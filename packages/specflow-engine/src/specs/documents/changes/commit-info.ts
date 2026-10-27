import type {
  CommitFailureReason,
  CommitInfo,
  CommitState,
} from '@nevo/specflow-contracts/documents';

import type { DocumentChangeJournal } from './journal/model';
import { isWriterStage, type DocumentChangeStage } from './journal/stages';

/** A pending commit older than this is `overdue`. */
export const COMMIT_OVERDUE_AFTER_MS = 5 * 60 * 1000;

/**
 * The commit state each stage reports. `completed` depends on its outcome and is decided by
 * {@link commitInfoOfJournal}; every other stage has exactly one state, and `Record` makes adding a
 * stage a compile error here.
 */
export const COMMIT_STATE_OF_STAGE = {
  reserved: 'pending',
  'files-writing': 'pending',
  queued: 'pending',
  committing: 'pending',
  completed: 'by-outcome',
  // A refusal after reservation: nothing was written, nothing will be committed.
  failed: 'failed',
  'commit-failed': 'failed',
  'recovery-required': 'failed',
} as const satisfies Record<DocumentChangeStage, CommitState | 'by-outcome'>;

/**
 * Whether only the operator (CLI) can resolve a failed commit for this reason. Exhaustive over the
 * documented failure vocabulary.
 */
export const RECOVERY_REQUIRED_BY_FAILURE_REASON = {
  'branch-changed': false,
  'branch-protected': false,
  'branch-not-allowed': false,
  detached: false,
  'no-commits': false,
  'path-ignored': false,
  'index-unreadable': false,
  'commit-failed': false,
  'content-changed': false,
  'retries-exhausted': false,
  'history-changed': true,
  uncertain: true,
} as const satisfies Record<CommitFailureReason, boolean>;

/**
 * The reasons of a failed commit that come from the checkout and not from the content: the commit
 * port's own blockers a person has to resolve (a detached HEAD, a changed branch, an empty history,
 * an ignored path, an unreadable index). Another write to the same documents meets the same blocker,
 * so reads report such a failure as `commit-blocked`.
 */
export const COMMIT_BLOCKER_REASONS: readonly string[] = [
  'detached',
  'branch-changed',
  'no-commits',
  'path-ignored',
  'index-unreadable',
];

/** Why a write that has not reached `queued` is still `pending`. */
export const COMMIT_WRITING_REASON = 'writing';

/**
 * The commit state the contract reports for a journal, derived and never stored. `now` (epoch
 * milliseconds) only decides `overdue`.
 */
export function commitInfoOfJournal(journal: DocumentChangeJournal, now: number): CommitInfo {
  const mapped = COMMIT_STATE_OF_STAGE[journal.stage];
  const state: CommitState =
    mapped === 'by-outcome'
      ? journal.outcome === 'committed'
        ? 'committed'
        : journal.outcome === 'uncommitted'
          ? 'uncommitted'
          : 'not-applicable'
      : mapped;
  const pending = state === 'pending';
  const reason =
    journal.reason ?? (isWriterStage(journal.stage) ? COMMIT_WRITING_REASON : undefined);
  const queuedAt = journal.queuedAt;
  return {
    state,
    ...(journal.sha !== undefined ? { sha: journal.sha } : {}),
    ...(queuedAt !== undefined ? { queuedAt } : {}),
    ...(journal.settledAt !== undefined ? { settledAt: journal.settledAt } : {}),
    ...(journal.batchId !== undefined ? { batchId: journal.batchId } : {}),
    ...(journal.coalescedWith !== undefined ? { coalescedWith: journal.coalescedWith } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(journal.blockedBy !== undefined ? { blockedBy: journal.blockedBy } : {}),
    ...(pending ? { attempts: journal.attempts } : {}),
    ...(pending && journal.nextAttemptAt !== undefined
      ? { nextAttemptAt: journal.nextAttemptAt }
      : {}),
    ...(pending && queuedAt !== undefined
      ? { overdue: now - Date.parse(queuedAt) > COMMIT_OVERDUE_AFTER_MS }
      : {}),
    ...(journal.stage === 'recovery-required' ? { recoveryRequired: true } : {}),
  };
}
