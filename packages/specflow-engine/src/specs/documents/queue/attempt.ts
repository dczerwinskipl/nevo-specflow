import { isDeepStrictEqual } from 'node:util';

import { withJournalLock } from '../../durable';
import { documentChangeError } from '../changes/errors';
import { decideBatchReplay } from '../changes/inspection';
import {
  parseDocumentBatchRecord,
  type DocumentBatchRecord,
  type DocumentChangeJournal,
} from '../changes/journal';
import { isNonBlobState } from '../../../version-control/commits/document-change';
import {
  DOCUMENT_BATCH_KIND,
  publishDocumentBatch,
  readBatchPaths,
  readDocumentBatch,
} from './batch-store';
import { batchCommitRequest, type BatchCommitMember } from './commit-request';
import {
  lookUpBatchCommit,
  pathsRefusedWith,
  provablyNotCommitted,
  type BatchEvidence,
} from './evidence';
import {
  NOT_TERMINATED,
  classifyCommitError,
  isBlockedBeforeCommit,
  type ClassifiedCommitFailure,
} from './failure';
import { inspectBatch } from './inspect';
import type { QueueRuntime } from './runtime';
import { QueueInterrupted } from './types';
import { planOfJournal } from './uncommitted';
import { commitHoldsPaths } from './verify';

/** How one attempt to commit a claimed batch ended. */
export type Attempt =
  | { readonly kind: 'committed'; readonly sha: string; readonly paths: readonly string[] }
  /** The effective set is empty: the members complete without a Git mutation. */
  | { readonly kind: 'nothing' }
  | { readonly kind: 'failed'; readonly failure: ClassifiedCommitFailure };

export interface AttemptResult {
  readonly attempt: Attempt;
  /** The batch record as it is now (the parent may have been read again, the start of the commit recorded). */
  readonly batch: DocumentBatchRecord;
}

const failed = (failure: ClassifiedCommitFailure): Attempt => ({ kind: 'failed', failure });

/** Rewrites the record of the batch this executor holds; any other state means somebody moved it. */
async function updateOwnRecord(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  change: (current: DocumentBatchRecord) => Record<string, unknown>,
): Promise<DocumentBatchRecord> {
  const own = await rt.executor();
  return withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    const current = await readDocumentBatch(rt.context, batch.operationId);
    if (current?.state !== 'committing' || !isDeepStrictEqual(current.executor, own)) {
      throw documentChangeError('operation-state-invalid', 'The document batch moved.');
    }
    const next = parseDocumentBatchRecord(
      rt.context,
      { ...current, ...change(current), updatedAt: rt.nowIso() },
      current.operationId,
    );
    await publishDocumentBatch(rt.context, next);
    return next;
  });
}

/**
 * Executes one attempt of a claimed batch: (after a stop, or after failed attempts) the look-up of
 * a commit that already carries the batch's trailer, the effective set, the guard against foreign
 * edits and directories where documents belong, the commit and its verification. The commit port's
 * errors become a classified failure; anything else (the queue's own storage, a bug) propagates and
 * leaves the claim for the caller to give back.
 */
export async function attemptCommit(
  rt: QueueRuntime,
  start: DocumentBatchRecord,
  held: readonly DocumentChangeJournal[],
  resumed: boolean,
): Promise<AttemptResult> {
  const { commits, checkout } = rt;
  const root = checkout.root;
  let batch = start;
  const result = (attempt: Attempt): AttemptResult => ({ attempt, batch });
  try {
    const expectations = await readBatchPaths(rt.context, batch);
    const paths = expectations.map((entry) => entry.path);

    // After a stop or a failed attempt a commit with the batch's trailer on top of the recorded parent
    // may exist: it is accepted when it is the whole batch, never repeated.
    if (resumed || batch.attempts > 0) {
      let evidence: BatchEvidence = await lookUpBatchCommit(rt, batch, expectations);
      if (evidence.kind === 'history-changed') {
        if (batch.commitStartedAt !== undefined) {
          return result(failed({ kind: 'uncertain', reason: 'history-changed' }));
        }
        // No commit was started, so none can be lost: the rewritten parent is read again.
        const head = await commits.head(root);
        if (head === undefined) return result(failed({ kind: 'permanent', reason: 'no-commits' }));
        batch = await updateOwnRecord(rt, batch, () => ({ parentHead: head }));
        evidence = await lookUpBatchCommit(rt, batch, expectations);
      }
      if (evidence.kind === 'committed') {
        return result({ kind: 'committed', sha: evidence.sha, paths: evidence.paths });
      }
      if (evidence.kind === 'foreign-commit' || evidence.kind === 'history-changed') {
        return result(
          failed({ kind: 'uncertain', reason: 'uncertain', blockedBy: 'foreign-commit' }),
        );
      }
    }

    const split = await commits.effectivePaths(root, paths);
    const inspections = await inspectBatch(root, expectations, split.facts);
    // A path that is neither before nor after the batch is someone else's edit: never committed silently.
    const foreign = inspections.filter((entry) => entry.state === 'foreign').map((e) => e.path);
    if (foreign.length > 0) {
      return result(failed({ kind: 'permanent', reason: 'content-changed', paths: foreign }));
    }
    // A directory where a document belongs (or the reverse) cannot be committed as a document.
    const misplaced = split.facts
      .filter(
        (fact) =>
          split.effective.includes(fact.path) &&
          (isNonBlobState(fact.head) || isNonBlobState(fact.working)),
      )
      .map((fact) => fact.path);
    if (misplaced.length > 0) {
      return result(
        failed({
          kind: 'permanent',
          reason: 'commit-failed',
          blockedBy: 'path-kind-conflict',
          paths: misplaced,
        }),
      );
    }
    if (decideBatchReplay(inspections) === 'done' || split.effective.length === 0) {
      // A->B->A, or already in HEAD: nothing to commit and no Git mutation.
      return result({ kind: 'nothing' });
    }
    const members = await Promise.all(held.map((journal) => commitMember(rt, journal)));
    await rt.hooks.beforeCommit?.(batch);
    // Recorded before Git runs: from here on a commit may exist.
    batch = await updateOwnRecord(rt, batch, () => ({ commitStartedAt: rt.nowIso() }));
    const committed = await commits.commit(
      batchCommitRequest(batch, root, members, split, rt.options.commitDeadlineMs),
    );
    await rt.hooks.afterCommit?.(batch, committed.sha);
    // A foreign write between the guard and the add is inside the commit: it is not the recorded content.
    if (!(await commitHoldsPaths(commits, root, expectations, split.effective, committed.sha))) {
      return result(
        failed({ kind: 'uncertain', reason: 'uncertain', blockedBy: 'commit-content-mismatch' }),
      );
    }
    return result({ kind: 'committed', sha: committed.sha, paths: split.effective });
  } catch (error) {
    const classified = classifyCommitError(error);
    if (classified === undefined) throw error;
    return result(await refined(rt, batch, classified));
  }
}

