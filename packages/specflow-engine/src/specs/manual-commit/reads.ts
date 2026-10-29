/**
 * Read side of the manual commit: the status of one operation and the rows of the operation list.
 * Lock-free and Git-free (the journals of the active directory, one tolerant read per changed file);
 * a completed manual commit is read from `settled/` for the retention window and is never listed.
 */
import type {
  Action,
  CommitInfo,
  DocumentExecutorHint,
  DocumentOperationStage,
  DocumentOperationStatus,
} from '@nevo/specflow-contracts/documents';

import type { ResolvedProjectHome } from '../../project/home/home';
import {
  OPERATION_ID_PATTERN,
  captureExecutorIdentity,
  listRecordsTolerant,
  nodeProcessTable,
  proveExecutorState,
  readRecordTolerant,
  type ProcessTable,
} from '../durable';
import { ledgerOwnerOfKey } from '../durable/ledger/model';
import { manualCommitError } from './errors';
import { MANUAL_COMMIT_JOURNAL_KIND, readSettledManualCommitJournal } from './journal-store';
import type { ManualCommitJournal } from './model';

export interface ManualCommitReadOptions {
  /** The Specification the route names: an operation of another one does not exist for the caller. */
  readonly specId?: string;
  /** Process table of the executor liveness judgement (procfs seam). */
  readonly processTable?: ProcessTable;
  /** Wall clock in epoch milliseconds (the stuck judgement); defaults to the system clock. */
  readonly nowMs?: () => number;
}

/**
 * A manual commit that holds its checkout (reserved, committing) without ending for this long is shown to
 * the operator even when no dead executor can be proved (Windows, macOS, containers without procfs). A
 * commit attempt is bounded far below it.
 */
export const MANUAL_COMMIT_STUCK_MS = 5 * 60 * 1000;

const NO: Action = { available: false };
const YES: Action = { available: true };

/** The Specification id the status names: the one the request addressed, the first Specification owner, else the definitions. */
export function subjectIdOf(journal: ManualCommitJournal): string {
  if (journal.specId !== undefined) {
    return journal.specId;
  }

  for (const key of journal.owners) {
    const owner = ledgerOwnerOfKey(key);
    if (owner?.kind === 'specification') {
      return owner.id;
    }
  }

  return 'definitions';
}

/** The commit state the contract reports for a manual commit, derived from its journal. */
export function commitInfoOfManualCommit(journal: ManualCommitJournal): CommitInfo {
  switch (journal.stage) {
    case 'reserved':
    case 'committing':
      return { state: 'pending', attempts: 0, queuedAt: journal.createdAt };
    case 'completed':
      return journal.outcome === 'committed' && journal.sha !== undefined
        ? {
            state: 'committed',
            sha: journal.sha,
            ...(journal.settledAt !== undefined ? { settledAt: journal.settledAt } : {}),
          }
        : {
            state: 'not-applicable',
            reason: journal.reason ?? 'nothing-to-commit',
            ...(journal.settledAt !== undefined ? { settledAt: journal.settledAt } : {}),
          };
    case 'failed':
      return {
        state: 'failed',
        reason: journal.reason ?? 'commit-failed',
        ...(journal.blockedBy !== undefined ? { blockedBy: journal.blockedBy } : {}),
        ...(journal.settledAt !== undefined ? { settledAt: journal.settledAt } : {}),
      };
    case 'recovery-required':
      return {
        state: 'failed',
        reason: journal.reason ?? 'uncertain',
        ...(journal.blockedBy !== undefined ? { blockedBy: journal.blockedBy } : {}),
        recoveryRequired: true,
      };
  }
}

/** The journal of a manual commit wherever it is: the active directory (tolerant), else `settled/`. */
export async function findManualCommitForRead(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<ManualCommitJournal | undefined> {
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    return undefined;
  }

  const row = await readRecordTolerant(context, MANUAL_COMMIT_JOURNAL_KIND, operationId);
  if (row?.kind === 'record') {
    return row.record;
  }

  if (row !== undefined) {
    throw manualCommitError('journal-corrupt', 'The manual commit record is unreadable.');
  }

  return readSettledManualCommitJournal(context, operationId);
}

async function executorHint(
  journal: ManualCommitJournal,
  options: ManualCommitReadOptions,
): Promise<DocumentExecutorHint | undefined> {
  if (journal.stage !== 'committing' || journal.executor === undefined) {
    return undefined;
  }

  const table = options.processTable ?? nodeProcessTable;
  const state = await proveExecutorState(
    journal.executor,
    await captureExecutorIdentity(table),
    table,
  );

  return { state: state === 'self' || state === 'alive' ? 'alive' : state };
}

/**
 * The stable code of a manual commit that needs a person, or undefined: recovery-required; one that holds
 * the checkout under an executor provably gone; one that has not moved for {@link MANUAL_COMMIT_STUCK_MS}
 * without a live executor (a reserved one has none yet).
 */
