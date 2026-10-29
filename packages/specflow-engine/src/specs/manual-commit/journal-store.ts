import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { readFileWindowsSafe } from '../../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../../project/home/home';
import {
  OPERATION_ID_PATTERN,
  SETTLED_DIRECTORY_NAME,
  isMissing,
  journalDirectory,
  listJournals,
  moveJournalToSettled,
  payloadOperationIdOf,
  publishJournal,
  readJournal,
  readPayload,
  removePayload,
  removeSettledJournal,
  settledJournalPath,
  withJournalLock,
  type JournalKind,
} from '../durable';
import { invalidManualCommitJournal, parseManualCommitJournal } from './codec';
import { manualCommitError } from './errors';
import {
  MANUAL_COMMIT_JOURNAL_MAX_BYTES,
  MANUAL_COMMIT_JOURNAL_VERSION,
  MANUAL_COMMIT_LISTING_MAX_FILES,
  MANUAL_COMMIT_RELATIVE_DIR,
  MANUAL_COMMIT_SETTLED_RETENTION_MS,
  MANUAL_COMMIT_SETTLED_SWEEP_BUDGET_MS,
  MANUAL_COMMIT_STAGE_FACTS,
  type ManualCommitJournal,
  type ManualCommitStage,
} from './model';
import { decodeMessage, decodeSnapshot, type SnapshotEntry, type StoredMessage } from './payload';
import { transitionManualCommit, type ManualCommitTransitionPatch } from './transition';

/**
 * The manual commit journal as one kind of the generic durable core: the store, the payload store
 * and the retention sweep take their location, version, cap and error vocabulary from here.
 */
export const MANUAL_COMMIT_JOURNAL_KIND: JournalKind<ManualCommitJournal> = {
  name: 'manual-commit',
  label: 'Manual commit',
  relativeDir: MANUAL_COMMIT_RELATIVE_DIR,
  version: MANUAL_COMMIT_JOURNAL_VERSION,
  maxBytes: MANUAL_COMMIT_JOURNAL_MAX_BYTES,
  listingMaxFiles: MANUAL_COMMIT_LISTING_MAX_FILES,
  parse: parseManualCommitJournal,
  isSettled: (journal) => MANUAL_COMMIT_STAGE_FACTS[journal.stage].settled,
  errors: {
    invalid: invalidManualCommitJournal,
    unsupported: invalidManualCommitJournal,
    invalidOperationId: () =>
      manualCommitError('operation-invalid', 'A UUID operationId is required.'),
    payloadUnprovable: (message) => manualCommitError('payload-unprovable', message),
  },
};

/** Runs `action` under the Project Home control lock with the journal directory chain verified. */
export function withManualCommitLock<T>(
  context: ResolvedProjectHome,
  action: () => Promise<T>,
): Promise<T> {
  return withJournalLock(context, MANUAL_COMMIT_JOURNAL_KIND, action);
}

/** The current-format journals of the active directory (a corrupt one fails closed). */
export function listManualCommitJournals(
  context: ResolvedProjectHome,
): Promise<readonly ManualCommitJournal[]> {
  return listJournals(context, MANUAL_COMMIT_JOURNAL_KIND);
}

export function readManualCommitJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<ManualCommitJournal | undefined> {
  return readJournal(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
}

/** A journal that moved to `settled/` (kept for replay), or `undefined`. */
export async function readSettledManualCommitJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<ManualCommitJournal | undefined> {
  const path = settledJournalPath(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MANUAL_COMMIT_JOURNAL_MAX_BYTES) {
      throw invalidManualCommitJournal();
    }

    const value: unknown = JSON.parse(await readFileWindowsSafe(path));

    return MANUAL_COMMIT_JOURNAL_KIND.parse(context, value, operationId);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }

    if (error instanceof SyntaxError) {
      throw invalidManualCommitJournal();
    }

    throw error;
  }
}

/** The journal of an operation wherever it is: the active directory first, then `settled/`. */
export async function findManualCommitJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<ManualCommitJournal | undefined> {
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    return undefined;
  }

  return (
    (await readManualCommitJournal(context, operationId)) ??
    (await readSettledManualCommitJournal(context, operationId))
  );
}

/** Another process moved the journal first: what the transition expected is no longer true. */
export class ManualCommitMovedError extends Error {
  readonly current: ManualCommitJournal;

  constructor(current: ManualCommitJournal) {
    super('The manual commit moved to ' + current.stage + '.');
    this.name = 'ManualCommitMovedError';
    this.current = current;
  }
}

/**
 * Moves a stored journal to `to` as ONE read, compare and write under the Project Home control lock.
 * `from` lists the stages the caller expects; any other stage (or a false `guard`) means another
 * executor already moved the operation and is a {@link ManualCommitMovedError} carrying what is there
 * now. `beforePublish` is an effect of the same critical section, run before the record is published.
 */
