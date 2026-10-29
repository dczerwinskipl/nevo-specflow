import { foldPathKey } from '../../document-rules/document-paths';
import { DOCUMENT_BATCH_MAX_OPERATIONS, DOCUMENT_BATCH_MAX_PATHS } from '../changes/limits';

/**
 * Batch formation (ADR 0016 decisions 2, 6, 9 and 17), one pure function. Nothing here reads a
 * clock, a file or Git: the caller passes the queued operations with their paths, the paths that
 * are not claimable and a reading of the monotonic clock.
 */

/** Settle period after the LAST member and the bounds it may be configured within. */
export const DOCUMENT_SETTLE_DEFAULT_MS = 300;
export const DOCUMENT_SETTLE_MIN_MS = 250;
export const DOCUMENT_SETTLE_MAX_MS = 500;
/** A batch is never held longer than this after its FIRST member. */
export const DOCUMENT_MAX_HOLD_MS = 5000;

/** The settle period in force: the configured value only when it lies inside the allowed window. */
export function effectiveSettleMs(configured: number | undefined): number {
  if (
    configured === undefined ||
    !Number.isFinite(configured) ||
    configured < DOCUMENT_SETTLE_MIN_MS ||
    configured > DOCUMENT_SETTLE_MAX_MS
  ) {
    return DOCUMENT_SETTLE_DEFAULT_MS;
  }

  return configured;
}

/** A `queued` operation as formation sees it. */
export interface QueuedOperation {
  readonly operationId: string;
  /** Monotonic per checkout; members of a batch keep this order. */
  readonly sequence: number;
  readonly specId: string;
  /** The branch the operation was pinned to; one batch commits on one branch. */
  readonly branch: string;
  /** Not a plain save: eligible at once, no settle. */
  readonly structural: boolean;
  /** Checkout-relative paths of the operation's plan. */
  readonly paths: readonly string[];
  /** When the operation was queued, on the monotonic clock of this process (see `SettleLedger`). */
  readonly queuedMonoMs: number;
  /** A retry that must not start before this wall-clock time (epoch ms): a seam for backoff. */
  readonly notBeforeWallMs?: number;
}

export interface FormationInput {
  /** `queued` operations of one checkout, any order. */
  readonly queued: readonly QueuedOperation[];
  /** Paths of operations that are barriers (`reserved`, `files-writing`, write-phase recovery), folded. */
  readonly barrierPaths: ReadonlySet<string>;
  /** Paths of batches that are `failed` or `recovery-required` (they wait for a human), folded. */
  readonly heldPaths: ReadonlySet<string>;
  readonly nowMonoMs: number;
  readonly nowWallMs: number;
  readonly settleMs: number;
  readonly maxHoldMs: number;
  /** Bypass the settle (flush): every formed batch is eligible at once. */
  readonly flush?: boolean;
  /** Form batches of this Specification only. */
  readonly onlySpecId?: string;
}

/** Why an operation was left out of the batch it could have joined. */
export type DeferralReason =
  | 'barrier'
  | 'held-by-failed-batch'
  | 'earlier-overlap'
  | 'other-branch'
  | 'backoff'
  | 'batch-full';

export interface DeferredOperation {
  readonly operationId: string;
  readonly reason: DeferralReason;
  /** For 'backoff': how long until the operation may be tried again. */
  readonly retryAfterMs?: number;
}

export interface FormedBatch {
  /** The id of the first member: the `Nevo-Operation` trailer of its commit. */
  readonly batchId: string;
  readonly specId: string;
  readonly branch: string;
  /** In sequence order. */
  readonly members: readonly QueuedOperation[];
  /** Distinct paths of all members (first spelling kept), in first-seen order. */
  readonly paths: readonly string[];
  /** The batch reached its caps; no later member could join. */
  readonly full: boolean;
}

export type FormationDecision =
  /** A batch to claim now. */
  | {
      readonly kind: 'batch';
      readonly batch: FormedBatch;
      readonly deferred: readonly DeferredOperation[];
    }
  /** A batch exists but is still settling: ask again after `waitMs`. */
  | {
      readonly kind: 'wait';
      readonly waitMs: number;
      readonly deferred: readonly DeferredOperation[];
    }
  /** Nothing can be claimed: no queued operation, or every one is deferred. */
  | {
      readonly kind: 'none';
      readonly deferred: readonly DeferredOperation[];
      /** The shortest backoff among the deferred operations, when any waits for one. */
      readonly retryAfterMs?: number;
    };

interface Candidate {
  readonly batch: FormedBatch | undefined;
  readonly deferred: readonly DeferredOperation[];
}

/**
 * Takes the claimable operations of ONE Specification, in sequence order, up to 50 operations and 200
 * paths. An operation is not claimable while any of its paths is held by a barrier or by a failed
 * batch, or overlaps an EARLIER operation of the same Specification that was not taken (it must not
 * overtake it), or was pinned to another branch than the first member, or waits for a backoff.
 */
