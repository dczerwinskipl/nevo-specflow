import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { readFileWindowsSafe } from '../../../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  SETTLED_DIRECTORY_NAME,
  isMissing,
  journalDirectory,
  listJournals,
  moveJournalToSettled,
  payloadOperationIdOf,
  publishJournal,
  readJournal,
  removePayload,
  removeSettledJournal,
  settledJournalPath,
  withJournalLock,
  OPERATION_ID_PATTERN,
} from '../../durable';
import { documentChangeError } from '../changes/errors';
import { invalidDocumentChangeJournal } from '../changes/journal/codec';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentChangeJournal } from '../changes/journal/model';
import type { DocumentChangeStage } from '../changes/journal/stages';
import {
  transitionDocumentChange,
  type DocumentChangeTransitionPatch,
} from '../changes/journal/transition';
import { DOCUMENT_JOURNAL_MAX_BYTES } from '../changes/limits';

/**
 * The current-format document-change journals of the Project Home. Unsupported (unreadable) files
 * never claim and never fail the listing; a corrupt current-format journal fails closed.
 */
export function listDocumentChangeJournals(
  context: ResolvedProjectHome,
): Promise<readonly DocumentChangeJournal[]> {
  return listJournals(context, DOCUMENT_CHANGE_JOURNAL_KIND);
}

export function readDocumentChangeJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<DocumentChangeJournal | undefined> {
  return readJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
}

/** A journal that moved to `settled/` (kept for replay), or `undefined`. */
export async function readSettledDocumentChangeJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<DocumentChangeJournal | undefined> {
  const path = settledJournalPath(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > DOCUMENT_JOURNAL_MAX_BYTES) {
      throw invalidDocumentChangeJournal();
    }
    const value: unknown = JSON.parse(await readFileWindowsSafe(path));
    return DOCUMENT_CHANGE_JOURNAL_KIND.parse(context, value, operationId);
  } catch (error) {
    if (isMissing(error)) return undefined;
    if (error instanceof SyntaxError) throw invalidDocumentChangeJournal();
    throw error;
  }
}

/** The journal of an operation wherever it is: the active directory first, then `settled/`. */
export async function findDocumentChangeJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<DocumentChangeJournal | undefined> {
  return (
    (await readDocumentChangeJournal(context, operationId)) ??
    (await readSettledDocumentChangeJournal(context, operationId))
  );
}

/** Another process moved the journal first: what the transition expected is no longer true. */
export class JournalMovedError extends Error {
  readonly current: DocumentChangeJournal;

  constructor(current: DocumentChangeJournal) {
    super('The document operation moved to ' + current.stage + '.');
    this.name = 'JournalMovedError';
    this.current = current;
  }
}

/**
 * Moves a stored journal to `to` as ONE read, compare and write under the Project Home control lock.
 * `from` lists the stages the caller expects; any other stage means another executor already moved
 * the operation and is a {@link JournalMovedError} carrying what is there now.
 */
export async function transitionDocumentChangeJournal(
  context: ResolvedProjectHome,
  operationId: string,
  from: readonly DocumentChangeStage[],
  to: DocumentChangeStage,
  patch: DocumentChangeTransitionPatch,
  now: string,
  /** Extra condition on the stored journal, judged under the lock; a false answer is a {@link JournalMovedError}. */
  guard?: (current: DocumentChangeJournal) => boolean,
  /**
   * An effect that belongs to the same critical section: it runs after the guard passed and BEFORE the
   * new journal is published, under the control lock (the ledger entry of an uncommitted completion).
   */
  beforePublish?: (next: DocumentChangeJournal) => Promise<void>,
): Promise<DocumentChangeJournal> {
  return withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
    const current = await readDocumentChangeJournal(context, operationId);
    if (current === undefined) {
      throw documentChangeError('operation-not-found', 'The document operation does not exist.');
    }
    if (!from.includes(current.stage) || guard?.(current) === false) {
      throw new JournalMovedError(current);
    }
    const next = transitionDocumentChange(current, to, patch, now);
    await beforePublish?.(next);
    await publishJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, next);
    return next;
  });
}

/**
 * Moves a settled journal out of the active directory, where claim checks and listings no longer
 * see it, and keeps it for replay (see {@link SETTLED_RETENTION_MS}). One lock; absent is fine.
 */
export async function settleDocumentChangeJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<void> {
  await withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
    const current = await readDocumentChangeJournal(context, operationId);
    if (current === undefined) return;
    if (current.stage !== 'completed' && current.stage !== 'failed') {
      throw documentChangeError('operation-state-invalid', 'Only a settled operation is moved.');
    }
    await moveJournalToSettled(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
  });
}

/** A settled operation replays idempotently for this long. */
export const SETTLED_RETENTION_MS = 24 * 60 * 60 * 1000;
/** The sweep of settled records stops after this long, so a reservation never waits for it. */
export const SETTLED_SWEEP_BUDGET_MS = 50;

export interface SettledSweepOptions {
  readonly now?: number;
  readonly retentionMs?: number;
  readonly budgetMs?: number;
  /** The operation being reserved or replayed right now is never removed. */
  readonly keepOperationId?: string;
}

/**
 * Removes settled records (and their plan files) older than the retention, and payload directories that
 * belong to no journal at all (a reservation that stopped between the payload and the journal and never
 * came back), capped by TIME and not by count. The payload goes BEFORE the record, so a stop in between
 * leaves a record that the next sweep removes, never a payload nothing points to. The caller holds the
 * Project Home control lock; no Git. Never throws for one bad entry.
 */
export async function sweepSettledDocumentChanges(
  context: ResolvedProjectHome,
  options: SettledSweepOptions = {},
): Promise<number> {
  const clock = options.now ?? Date.now();
  const retention = options.retentionMs ?? SETTLED_RETENTION_MS;
  const started = performance.now();
  const outOfTime = (): boolean =>
    performance.now() - started >= (options.budgetMs ?? SETTLED_SWEEP_BUDGET_MS);
  const base = journalDirectory(context, DOCUMENT_CHANGE_JOURNAL_KIND);
  const directory = join(base, SETTLED_DIRECTORY_NAME);
  let settled: string[];
  try {
    settled = await readdir(directory);
  } catch {
    settled = [];
  }
  let removed = 0;
  for (const name of settled) {
    if (outOfTime()) return removed;
    if (!name.endsWith('.json')) continue;
    const operationId = name.slice(0, -5);
    if (!OPERATION_ID_PATTERN.test(operationId) || operationId === options.keepOperationId) {
      continue;
    }
    try {
      const stat = await lstat(join(directory, name));
      if (!stat.isFile() || clock - stat.mtimeMs < retention) continue;
      await removePayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
      await removeSettledJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
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
    if (outOfTime()) break;
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
      if (!stat.isDirectory() || clock - stat.mtimeMs < retention) continue;
      await removePayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
      removed += 1;
    } catch {
      // Vanished or not removable: never fatal for the reservation.
    }
  }
  return removed;
}
