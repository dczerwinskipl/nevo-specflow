import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomically } from '../../../project/fs/atomic-json';
import { readFileWindowsSafe, removeFileWindowsSafe } from '../../../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../../../project/home/home';
import { isMissing, withJournalLock, type JournalKindBase } from '../journal-store';
import { encodeLedgerRecord, parseLedgerRecord } from './codec';
import {
  LEDGER_LISTING_MAX_RECORDS,
  LEDGER_LISTING_MAX_WORKSPACES,
  LEDGER_MAX_BYTES,
  LEDGER_RELATIVE_DIR,
  LEDGER_VERSION,
  LedgerCorruptError,
  ledgerOwnerKey,
  ledgerOwnerOfKey,
  type LedgerOwner,
  type LedgerRecord,
} from './model';
import { applyLedgerUpsert, type LedgerSubject, type LedgerUpsert } from './upsert';

const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The ledger as a location below the Project state root: it takes the control lock like a journal does. */
const LEDGER_LOCATION: JournalKindBase = {
  name: 'ledger',
  label: 'Uncommitted-changes ledger',
  relativeDir: LEDGER_RELATIVE_DIR,
  version: LEDGER_VERSION,
  maxBytes: LEDGER_MAX_BYTES,
  listingMaxFiles: LEDGER_LISTING_MAX_RECORDS,
  errors: {
    invalid: () => new LedgerCorruptError(),
    unsupported: () => new LedgerCorruptError(),
    invalidOperationId: () => new LedgerCorruptError(),
    payloadUnprovable: () => new LedgerCorruptError(),
  },
};

/** Runs `action` under the Project Home control lock with the ledger directory chain verified. */
export function withLedgerLock<T>(
  context: ResolvedProjectHome,
  action: () => Promise<T>,
): Promise<T> {
  return withJournalLock(context, LEDGER_LOCATION, action);
}

function assertWorkspaceId(workspaceId: string): void {
  if (!WORKSPACE_ID.test(workspaceId)) {
    throw new LedgerCorruptError();
  }
}

export function ledgerDirectory(context: ResolvedProjectHome, workspaceId: string): string {
  assertWorkspaceId(workspaceId);

  return join(context.project.stateRoot, LEDGER_RELATIVE_DIR, workspaceId);
}

export function ledgerPath(
  context: ResolvedProjectHome,
  workspaceId: string,
  owner: LedgerOwner,
): string {
  return join(ledgerDirectory(context, workspaceId), ledgerOwnerKey(owner) + '.json');
}

async function readRecordFile(
  context: ResolvedProjectHome,
  path: string,
  workspaceId: string,
  ownerKey: string,
): Promise<LedgerRecord | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LEDGER_MAX_BYTES) {
      throw new LedgerCorruptError();
    }

    let value: unknown;
    try {
      value = JSON.parse(await readFileWindowsSafe(path));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new LedgerCorruptError();
      }

      throw error;
    }

    return parseLedgerRecord(context, value, workspaceId, ownerKey);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }

    throw error;
  }
}

/**
 * The record of one owner in one checkout, or `undefined`. Records are published by rename, so the
 * read needs no lock. A corrupt file is {@link LedgerCorruptError} (fail closed).
 */
export async function readLedgerRecord(
  context: ResolvedProjectHome,
  workspaceId: string,
  owner: LedgerOwner,
): Promise<LedgerRecord | undefined> {
  return readRecordFile(
    context,
    ledgerPath(context, workspaceId, owner),
    workspaceId,
    ledgerOwnerKey(owner),
  );
}

export interface LedgerListing {
  readonly records: readonly LedgerRecord[];
  /** Files that could not be read as a record (never thrown). */
  readonly unreadable: number;
  /** A directory held more entries than a listing reads. */
  readonly truncated: boolean;
}

/**
 * Lock-free, Git-free, tolerant listing: records of one checkout (`workspaceId`) or of every checkout.
 * One bad file counts as `unreadable`; the number of directories and files read is bounded.
 */
export async function listLedgerRecords(
  context: ResolvedProjectHome,
  options: { readonly workspaceId?: string } = {},
): Promise<LedgerListing> {
  const base = join(context.project.stateRoot, LEDGER_RELATIVE_DIR);
  let workspaces: string[];
  try {
    workspaces =
      options.workspaceId !== undefined
        ? [options.workspaceId]
        : (await readdir(base)).filter((name) => WORKSPACE_ID.test(name));
  } catch (error) {
    if (isMissing(error)) {
      return { records: [], unreadable: 0, truncated: false };
    }

    throw error;
  }

  const records: LedgerRecord[] = [];
  let unreadable = 0;
  let truncated = workspaces.length > LEDGER_LISTING_MAX_WORKSPACES;
  for (const workspaceId of workspaces.sort().slice(0, LEDGER_LISTING_MAX_WORKSPACES)) {
    if (!WORKSPACE_ID.test(workspaceId)) {
      continue;
    }

    const directory = join(base, workspaceId);
    let names: string[];
    try {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        unreadable += 1;
        continue;
      }

      names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      if (isMissing(error)) {
        continue;
      }

      unreadable += 1;
      continue;
    }

    if (names.length > LEDGER_LISTING_MAX_RECORDS) {
      truncated = true;
    }

    for (const name of names.slice(0, LEDGER_LISTING_MAX_RECORDS)) {
      const key = name.slice(0, -5);
      if (ledgerOwnerOfKey(key) === undefined) {
        continue;
      }

      try {
        const record = await readRecordFile(context, join(directory, name), workspaceId, key);
        if (record !== undefined) {
          records.push(record);
        }
      } catch {
        unreadable += 1;
      }
    }
  }

  return { records, unreadable, truncated };
}

/**
 * Publishes a record (atomic rename); a record without entries is removed instead, so an empty ledger
 * leaves no file. The caller MUST hold the control lock ({@link withLedgerLock} or a journal lock).
 */
export async function writeLedgerRecord(
  context: ResolvedProjectHome,
  record: LedgerRecord,
): Promise<void> {
  const path = ledgerPath(context, record.workspaceId, record.owner);
  if (record.entries.length === 0) {
    await removeFileWindowsSafe(path).catch((error: unknown) => {
      if (!isMissing(error)) {
        throw error;
      }
    });

    return;
  }

  encodeLedgerRecord(context, record);
  await mkdir(ledgerDirectory(context, record.workspaceId), { recursive: true, mode: 0o700 });
  const directory = ledgerDirectory(context, record.workspaceId);
  if ((await realpath(directory)) !== directory) {
    throw new LedgerCorruptError();
  }

  await writeJsonAtomically(path, record);
}

/**
 * Read, apply and write: the operation's paths are in the ledger when this returns. Idempotent by
 * operation id; {@link LedgerLimitError} before anything is written when it would not fit. The caller
 * MUST hold the control lock.
 */
export async function recordLedgerEntries(
  context: ResolvedProjectHome,
  subject: LedgerSubject,
  upsert: LedgerUpsert,
): Promise<LedgerRecord> {
  const current = await readLedgerRecord(context, subject.workspaceId, subject.owner);
  const next = applyLedgerUpsert(current, subject, upsert);
  if (next !== current) {
    await writeLedgerRecord(context, next);
  }

  return next;
}
