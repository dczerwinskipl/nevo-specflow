/**
 * The state machines of document changes, as data. Every table is a `Record` over the full state
 * union, so adding a state fails compilation until its row exists. Pure; no I/O.
 *
 *   operation: reserved -> files-writing -> queued -> committing -> completed
 *                 |              |  \            ^  \-> commit-failed -> queued | completed
 *                 v              v   \           |  \-> recovery-required -> queued | completed
 *               failed   recovery-required       \--- transient blocker (backoff) ---/
 *   A manual-mode write (auto-commit off) goes files-writing -> completed (uncommitted) and never
 *   queues; an abandon completes the operation as uncommitted too (ADR 0018 decision 5).
 *   batch:     formed -> committing -> committed | failed | recovery-required | dissolved
 */

export const DOCUMENT_CHANGE_STAGES = [
  'reserved',
  'files-writing',
  'queued',
  'committing',
  'completed',
  'failed',
  'commit-failed',
  'recovery-required',
] as const;

export type DocumentChangeStage = (typeof DOCUMENT_CHANGE_STAGES)[number];

/** Legal successors of each stage. A stage is never its own successor: a journal is rewritten only to move. */
export const DOCUMENT_CHANGE_TRANSITIONS = {
  // The writer owns the operation; a refusal after reservation holds no claim; a dead writer is recovery.
  reserved: ['files-writing', 'failed', 'recovery-required'],
  // After the first rename a failure rolls forward; it never becomes a plain `failed`. `failed` is for a
  // write that found a foreign edit while NOTHING of it is on disk. `files-writing` to itself hands the
  // write to a new executor (the record is compared and replaced under the lock).
  // `completed` is the manual-mode write: no queue, the operation ends uncommitted (auto-commit off).
  'files-writing': ['queued', 'completed', 'recovery-required', 'failed', 'files-writing'],
  // `completed` without a claim attempt: Git was disabled while pending. `commit-failed` without a
  // claim: the checkout is gone.
  queued: ['committing', 'completed', 'commit-failed'],
  committing: ['completed', 'queued', 'commit-failed', 'recovery-required'],
  completed: [],
  failed: [],
  // retry, flush or a new overlapping operation dissolve the batch (back to queued); abandon completes
  // the operation as uncommitted (its paths are in the ledger).
  'commit-failed': ['queued', 'completed'],
  // Operator recovery: resume (queued), adopt a hand commit or abandon (completed). A write-phase
  // recovery is continued by a retry of the operation: it takes the write back (`files-writing`) and
  // rolls forward to queued.
  'recovery-required': ['queued', 'completed', 'files-writing'],
} as const satisfies Record<DocumentChangeStage, readonly DocumentChangeStage[]>;

export function canTransitionDocumentChange(
  from: DocumentChangeStage,
  to: DocumentChangeStage,
): boolean {
  return (DOCUMENT_CHANGE_TRANSITIONS[from] as readonly DocumentChangeStage[]).includes(to);
}

/** Facts about a stage that other modules (claims, barriers, listings, retention) decide on. */
export interface DocumentChangeStageFacts {
  /** The operation holds its `checkout-scoped:` claim. */
  readonly holdsClaim: boolean;
  /** Not yet in a final state: listed by claim checks and by the active directory. */
  readonly active: boolean;
  /** The files may not all be in place; a batch with an overlapping path must not be claimed. */
  readonly barrier: boolean;
  /** Retention may delete the record (after the settled window). */
  readonly settled: boolean;
  /** The Engine acts on it without a human (the queue or the writer). */
  readonly automatic: boolean;
  /** The writer still owns the operation: it carries an executor and its payload is not acknowledged. */
  readonly writing: boolean;
  /** Waiting for the writer or the queue; a manual commit of the same paths must wait for it. */
  readonly pending: boolean;
}