/**
 * A member of the commit with its plan, which only words the message: a plan that cannot be read
 * (the claim already failed such an operation alone) leaves the member with its action.
 */
async function commitMember(
  rt: QueueRuntime,
  journal: DocumentChangeJournal,
): Promise<BatchCommitMember> {
  const member = { operationId: journal.operationId, action: journal.action };
  try {
    return { ...member, plan: await planOfJournal(rt.context, journal) };
  } catch (error) {
    if (error instanceof QueueInterrupted) throw error;
    return member;
  }
}

/**
 * Sharpens a classified failure with what the repository can still tell:
 * - an ignored path is found (by halving, within a budget), so the rest of the batch is committed;
 * - once the commit was started, a failure that does not prove the commit never ran (anything but
 *   the port's own blockers, which come before it) is checked against the repository FIRST: a commit
 *   that is the whole batch completes it, whatever the failure was. Only provably no commit (no
 *   trailer, HEAD unchanged, no index lock, and a Git process that is known to have ended) is a
 *   retryable failure; anything else, or a repository that cannot be asked, stays for the operator.
 */
async function refined(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  failure: ClassifiedCommitFailure,
): Promise<Attempt> {
  const started = batch.commitStartedAt !== undefined;
  const maybeLanded =
    started &&
    (failure.kind === 'uncertain' ||
      (failure.kind === 'transient' && !isBlockedBeforeCommit(failure.reason)));
  try {
    const expectations = await readBatchPaths(rt.context, batch);
    const paths = expectations.map((entry) => entry.path);
    if (
      failure.kind === 'permanent' &&
      failure.blockedBy === undefined &&
      failure.reason === 'path-ignored'
    ) {
      const ignored = await pathsRefusedWith(rt, batch, paths, 'path-ignored');
      if (ignored === undefined) return failed({ ...failure, blockedBy: 'bisection-limit' });
      return failed(ignored.length > 0 ? { ...failure, paths: ignored } : failure);
    }
    if (maybeLanded) {
      const evidence = await lookUpBatchCommit(rt, batch, expectations);
      if (evidence.kind === 'committed') {
        return { kind: 'committed', sha: evidence.sha, paths: evidence.paths };
      }
      if (evidence.kind === 'foreign-commit') {
        return failed({ kind: 'uncertain', reason: 'uncertain', blockedBy: 'foreign-commit' });
      }
      if (evidence.kind === 'history-changed') {
        return failed({ kind: 'uncertain', reason: 'history-changed' });
      }
      // No commit. A Git process that may still be running (`not-terminated`) makes that no proof.
      if (failure.blockedBy !== NOT_TERMINATED && (await provablyNotCommitted(rt, batch, paths))) {
        return failed(
          failure.kind === 'transient'
            ? failure
            : { kind: 'transient', reason: 'git-timeout', blockedBy: 'uncertain' },
        );
      }
      return failed(
        failure.kind === 'transient'
          ? { kind: 'uncertain', reason: 'uncertain', blockedBy: failure.reason }
          : failure,
      );
    }
  } catch (error) {
    if (classifyCommitError(error) === undefined) throw error;
    // The repository cannot be asked whether the commit landed.
    if (maybeLanded && failure.kind === 'transient') {
      return failed({ kind: 'uncertain', reason: 'uncertain', blockedBy: failure.reason });
    }
  }
  return failed(failure);
}
