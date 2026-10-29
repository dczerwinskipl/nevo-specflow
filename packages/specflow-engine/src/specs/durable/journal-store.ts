import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomically } from '../../project/fs/atomic-json';
import {
  readFileWindowsSafe,
  removeFileWindowsSafe,
  renameWindowsSafe,
} from '../../project/fs/windows-safe-fs';
import { withProjectControlLock } from '../../project/control-lock';
import type { ResolvedProjectHome } from '../../project/home/home';
import { isRecord } from './guards';
import { classifyJournalText, type UnsupportedJournal } from './unsupported';

/** Operation ids on disk and on the wire: UUIDs. */
export const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Describes one kind of durable operation journal: where its files live, which version this Engine
 * writes, how a current-format record is validated and which errors the kind reports. The generic
 * store, payload store and retention sweep never name a kind; every journal kind (Create today)
 * is one descriptor.
 */
export interface JournalKindBase {
  /** Machine name, for example `create`. */
  readonly name: string;
  /** Used in messages, for example `Create`. */
  readonly label: string;
  /** Directory below the Project state root, with `/` separators, for example `engine/operations/create`. */
  readonly relativeDir: string;
  /** The only journal format version this Engine interprets. */
  readonly version: number;
  /** Largest journal file, in bytes. */
  readonly maxBytes: number;
  /** Most file names a tolerant listing reads. */
  readonly listingMaxFiles: number;
  readonly errors: JournalKindErrors;
}

/** A journal kind: the location and error vocabulary plus how to validate its records. */
export interface JournalKind<T> extends JournalKindBase {
  /** Validates a current-format record; throws {@link JournalKindErrors.invalid} on any violation. */
  readonly parse: (context: ResolvedProjectHome, value: unknown, operationId: string) => T;
  /** Terminal, fully settled records: the only ones retention deletes. */
  readonly isSettled: (record: T) => boolean;
}

export interface JournalKindErrors {
  /** A corrupt, redirected or oversize file of the current format. Fail closed. */
  readonly invalid: () => Error;
  /** An unreadable file read by operation id. */
  readonly unsupported: () => Error;
  /** A value that is not an operation id. */
  readonly invalidOperationId: () => Error;
  /** A payload that is missing or does not match its recorded evidence. */
  readonly payloadUnprovable: (message: string) => Error;
}

/**
 * Stage file of `writeJsonAtomically` (`.<id>.json.<uuid>.tmp`). A SIGKILL or power loss between
 * its creation and the rename leaves it behind; it is never a journal and must not wedge a kind.
 */
const STRAY_TEMP_JOURNAL = /^.[0-9a-f-]{36}.json.[0-9a-f-]{36}.tmp$/iu;

export function isStrayJournalTempName(name: string): boolean {
  return STRAY_TEMP_JOURNAL.test(name);
}

export function validateJournalOperationId(kind: JournalKindBase, id: string): void {
  if (!OPERATION_ID_PATTERN.test(id)) throw kind.errors.invalidOperationId();
}

export function journalDirectory(context: ResolvedProjectHome, kind: JournalKindBase): string {
  return join(context.project.stateRoot, kind.relativeDir);
}

export function journalPath(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
): string {
  validateJournalOperationId(kind, operationId);
  return join(journalDirectory(context, kind), operationId + '.json');
}

/** Directory of records that are settled but still kept (for example for idempotent replay). */
export const SETTLED_DIRECTORY_NAME = 'settled';

export function settledJournalPath(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
): string {
  validateJournalOperationId(kind, operationId);
  return join(journalDirectory(context, kind), SETTLED_DIRECTORY_NAME, operationId + '.json');
}

type JournalFileRead<T> =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unsupported'; readonly mtimeMs: number }
  | { readonly kind: 'journal'; readonly journal: T };

