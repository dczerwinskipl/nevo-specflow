import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../../application';
import { withJournalLock } from '../../durable';
import { pruneUncommitted } from '../../uncommitted';
import { documentChangeError } from '../changes/errors';
import type { DocumentBatchRecord, DocumentChangeJournal } from '../changes/journal';
import {
  listDocumentChangeJournals,
  readDocumentChangeJournal,
  settleDocumentChangeJournal,
} from '../write/journal-store';
import {
  DOCUMENT_BATCH_KIND,
  publishDocumentBatch,
  readBatchPaths,
  readDocumentBatch,
  removeDocumentBatch,
  transitionDocumentBatch,
} from './batch-store';
import { attemptCommit } from './attempt';
import { claimNextBatch, hasQueueWork } from './claim';
import { recordCommitFailure, type ClassifiedCommitFailure } from './failure';
import { lookUpBatchCommit } from './evidence';
import { applyGateToQueued, checkoutGate } from './gates';
import { markLeaseActive, markLeaseIdle, readQueueLease, removeQueueLeaseOf } from './lease';
import { createQueueRuntime, type QueueRuntime } from './runtime';
import { completeHeldMembersWithoutCommit, holdsMember, reconcileBatchMember } from './settlement';
import {
  QueueInterrupted,
  checkoutOfEngine,
  type QueueCheckout,
  type QueueDependencies,
  type QueueOptions,
  type QueueRunResult,
} from './types';

/** `Nevo-Documents` of an empty effective set is meaningless: members complete with this reason. */
export const NOTHING_TO_COMMIT = 'nothing-to-commit';

/**
 * ONE pass of the queue for a checkout, explicitly called (no timers, no scheduler): settle what
 * the previous pass left completed, claim the next batch, execute it, record the outcome. At most
 * one batch is executed per call; {@link drainQueue} repeats until nothing is claimable.
 *
 * The failure handling plugs in through `QueueDependencies.onCommitFailure`; the scheduler calls this
 * function (or `drainQueue`) on its timers and on `flush`.
 */
export async function runQueueOnce(
  engine: SpecFlowEngine,
  deps: QueueDependencies = {},
  checkout: QueueCheckout = checkoutOfEngine(engine),
  options: QueueOptions = {},
): Promise<QueueRunResult> {
  const rt = createQueueRuntime(engine, deps, checkout, options);
  // One run per checkout in this process (the module-wide registry also covers a second copy of it).
  if (!markLeaseActive(checkout.workspaceId)) return { status: 'busy', reason: 'lease-held' };
  try {
    await settleCompletedJournals(rt);
    const gate = await checkoutGate(rt);
    if (gate !== undefined) {
      // Git turned off, or the checkout gone: what waits in the queue cannot be committed.
      const operationIds = await applyGateToQueued(rt, gate);
      await settleCompletedJournals(rt);
      if (operationIds.length > 0) return { status: 'unavailable', reason: gate, operationIds };
    }
    if (!(await hasQueueWork(rt))) return { status: 'idle', reason: 'no-queued-operations' };
    // A checkout that cannot take commits has no HEAD to read; a claimed batch is failed by its gate.
    const claim = await claimNextBatch(rt, () =>
      gate === undefined ? rt.commits.head(checkout.root) : Promise.resolve(undefined),
    );
    if (claim.kind === 'busy') return { status: 'busy', reason: 'lease-held' };
    if (claim.kind === 'idle') {
      // A takeover may have completed members of a batch that was recorded before a stop.
      await settleCompletedJournals(rt);
      return {
        status: 'idle',
        reason: claim.reason,
        ...(claim.waitMs !== undefined ? { waitMs: claim.waitMs } : {}),
      };
    }
    await rt.hooks.afterClaim?.(claim.batch);
    return await executeBatch(rt, claim.batch, claim.resumed);
  } catch (error) {
    // An error that is not a simulated stop must not leave the lease to a live process.
    if (!(error instanceof QueueInterrupted)) await releaseAfterError(rt).catch(() => undefined);
    throw error;
  } finally {
    markLeaseIdle(checkout.workspaceId);
  }
}

