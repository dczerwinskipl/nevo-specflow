import { channel } from 'node:diagnostics_channel';

import type { SpecFlowEngine } from '../../../application';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { pruneUncommitted } from '../../uncommitted';
import { backoffMs } from '../queue/backoff';
import {
  checkoutsOfJournals,
  flushAllDocumentCommits,
  type FlushAllOutcome,
  type FlushDependencies,
} from '../queue/flush';
import { effectiveSettleMs } from '../queue/formation';
import { systemQueueClock, type QueueClock } from '../queue/settle-ledger';
import { systemQueueTimers, withDeadline, type QueueTimers } from '../queue/timers';
import type {
  QueueCheckout,
  QueueDependencies,
  QueueOptions,
  QueueRunResult,
} from '../queue/types';
import { drainQueue } from '../queue/worker';
import { resumeDocumentChange } from '../api';
import { isWriterStage } from '../changes/journal/stages';
import { resumeStoppedManualCommits } from '../manual-commit';
import { listDocumentChangeJournals } from '../write/journal-store';
import { onDocumentChangeApplied } from './notifier';

/** How often the scheduler looks for queues that no timer serves (ADR 0016 decision 18). */
export const DOCUMENT_SWEEP_MS = 30_000;

/** The deadline of the shutdown flush of the Runtime and the CLI (ADR 0016 decision 18). */
export const DOCUMENT_SHUTDOWN_DEADLINE_MS = 10_000;

/** The longest wait before another look at a checkout whose queue another executor runs. */
const BUSY_RETRY_MAX_MS = 30_000;

/** How many events the scheduler keeps for a person to read. */
const RECENT_EVENTS_MAX = 50;

const diagnostics = channel('nevo.specflow.engine.document-scheduler');

/** What happened, as a bounded record: published on a diagnostics channel and kept in a ring. */
export interface SchedulerEvent {
  readonly kind: 'pass' | 'error' | 'startup' | 'sweep' | 'stop';
  readonly at: string;
  readonly workspaceId?: string;
  /** The last result status of a pass, or the message of an error (never a path). */
  readonly detail?: string;
}

export interface SchedulerStopOptions {
  /** Commit what is queued before returning (shutdown). Default false. */
  readonly flush?: boolean;
  /** The whole stop gives up after this long (default 10 s). What is left stays journaled. */
  readonly deadlineMs?: number;
}

export interface SchedulerStopOutcome {
  /** The flush ran to the end (also true when no flush was asked for and nothing was running). */
  readonly complete: boolean;
  /** The deadline passed before the stop finished. */
  readonly timedOut: boolean;
  /** Operations still `queued` or `committing` (they stay journaled and are picked up later). */
  readonly remaining: number;
}

export interface SchedulerOptions {
  /** Seams of the queue passes (commit port, ledger, process table, hooks). */
  readonly queue?: QueueDependencies;
  /** Options of a pass; `settleMs` is honoured inside 250-500 ms. */
  readonly queueOptions?: Omit<QueueOptions, 'flush' | 'specId'>;
  readonly clock?: QueueClock;
  readonly timers?: QueueTimers;
  readonly sweepMs?: number;
  /** Seam of the passes themselves; defaults to `drainQueue`. */
  readonly drain?: (checkout: QueueCheckout) => Promise<readonly QueueRunResult[]>;
  /** Seam of the startup resume of interrupted writes; defaults to `resumeDocumentChange`. */
  readonly resume?: (operationId: string) => Promise<unknown>;
  /** Seam of the flush of `stop`. */
  readonly flush?: FlushDependencies;
  /** Seam of the whole flush of `stop`; defaults to `flushAllDocumentCommits`. */
  readonly flushAll?: (deadlineMs: number) => Promise<FlushAllOutcome>;
  /**
   * Seam of the prune of the uncommitted-changes ledger that the sweep runs (read-only Git, only for
   * non-empty ledgers); defaults to `pruneUncommitted`.
   */
  readonly prune?: () => Promise<unknown>;
  /** Seam of the journal listing (the discovery of work); defaults to the Project Home journals. */
  readonly journals?: () => Promise<readonly DocumentChangeJournal[]>;
}