async function readJournalFile<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
  operationId: string,
): Promise<JournalFileRead<T>> {
  const path = journalPath(context, kind, operationId);
  try {
    const stat = await lstat(path);
    // A redirected, special or oversize file is never a journal this Engine wrote: fail closed.
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > kind.maxBytes) {
      throw kind.errors.invalid();
    }
    const classified = classifyJournalText(await readFileWindowsSafe(path));
    if (classified.kind === 'unsupported') return { kind: 'unsupported', mtimeMs: stat.mtimeMs };
    return { kind: 'journal', journal: kind.parse(context, classified.value, operationId) };
  } catch (error) {
    if (isMissing(error)) return { kind: 'missing' };
    throw error;
  }
}

/**
 * The journal of one operation. An unsupported (unreadable) file answers the kind's
 * `unsupported` error; a corrupt current-format file stays the kind's `invalid` error.
 */
export async function readJournal<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
  operationId: string,
): Promise<T | undefined> {
  const read = await readJournalFile(context, kind, operationId);
  if (read.kind === 'unsupported') throw kind.errors.unsupported();
  return read.kind === 'journal' ? read.journal : undefined;
}

export interface JournalListing<T> {
  /** Valid current-format journals: the only resource claims. */
  readonly journals: readonly T[];
  /** Unreadable or unparseable files: never claims, never an error. */
  readonly unsupported: readonly UnsupportedJournal[];
}

/**
 * Strict listing used by admission. Unsupported files are returned separately and never throw or
 * claim; a corrupt current-format journal still fails closed.
 */
export async function listJournalsDetailed<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
): Promise<JournalListing<T>> {
  const path = journalDirectory(context, kind);
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path) {
      throw kind.errors.invalid();
    }
  } catch (error) {
    if (isMissing(error)) return { journals: [], unsupported: [] };
    throw error;
  }
  const files = await readdir(path, { withFileTypes: true });
  const records: T[] = [];
  const unsupported: UnsupportedJournal[] = [];
  for (const file of files) {
    // Leftover stage files and editor/OS droppings are not journals; only a `*.json` entry is judged.
    if (isStrayJournalTempName(file.name) || !file.name.endsWith('.json')) continue;
    if (!file.isFile() || file.isSymbolicLink()) {
      throw kind.errors.invalid();
    }
    const operationId = file.name.slice(0, -5);
    validateJournalOperationId(kind, operationId);
    const read = await readJournalFile(context, kind, operationId);
    if (read.kind === 'missing') throw kind.errors.invalid();
    if (read.kind === 'unsupported') unsupported.push({ operationId, mtimeMs: read.mtimeMs });
    else records.push(read.journal);
  }
  return { journals: records, unsupported };
}

/** The current-format journals only (see {@link listJournalsDetailed}). */
export async function listJournals<T>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
): Promise<readonly T[]> {
  return (await listJournalsDetailed(context, kind)).journals;
}

/**
 * Runs `action` under the Project Home control lock after checking that the kind's directory chain
 * exists as real directories (creating it with mode 0700) and that every ancestor is not redirected.
 */
export async function withJournalLock<T>(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  action: () => Promise<T>,
): Promise<T> {
  return withProjectControlLock(
    context,
    async () => {
      // Every ancestor is checked, including the journal's ignored local state.
      let root = context.project.stateRoot;
      const state = await lstat(root);
      if (!state.isDirectory() || state.isSymbolicLink() || (await realpath(root)) !== root) {
        throw kind.errors.invalid();
      }
      for (const segment of kind.relativeDir.split('/')) {
        root = join(root, segment);
        try {
          await mkdir(root, { mode: 0o700 });
        } catch (error) {
          if (!isExists(error)) throw error;
        }
        const stat = await lstat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(root)) !== root) {
          throw kind.errors.invalid();
        }
      }
      return action();
    },
    { waitMs: 25000 },
  );
}

/** Caller MUST hold the Project Home control lock. */
export async function publishJournal<T extends { readonly operationId: string }>(
  context: ResolvedProjectHome,
  kind: JournalKind<T>,
  record: T,
): Promise<void> {
  kind.parse(context, record, record.operationId);
  await writeJsonAtomically(journalPath(context, kind, record.operationId), record);
}

/**
 * Moves a settled journal into `settled/`, where active-directory listings do not see it. Caller
 * MUST hold the Project Home control lock. A kind that keeps settled records for replay uses this;
 * Create does not.
 */