function needsOperator(
  journal: ManualCommitJournal,
  hint: DocumentExecutorHint | undefined,
  options: ManualCommitReadOptions,
): string | undefined {
  if (journal.stage === 'recovery-required') {
    return MANUAL_COMMIT_RECOVERY_CODE;
  }

  if (journal.stage !== 'reserved' && journal.stage !== 'committing') {
    return undefined;
  }

  if (hint?.state === 'dead') {
    return MANUAL_COMMIT_INTERRUPTED_CODE;
  }

  if (hint?.state === 'alive') {
    return undefined;
  }

  const now = (options.nowMs ?? Date.now)();

  return now - Date.parse(journal.updatedAt) > MANUAL_COMMIT_STUCK_MS
    ? MANUAL_COMMIT_INTERRUPTED_CODE
    : undefined;
}

/**
 * The status of a manual commit as a `DocumentOperationStatus` (`action: manual-commit`), or
 * `undefined` when the id names none (the caller then looks for a document operation). An operation of
 * another Specification than `options.specId` does not exist for the caller.
 */
export async function readManualCommitStatus(
  context: ResolvedProjectHome,
  operationId: string,
  options: ManualCommitReadOptions = {},
): Promise<DocumentOperationStatus | undefined> {
  const journal = await findManualCommitForRead(context, operationId);
  if (journal === undefined) {
    return undefined;
  }

  if (options.specId !== undefined && subjectIdOf(journal) !== options.specId) {
    return undefined;
  }

  const executor = await executorHint(journal, options);
  const stage: DocumentOperationStage = journal.stage;

  return {
    operationId: journal.operationId,
    specId: subjectIdOf(journal),
    action: 'manual-commit',
    documentIds: [],
    createdAt: journal.createdAt,
    commit: commitInfoOfManualCommit(journal),
    stage,
    updatedAt: journal.settledAt ?? journal.updatedAt,
    ...(executor !== undefined ? { executor } : {}),
    actions: {
      retry: NO,
      abandon: NO,
      recover: needsOperator(journal, executor, options) !== undefined ? YES : NO,
    },
  };
}

/** A row of the operation list for a manual commit that needs the operator (ADR 0018 decision 11). */
export interface ManualCommitListingRow {
  readonly operationId: string;
  readonly kind: 'manual-commit';
  readonly subject?: { readonly specId: string };
  readonly action: 'manual-commit';
  readonly documentCount?: number;
  /** Stable code, never server text. */
  readonly code: string;
  /** ISO. */
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly status: 'recovery-required';
  readonly state: 'recovery-required';
  /** A manual commit is never judged by the idle-interrupted rule. */
  readonly staleExempt: true;
  /** The journal file could not be read: only its id and time are known. */
  readonly unreadable?: true;
}

export const MANUAL_COMMIT_RECOVERY_CODE = 'MANUAL_COMMIT_RECOVERY_REQUIRED';
export const MANUAL_COMMIT_INTERRUPTED_CODE = 'OPERATION_INTERRUPTED';

/**
 * The rows of the manual commits worth a person's attention: those in `recovery-required` and the
 * `reserved` or `committing` ones whose executor is provably gone or that showed no sign of life
 * for MANUAL_COMMIT_STUCK_MS. Completed and refused ones are never listed.
 * Active directory only: no lock, no Git; a bad file is a row of its own.
 */
export async function listManualCommitRows(
  context: ResolvedProjectHome,
  options: ManualCommitReadOptions = {},
): Promise<readonly ManualCommitListingRow[]> {
  const listing = await listRecordsTolerant(context, MANUAL_COMMIT_JOURNAL_KIND);
  const rows: ManualCommitListingRow[] = [];
  for (const journal of listing.records) {
    const code = needsOperator(journal, await executorHint(journal, options), options);
    if (code === undefined) {
      continue;
    }

    rows.push({
      operationId: journal.operationId,
      kind: 'manual-commit',
      subject: { specId: subjectIdOf(journal) },
      action: 'manual-commit',
      documentCount: journal.snapshot.pathCount,
      code,
      startedAt: journal.createdAt,
      updatedAt: journal.updatedAt,
      status: 'recovery-required',
      state: 'recovery-required',
      staleExempt: true,
    });
  }

  for (const entry of listing.unreadable) {
    rows.push({
      operationId: entry.operationId,
      kind: 'manual-commit',
      action: 'manual-commit',
      code: MANUAL_COMMIT_RECOVERY_CODE,
      updatedAt: entry.updatedAt.toISOString(),
      status: 'recovery-required',
      state: 'recovery-required',
      staleExempt: true,
      unreadable: true,
    });
  }

  return rows.sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      (left.operationId < right.operationId ? -1 : 1),
  );
}