export interface DocumentQueueScheduler {
  /**
   * Starts the scheduler: subscribes to finished writes, resumes interrupted work (writes that were
   * `reserved` or `files-writing`, then every queue with work) and arms the sweep. Resolves when the
   * startup pass is done. Calling it twice is the same as calling it once.
   */
  start(): Promise<void>;
  /** Arms the settle timer of every checkout with queue work (a finished write calls this). */
  wake(): Promise<void>;
  /** The scheduler no longer starts passes. With `flush`, commits what is queued within the deadline. */
  stop(options?: SchedulerStopOptions): Promise<SchedulerStopOutcome>;
  /** Resolves when no pass runs (passes armed for later are not waited for). */
  whenIdle(): Promise<void>;
  /** The last events, oldest first (bounded). */
  recentEvents(): readonly SchedulerEvent[];
  readonly running: boolean;
}

/** A scheduler that does nothing: tests, and the one-shot CLI commands that drain explicitly. */
export const disabledDocumentQueueScheduler: DocumentQueueScheduler = {
  start: () => Promise.resolve(),
  wake: () => Promise.resolve(),
  stop: () => Promise.resolve({ complete: true, timedOut: false, remaining: 0 }),
  whenIdle: () => Promise.resolve(),
  recentEvents: () => [],
  running: false,
};

interface CheckoutState {
  readonly checkout: QueueCheckout;
  timer: unknown;
  /** Monotonic time the armed timer is due. */
  dueAt: number | undefined;
  running: Promise<void> | undefined;
  /** A wake-up arrived while a pass ran: run once more. */
  again: boolean;
  /** Consecutive failed or busy passes, for the backoff. */
  misses: number;
}

/**
 * The scheduler of the document commit queue, one per Engine (Project Home). It owns timers only;
 * what a pass does is decided by the queue (`drainQueue`), which reports when it should be asked
 * again (`idle.waitMs`). Rules:
 *
 * - One pass per checkout at a time, never overlapping (the process-wide lease mark of the queue
 *   backs this up; a pass that finds the checkout busy is retried with backoff).
 * - A finished write arms the settle timer; the queue decides whether the batch is due and reports
 *   the time left, which re-arms the timer. A timer that is already due earlier is kept.
 * - Every 30 s a sweep looks at the journals and arms checkouts with queue work that no timer serves,
 *   and prunes the uncommitted-changes ledger entries that a commit (a hand commit included) now holds.
 * - An error of a pass is logged to a bounded ring and a diagnostics channel and retried with the
 *   queue's backoff (1 s doubling to 60 s); the queue gives its claim back before the error escapes.
 * - All timers are `unref`'d: the scheduler never keeps a process alive. `stop({flush})` is the
 *   graceful way out.
 */