export async function moveJournalToSettled(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
): Promise<void> {
  const from = journalPath(context, kind, operationId);
  const to = settledJournalPath(context, kind, operationId);
  await mkdir(join(journalDirectory(context, kind), SETTLED_DIRECTORY_NAME), {
    recursive: true,
    mode: 0o700,
  });
  await renameWindowsSafe(from, to);
}

/** Deletes a settled record once it is past its retention; absent is fine. */
export async function removeSettledJournal(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
): Promise<void> {
  await removeFileWindowsSafe(settledJournalPath(context, kind, operationId)).catch(
    (error: unknown) => {
      if (!isMissing(error)) throw error;
    },
  );
}

export function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}

/** Stat fields the tolerant listing keeps per file. */
export interface JournalFileStat {
  isFile(): boolean;
  isSymbolicLink(): boolean;
  readonly size: number;
}

export interface TolerantJournalReader<TRow> {
  /** Reads one file; MUST NOT throw for a bad file (return the unreadable row instead). */
  readonly readRow: (
    path: string,
    operationId: string,
    stat: JournalFileStat,
    updatedAt: Date,
  ) => Promise<TRow>;
  /** The row of a file that cannot be read: only its id and time are known. */
  readonly unreadable: (operationId: string, updatedAt: Date) => TRow;
}

interface Memo<TRow> {
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly size: number;
  readonly ino: number;
  readonly row: TRow;
}

/** Process-local memo per journal directory: only files whose stat signature changed are parsed. */
const memos = new Map<string, Map<string, Memo<unknown>>>();

/**
 * Tolerant, read-only listing of a kind's journals from disk. It never spawns Git, never takes the
 * Project Home control lock and never fails because of one bad file: an unreadable journal is a row
 * of its own. The strict {@link listJournalsDetailed} used by admission is untouched.
 */
export async function listJournalRowsTolerant<TRow>(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  reader: TolerantJournalReader<TRow>,
  /** `onTruncated` runs when the directory holds more files than the kind's listing cap. */
  options: { readonly onTruncated?: () => void } = {},
): Promise<readonly TRow[]> {
  const dir = journalDirectory(context, kind);
  let names: string[];
  try {
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return [];
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  names.sort();
  if (names.length > kind.listingMaxFiles) options.onTruncated?.();
  names = names.slice(0, kind.listingMaxFiles);

  const previous = (memos.get(dir) ?? new Map()) as Map<string, Memo<TRow>>;
  const next = new Map<string, Memo<TRow>>();
  const rows: TRow[] = [];
  for (const name of names) {
    const operationId = name.slice(0, -5);
    // A name that is not an operation id cannot be addressed by anything: not a journal.
    if (!OPERATION_ID_PATTERN.test(operationId)) continue;
    const path = join(dir, name);
    let stat;
    try {
      stat = await lstat(path);
    } catch (error) {
      if (isMissing(error)) continue;
      rows.push(reader.unreadable(operationId, new Date(0)));
      continue;
    }
    const updatedAt = new Date(stat.mtimeMs);
    const known = previous.get(name);
    if (
      known?.mtimeMs === stat.mtimeMs &&
      known.ctimeMs === stat.ctimeMs &&
      known.size === stat.size &&
      known.ino === stat.ino
    ) {
      next.set(name, known);
      rows.push(known.row);
      continue;
    }
    const row = await reader.readRow(path, operationId, stat, updatedAt);
    next.set(name, {
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      size: stat.size,
      ino: stat.ino,
      row,
    });
    rows.push(row);
  }
  memos.set(dir, next);
  return rows;
}

/**
 * The tolerant row of ONE operation (same read as the list, never takes the lock and never spawns
 * Git); `undefined` when no journal file exists or the id is not an operation id.
 */
export async function readJournalRowTolerant<TRow>(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
  reader: TolerantJournalReader<TRow>,
): Promise<TRow | undefined> {
  if (!OPERATION_ID_PATTERN.test(operationId)) return undefined;
  const path = join(journalDirectory(context, kind), operationId + '.json');
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    return reader.unreadable(operationId, new Date(0));
  }
  return reader.readRow(path, operationId, stat, new Date(stat.mtimeMs));
}
