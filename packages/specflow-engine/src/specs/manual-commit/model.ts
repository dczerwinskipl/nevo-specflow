/**
 * The manual commit (ADR 0018 decision 8): the one way the Engine commits what the uncommitted-changes
 * ledger holds. It is an operation kind of its own (`manual-commit`) with its own journal, but it goes
 * through the same commit port, the same per-checkout lease and the same `checkout-scoped` claim as a
 * batch of the document queue, so the two never run in a checkout at once. Pure model: the journal
 * record, its state machine and the limits. No I/O.
 */
import type { ExecutorIdentity } from '../durable/executor-identity';
import type { PayloadEvidence } from '../durable/payload-store';

/** The only journal format this Engine writes and interprets. */
export const MANUAL_COMMIT_JOURNAL_VERSION = 1;

/** Directory of the journals below the Project state root; `settled/` and `<id>.payload/` sit in it. */
export const MANUAL_COMMIT_RELATIVE_DIR = 'engine/operations/manual-commit';

const KIB = 1024;
/** Largest journal file: counts, hashes and owner keys only; the ledger snapshot and the message are payload. */
export const MANUAL_COMMIT_JOURNAL_MAX_BYTES = 16 * KIB;
/** A tolerant listing reads at most this many names of the directory. */
export const MANUAL_COMMIT_LISTING_MAX_FILES = 1000;
/** A settled journal replays an `operationId` for this long, then it is swept. */
export const MANUAL_COMMIT_SETTLED_RETENTION_MS = 24 * 60 * 60 * 1000;
/** The settled sweep of one admission stops after this long. */
export const MANUAL_COMMIT_SETTLED_SWEEP_BUDGET_MS = 50;
/** How long the flush of the document queue before a manual commit waits at most. */
export const MANUAL_COMMIT_FLUSH_WAIT_MS = 10_000;
/** Most paths one manual commit holds: the ledger holds at most this many per owner. */
export const MANUAL_COMMIT_MAX_PATHS = 200;
/** Most ledger owners one manual commit covers (the ledger lists this many records per checkout). */
export const MANUAL_COMMIT_MAX_OWNERS = 64;

/** What a request covers: one Specification, the definitions of the Project Home, or all owners of a checkout. */
export const MANUAL_COMMIT_SCOPES = ['specification', 'definitions', 'all'] as const;
export type ManualCommitScope = (typeof MANUAL_COMMIT_SCOPES)[number];

/**
 * reserved -> committing -> completed, plus `failed` (a refusal after the reservation that changed
 * nothing) and `recovery-required` (the outcome in Git is not provable).
 *
 *   reserved --> committing --> completed
 *       |            |  \--> failed                (no commit exists; the person starts again)
 *       v            |  \--> recovery-required --> committing   (resume)
 *     failed         |                         \--> completed   (adopt)
 *                    |                         \--> failed      (abandon: the ledger stays as it is)
 *                    \--> committing                            (a new executor takes it over; the
 *                                                                start of the commit is recorded)
 */
export const MANUAL_COMMIT_STAGES = [
  'reserved',
  'committing',
  'completed',
  'failed',
  'recovery-required',
] as const;
export type ManualCommitStage = (typeof MANUAL_COMMIT_STAGES)[number];

/** Legal successors of each stage. Every table is a `Record`: a new stage fails compilation until its row exists. */
export const MANUAL_COMMIT_TRANSITIONS = {
  reserved: ['committing', 'failed'],
  // `committing` to itself: a new executor takes over, or the start of the Git commit is recorded.
  committing: ['committing', 'completed', 'failed', 'recovery-required'],
  completed: [],
  failed: [],
  'recovery-required': ['committing', 'completed', 'failed'],
} as const satisfies Record<ManualCommitStage, readonly ManualCommitStage[]>;

export function canTransitionManualCommit(from: ManualCommitStage, to: ManualCommitStage): boolean {
  return (MANUAL_COMMIT_TRANSITIONS[from] as readonly ManualCommitStage[]).includes(to);
}

export interface ManualCommitStageFacts {
  /** The operation holds its `checkout-scoped:` claim (Close cannot run, the paths are not written). */
  readonly holdsClaim: boolean;
  /** Not in a final state: listed by claim checks and by the active directory. */
  readonly active: boolean;
  /** Retention may delete the record (after the settled window). */
  readonly settled: boolean;
}

export const MANUAL_COMMIT_STAGE_FACTS = {
  reserved: { holdsClaim: true, active: true, settled: false },
  committing: { holdsClaim: true, active: true, settled: false },
  completed: { holdsClaim: false, active: false, settled: true },
  failed: { holdsClaim: false, active: false, settled: true },
  'recovery-required': { holdsClaim: true, active: true, settled: false },
} as const satisfies Record<ManualCommitStage, ManualCommitStageFacts>;

export function isManualCommitStage(value: unknown): value is ManualCommitStage {
  return typeof value === 'string' && (MANUAL_COMMIT_STAGES as readonly string[]).includes(value);
}

/** How a `completed` manual commit ended: a commit, or every path already equalled HEAD. */
export const MANUAL_COMMIT_OUTCOMES = ['committed', 'not-applicable'] as const;
export type ManualCommitOutcome = (typeof MANUAL_COMMIT_OUTCOMES)[number];

/** Why a manual commit with no commit completed or ended. */
export const NOTHING_TO_COMMIT = 'nothing-to-commit';
/** The operator ended a `recovery-required` manual commit and left the ledger as it is. */
export const MANUAL_COMMIT_ABANDONED = 'abandoned';

/**
 * The durable record of one manual commit (`engine/operations/manual-commit/<operationId>.json`).
 * Counts, hashes and short facts only: the ledger entries the commit was judged on and the message
 * are payload files (hash-addressed, proven against this evidence on every read).
 */
export interface ManualCommitJournal {
  readonly version: typeof MANUAL_COMMIT_JOURNAL_VERSION;
  readonly projectId: string;
  readonly operationId: string;
  readonly workspaceId: string;
  /** The checkout the commit is made in. */
  readonly workspaceRoot: string;
  readonly scope: ManualCommitScope;
  /** The Specification the request addressed; absent for the definitions scope and a checkout-wide request without one. */
  readonly specId?: string;
  /** Ledger owner keys (`definitions`, `specification-<id>`), sorted: whose entries the commit holds. */
  readonly owners: readonly string[];
  /** Canonical hash of the request, `operationId` excluded: the same id with another body is a conflict. */
  readonly inputFingerprint: string;
  readonly stage: ManualCommitStage;
  /** The branch the commit is made on, pinned at admission (equal to the ledger's). */
  readonly branch: string;
  /** The ledger entries judged at admission: path, post-image, owner. */
  readonly snapshot: PayloadEvidence & { readonly pathCount: number };
  /** The person's message (subject and body, cleaned), as the commit will carry it. */
  readonly message: PayloadEvidence;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** HEAD when the lease was taken: the commit is searched on top of it. */
  readonly parentHead?: string;
  /** The process that holds the lease, while `committing`. */
  readonly executor?: ExecutorIdentity;
  /** Recorded before Git runs: from here on a commit may exist. */
  readonly commitStartedAt?: string;
  readonly outcome?: ManualCommitOutcome;
  /** The commit, when `outcome` is `committed`. */
  readonly sha?: string;
  /** How many paths the commit holds, when `outcome` is `committed`. */
  readonly pathCount?: number;
  /** Open kebab-case: why it failed, needs recovery, or completed without a commit. */
  readonly reason?: string;
  /** The commit port's own reason when a Git blocker is the cause. */
  readonly blockedBy?: string;
  readonly settledAt?: string;
}
