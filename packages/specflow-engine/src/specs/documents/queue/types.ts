import type { SpecFlowEngine } from '../../../application';
import type { CommitPort } from '../../../version-control/commits/port';
import type { DocumentBatchRecord, ExecutorIdentity } from '../changes/journal';
import type { ProcessTable } from '../write/executor-identity';
import type { ClassifiedCommitFailure, FailureContext, RecordedFailure } from './failure';
import type { QueueClock, SettleLedger } from './settle-ledger';

/** The checkout a queue run serves: the identity of its journals and the root Git runs in. */
export interface QueueCheckout {
  readonly workspaceId: string;
  /** Verified physical checkout root. */
  readonly root: string;
}

/** The checkout the engine was opened in. */
export function checkoutOfEngine(engine: SpecFlowEngine): QueueCheckout {
  return { workspaceId: engine.workspace.workspaceId, root: engine.workspace.root };
}

/**
 * Observation points of a run. Production passes none. Tests await them to stop the process at a
 * cut point (hang until killed, or throw to leave a partial state). Every hook runs OUTSIDE the
 * Project Home control lock except the `inClaim*` and `inResume*` ones, which exist so a test can interrupt
 * the claim between two of its writes; a hook that hangs there would hold the lock.
 */
export interface QueueHooks {
  /** Inside the claim: the lease is written, the batch record is not. */
  inClaimAfterLease?(): Promise<void>;
  /** Inside the claim: the lease and the batch record are written, no member is claimed yet. */
  inClaimAfterRecord?(): Promise<void>;
  /** Inside the claim that resumes a batch: the record names this executor, the lease still names the previous one. */
  inResumeAfterRecord?(): Promise<void>;
  /** Outside the lock: `claimed` members of the batch are `committing` now, the others still `queued`. */
  afterMemberClaimed?(claimed: number): Promise<void>;
  /**
   * The inputs of the claim were read and the lock is not held yet; a test changes the queue here to
   * make the snapshot stale. Called once per reading.
   */
  afterSnapshot?(): Promise<void>;
  /** The claim is complete and the lock is released; no Git has run. */
  afterClaim?(batch: DocumentBatchRecord): Promise<void>;
  /** Just before the commit port is called. */
  beforeCommit?(batch: DocumentBatchRecord): Promise<void>;
  /** The commit exists; nothing is recorded yet. */
  afterCommit?(batch: DocumentBatchRecord, sha: string): Promise<void>;
  /** The batch record says `committed`; no member is completed yet. */
  afterBatchRecorded?(batch: DocumentBatchRecord): Promise<void>;
  /** The members are `completed`; nothing is settled or released yet. */
  afterMembersCompleted?(batch: DocumentBatchRecord): Promise<void>;
  /** The members are settled; the batch record and the lease are still there. */
  afterSettled?(batch: DocumentBatchRecord): Promise<void>;
  /**
   * Inside an abandon, under the control lock: the ledger holds the paths of a member, the member is
   * not `completed` yet. A test stops the process here; a hook that hangs holds the lock.
   */
  afterLedgerWrite?(): Promise<void>;
}

/** What a run needs from the rest of the Engine. Every field is a seam; the defaults are production. */
export interface QueueDependencies {
  /** The commit port; defaults to the Git port of the engine. */
  readonly commits?: CommitPort;
  readonly clock?: QueueClock;
  /** Defaults to the ledger of this process. */
  readonly ledger?: SettleLedger;
  readonly processTable?: ProcessTable;
  /** The identity written into the lease; defaults to the capture of this process. */
  readonly executor?: ExecutorIdentity;
  readonly hooks?: QueueHooks;
  /**
   * Seam of the failure handling (retry, backoff, split and abandon live behind it): decides
   * what a failed commit attempt leaves behind. Defaults to `recordCommitFailure`.
   */
  readonly onCommitFailure?: (
    context: FailureContext,
    failure: ClassifiedCommitFailure,
  ) => Promise<RecordedFailure>;
}

export interface QueueOptions {
  /** Settle period; honoured only inside 250-500 ms, otherwise 300 ms. */
  readonly settleMs?: number;
  /** Bypass the settle: the batches of the checkout are eligible at once (flush). */
  readonly flush?: boolean;
  /** Form batches of this Specification only. */
  readonly specId?: string;
  /**
   * Operator assertion that the executor recorded in a lease cannot be proven dead but has stopped.
   * Never set by a transport.
   */
  readonly confirmExecutorStopped?: boolean;
  /** Budget of one commit attempt, passed to the port. */
  readonly commitDeadlineMs?: number;
}

export type QueueIdleReason =
  /** No operation of the checkout is queued. */
  | 'no-queued-operations'
  /** A batch exists and is settling; `waitMs` is the time left. */
  | 'settling'
  /** Queued operations exist but every one waits for a barrier, a failed batch or an earlier one. */
  | 'blocked'
  /** Every queued operation waits for the backoff after a failed attempt; `waitMs` is the shortest. */
  | 'backoff'
  /** A record of the id the batch would take is not terminal. */
  | 'batch-id-collision'
  /** The branch has no commit yet (nothing to record a parent for). */
  | 'no-commits';

export type QueueRunResult =
  | { readonly status: 'idle'; readonly reason: QueueIdleReason; readonly waitMs?: number }
  /** Another executor holds the checkout's lease and may be running. */
  | { readonly status: 'busy'; readonly reason: 'lease-held' }
  /**
   * The checkout cannot take commits: Git was turned off (the queued operations completed as
   * `not-applicable`) or the checkout is gone (they are `commit-failed`, `abandon` is allowed).
   */
  | {
      readonly status: 'unavailable';
      readonly reason: 'git-disabled' | 'workspace-missing';
      readonly operationIds: readonly string[];
    }
  | {
      readonly status: 'committed';
      readonly batchId: string;
      readonly sha: string;
      readonly operationIds: readonly string[];
      readonly paths: readonly string[];
      /** The batch was recovered from a stopped executor instead of formed in this run. */
      readonly resumed: boolean;
    }
  /** The members completed without a Git mutation: the effective set was empty. */
  | {
      readonly status: 'not-applicable';
      readonly batchId: string;
      readonly operationIds: readonly string[];
      readonly resumed: boolean;
    }
  /** The attempt failed and was recorded; `outcome` is what it left (see `recordCommitFailure`). */
  | {
      readonly status: 'failed';
      readonly batchId: string;
      readonly operationIds: readonly string[];
      readonly outcome: 'failed' | 'recovery-required' | 'requeued' | 'split';
      readonly reason: string;
    };

/**
 * Thrown by a test hook to simulate a process that stopped at that point: the run ends without
 * cleaning up, leaving exactly the records a killed process leaves. Any other error that escapes a
 * run releases the claim first.
 */
export class QueueInterrupted extends Error {
  constructor(point = 'a cut point') {
    super('The queue was interrupted at ' + point + '.');
    this.name = 'QueueInterrupted';
  }
}
