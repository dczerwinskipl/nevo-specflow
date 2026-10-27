import { isDeepStrictEqual } from 'node:util';

import type { ResolvedProjectHome } from '../../../project/home/home';
import { readPayload, withJournalLock } from '../../durable';
import { documentChangeError } from '../changes/errors';
import {
  DOCUMENT_BATCH_RECORD_VERSION,
  encodeBatchPaths,
  mergeBatchPaths,
  parseDocumentBatchRecord,
  type DocumentBatchRecord,
  type ExecutorIdentity,
} from '../changes/journal';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import type { DocumentChangePlan } from '../changes/plan/model';
import { readDocumentChangeJournal } from '../write/journal-store';
import type { ClassifiedCommitFailure } from '../../../version-control/commits/failure-class';
import { countFailedAttempt } from './backoff';
import {
  DOCUMENT_BATCH_KIND,
  publishDocumentBatch,
  readDocumentBatch,
  removeDocumentBatch,
  transitionDocumentBatch,
  writeBatchPaths,
} from './batch-store';
import { removeQueueLeaseOf } from './lease';
import { DISSOLVED_BY_SPLIT, reconcileBatchMembers } from './settlement';
import { splitBatch } from './split';

// The classification of a failed attempt is shared with the manual commit (same port, same lease).
export {
  NOT_TERMINATED,
  classifyCommitError,
  isBlockedBeforeCommit,
  type ClassifiedCommitFailure,
  type CommitFailureKind,
} from '../../../version-control/commits/failure-class';

/** What the failure handler sees of the attempt that failed. */
export interface FailureContext {
  readonly context: ResolvedProjectHome;
  readonly batch: DocumentBatchRecord;
  /** The executor that holds the batch: a failure is recorded only while the batch is still its own. */
  readonly executor: ExecutorIdentity;
  readonly now: () => string;
}

/**
 * What a recorded failure leaves, for the result of the run:
 * `failed` (batch failed), `recovery-required`, `requeued` (members queued, next attempt after the
 * backoff) or `split` (the failing part is a new failed batch, the rest is queued to be committed).
 */
export type RecordedFailure = 'failed' | 'recovery-required' | 'requeued' | 'split';

/** The plans of the members, read without the control lock (payload files never change). */
async function memberPlansOf(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
): Promise<Map<string, DocumentChangePlan>> {
  const plans = new Map<string, DocumentChangePlan>();
  for (const id of batch.memberIds) {
    const journal = await readDocumentChangeJournal(context, id);
    if (journal === undefined) continue;
    plans.set(
      id,
      decodePlanWithEvidence(
        await readPayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, id, journal.plan),
        journal.plan,
      ),
    );
  }
  return plans;
}

/**
 * Records a failed attempt (the caller holds the Project Home control lock). The batch record moves
 * first (it is the commit point), then the members, then the lease is released:
 *
 * - transient: the batch is `dissolved` with the failure as its reason, the members are `queued`
 *   again with the attempt counted (saturating) and `nextAttemptAt` after the backoff (1 s doubling
 *   to 60 s, then every 60 s for as long as the blocker lasts);
 * - permanent: the batch is `failed`, the members `commit-failed`; when `failure.paths` names only
 *   some of the batch's paths, the batch is split instead (see {@link splitLocked});
 * - uncertain: the batch is `recovery-required` and the members `recovery-required`.
 */