export function createDocumentQueueScheduler(
  engine: SpecFlowEngine,
  options: SchedulerOptions = {},
): DocumentQueueScheduler {
  const clock = options.clock ?? systemQueueClock;
  const timers = options.timers ?? systemQueueTimers;
  const sweepMs = options.sweepMs ?? DOCUMENT_SWEEP_MS;
  const settleMs = effectiveSettleMs(options.queueOptions?.settleMs);
  const checkouts = new Map<string, CheckoutState>();
  const events: SchedulerEvent[] = [];
  let started: Promise<void> | undefined;
  let stopped = false;
  let sweepTimer: unknown;
  let unsubscribe: (() => void) | undefined;

  const record = (event: Omit<SchedulerEvent, 'at'>): void => {
    const full: SchedulerEvent = { ...event, at: new Date(clock.wallMs()).toISOString() };
    events.push(full);
    if (events.length > RECENT_EVENTS_MAX) {
      events.splice(0, events.length - RECENT_EVENTS_MAX);
    }

    if (diagnostics.hasSubscribers) {
      try {
        diagnostics.publish(full);
      } catch {
        // Subscribers are observers; they never break a pass.
      }
    }
  };

  const journals = options.journals ?? (() => listDocumentChangeJournals(engine.context));

  const drain =
    options.drain ??
    ((checkout: QueueCheckout) =>
      drainQueue(engine, options.queue ?? {}, checkout, options.queueOptions ?? {}));

  const prune =
    options.prune ??
    (() =>
      pruneUncommitted(engine, {
        ...(options.queue?.commits !== undefined ? { commits: options.queue.commits } : {}),
      }));

  const stateOf = (checkout: QueueCheckout): CheckoutState => {
    let state = checkouts.get(checkout.workspaceId);
    if (state === undefined) {
      state = {
        checkout,
        timer: undefined,
        dueAt: undefined,
        running: undefined,
        again: false,
        misses: 0,
      };
      checkouts.set(checkout.workspaceId, state);
    }

    return state;
  };

  /** Arms the checkout's timer unless one is already due at or before the requested time. */
  const arm = (state: CheckoutState, delayMs: number): void => {
    if (stopped) {
      return;
    }

    const due = clock.monotonicMs() + delayMs;
    if (state.timer !== undefined && state.dueAt !== undefined && state.dueAt <= due) {
      return;
    }

    if (state.timer !== undefined) {
      timers.clear(state.timer);
    }

    state.dueAt = due;
    state.timer = timers.set(
      () => {
        state.timer = undefined;
        state.dueAt = undefined;
        launch(state);
      },
      Math.max(0, delayMs),
      { unref: true },
    );
  };

  const launch = (state: CheckoutState): void => {
    if (stopped) {
      return;
    }

    if (state.running !== undefined) {
      state.again = true;

      return;
    }

    state.running = pass(state).finally(() => {
      state.running = undefined;
    });
  };

  const pass = async (state: CheckoutState): Promise<void> => {
    do {
      state.again = false;
      let results: readonly QueueRunResult[];
      try {
        results = await drain(state.checkout);
      } catch (error) {
        state.misses += 1;
        record({
          kind: 'error',
          workspaceId: state.checkout.workspaceId,
          detail: error instanceof Error ? error.name : 'error',
        });
        arm(state, backoffMs(state.misses));

        return;
      }

      const last = results.at(-1);
      record({
        kind: 'pass',
        workspaceId: state.checkout.workspaceId,
        ...(last !== undefined ? { detail: last.status } : {}),
      });
      scheduleNext(state, last);
    } while (state.again && !stopped);
  };

  /** What to do after a pass, from the last result the queue reported. */
  const scheduleNext = (state: CheckoutState, last: QueueRunResult | undefined): void => {
    if (last === undefined) {
      return;
    }

    if (last.status === 'busy') {
      // Another executor (or a second run of this process) holds the checkout.
      state.misses += 1;
      arm(state, Math.min(backoffMs(state.misses), BUSY_RETRY_MAX_MS));

      return;
    }

    state.misses = 0;
    if (last.status === 'idle') {
      // `waitMs` is the settle left or the backoff of a failed attempt; without it, the queue has
      // nothing to wait for (empty, or blocked behind a failure) and the sweep will notice a change.
      if (last.waitMs !== undefined) {
        arm(state, last.waitMs);
      }

      return;
    }

    // A re-queued attempt: the next pass reports its backoff as `idle.waitMs`.
    if (last.status === 'failed' && last.outcome === 'requeued') {
      arm(state, 0);
    }
  };

  const remainingWork = async (): Promise<number> =>
    (await journals()).filter(
      (journal) => journal.stage === 'queued' || journal.stage === 'committing',
    ).length;

  const armAllWithWork = async (delayMs: number): Promise<void> => {
    for (const checkout of checkoutsOfJournals(await journals())) {
      arm(stateOf(checkout), delayMs);
    }
  };

  const sweep = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      await armAllWithWork(0);
      record({ kind: 'sweep' });
    } catch (error) {
      record({ kind: 'error', detail: error instanceof Error ? error.name : 'error' });
    }

    armSweep();
    startPrune();
  };

  /**
   * The prune of the ledger runs beside the sweep, never inside it (it reads Git and must not delay
   * the arming of a queue), one at a time, and its failure is an event like any other.
   */
  let pruning: Promise<void> | undefined;
  const startPrune = (): void => {
    if (stopped || pruning !== undefined) {
      return;
    }

    pruning = prune().then(
      () => {
        pruning = undefined;
      },
      (error: unknown) => {
        pruning = undefined;
        record({ kind: 'error', detail: error instanceof Error ? error.name : 'error' });
      },
    );
  };

  const armSweep = (): void => {
    if (stopped) {
      return;
    }

    sweepTimer = timers.set(
      () => {
        sweepTimer = undefined;
        void sweep();
      },
      sweepMs,
      { unref: true },
    );
  };

  const startupPass = async (): Promise<void> => {
    const resume =
      options.resume ?? ((operationId: string) => resumeDocumentChange(engine, operationId));
    try {
      for (const journal of await journals()) {
        if (stopped) {
          return;
        }

        if (!isWriterStage(journal.stage)) {
          continue;
        }

        // The writer judges the executor of the journal itself; a live writer is simply refused.
        try {
          await resume(journal.operationId);
        } catch (error) {
          record({
            kind: 'error',
            workspaceId: journal.workspaceId,
            detail: error instanceof Error ? error.name : 'error',
          });
        }
      }

      // A manual commit a killed CLI left holding a checkout: resumed when its executor is provably gone.
      if (!stopped) {
        await resumeStoppedManualCommits(engine);
      }

      await armAllWithWork(0);
      record({ kind: 'startup' });
    } catch (error) {
      record({ kind: 'error', detail: error instanceof Error ? error.name : 'error' });
    }
  };

  const wake = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      await armAllWithWork(settleMs);
    } catch (error) {
      record({ kind: 'error', detail: error instanceof Error ? error.name : 'error' });
    }
  };

  return {
    get running() {
      return started !== undefined && !stopped;
    },
    start() {
      started ??= (async () => {
        unsubscribe = onDocumentChangeApplied((notice) => {
          if (notice.stateRoot === engine.context.project.stateRoot) {
            void wake();
          }
        });
        armSweep();
        await startupPass();
      })();

      return started;
    },
    wake,
    async stop(stopOptions = {}) {
      const deadlineMs = stopOptions.deadlineMs ?? DOCUMENT_SHUTDOWN_DEADLINE_MS;
      const began = clock.monotonicMs();
      stopped = true;
      unsubscribe?.();
      if (sweepTimer !== undefined) {
        timers.clear(sweepTimer);
      }

      for (const state of checkouts.values()) {
        if (state.timer !== undefined) {
          timers.clear(state.timer);
        }

        state.timer = undefined;
        state.dueAt = undefined;
      }

      record({ kind: 'stop' });
      // A pass that runs now finishes (a Git commit cannot be cancelled); the stop waits for it,
      // but not past the deadline.
      const inFlight = [...checkouts.values()]
        .map((state) => state.running)
        .filter((running): running is Promise<void> => running !== undefined);
      const settledRuns = await withDeadline(
        Promise.allSettled([started, pruning, ...inFlight]).then(() => undefined),
        deadlineMs,
        timers,
      );
      if (settledRuns.kind === 'deadline') {
        return { complete: false, timedOut: true, remaining: await remainingWork() };
      }

      if (stopOptions.flush !== true) {
        return { complete: true, timedOut: false, remaining: await remainingWork() };
      }

      const left = deadlineMs - (clock.monotonicMs() - began);
      const flushed: FlushAllOutcome = await (options.flushAll
        ? options.flushAll(Math.max(0, left))
        : flushAllDocumentCommits(engine, {
            ...options.flush,
            queue: options.flush?.queue ?? options.queue,
            deadlineMs: Math.max(0, left),
            timers,
            clock,
          }));

      return {
        complete: !flushed.timedOut && flushed.remaining === 0,
        timedOut: flushed.timedOut,
        remaining: flushed.remaining,
      };
    },
    async whenIdle() {
      for (;;) {
        const running = [...checkouts.values()]
          .map((state) => state.running)
          .filter((value): value is Promise<void> => value !== undefined);
        if (running.length === 0) {
          return;
        }

        await Promise.allSettled(running);
      }
    },
    recentEvents: () => [...events],
  };
}
