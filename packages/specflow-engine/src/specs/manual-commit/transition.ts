import type { ExecutorIdentity } from '../durable/executor-identity';
import { manualCommitError } from './errors';
import {
  canTransitionManualCommit,
  type ManualCommitJournal,
  type ManualCommitOutcome,
  type ManualCommitStage,
} from './model';

/** What a transition sets; everything a stage does not keep is dropped. */
export interface ManualCommitTransitionPatch {
  readonly executor?: ExecutorIdentity;
  readonly parentHead?: string;
  readonly commitStartedAt?: string;
  readonly outcome?: ManualCommitOutcome;
  readonly sha?: string;
  readonly pathCount?: number;
  readonly reason?: string;
  readonly blockedBy?: string;
}

/**
 * The journal after moving to `to`: a pure function of the record, the stage and the patch. An illegal
 * move throws `operation-state-invalid`. `executor` lives only while `committing`; `reason` and
 * `blockedBy` belong to the stage that set them (a resumed `committing` forgets the failure it
 * resumes from); `sha`, `outcome` and `pathCount` belong to `completed`.
 */
export function transitionManualCommit(
  journal: ManualCommitJournal,
  to: ManualCommitStage,
  patch: ManualCommitTransitionPatch,
  now: string,
): ManualCommitJournal {
  if (!canTransitionManualCommit(journal.stage, to)) {
    throw manualCommitError(
      'operation-state-invalid',
      `A manual commit cannot move from ${journal.stage} to ${to}.`,
    );
  }
  const settles = to === 'completed' || to === 'failed';
  const parentHead = patch.parentHead ?? journal.parentHead;
  const commitStartedAt = patch.commitStartedAt ?? journal.commitStartedAt;
  const executor = to === 'committing' ? (patch.executor ?? journal.executor) : undefined;
  return {
    version: journal.version,
    projectId: journal.projectId,
    operationId: journal.operationId,
    workspaceId: journal.workspaceId,
    workspaceRoot: journal.workspaceRoot,
    scope: journal.scope,
    ...(journal.specId !== undefined ? { specId: journal.specId } : {}),
    owners: journal.owners,
    inputFingerprint: journal.inputFingerprint,
    stage: to,
    branch: journal.branch,
    snapshot: journal.snapshot,
    message: journal.message,
    createdAt: journal.createdAt,
    updatedAt: now,
    ...(parentHead !== undefined ? { parentHead } : {}),
    ...(executor !== undefined ? { executor } : {}),
    ...(commitStartedAt !== undefined ? { commitStartedAt } : {}),
    ...(to === 'completed' && patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
    ...(to === 'completed' && patch.outcome === 'committed' && patch.sha !== undefined
      ? { sha: patch.sha }
      : {}),
    ...(to === 'completed' && patch.pathCount !== undefined ? { pathCount: patch.pathCount } : {}),
    ...(to !== 'committing' && patch.reason !== undefined ? { reason: patch.reason } : {}),
    ...(to !== 'committing' && patch.blockedBy !== undefined ? { blockedBy: patch.blockedBy } : {}),
    ...(settles ? { settledAt: now } : {}),
  };
}