export async function recordCommitFailureLocked(
  failureContext: FailureContext,
  failure: ClassifiedCommitFailure,
  plans: ReadonlyMap<string, DocumentChangePlan> = new Map(),
): Promise<RecordedFailure> {
  const { context } = failureContext;
  // The record is read again: after an operator took the checkout over, a slow executor must not
  // publish a failure over a batch that somebody else committed (and removed) meanwhile.
  const batch = await readDocumentBatch(context, failureContext.batch.operationId);
  if (
    batch?.state !== 'committing' ||
    !isDeepStrictEqual(batch.executor, failureContext.executor)
  ) {
    throw documentChangeError('operation-state-invalid', 'The document batch moved.');
  }
  const now = failureContext.now();
  const attempts = countFailedAttempt(batch.attempts);
  const effective: ClassifiedCommitFailure = failure;

  if (effective.kind === 'permanent' && effective.paths !== undefined) {
    const split = splitBatch(
      batch.memberIds.map((id) => ({
        operationId: id,
        paths: plans.get(id)?.paths.map((entry) => entry.path) ?? [],
      })),
      effective.paths,
    );
    if (split !== undefined) {
      await splitLocked({ ...failureContext, batch }, effective, split.failed, plans, now);
      return 'split';
    }
  }

  const to =
    effective.kind === 'transient'
      ? 'dissolved'
      : effective.kind === 'permanent'
        ? 'failed'
        : 'recovery-required';
  const next = transitionDocumentBatch(
    context,
    batch,
    to,
    {
      reason: effective.reason,
      ...(effective.blockedBy !== undefined ? { blockedBy: effective.blockedBy } : {}),
      attempts,
    },
    now,
  );
  await publishDocumentBatch(context, next);
  await reconcileBatchMembers(context, next, now);
  if (to === 'dissolved') await removeDocumentBatch(context, next.operationId);
  await removeQueueLeaseOf(context, next.workspaceId, next.operationId);
  return to === 'dissolved' ? 'requeued' : to;
}

/**
 * Split-and-retry (ADR 0016 decision 13). The original batch is dissolved (its members go back to
 * `queued` as they were) and its record is removed; then the members that cannot be committed become
 * ONE NEW `failed` batch of their own, named by its own first member, and the rest are left queued
 * to be formed into a new batch and committed. Two live records never share an id, and no operation
 * is in both batches. Every step is one write and the order makes a stop harmless: before the new
 * record exists the members are simply queued (the attempt is made again and splits again); once it
 * exists the members it lists are moved to `commit-failed` by whoever reads it next.
 */
async function splitLocked(
  failureContext: FailureContext,
  failure: ClassifiedCommitFailure,
  failedIds: readonly string[],
  plans: ReadonlyMap<string, DocumentChangePlan>,
  now: string,
): Promise<void> {
  const { context, batch } = failureContext;
  const dissolved = transitionDocumentBatch(
    context,
    batch,
    'dissolved',
    { reason: DISSOLVED_BY_SPLIT },
    now,
  );
  await publishDocumentBatch(context, dissolved);
  await reconcileBatchMembers(context, dissolved, now);
  await removeDocumentBatch(context, batch.operationId);

  const id = failedIds[0]!;
  const encoded = encodeBatchPaths(
    mergeBatchPaths(failedIds.map((memberId) => plans.get(memberId)!)),
  );
  await writeBatchPaths(context, id, encoded);
  const record = parseDocumentBatchRecord(
    context,
    {
      version: DOCUMENT_BATCH_RECORD_VERSION,
      projectId: batch.projectId,
      operationId: id,
      workspaceId: batch.workspaceId,
      workspaceRoot: batch.workspaceRoot,
      specId: batch.specId,
      slug: batch.slug,
      state: 'failed',
      memberIds: failedIds,
      paths: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: encoded.pathCount },
      branch: batch.branch,
      parentHead: batch.parentHead,
      ...(batch.commitStartedAt !== undefined ? { commitStartedAt: batch.commitStartedAt } : {}),
      createdAt: now,
      updatedAt: now,
      attempts: countFailedAttempt(batch.attempts),
      reason: failure.reason,
      ...(failure.blockedBy !== undefined ? { blockedBy: failure.blockedBy } : {}),
    },
    id,
  );
  await publishDocumentBatch(context, record);
  await reconcileBatchMembers(context, record, now);
  await removeQueueLeaseOf(context, batch.workspaceId, batch.operationId);
}

/**
 * The default failure handler: reads the plans of the members when the failure names paths (outside
 * the lock), then {@link recordCommitFailureLocked} inside one control-lock section.
 */
export async function recordCommitFailure(
  failureContext: FailureContext,
  failure: ClassifiedCommitFailure,
): Promise<RecordedFailure> {
  const plans =
    failure.kind === 'permanent' && failure.paths !== undefined
      ? await memberPlansOf(failureContext.context, failureContext.batch)
      : new Map<string, DocumentChangePlan>();
  return withJournalLock(failureContext.context, DOCUMENT_BATCH_KIND, () =>
    recordCommitFailureLocked(failureContext, failure, plans),
  );
}