function formForSpecification(
  operations: readonly QueuedOperation[],
  input: FormationInput,
): Candidate {
  const deferred: DeferredOperation[] = [];
  const skipped = new Set<string>();
  const taken: QueuedOperation[] = [];
  const distinct = new Map<string, string>();
  let branch: string | undefined;
  let full = false;

  const skip = (
    operation: QueuedOperation,
    reason: DeferralReason,
    retryAfterMs?: number,
  ): void => {
    deferred.push({
      operationId: operation.operationId,
      reason,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
    for (const path of operation.paths) {
      skipped.add(foldPathKey(path));
    }
  };

  for (const operation of operations) {
    const keys = operation.paths.map(foldPathKey);
    if (full) {
      // Once a batch is full nothing later may join it; an overlapping later operation also waits.
      deferred.push({ operationId: operation.operationId, reason: 'batch-full' });
      continue;
    }

    if (keys.some((key) => input.heldPaths.has(key))) {
      skip(operation, 'held-by-failed-batch');
      continue;
    }

    if (keys.some((key) => input.barrierPaths.has(key))) {
      skip(operation, 'barrier');
      continue;
    }

    if (keys.some((key) => skipped.has(key))) {
      skip(operation, 'earlier-overlap');
      continue;
    }

    if (operation.notBeforeWallMs !== undefined && operation.notBeforeWallMs > input.nowWallMs) {
      skip(operation, 'backoff', operation.notBeforeWallMs - input.nowWallMs);
      continue;
    }

    if (branch !== undefined && operation.branch !== branch) {
      skip(operation, 'other-branch');
      continue;
    }

    const added = keys.filter((key) => !distinct.has(key)).length;
    if (
      taken.length >= DOCUMENT_BATCH_MAX_OPERATIONS ||
      distinct.size + added > DOCUMENT_BATCH_MAX_PATHS
    ) {
      full = true;
      deferred.push({ operationId: operation.operationId, reason: 'batch-full' });
      for (const key of keys) {
        skipped.add(key);
      }

      continue;
    }

    branch ??= operation.branch;
    taken.push(operation);
    for (const path of operation.paths) {
      const key = foldPathKey(path);
      if (!distinct.has(key)) {
        distinct.set(key, path);
      }
    }
  }

  const first = taken[0];
  if (first === undefined || branch === undefined) {
    return { batch: undefined, deferred };
  }

  return {
    batch: {
      batchId: first.operationId,
      specId: first.specId,
      branch,
      members: taken,
      paths: [...distinct.values()],
      full,
    },
    deferred,
  };
}

/** Milliseconds until the batch may be claimed; 0 when it may be claimed now. */
export function settleRemainingMs(batch: FormedBatch, input: FormationInput): number {
  if (input.flush === true || batch.full || batch.members.some((member) => member.structural)) {
    return 0;
  }

  const last = Math.max(...batch.members.map((member) => member.queuedMonoMs));
  const first = Math.min(...batch.members.map((member) => member.queuedMonoMs));
  const untilSettled = last + input.settleMs - input.nowMonoMs;
  const untilMaxHold = first + input.maxHoldMs - input.nowMonoMs;

  return Math.max(0, Math.min(untilSettled, untilMaxHold));
}

/**
 * The next batch of the checkout. Specifications are independent: each forms its own batch, and the
 * one whose first member has the lowest sequence goes first among the eligible ones. An eligible
 * batch of a later Specification is not held back by a settling batch of an earlier one.
 */
export function formNextBatch(input: FormationInput): FormationDecision {
  const bySpecification = new Map<string, QueuedOperation[]>();
  for (const operation of [...input.queued].sort((a, b) => a.sequence - b.sequence)) {
    if (input.onlySpecId !== undefined && operation.specId !== input.onlySpecId) {
      continue;
    }

    const list = bySpecification.get(operation.specId);
    if (list) {
      list.push(operation);
    } else {
      bySpecification.set(operation.specId, [operation]);
    }
  }

  const deferred: DeferredOperation[] = [];
  let waiting: number | undefined;
  for (const operations of bySpecification.values()) {
    const candidate = formForSpecification(operations, input);
    deferred.push(...candidate.deferred);
    if (candidate.batch === undefined) {
      continue;
    }

    const remaining = settleRemainingMs(candidate.batch, input);
    if (remaining === 0) {
      return { kind: 'batch', batch: candidate.batch, deferred: candidate.deferred };
    }

    waiting = waiting === undefined ? remaining : Math.min(waiting, remaining);
  }

  const backoffs = deferred.flatMap((entry) =>
    entry.retryAfterMs !== undefined ? [entry.retryAfterMs] : [],
  );

  return waiting === undefined
    ? {
        kind: 'none',
        deferred,
        ...(backoffs.length > 0 ? { retryAfterMs: Math.min(...backoffs) } : {}),
      }
    : { kind: 'wait', waitMs: waiting, deferred };
}
