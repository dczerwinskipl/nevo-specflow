import { describe, expect, it } from 'vitest';

import type { SpecFlowEngine } from '../../../application';
import type { DocumentChangeJournal } from '../changes/journal/model';
import type { DocumentChangeStage } from '../changes/journal/stages';
import { backoffMs } from '../queue/backoff';
import type { QueueClock } from '../queue/settle-ledger';
import type { QueueTimers } from '../queue/timers';
import type { QueueCheckout, QueueRunResult } from '../queue/types';
import { notifyDocumentChangeApplied } from './notifier';
import {
  DOCUMENT_SWEEP_MS,
  createDocumentQueueScheduler,
  disabledDocumentQueueScheduler,
  type SchedulerOptions,
} from './scheduler';

const STATE_ROOT = 'state-root-under-test';
const engine = { context: { project: { stateRoot: STATE_ROOT } } } as unknown as SpecFlowEngine;

/** Timers and a monotonic clock the test moves by hand. */
class FakeTime implements QueueTimers, QueueClock {
  now = 1000;
  private seq = 0;
  readonly pending = new Map<number, { at: number; fn: () => void; unref: boolean }>();
  monotonicMs = (): number => this.now;
  wallMs = (): number => 1_700_000_000_000 + this.now;
  set(fn: () => void, ms: number, options?: { readonly unref?: boolean }): unknown {
    this.seq += 1;
    this.pending.set(this.seq, { at: this.now + ms, fn, unref: options?.unref === true });
    return this.seq;
  }
  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** Moves time forward, firing due timers in order and letting promises settle after each. */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    for (;;) {
      const next = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (next === undefined) break;
      this.pending.delete(next[0]);
      this.now = Math.max(this.now, next[1].at);
      next[1].fn();
      await settle();
    }
    this.now = target;
    await settle();
  }
  dueIn(): number[] {
    return [...this.pending.values()].map((timer) => timer.at - this.now).sort((a, b) => a - b);
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function journal(
  stage: DocumentChangeStage,
  workspaceId = 'ws-1',
  operationId = 'op-' + stage,
): DocumentChangeJournal {
  return {
    stage,
    workspaceId,
    workspaceRoot: 'root-of-' + workspaceId,
    operationId,
  } as unknown as DocumentChangeJournal;
}

const IDLE: QueueRunResult = { status: 'idle', reason: 'no-queued-operations' };

interface Harness {
  readonly time: FakeTime;
  readonly drained: string[];
  readonly resumed: string[];
  journals: DocumentChangeJournal[];
  results: (checkout: QueueCheckout) => QueueRunResult | Error;
  readonly scheduler: ReturnType<typeof createDocumentQueueScheduler>;
}

function harness(overrides: Partial<SchedulerOptions> = {}): Harness {
  const time = new FakeTime();
  const self: Harness = {
    time,
    drained: [],
    resumed: [],
    journals: [],
    results: () => IDLE,
    scheduler: undefined as never,
  };
  const scheduler = createDocumentQueueScheduler(engine, {
    clock: time,
    timers: time,
    journals: () => Promise.resolve(self.journals),
    drain: (checkout) => {
      self.drained.push(checkout.workspaceId);
      const result = self.results(checkout);
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve([result]);
    },
    resume: (operationId) => {
      self.resumed.push(operationId);
      return Promise.resolve();
    },
    ...overrides,
  });
  return Object.assign(self, { scheduler });
}

describe('startup pass', () => {
  it('resumes interrupted writes, then drains every checkout with queued work at once', async () => {
    const h = harness();
    h.journals = [
      journal('reserved', 'ws-1', 'a'),
      journal('files-writing', 'ws-1', 'b'),
      journal('queued', 'ws-2', 'c'),
      journal('commit-failed', 'ws-3', 'd'),
      journal('recovery-required', 'ws-3', 'e'),
    ];
    await h.scheduler.start();
    expect(h.resumed).toEqual(['a', 'b']);
    expect(h.drained).toEqual([]);
    await h.time.advance(0);
    expect(h.drained).toEqual(['ws-2']);
    await h.scheduler.stop();
  });

  it('survives a resume that fails and still arms the queues', async () => {
    const h = harness({
      resume: () => Promise.reject(new Error('writer is alive')),
    });
    h.journals = [journal('reserved', 'ws-1', 'a'), journal('queued', 'ws-1', 'b')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(h.drained).toEqual(['ws-1']);
    expect(h.scheduler.recentEvents().some((event) => event.kind === 'error')).toBe(true);
    await h.scheduler.stop();
  });

  it('is idempotent', async () => {
    const h = harness();
    h.journals = [journal('reserved', 'ws-1', 'a')];
    await h.scheduler.start();
    await h.scheduler.start();
    expect(h.resumed).toEqual(['a']);
    await h.scheduler.stop();
  });
});

describe('wake-up of a finished write', () => {
  it('arms the settle timer (300 ms) and runs a pass when it expires', async () => {
    const h = harness();
    await h.scheduler.start();
    h.journals = [journal('queued')];
    notifyDocumentChangeApplied({ stateRoot: STATE_ROOT });
    await settle();
    await h.time.advance(299);
    expect(h.drained).toEqual([]);
    await h.time.advance(1);
    expect(h.drained).toEqual(['ws-1']);
    await h.scheduler.stop();
  });

  it('ignores a write in another Project Home', async () => {
    const h = harness();
    await h.scheduler.start();
    h.journals = [journal('queued')];
    notifyDocumentChangeApplied({ stateRoot: 'another-root' });
    await settle();
    expect(h.time.dueIn()).toEqual([DOCUMENT_SWEEP_MS]);
    await h.scheduler.stop();
  });

  it('keeps one timer for a burst of writes, due at the first settle', async () => {
    const h = harness();
    await h.scheduler.start();
    h.journals = [journal('queued')];
    notifyDocumentChangeApplied({ stateRoot: STATE_ROOT });
    await settle();
    await h.time.advance(100);
    notifyDocumentChangeApplied({ stateRoot: STATE_ROOT });
    await settle();
    expect(h.time.dueIn().filter((due) => due < 10_000)).toEqual([200]);
    await h.scheduler.stop();
  });

  it('is silent after stop', async () => {
    const h = harness();
    await h.scheduler.start();
    await h.scheduler.stop();
    h.journals = [journal('queued')];
    notifyDocumentChangeApplied({ stateRoot: STATE_ROOT });
    await settle();
    expect(h.time.dueIn()).toEqual([]);
  });
});

describe('timers follow what the queue reports', () => {
  it('comes back after the settle or backoff the queue names', async () => {
    const h = harness();
    let calls = 0;
    h.results = () => {
      calls += 1;
      return calls < 3 ? { status: 'idle', reason: 'settling', waitMs: 120 } : IDLE;
    };
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(h.drained).toHaveLength(1);
    await h.time.advance(119);
    expect(h.drained).toHaveLength(1);
    await h.time.advance(1);
    expect(h.drained).toHaveLength(2);
    await h.time.advance(120);
    expect(h.drained).toHaveLength(3);
    // The queue is empty now: nothing is armed but the sweep.
    expect(h.time.dueIn().filter((due) => due < 10_000)).toEqual([]);
    await h.scheduler.stop();
  });

  it('asks again at once after a re-queued attempt, which then reports its backoff', async () => {
    const h = harness();
    const script: QueueRunResult[] = [
      {
        status: 'failed',
        batchId: 'b',
        operationIds: ['o'],
        outcome: 'requeued',
        reason: 'index-locked',
      },
      { status: 'idle', reason: 'backoff', waitMs: 1000 },
      IDLE,
    ];
    h.results = () => script.shift() ?? IDLE;
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(h.drained).toHaveLength(2);
    await h.time.advance(1000);
    expect(h.drained).toHaveLength(3);
    await h.scheduler.stop();
  });

  it('retries a checkout another executor holds, with growing pauses', async () => {
    const h = harness();
    h.results = () => ({ status: 'busy', reason: 'lease-held' });
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(h.drained).toHaveLength(1);
    await h.time.advance(backoffMs(1));
    expect(h.drained).toHaveLength(2);
    await h.time.advance(backoffMs(2) - 1);
    expect(h.drained).toHaveLength(2);
    await h.time.advance(1);
    expect(h.drained).toHaveLength(3);
    await h.scheduler.stop();
  });
});

describe('errors', () => {
  it('records the error, retries with the queue backoff and recovers', async () => {
    const h = harness();
    let calls = 0;
    h.results = () => {
      calls += 1;
      return calls <= 2 ? new Error('boom with /some/path') : IDLE;
    };
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(h.drained).toHaveLength(1);
    await h.time.advance(backoffMs(1));
    expect(h.drained).toHaveLength(2);
    await h.time.advance(backoffMs(2));
    expect(h.drained).toHaveLength(3);
    const errors = h.scheduler.recentEvents().filter((event) => event.kind === 'error');
    expect(errors).toHaveLength(2);
    // Only the error name is kept: a message may carry a path.
    expect(JSON.stringify(errors)).not.toContain('/some/path');
    await h.scheduler.stop();
  });

  it('keeps the ring of events bounded', async () => {
    const h = harness();
    h.results = () => new Error('again');
    h.journals = [journal('queued')];
    await h.scheduler.start();
    for (let index = 0; index < 120; index += 1) await h.time.advance(60_000);
    expect(h.scheduler.recentEvents().length).toBeLessThanOrEqual(50);
    await h.scheduler.stop();
  });
});

describe('never overlapping passes', () => {
  it('runs one pass per checkout at a time and once more after a wake-up during it', async () => {
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const h = harness({
      drain: () => {
        active += 1;
        peak = Math.max(peak, active);
        return new Promise((resolve) => {
          releases.push(() => {
            active -= 1;
            resolve([IDLE]);
          });
        });
      },
    });
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(releases).toHaveLength(1);
    // A sweep and a wake-up arrive while the pass runs.
    notifyDocumentChangeApplied({ stateRoot: STATE_ROOT });
    await settle();
    await h.time.advance(DOCUMENT_SWEEP_MS);
    expect(releases).toHaveLength(1);
    releases[0]!();
    await settle();
    expect(releases).toHaveLength(2);
    releases[1]!();
    await settle();
    expect(peak).toBe(1);
    await h.scheduler.stop();
  });

  it('serves different checkouts independently', async () => {
    const h = harness();
    h.journals = [journal('queued', 'ws-1', 'a'), journal('queued', 'ws-2', 'b')];
    await h.scheduler.start();
    await h.time.advance(0);
    expect(h.drained.sort()).toEqual(['ws-1', 'ws-2']);
    await h.scheduler.stop();
  });
});

describe('sweep', () => {
  it('looks every 30 s, arms only checkouts with queue work, and arms itself again', async () => {
    const h = harness();
    await h.scheduler.start();
    await h.time.advance(DOCUMENT_SWEEP_MS);
    expect(h.drained).toEqual([]);
    h.journals = [journal('queued', 'ws-9')];
    await h.time.advance(DOCUMENT_SWEEP_MS);
    expect(h.drained).toEqual(['ws-9']);
    h.journals = [];
    await h.time.advance(DOCUMENT_SWEEP_MS);
    expect(h.drained).toEqual(['ws-9']);
    expect(h.time.dueIn()).toEqual([DOCUMENT_SWEEP_MS]);
    await h.scheduler.stop();
  });

  it('prunes the uncommitted-changes ledger on every sweep, and a failing prune does not stop the sweeps', async () => {
    let pruned = 0;
    let failing = true;
    const h = harness({
      prune: () => {
        pruned += 1;
        return failing ? Promise.reject(new Error('git is busy')) : Promise.resolve();
      },
    });
    await h.scheduler.start();
    expect(pruned).toBe(0);
    await h.time.advance(DOCUMENT_SWEEP_MS);
    expect(pruned).toBe(1);
    expect(h.scheduler.recentEvents().at(-1)).toMatchObject({ kind: 'error' });
    failing = false;
    await h.time.advance(DOCUMENT_SWEEP_MS);
    expect(pruned).toBe(2);
    expect(h.scheduler.recentEvents().at(-1)).toMatchObject({ kind: 'sweep' });
    expect(h.time.dueIn()).toEqual([DOCUMENT_SWEEP_MS]);
    await h.scheduler.stop();
  });

  it('never keeps the process alive: every timer is unref-ed', async () => {
    const h = harness();
    h.journals = [journal('queued')];
    await h.scheduler.start();
    notifyDocumentChangeApplied({ stateRoot: STATE_ROOT });
    await settle();
    expect(h.time.pending.size).toBeGreaterThan(0);
    for (const timer of h.time.pending.values()) expect(timer.unref).toBe(true);
    await h.scheduler.stop();
  });
});

describe('stop', () => {
  it('clears every timer and starts no further pass', async () => {
    const h = harness();
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.scheduler.stop();
    expect(h.time.pending.size).toBe(0);
    await h.time.advance(10 * DOCUMENT_SWEEP_MS);
    expect(h.drained).toEqual([]);
    expect(h.scheduler.running).toBe(false);
  });

  it('waits for a running pass, then flushes within what is left of the deadline', async () => {
    let release: () => void = () => undefined;
    let flushDeadline: number | undefined;
    const h = harness({
      drain: () =>
        new Promise((resolve) => {
          release = () => {
            resolve([IDLE]);
          };
        }),
      flushAll: (deadlineMs) => {
        flushDeadline = deadlineMs;
        return Promise.resolve({ checkouts: 1, remaining: 0, timedOut: false });
      },
    });
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    const stopping = h.scheduler.stop({ flush: true, deadlineMs: 10_000 });
    await settle();
    expect(flushDeadline).toBeUndefined();
    await h.time.advance(2000);
    release();
    const outcome = await stopping;
    expect(flushDeadline).toBe(8000);
    expect(outcome).toEqual({ complete: true, timedOut: false, remaining: 0 });
  });

  it('gives up at the deadline when a pass does not finish and leaves the journals', async () => {
    const h = harness({ drain: () => new Promise(() => undefined) });
    h.journals = [journal('queued')];
    await h.scheduler.start();
    await h.time.advance(0);
    const stopping = h.scheduler.stop({ flush: true, deadlineMs: 10_000 });
    await h.time.advance(10_000);
    expect(await stopping).toEqual({ complete: false, timedOut: true, remaining: 1 });
  });

  it('reports what the flush left when its deadline passed', async () => {
    const h = harness({
      flushAll: () => Promise.resolve({ checkouts: 2, remaining: 3, timedOut: true }),
    });
    await h.scheduler.start();
    expect(await h.scheduler.stop({ flush: true })).toEqual({
      complete: false,
      timedOut: true,
      remaining: 3,
    });
  });

  it('without flush only stops', async () => {
    let flushed = false;
    const h = harness({
      flushAll: () => {
        flushed = true;
        return Promise.resolve({ checkouts: 0, remaining: 0, timedOut: false });
      },
    });
    h.journals = [journal('queued')];
    await h.scheduler.start();
    expect(await h.scheduler.stop()).toEqual({ complete: true, timedOut: false, remaining: 1 });
    expect(flushed).toBe(false);
  });
});

describe('disabled scheduler', () => {
  it('does nothing, so a test or a one-shot CLI command drains explicitly', async () => {
    await disabledDocumentQueueScheduler.start();
    await disabledDocumentQueueScheduler.wake();
    expect(await disabledDocumentQueueScheduler.stop({ flush: true })).toEqual({
      complete: true,
      timedOut: false,
      remaining: 0,
    });
    expect(disabledDocumentQueueScheduler.running).toBe(false);
    expect(disabledDocumentQueueScheduler.recentEvents()).toEqual([]);
  });
});
