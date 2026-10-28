import { describe, expect, it } from 'vitest';

import { DOCUMENT_BATCH_MAX_OPERATIONS, DOCUMENT_BATCH_MAX_PATHS } from '../changes/limits';
import {
  DOCUMENT_MAX_HOLD_MS,
  DOCUMENT_SETTLE_DEFAULT_MS,
  effectiveSettleMs,
  formNextBatch,
  type FormationInput,
  type QueuedOperation,
} from './formation';
import { SettleLedger, type QueueClock } from './settle-ledger';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SPEC_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SPEC_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function op(n: number, patch: Partial<QueuedOperation> = {}): QueuedOperation {
  return {
    operationId: id(n),
    sequence: n,
    specId: SPEC_A,
    branch: 'feature/work',
    structural: false,
    paths: [`specs/active/a/doc-${n}.md`],
    queuedMonoMs: 0,
    ...patch,
  };
}

function input(queued: QueuedOperation[], patch: Partial<FormationInput> = {}): FormationInput {
  return {
    queued,
    barrierPaths: new Set(),
    heldPaths: new Set(),
    nowMonoMs: 10_000,
    nowWallMs: 0,
    settleMs: DOCUMENT_SETTLE_DEFAULT_MS,
    maxHoldMs: DOCUMENT_MAX_HOLD_MS,
    ...patch,
  };
}

describe('batch formation', () => {
  it('takes the queued operations of one Specification in sequence order; the first member names the batch', () => {
    const decision = formNextBatch(input([op(3), op(1), op(2)]));
    expect(decision.kind).toBe('batch');
    if (decision.kind !== 'batch') return;
    expect(decision.batch.members.map((member) => member.operationId)).toEqual([
      id(1),
      id(2),
      id(3),
    ]);
    expect(decision.batch.batchId).toBe(id(1));
  });

  it('consolidates several saves of one document into one path', () => {
    const same = ['specs/active/a/notes.md'];
    const decision = formNextBatch(input([op(1, { paths: same }), op(2, { paths: same })]));
    expect(decision.kind === 'batch' && decision.batch.paths).toEqual(same);
  });

  it('forms the batches of different Specifications separately, lowest first member first', () => {
    const queued = [op(1, { specId: SPEC_B }), op(2), op(3, { specId: SPEC_B })];
    const decision = formNextBatch(input(queued));
    expect(decision.kind === 'batch' && decision.batch.specId).toBe(SPEC_B);
    expect(decision.kind === 'batch' && decision.batch.members.length).toBe(2);
  });

  it('does not claim an operation while an overlapping barrier exists, and does not overtake it', () => {
    const shared = 'specs/active/a/shared.md';
    const queued = [
      op(1, { paths: [shared] }),
      op(2, { paths: [shared, 'specs/active/a/two.md'] }),
      op(3, { paths: ['specs/active/a/two.md'] }),
      op(4, { paths: ['specs/active/a/free.md'] }),
    ];
    const decision = formNextBatch(input(queued, { barrierPaths: new Set([shared]) }));
    expect(decision.kind).toBe('batch');
    if (decision.kind !== 'batch') return;
    // 1 is blocked by the barrier; 2 too; 3 overlaps 2 (it must not overtake); 4 is free.
    expect(decision.batch.members.map((member) => member.operationId)).toEqual([id(4)]);
    expect(decision.deferred).toEqual([
      { operationId: id(1), reason: 'barrier' },
      { operationId: id(2), reason: 'barrier' },
      { operationId: id(3), reason: 'earlier-overlap' },
    ]);
  });

  it('compares paths case-insensitively', () => {
    const decision = formNextBatch(
      input([op(1, { paths: ['specs/active/a/Notes.md'] })], {
        barrierPaths: new Set(['specs/active/a/notes.md']),
      }),
    );
    expect(decision.kind).toBe('none');
  });

  it('holds back operations that overlap a failed batch', () => {
    const decision = formNextBatch(
      input([op(1)], { heldPaths: new Set(['specs/active/a/doc-1.md']) }),
    );
    expect(decision).toEqual({
      kind: 'none',
      deferred: [{ operationId: id(1), reason: 'held-by-failed-batch' }],
    });
  });

  it('puts no path in two batches: a later operation overlapping a skipped one is skipped too', () => {
    const queued = [
      op(1, { paths: ['specs/active/a/x.md'] }),
      op(2, { paths: ['specs/active/a/x.md', 'specs/active/a/y.md'], branch: 'other' }),
      op(3, { paths: ['specs/active/a/y.md'] }),
    ];
    const decision = formNextBatch(input(queued));
    expect(decision.kind === 'batch' && decision.batch.members.map((m) => m.operationId)).toEqual([
      id(1),
    ]);
    expect(decision.kind === 'batch' && decision.deferred.map((d) => d.reason)).toEqual([
      'other-branch',
      'earlier-overlap',
    ]);
  });

  it('caps a batch at 50 operations; the rest waits for the next batch', () => {
    const queued = Array.from({ length: DOCUMENT_BATCH_MAX_OPERATIONS + 5 }, (_, i) => op(i + 1));
    const decision = formNextBatch(input(queued));
    expect(decision.kind === 'batch' && decision.batch.members.length).toBe(
      DOCUMENT_BATCH_MAX_OPERATIONS,
    );
    expect(decision.kind === 'batch' && decision.batch.full).toBe(true);
    expect(decision.kind === 'batch' && decision.deferred.length).toBe(5);
  });

  it('caps a batch at 200 distinct paths', () => {
    const many = (start: number, count: number): string[] =>
      Array.from({ length: count }, (_, i) => `specs/active/a/f-${start + i}.md`);
    const queued = [
      op(1, { paths: many(0, 150) }),
      op(2, { paths: many(1000, 60) }),
      op(3, { paths: many(0, 10) }),
    ];
    const decision = formNextBatch(input(queued));
    expect(decision.kind === 'batch' && decision.batch.members.map((m) => m.operationId)).toEqual([
      id(1),
    ]);
    expect(decision.kind === 'batch' && decision.batch.paths.length).toBeLessThanOrEqual(
      DOCUMENT_BATCH_MAX_PATHS,
    );
  });

  it('respects a backoff time in the future', () => {
    const decision = formNextBatch(input([op(1, { notBeforeWallMs: 5000 })], { nowWallMs: 1000 }));
    expect(decision.kind).toBe('none');
    const later = formNextBatch(input([op(1, { notBeforeWallMs: 5000 })], { nowWallMs: 6000 }));
    expect(later.kind).toBe('batch');
  });

  describe('settle and maximum hold (monotonic clock)', () => {
    it('waits the settle period after the LAST member', () => {
      const queued = [op(1, { queuedMonoMs: 9_000 }), op(2, { queuedMonoMs: 9_900 })];
      expect(formNextBatch(input(queued))).toMatchObject({ kind: 'wait', waitMs: 200 });
      expect(formNextBatch(input(queued, { nowMonoMs: 10_200 })).kind).toBe('batch');
    });

    it('never holds a batch longer than the maximum after the FIRST member', () => {
      // A save every 100 ms keeps resetting the settle; the maximum hold ends it.
      const queued = Array.from({ length: 49 }, (_, i) =>
        op(i + 1, { queuedMonoMs: 5_100 + i * 100 }),
      );
      expect(formNextBatch(input(queued, { nowMonoMs: 10_099 }))).toMatchObject({
        kind: 'wait',
        waitMs: 1,
      });
      expect(formNextBatch(input(queued, { nowMonoMs: 10_100 })).kind).toBe('batch');
    });

    it('makes a batch with a structural member eligible at once', () => {
      const queued = [
        op(1, { queuedMonoMs: 9_999 }),
        op(2, { structural: true, queuedMonoMs: 9_999 }),
      ];
      expect(formNextBatch(input(queued)).kind).toBe('batch');
    });

    it('lets a flush bypass the settle', () => {
      const queued = [op(1, { queuedMonoMs: 9_999 })];
      expect(formNextBatch(input(queued)).kind).toBe('wait');
      expect(formNextBatch(input(queued, { flush: true })).kind).toBe('batch');
    });

    it('does not let a settling Specification hold back an eligible one', () => {
      const queued = [op(1, { queuedMonoMs: 9_999 }), op(2, { specId: SPEC_B, queuedMonoMs: 0 })];
      const decision = formNextBatch(input(queued));
      expect(decision.kind === 'batch' && decision.batch.specId).toBe(SPEC_B);
    });

    it('forms only the requested Specification', () => {
      const queued = [op(1), op(2, { specId: SPEC_B })];
      const decision = formNextBatch(input(queued, { onlySpecId: SPEC_B }));
      expect(decision.kind === 'batch' && decision.batch.specId).toBe(SPEC_B);
    });

    it('accepts a configured settle only inside 250-500 ms', () => {
      expect(effectiveSettleMs(undefined)).toBe(300);
      expect(effectiveSettleMs(250)).toBe(250);
      expect(effectiveSettleMs(500)).toBe(500);
      expect(effectiveSettleMs(100)).toBe(300);
      expect(effectiveSettleMs(900)).toBe(300);
      expect(effectiveSettleMs(Number.NaN)).toBe(300);
    });
  });
});

