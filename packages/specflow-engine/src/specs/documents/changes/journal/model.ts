import type { ExecutorIdentity } from '../../../durable/executor-identity';
import type { DocumentChangeAction } from '../plan/model';
import type { PlanEvidence } from '../plan/codec';
import type { DocumentChangeStage, DocumentRecoveryPhase } from './stages';

/** The only operation-journal format this Engine writes and interprets. */
export const DOCUMENT_CHANGE_JOURNAL_VERSION = 1;

/** Directory of operation journals below the Project state root; `settled/`, `batches/` and `leases/` sit below it. */
export const DOCUMENT_JOURNAL_RELATIVE_DIR = 'engine/operations/documents';
export const DOCUMENT_BATCH_RELATIVE_DIR = DOCUMENT_JOURNAL_RELATIVE_DIR + '/batches';
export const DOCUMENT_LEASE_RELATIVE_DIR = DOCUMENT_JOURNAL_RELATIVE_DIR + '/leases';

// Who runs a step is defined by the durable core (the lease and the manual-commit journal use it too).
export type { ExecutorIdentity };

/**
 * How a `completed` operation ended. `uncommitted`: the files are on disk and recorded in the
 * uncommitted-changes ledger, not in Git (reason `auto-commit-off` or `abandoned`).
 */
export const DOCUMENT_CHANGE_OUTCOMES = ['committed', 'not-applicable', 'uncommitted'] as const;
export type DocumentChangeOutcome = (typeof DOCUMENT_CHANGE_OUTCOMES)[number];

/**
 * Who commits the operation's files, pinned at admission (ADR 0018 decision 4): `auto` goes through
 * the queue, `manual` (auto-commit off) completes uncommitted and is committed only by a manual commit.
 */
export const DOCUMENT_COMMIT_MODES = ['auto', 'manual'] as const;
export type DocumentCommitMode = (typeof DOCUMENT_COMMIT_MODES)[number];

/** Evidence of the plan file: hash and size (the payload key), and the counts the journal reports. */
export interface JournalPlanEvidence extends PlanEvidence {
  readonly pathCount: number;
  readonly documentCount: number;
}

/**
 * The durable record of one document operation (`engine/operations/documents/<operationId>.json`).
 * Counts, hashes and small facts only: the plan and the content live in the payload store, so the
 * file stays far below its cap whatever the operation touches.
 */
export interface DocumentChangeJournal {
  readonly version: typeof DOCUMENT_CHANGE_JOURNAL_VERSION;
  readonly projectId: string;
  readonly operationId: string;
  readonly specId: string;
  readonly slug: string;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly action: DocumentChangeAction;
  /** Canonical hash of the client request, `operationId` excluded (see `fingerprint.ts`). */
  readonly inputFingerprint: string;
  /** Monotonic per checkout, allocated under the control lock at reservation. */
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stage: DocumentChangeStage;
  readonly plan: JournalPlanEvidence;
  /** Pinned iff Git was enabled at reservation in `auto` mode: the branch the commit is made on. */
  readonly commit?: { readonly branch: string };
  /**
   * Pinned iff Git was enabled at reservation: `auto` (with `commit`) or `manual` (without it: no
   * preflight ran, the ledger holds the branch). Absent when Git was disabled.
   */
  readonly commitMode?: DocumentCommitMode;
  /** The writer, while the operation is `reserved` or `files-writing`. */
  readonly executor?: ExecutorIdentity;
  /** Where a `recovery-required` operation stopped. */
  readonly recoveryPhase?: DocumentRecoveryPhase;
  /** The acknowledgement point: when the operation became `queued`. */
  readonly queuedAt?: string;
  readonly batchId?: string;
  /** Failed commit attempts that went back to `queued`. */
  readonly attempts: number;
  readonly nextAttemptAt?: string;
  /** Open kebab-case: why it waits, failed, or completed without a commit. */
  readonly reason?: string;
  /** The commit port's own reason when a Git blocker is the cause. */
  readonly blockedBy?: string;
  readonly outcome?: DocumentChangeOutcome;
  /** The commit, when `outcome` is `committed`. */
  readonly sha?: string;
  /** Operations that share the commit (>= 0). */
  readonly coalescedWith?: number;
  readonly settledAt?: string;
}
