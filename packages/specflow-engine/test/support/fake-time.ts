import type { QueueClock } from '../../src/specs/documents/queue/settle-ledger';
import type { QueueTimers } from '../../src/specs/documents/queue/timers';

/** Timers and clocks the test moves by hand: no test waits for wall-clock time. */
export class FakeTime implements QueueTimers, QueueClock {
  now = 1_000;
  private seq = 0;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();
  monotonicMs = (): number => this.now;
  private wallAnchor: { readonly wall: number; readonly mono: number } = {
    // Ahead of every journal the test writes: each operation counts as queued a maximum hold ago.
    wall: Date.now() + 3_600_000,
    mono: 1_000,
  };
  wallMs = (): number => this.wallAnchor.wall + (this.now - this.wallAnchor.mono);
  /** Pins the wall clock: it reads `epochMs` now and moves with the fake time from there. */
  pinWall(epochMs: number): void {
    this.wallAnchor = { wall: epochMs, mono: this.now };
  }
  set(fn: () => void, ms: number): unknown {
    this.seq += 1;
    this.pending.set(this.seq, { at: this.now + ms, fn });

    return this.seq;
  }
  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** Moves time forward and fires the due timers in order. Does not wait for the passes they start. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const next = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (next === undefined) {
        break;
      }

      this.pending.delete(next[0]);
      this.now = Math.max(this.now, next[1].at);
      next[1].fn();
    }

    this.now = target;
  }
  /** Delays (from now) of the timers that are armed, soonest first. */
  dueIn(): number[] {
    return [...this.pending.values()].map((timer) => timer.at - this.now).sort((a, b) => a - b);
  }
}