describe('the settle ledger', () => {
  function clock(state: { mono: number; wall: number }): QueueClock {
    return { monotonicMs: () => state.mono, wallMs: () => state.wall };
  }

  it('places an operation seen for the first time by its age and keeps it by the monotonic clock', () => {
    const state = { mono: 1_000, wall: 1_700_000_000_000 };
    const ledger = new SettleLedger();
    const queuedAt = new Date(state.wall - 120).toISOString();
    expect(ledger.observe(id(1), queuedAt, clock(state))).toBe(880);
    state.mono += 500;
    state.wall -= 60_000; // the wall clock jumps back: it no longer matters
    expect(ledger.observe(id(1), queuedAt, clock(state))).toBe(880);
  });

  it('clamps an age beyond the maximum hold (a restart: eligible at once)', () => {
    const state = { mono: 100_000, wall: 1_700_000_000_000 };
    const queuedAt = new Date(state.wall - 3_600_000).toISOString();
    expect(new SettleLedger().observe(id(1), queuedAt, clock(state))).toBe(100_000 - 5_000);
  });

  it('counts a queuedAt in the future as age 0, so the maximum hold still expires', () => {
    const state = { mono: 100_000, wall: 1_700_000_000_000 };
    const ledger = new SettleLedger();
    const queuedAt = new Date(state.wall + 3_600_000).toISOString();
    const placed = ledger.observe(id(1), queuedAt, clock(state));
    expect(placed).toBe(100_000);
    const decision = formNextBatch(
      input([op(1, { queuedMonoMs: placed })], { nowMonoMs: placed + DOCUMENT_MAX_HOLD_MS }),
    );
    expect(decision.kind).toBe('batch');
  });

  it('forgets operations that left the queue', () => {
    const state = { mono: 1_000, wall: 1_700_000_000_000 };
    const ledger = new SettleLedger();
    ledger.observe(id(1), new Date(state.wall).toISOString(), clock(state));
    ledger.retain(new Set());
    state.mono = 9_000;
    expect(ledger.observe(id(1), new Date(state.wall).toISOString(), clock(state))).toBe(9_000);
  });
});