/** Runs the queue until nothing is claimable, a lease is held elsewhere, or an attempt was re-queued. */
export async function drainQueue(
  engine: SpecFlowEngine,
  deps: QueueDependencies = {},
  checkout: QueueCheckout = checkoutOfEngine(engine),
  options: QueueOptions = {},
): Promise<readonly QueueRunResult[]> {
  const results: QueueRunResult[] = [];
  for (;;) {
    const result = await runQueueOnce(engine, deps, checkout, options);
    results.push(result);
    // A re-queued attempt waits for its backoff: the caller (the scheduler) comes back at the time
    // `idle` reports. A split goes on at once with the rest of the batch.
    if (
      result.status === 'idle' ||
      result.status === 'busy' ||
      result.status === 'unavailable' ||
      (result.status === 'failed' && result.outcome === 'requeued')
    ) {
      return results;
    }
  }
}

/** Completed journals still in the active directory (a stop before the move) go to `settled/`. */
async function settleCompletedJournals(rt: QueueRuntime): Promise<void> {
  for (const journal of await listDocumentChangeJournals(rt.context)) {
    if (journal.workspaceId !== rt.checkout.workspaceId || journal.stage !== 'completed') continue;
    await settleDocumentChangeJournal(rt.context, journal.operationId).catch(() => undefined);
  }
}

async function heldMembers(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
): Promise<DocumentChangeJournal[]> {
  const held: DocumentChangeJournal[] = [];
  for (const id of batch.memberIds) {
    const journal = await readDocumentChangeJournal(rt.context, id);
    if (journal !== undefined && holdsMember(journal, batch.operationId)) held.push(journal);
  }
  return held;
}

/**
 * Executes a claimed batch: the gates (Git turned off, the checkout gone), one attempt to commit it
 * (`attempt.ts`), and the record of the outcome. A failed attempt goes to the failure handler
 * (`QueueDependencies.onCommitFailure`); anything that is not a commit failure (the queue's own
 * storage, a bug) propagates and the caller gives the claim back.
 */
async function executeBatch(
  rt: QueueRuntime,
  claimed: DocumentBatchRecord,
  resumed: boolean,
): Promise<QueueRunResult> {
  const held = await heldMembers(rt, claimed);
  const operationIds = held.map((journal) => journal.operationId);
  if (held.length === 0) {
    // Every member finished before the stop: only the cleanup is left.
    await finishWithoutCommit(rt, claimed, claimed.memberIds);
    return { status: 'not-applicable', batchId: claimed.operationId, operationIds, resumed };
  }

  const handler = rt.deps.onCommitFailure ?? recordCommitFailure;
  const fail = async (
    batch: DocumentBatchRecord,
    failure: ClassifiedCommitFailure,
  ): Promise<QueueRunResult> => {
    const outcome = await handler(
      { context: rt.context, batch, executor: await rt.executor(), now: () => rt.nowIso() },
      failure,
    );
    return {
      status: 'failed',
      batchId: batch.operationId,
      operationIds,
      outcome,
      // A transient failure that ends the batch for good was the last of its attempts.
      reason:
        failure.kind === 'transient' && outcome === 'failed' ? 'retries-exhausted' : failure.reason,
    };
  };

  const gate = await checkoutGate(rt);
  if (gate === 'git-disabled') {
    // A crash after the commit and before it was recorded: the commit is still the batch's, and its
    // sha is recorded before Git is given up on.
    const landed = await landedCommit(rt, claimed);
    if (landed !== undefined) {
      await recordCommitted(rt, claimed, landed.sha, operationIds);
      return {
        status: 'committed',
        batchId: claimed.operationId,
        sha: landed.sha,
        operationIds,
        paths: landed.paths,
        resumed,
      };
    }
    await completeWithoutCommit(rt, claimed, operationIds, 'git-disabled');
    return { status: 'not-applicable', batchId: claimed.operationId, operationIds, resumed };
  }
  if (gate === 'workspace-missing') {
    return fail(claimed, { kind: 'permanent', reason: 'workspace-missing' });
  }

  const { attempt, batch } = await attemptCommit(rt, claimed, held, resumed);
  if (attempt.kind === 'failed') return fail(batch, attempt.failure);
  if (attempt.kind === 'nothing') {
    await completeWithoutCommit(rt, batch, operationIds, NOTHING_TO_COMMIT);
    return { status: 'not-applicable', batchId: batch.operationId, operationIds, resumed };
  }
  await recordCommitted(rt, batch, attempt.sha, operationIds);
  return {
    status: 'committed',
    batchId: batch.operationId,
    sha: attempt.sha,
    operationIds,
    paths: attempt.paths,
    resumed,
  };
}

