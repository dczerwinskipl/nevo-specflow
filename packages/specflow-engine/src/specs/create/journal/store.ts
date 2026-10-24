import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomically } from '../../../project/fs/atomic-json';
import { readFileWindowsSafe } from '../../../project/fs/windows-safe-fs';
import { withProjectControlLock } from '../../../project/control-lock';
import type { ResolvedProjectHome } from '../../../project/home/home';
import { CREATE_JOURNAL_MAX_BYTES } from '../limits';
import { CreateOperationError } from '../error';
import type { CreateJournal } from './model';
import { UUID, invalidJournal, parseCreateJournal } from './codec';
import {
  classifyCreateJournalText,
  unsupportedJournalError,
  type UnsupportedCreateJournal,
} from './unsupported';

export const CREATE_JOURNAL_RELATIVE_DIR = 'engine/operations/create';

/**
 * Stage file of `writeJsonAtomically` (`.<id>.json.<uuid>.tmp`). A SIGKILL or power loss between
 * its creation and the rename leaves it behind; it is never a journal and must not wedge Create.
 */
const STRAY_TEMP_JOURNAL = /^.[0-9a-f-]{36}.json.[0-9a-f-]{36}.tmp$/iu;

export function isStrayJournalTempName(name: string): boolean {
  return STRAY_TEMP_JOURNAL.test(name);
}

export function validateOperationId(id: string): void {
  if (!UUID.test(id)) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'A UUID operationId is required.');
  }
}

export function createJournalPath(context: ResolvedProjectHome, operationId: string): string {
  validateOperationId(operationId);
  return join(context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR, operationId + '.json');
}

type JournalFileRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unsupported'; readonly mtimeMs: number }
  | { readonly kind: 'journal'; readonly journal: CreateJournal };

async function readJournalFile(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<JournalFileRead> {
  const path = createJournalPath(context, operationId);
  try {
    const stat = await lstat(path);
    // A redirected, special or oversize file is never a journal this Engine wrote: fail closed.
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CREATE_JOURNAL_MAX_BYTES) {
      throw invalidJournal();
    }
    const classified = classifyCreateJournalText(await readFileWindowsSafe(path));
    if (classified.kind === 'unsupported') return { kind: 'unsupported', mtimeMs: stat.mtimeMs };
    return { kind: 'journal', journal: parseCreateJournal(context, classified.value, operationId) };
  } catch (error) {
    if (isMissing(error)) return { kind: 'missing' };
    throw error;
  }
}

/**
 * The journal of one operation. An unsupported (older-format) file answers
 * `CREATE_JOURNAL_UNSUPPORTED`; a corrupt current-format file stays `CREATE_JOURNAL_CORRUPT`.
 */
export async function readCreateJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<CreateJournal | undefined> {
  const read = await readJournalFile(context, operationId);
  if (read.kind === 'unsupported') throw unsupportedJournalError();
  return read.kind === 'journal' ? read.journal : undefined;
}

export interface CreateJournalListing {
  /** Valid current-format journals: the only resource claims. */
  readonly journals: readonly CreateJournal[];
  /** Older-format or unparseable files: never claims, never an error. */
  readonly unsupported: readonly UnsupportedCreateJournal[];
}

/**
 * Strict listing used by Create and Close admission. Unsupported files are returned separately
 * and never throw or claim; a corrupt current-format journal still fails closed.
 */
export async function listCreateJournalsDetailed(
  context: ResolvedProjectHome,
): Promise<CreateJournalListing> {
  const path = join(context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path) {
      throw invalidJournal();
    }
  } catch (error) {
    if (isMissing(error)) return { journals: [], unsupported: [] };
    throw error;
  }
  const files = await readdir(path, { withFileTypes: true });
  const records: CreateJournal[] = [];
  const unsupported: UnsupportedCreateJournal[] = [];
  for (const file of files) {
    // Leftover stage files and editor/OS droppings are not journals; only a `*.json` entry is judged.
    if (isStrayJournalTempName(file.name) || !file.name.endsWith('.json')) continue;
    if (!file.isFile() || file.isSymbolicLink()) {
      throw invalidJournal();
    }
    const operationId = file.name.slice(0, -5);
    validateOperationId(operationId);
    const read = await readJournalFile(context, operationId);
    if (read.kind === 'missing') throw invalidJournal();
    if (read.kind === 'unsupported') unsupported.push({ operationId, mtimeMs: read.mtimeMs });
    else records.push(read.journal);
  }
  return { journals: records, unsupported };
}

/** The current-format journals only (see {@link listCreateJournalsDetailed}). */
export async function listCreateJournals(
  context: ResolvedProjectHome,
): Promise<readonly CreateJournal[]> {
  return (await listCreateJournalsDetailed(context)).journals;
}

export async function withCreateJournalLock<T>(
  context: ResolvedProjectHome,
  action: () => Promise<T>,
): Promise<T> {
  return withProjectControlLock(
    context,
    async () => {
      // Every ancestor is checked, including the journal's ignored local state.
      let root = context.project.stateRoot;
      const state = await lstat(root);
      if (!state.isDirectory() || state.isSymbolicLink() || (await realpath(root)) !== root) {
        throw invalidJournal();
      }
      for (const segment of ['engine', 'operations', 'create']) {
        root = join(root, segment);
        try {
          await mkdir(root, { mode: 0o700 });
        } catch (error) {
          if (!isExists(error)) throw error;
        }
        const stat = await lstat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(root)) !== root) {
          throw invalidJournal();
        }
      }
      return action();
    },
    { waitMs: 25000 },
  );
}

/** Caller MUST hold the Project Home control lock. */
export async function publishCreateJournal(
  context: ResolvedProjectHome,
  record: CreateJournal,
): Promise<void> {
  parseCreateJournal(context, record, record.operationId);
  await writeJsonAtomically(createJournalPath(context, record.operationId), record);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}
