import { performance } from 'node:perf_hooks';

import { DOCUMENT_MAX_HOLD_MS } from './formation';

/** The two clocks the queue reads. Production: `performance.now()` and the system time. */
export interface QueueClock {
  /** Milliseconds on a monotonic clock; only differences mean anything. */
  monotonicMs(): number;
  /** Wall-clock time, used only to read the age of a journal written by an earlier process. */
  wallMs(): number;
}

export const systemQueueClock: QueueClock = {
  monotonicMs: () => performance.now(),
  wallMs: () => Date.now(),
};

/**
 * When each queued operation entered the queue, on the monotonic clock of this process (ADR 0016
 * decision 9). An operation the process has not seen before is placed by its journal's wall-clock
 * `queuedAt`, but its age is CLAMPED to `0 .. maxHoldMs`:
 *
 * - a journal from before a restart (or from a long wait) is at most a maximum hold old, so it is
 *   eligible at once; the settle restarts after a restart;
 * - a wall clock that jumped backwards (a `queuedAt` in the future) counts as age 0, and from then on
 *   only the monotonic clock decides, so the maximum hold always expires.
 *
 * Entries of operations that left the queue are dropped by {@link retain}.
 */
export class SettleLedger {
  private readonly queuedAt = new Map<string, number>();

  private readonly maxHoldMs: number;

  constructor(maxHoldMs: number = DOCUMENT_MAX_HOLD_MS) {
    this.maxHoldMs = maxHoldMs;
  }

  /** The monotonic time at which the operation counts as queued. */
  observe(operationId: string, queuedAtIso: string, clock: QueueClock): number {
    const known = this.queuedAt.get(operationId);
    if (known !== undefined) return known;
    const wall = Date.parse(queuedAtIso);
    const age = Number.isNaN(wall)
      ? this.maxHoldMs
      : Math.min(Math.max(clock.wallMs() - wall, 0), this.maxHoldMs);
    const placed = clock.monotonicMs() - age;
    this.queuedAt.set(operationId, placed);
    return placed;
  }

  /** Forgets every operation that is not in `operationIds`. */
  retain(operationIds: ReadonlySet<string>): void {
    for (const id of this.queuedAt.keys()) {
      if (!operationIds.has(id)) this.queuedAt.delete(id);
    }
  }
}

const SHARED = Symbol.for('nevo.specflow.engine.documentQueue.settleLedger');

/** The ledger of this process, shared by every run (and every copy of this module). */
export function sharedSettleLedger(): SettleLedger {
  const holder = globalThis as Record<symbol, unknown>;
  return (holder[SHARED] ??= new SettleLedger()) as SettleLedger;
}
