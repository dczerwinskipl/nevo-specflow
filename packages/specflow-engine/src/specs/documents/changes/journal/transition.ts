import { documentChangeError } from '../errors';
import { parseDocumentChangeJournal } from './codec';
import type { DocumentChangeJournal, DocumentChangeOutcome, ExecutorIdentity } from './model';
import {
  canTransitionDocumentChange,
  isWriterStage,
  type DocumentChangeStage,
  type DocumentRecoveryPhase,
} from './stages';

/** What a transition sets. Everything a stage does not keep is dropped unless the patch names it again. */
export interface DocumentChangeTransitionPatch {
  readonly executor?: ExecutorIdentity;
  readonly recoveryPhase?: DocumentRecoveryPhase;
  readonly batchId?: string;
  readonly attempts?: number;
  readonly nextAttemptAt?: string;
  readonly reason?: string;
  readonly blockedBy?: string;
  readonly outcome?: DocumentChangeOutcome;
  readonly sha?: string;
  readonly coalescedWith?: number;
}

/**
 * The journal after moving to `to`: a pure function of the journal, the stage and the patch. An
 * illegal move, or a result that would not decode, throws; nothing is partially applied. The writer
 * and the queue persist the returned value under the control lock.
 *
 * Carry-over rules: the writer's `executor` lives while the operation is being written; a
 * `recoveryPhase` only while it is `recovery-required`; `reason`, `blockedBy` and `nextAttemptAt` are
 * facts of one stage and must be named again; the `batchId` leaves with a dissolve (back to
 * `queued`); `queuedAt` is the first acknowledgement and never changes afterwards.
 */
export function transitionDocumentChange(
  journal: DocumentChangeJournal,
  to: DocumentChangeStage,
  patch: DocumentChangeTransitionPatch,
  now: string,
): DocumentChangeJournal {
  if (!canTransitionDocumentChange(journal.stage, to)) {
    throw documentChangeError(
      'operation-state-invalid',
      `A document operation cannot move from ${journal.stage} to ${to}.`,
    );
  }
  const keepsExecutor = isWriterStage(to);
  const acknowledged = to === 'queued' || to === 'committing' || to === 'commit-failed';
  const keepsBatch = to !== 'queued' && !isWriterStage(to) && to !== 'failed';
  const queuedAt = journal.queuedAt ?? (acknowledged ? now : undefined);
  const completed = to === 'completed';

  const next: DocumentChangeJournal = {
    version: journal.version,
    projectId: journal.projectId,
    operationId: journal.operationId,
    specId: journal.specId,
    slug: journal.slug,
    workspaceId: journal.workspaceId,
    workspaceRoot: journal.workspaceRoot,
    action: journal.action,
    inputFingerprint: journal.inputFingerprint,
    sequence: journal.sequence,
    createdAt: journal.createdAt,
    updatedAt: now,
    stage: to,
    plan: journal.plan,
    ...(journal.commit !== undefined ? { commit: journal.commit } : {}),
    ...(journal.commitMode !== undefined ? { commitMode: journal.commitMode } : {}),
    ...(keepsExecutor ? executorOf(journal, patch) : {}),
    ...(to === 'recovery-required' && patch.recoveryPhase !== undefined
      ? { recoveryPhase: patch.recoveryPhase }
      : {}),
    ...(queuedAt !== undefined ? { queuedAt } : {}),
    ...(keepsBatch ? batchOf(journal, patch) : {}),
    attempts: patch.attempts ?? journal.attempts,
    ...(patch.nextAttemptAt !== undefined ? { nextAttemptAt: patch.nextAttemptAt } : {}),
    ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
    ...(patch.blockedBy !== undefined ? { blockedBy: patch.blockedBy } : {}),
    ...(completed && patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
    ...(completed && patch.sha !== undefined ? { sha: patch.sha } : {}),
    ...(completed && patch.coalescedWith !== undefined
      ? { coalescedWith: patch.coalescedWith }
      : {}),
    ...(completed ? { settledAt: now } : {}),
  };
  return parseDocumentChangeJournal(
    { project: { projectId: journal.projectId } },
    next,
    journal.operationId,
  );
}

function executorOf(
  journal: DocumentChangeJournal,
  patch: DocumentChangeTransitionPatch,
): { executor?: ExecutorIdentity } {
  const executor = patch.executor ?? journal.executor;
  return executor !== undefined ? { executor } : {};
}

function batchOf(
  journal: DocumentChangeJournal,
  patch: DocumentChangeTransitionPatch,
): { batchId?: string } {
  const batchId = patch.batchId ?? journal.batchId;
  return batchId !== undefined ? { batchId } : {};
}