/** The batch record says `committed` (the commit point), then the members follow, then the cleanup. */
async function recordCommitted(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  sha: string,
  operationIds: readonly string[],
): Promise<void> {
  const recorded = await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    const current = await readDocumentBatch(rt.context, batch.operationId);
    if (current?.state !== 'committing') {
      throw documentChangeError('operation-state-invalid', 'The document batch moved.');
    }
    const next = transitionDocumentBatch(rt.context, current, 'committed', { sha }, rt.nowIso());
    await publishDocumentBatch(rt.context, next);
    return next;
  });
  await rt.hooks.afterBatchRecorded?.(recorded);
  // One short lock section per member, so reservations are not held back by a long batch.
  for (const memberId of recorded.memberIds) {
    await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, () =>
      reconcileBatchMember(rt.context, recorded, memberId, rt.nowIso()),
    );
  }
  await rt.hooks.afterMembersCompleted?.(recorded);
  // Paths of the ledger (an abandoned batch, a stretch with auto-commit off) that this commit holds
  // are committed now. A stop before this leaves them for the next prune (flush, sweep, Close).
  await pruneUncommitted(rt.engine, {
    workspaceId: recorded.workspaceId,
    commits: rt.commits,
    now: () => rt.nowIso(),
  }).catch(() => undefined);
  await settleMembers(rt, operationIds);
  await rt.hooks.afterSettled?.(recorded);
  await releaseBatch(rt, recorded);
}

async function completeWithoutCommit(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  operationIds: readonly string[],
  reason: string,
): Promise<void> {
  await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, () =>
    completeHeldMembersWithoutCommit(rt.context, batch, reason, rt.nowIso()),
  );
  await rt.hooks.afterMembersCompleted?.(batch);
  await finishWithoutCommit(rt, batch, operationIds);
}

async function finishWithoutCommit(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  operationIds: readonly string[],
): Promise<void> {
  await settleMembers(rt, operationIds);
  await releaseBatch(rt, batch);
}

async function settleMembers(rt: QueueRuntime, operationIds: readonly string[]): Promise<void> {
  for (const id of operationIds) {
    const journal = await readDocumentChangeJournal(rt.context, id);
    if (journal?.stage === 'completed') await settleDocumentChangeJournal(rt.context, id);
  }
}

/** Removes the finished batch record with its path list, then releases the lease. */
async function releaseBatch(rt: QueueRuntime, batch: DocumentBatchRecord): Promise<void> {
  await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    await removeDocumentBatch(rt.context, batch.operationId);
    await removeQueueLeaseOf(rt.context, batch.workspaceId, batch.operationId);
  });
}

/** A commit of the batch that is in the repository already, or `undefined`. */
async function landedCommit(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
): Promise<{ sha: string; paths: readonly string[] } | undefined> {
  if (batch.commitStartedAt === undefined) return undefined;
  const evidence = await lookUpBatchCommit(rt, batch, await readBatchPaths(rt.context, batch));
  return evidence.kind === 'committed' ? { sha: evidence.sha, paths: evidence.paths } : undefined;
}

/**
 * Gives the checkout back after an error that is neither a commit failure nor a stop. A batch that
 * is still `committing` is first checked for a commit it may have made already (the error can come
 * after it): such a commit is recorded. Otherwise the batch is dissolved like a transient failure
 * (its members go back to `queued`, the attempt counted), and when the repository cannot be asked
 * after the commit was started it needs recovery instead. Any other lease is simply released. Best
 * effort: when the records cannot be written the next run finds them as they are and judges the
 * executor.
 */
async function releaseAfterError(rt: QueueRuntime): Promise<void> {
  const handler = rt.deps.onCommitFailure ?? recordCommitFailure;
  const own = await rt.executor();
  const lease = await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, () =>
    readQueueLease(rt.context, rt.checkout.workspaceId),
  );
  if (lease === undefined || !isDeepStrictEqual(lease.executor, own)) return;
  const batch = await readDocumentBatch(rt.context, lease.batchId);
  if (batch?.state === 'committing') {
    const context = { context: rt.context, batch, executor: own, now: () => rt.nowIso() };
    let landed;
    try {
      landed = await landedCommit(rt, batch);
    } catch {
      await handler(context, { kind: 'uncertain', reason: 'uncertain', blockedBy: 'queue-error' });
      return;
    }
    if (landed !== undefined) {
      const held = await heldMembers(rt, batch);
      await recordCommitted(
        rt,
        batch,
        landed.sha,
        held.map((journal) => journal.operationId),
      );
      return;
    }
    await handler(context, { kind: 'transient', reason: 'queue-error' });
    return;
  }
  await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, () =>
    removeQueueLeaseOf(rt.context, rt.checkout.workspaceId, lease.batchId),
  );
}