export const DOCUMENT_CHANGE_STAGE_FACTS = {
  reserved: {
    holdsClaim: true,
    active: true,
    barrier: true,
    settled: false,
    automatic: true,
    writing: true,
    pending: true,
  },
  'files-writing': {
    holdsClaim: true,
    active: true,
    barrier: true,
    settled: false,
    automatic: true,
    writing: true,
    pending: true,
  },
  queued: {
    holdsClaim: true,
    active: true,
    barrier: false,
    settled: false,
    automatic: true,
    writing: false,
    pending: true,
  },
  committing: {
    holdsClaim: true,
    active: true,
    barrier: false,
    settled: false,
    automatic: true,
    writing: false,
    pending: true,
  },
  completed: {
    holdsClaim: false,
    active: false,
    barrier: false,
    settled: true,
    automatic: false,
    writing: false,
    pending: false,
  },
  // A refusal after reservation: nothing was changed, no claim.
  failed: {
    holdsClaim: false,
    active: false,
    barrier: false,
    settled: true,
    automatic: false,
    writing: false,
    pending: false,
  },
  'commit-failed': {
    holdsClaim: true,
    active: true,
    barrier: false,
    settled: false,
    automatic: false,
    writing: false,
    pending: false,
  },
  'recovery-required': {
    holdsClaim: true,
    active: true,
    barrier: false,
    settled: false,
    automatic: false,
    writing: false,
    pending: false,
  },
} as const satisfies Record<DocumentChangeStage, DocumentChangeStageFacts>;

export function isDocumentChangeStage(value: unknown): value is DocumentChangeStage {
  return typeof value === 'string' && (DOCUMENT_CHANGE_STAGES as readonly string[]).includes(value);
}

/** Whether the writer still owns the operation (`reserved`, `files-writing`). */
export function isWriterStage(stage: DocumentChangeStage): boolean {
  return DOCUMENT_CHANGE_STAGE_FACTS[stage].writing;
}

/** Whether the operation still waits for the writer or the queue (`reserved` to `committing`). */
export function isPendingStage(stage: DocumentChangeStage): boolean {
  return DOCUMENT_CHANGE_STAGE_FACTS[stage].pending;
}

/** Where a `recovery-required` operation stopped; decides whether it is still a barrier. */
export const DOCUMENT_RECOVERY_PHASES = ['write', 'commit'] as const;
export type DocumentRecoveryPhase = (typeof DOCUMENT_RECOVERY_PHASES)[number];

/** Whether the operation is a barrier for the paths it plans (its files may not all be in place). */
export function isBarrierStage(
  stage: DocumentChangeStage,
  recoveryPhase: DocumentRecoveryPhase | undefined,
): boolean {
  if (stage === 'recovery-required') {
    return recoveryPhase === 'write';
  }

  return DOCUMENT_CHANGE_STAGE_FACTS[stage].barrier;
}

export const DOCUMENT_BATCH_STATES = [
  'formed',
  'committing',
  'committed',
  'failed',
  'recovery-required',
  'dissolved',
] as const;

export type DocumentBatchState = (typeof DOCUMENT_BATCH_STATES)[number];

export const DOCUMENT_BATCH_TRANSITIONS = {
  // Claiming records `parentHead` before any Git effect.
  formed: ['committing', 'dissolved'],
  // A transient blocker or a retry dissolves the batch; a split commits the unaffected paths and
  // leaves the rest to a NEW failed batch.
  committing: ['committed', 'failed', 'recovery-required', 'dissolved'],
  committed: [],
  // retry, flush, a new overlapping operation or abandon.
  failed: ['dissolved'],
  // resume (members re-queued), adopt a hand commit, abandon.
  'recovery-required': ['committed', 'dissolved'],
  dissolved: [],
} as const satisfies Record<DocumentBatchState, readonly DocumentBatchState[]>;

export function canTransitionDocumentBatch(
  from: DocumentBatchState,
  to: DocumentBatchState,
): boolean {
  return (DOCUMENT_BATCH_TRANSITIONS[from] as readonly DocumentBatchState[]).includes(to);
}

/**
 * A reservation whose paths overlap a batch in one of these states is refused (`SPEC_BUSY`). A
 * `failed` batch is not one: a new overlapping operation dissolves it and re-forms the batch.
 */
export const DOCUMENT_BATCH_REFUSES_RESERVATION = {
  formed: false,
  committing: true,
  committed: false,
  failed: false,
  'recovery-required': true,
  dissolved: false,
} as const satisfies Record<DocumentBatchState, boolean>;

export function isDocumentBatchState(value: unknown): value is DocumentBatchState {
  return typeof value === 'string' && (DOCUMENT_BATCH_STATES as readonly string[]).includes(value);
}