export function transitionManualCommitJournal(
  context: ResolvedProjectHome,
  operationId: string,
  from: readonly ManualCommitStage[],
  to: ManualCommitStage,
  patch: ManualCommitTransitionPatch,
  now: string,
  options: {
    readonly guard?: (current: ManualCommitJournal) => boolean;
    readonly beforePublish?: (next: ManualCommitJournal) => Promise<void>;
  } = {},
): Promise<ManualCommitJournal> {
  return withManualCommitLock(context, async () => {
    const current = await readManualCommitJournal(context, operationId);
    if (current === undefined) {
      throw manualCommitError('operation-not-found', 'The manual commit does not exist.');
    }

    if (!from.includes(current.stage) || options.guard?.(current) === false) {
      throw new ManualCommitMovedError(current);
    }

    const next = transitionManualCommit(current, to, patch, now);
    await options.beforePublish?.(next);
    await publishJournal(context, MANUAL_COMMIT_JOURNAL_KIND, next);

    return next;
  });
}

/** Moves a settled journal out of the active directory (kept for replay). One lock; absent is fine. */
export async function settleManualCommitJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<void> {
  await withManualCommitLock(context, async () => {
    const current = await readManualCommitJournal(context, operationId);
    if (current === undefined) {
      return;
    }

    if (!MANUAL_COMMIT_STAGE_FACTS[current.stage].settled) {
      throw manualCommitError('operation-state-invalid', 'Only a settled operation is moved.');
    }

    await moveJournalToSettled(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
  });
}

/** The verified ledger entries the commit was judged on. */
export async function readSnapshot(
  context: ResolvedProjectHome,
  journal: ManualCommitJournal,
): Promise<SnapshotEntry[]> {
  const entries = decodeSnapshot(
    await readPayload(context, MANUAL_COMMIT_JOURNAL_KIND, journal.operationId, journal.snapshot),
  );
  if (entries.length !== journal.snapshot.pathCount) {
    throw manualCommitError('payload-unprovable', 'The manual commit snapshot does not match.');
  }

  return entries;
}

/** The verified message of the commit. */
export async function readMessage(
  context: ResolvedProjectHome,
  journal: ManualCommitJournal,
): Promise<StoredMessage> {
  return decodeMessage(
    await readPayload(context, MANUAL_COMMIT_JOURNAL_KIND, journal.operationId, journal.message),
  );
}

/**
 * Removes settled records (and their payload) older than the retention, capped by TIME. The payload
 * goes BEFORE the record, so a stop in between leaves a record that the next sweep removes, never a
 * payload nothing points to. The caller holds the Project Home control lock; no Git. Never throws
 * for one bad entry.
 */
export async function sweepSettledManualCommits(
  context: ResolvedProjectHome,
  options: {
    readonly now?: number;
    readonly retentionMs?: number;
    readonly budgetMs?: number;
    readonly keepOperationId?: string;
  } = {},
): Promise<number> {
  const clock = options.now ?? Date.now();
  const retention = options.retentionMs ?? MANUAL_COMMIT_SETTLED_RETENTION_MS;
  const started = performance.now();
  const outOfTime = (): boolean =>
    performance.now() - started >= (options.budgetMs ?? MANUAL_COMMIT_SETTLED_SWEEP_BUDGET_MS);
  const base = journalDirectory(context, MANUAL_COMMIT_JOURNAL_KIND);
  const directory = join(base, SETTLED_DIRECTORY_NAME);
  let settled: string[];
  try {
    settled = await readdir(directory);
  } catch {
    settled = [];
  }

  let removed = 0;
  for (const name of settled) {
    if (outOfTime()) {
      return removed;
    }

    if (!name.endsWith('.json')) {
      continue;
    }

    const operationId = name.slice(0, -5);
    if (!OPERATION_ID_PATTERN.test(operationId) || operationId === options.keepOperationId) {
      continue;
    }

    try {
      const stat = await lstat(join(directory, name));
      if (!stat.isFile() || clock - stat.mtimeMs < retention) {
        continue;
      }

      await removePayload(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
      await removeSettledJournal(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
      removed += 1;
    } catch {
      // Vanished or not removable: never fatal for the reservation.
    }
  }

  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return removed;
  }

  const known = new Set([...entries, ...settled].filter((name) => name.endsWith('.json')));
  for (const name of entries) {
    if (outOfTime()) {
      break;
    }

    const operationId = payloadOperationIdOf(name);
    if (
      operationId === undefined ||
      operationId === options.keepOperationId ||
      known.has(operationId + '.json')
    ) {
      continue;
    }

    try {
      const stat = await lstat(join(base, name));
      if (!stat.isDirectory() || clock - stat.mtimeMs < retention) {
        continue;
      }

      await removePayload(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
      removed += 1;
    } catch {
      // Vanished or not removable: never fatal for the reservation.
    }
  }

  return removed;
}
