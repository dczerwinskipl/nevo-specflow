import { describe, expect, it } from 'vitest';

import type { DocumentBatchRecord } from '../changes/journal/batch';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { DOCUMENT_CHANGE_STAGES, type DocumentChangeStage } from '../changes/journal/stages';
import {
  DOCUMENT_QUEUE_MAX_JOURNALS_PER_CHECKOUT,
  DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT,
} from '../changes/limits';
import {
  TEST_BATCH_ID,
  TEST_LATER,
  TEST_NOW,
  TEST_SLUG,
  TEST_SPEC_ID,
  TEST_WORKSPACE_ID,
  buildJournal,
} from '../changes/test-support';
import { BUSY_RETRY_AFTER_MS } from '../write/reservation-guard';
import {
  deriveCommitView,
  emptyCommitView,
  markerOfJournal,
  type BatchPaths,
  type OperationPaths,
} from './commit-model';

const DIRECTORY = 'specs/active/' + TEST_SLUG;
const NOW = Date.parse(TEST_LATER);
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const doc = (name: string): string => `${DIRECTORY}/${name}`;

function entry(
  stage: DocumentChangeStage,
  paths: readonly string[] | undefined,
  overrides: Partial<Record<keyof DocumentChangeJournal, unknown>> = {},
  writer?: OperationPaths['writer'],
): OperationPaths {
  return {
    journal: buildJournal(stage, overrides),
    paths,
    ...(writer !== undefined ? { writer } : {}),
  };
}

function batch(
  state: DocumentBatchRecord['state'],
  paths: readonly string[] | undefined,
  specId = TEST_SPEC_ID,
): BatchPaths {
  const record = {
    version: 1,
    projectId: 'p',
    operationId: TEST_BATCH_ID,
    workspaceId: TEST_WORKSPACE_ID,
    workspaceRoot: '/work/checkout',
    specId,
    slug: TEST_SLUG,
    state,
    memberIds: [TEST_BATCH_ID],
    paths: { sha256: 'e'.repeat(64), bytes: 10, pathCount: paths?.length ?? 0 },
    branch: 'main',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    attempts: 0,
  } as unknown as DocumentBatchRecord;

  return { batch: record, paths };
}

function view(journals: OperationPaths[], batches: BatchPaths[] = [], unreadable = 0) {
  return deriveCommitView({
    specId: TEST_SPEC_ID,
    workspaceId: TEST_WORKSPACE_ID,
    directory: DIRECTORY,
    journals,
    batches,
    unreadable,
    now: NOW,
  });
}

describe('markerOfJournal: the state every stage reports', () => {
  const expected: Record<DocumentChangeStage, string | undefined> = {
    reserved: 'pending',
    'files-writing': 'pending',
    queued: 'pending',
    committing: 'pending',
    // Settled operations are not open commits.
    completed: undefined,
    failed: undefined,
    'commit-failed': 'failed',
    'recovery-required': 'failed',
  };

  it.each(DOCUMENT_CHANGE_STAGES)('maps %s', (stage) => {
    expect(markerOfJournal(entry(stage, ['x']), NOW)?.state).toBe(expected[stage]);
  });

  it('flags only recovery-required as needing the operator', () => {
    expect(markerOfJournal(entry('recovery-required', []), NOW)?.recoveryRequired).toBe(true);
    expect(markerOfJournal(entry('commit-failed', []), NOW)?.recoveryRequired).toBeUndefined();
  });

  it('carries the reason, the port blocker, the attempts and the next attempt of a waiting commit', () => {
    const marker = markerOfJournal(
      entry('queued', [], {
        reason: 'index-locked',
        blockedBy: 'index-locked',
        attempts: 3,
        nextAttemptAt: '2026-10-24T10:00:30.000Z',
      }),
      NOW,
    );
    expect(marker).toEqual({
      state: 'pending',
      operationId: buildJournal('queued').operationId,
      reason: 'index-locked',
      blockedBy: 'index-locked',
      attempts: 3,
      nextAttemptAt: '2026-10-24T10:00:30.000Z',
      queuedAt: TEST_NOW,
    });
  });

  it('says a write in progress is writing, and a failure keeps its reason without attempts', () => {
    expect(markerOfJournal(entry('files-writing', []), NOW)?.reason).toBe('writing');
    const failed = markerOfJournal(entry('commit-failed', [], { reason: 'detached' }), NOW);
    expect(failed).toMatchObject({ state: 'failed', reason: 'detached' });
    expect(failed).not.toHaveProperty('attempts');
  });

  it('reports no open commit for an operation that completed uncommitted', () => {
    const completed = entry('completed', [], {
      outcome: 'uncommitted',
      reason: 'abandoned',
      sha: undefined,
    });
    expect(markerOfJournal(completed, NOW)).toBeUndefined();
  });

  it.each(['reserved', 'files-writing'] as const)(
    'reports a %s write whose process is gone as needing recovery, not as pending',
    (stage) => {
      const dead = markerOfJournal(entry(stage, [], {}, 'dead'), NOW);
      expect(dead).toMatchObject({
        state: 'failed',
        recoveryRequired: true,
        reason: 'write-interrupted',
      });
      expect(markerOfJournal(entry(stage, [], {}, 'alive'), NOW)?.state).toBe('pending');
      expect(markerOfJournal(entry(stage, [], {}, 'unknown'), NOW)?.state).toBe('pending');
    },
  );
});

describe('deriveCommitView: the uncommitted-changes ledger and the policy', () => {
  const ledgerEntry = (
    path: string,
    reason: 'auto-commit-off' | 'abandoned' = 'auto-commit-off',
  ) => ({
    path: DIRECTORY + '/' + path,
    operationId: '3f2b8a40-5c1d-4e7a-9b62-0d4e8f1a7c36',
    reason,
    recordedAt: TEST_NOW,
  });
  const withLedger = (ledger: ReturnType<typeof ledgerEntry>[], extra = {}) =>
    deriveCommitView({
      specId: TEST_SPEC_ID,
      workspaceId: TEST_WORKSPACE_ID,
      directory: DIRECTORY,
      journals: [],
      batches: [],
      unreadable: 0,
      now: NOW,
      ledger,
      ...extra,
    });

  it('marks the ledger paths of the Specification uncommitted, with the reason, and counts them', () => {
    const result = withLedger([
      ledgerEntry('a.md'),
      ledgerEntry('b.md', 'abandoned'),
      { ...ledgerEntry('x.md'), path: 'specs/active/other/x.md' },
    ]);
    expect(result.summary.uncommitted).toBe(2);
    expect(result.markers.get('a.md')).toMatchObject({
      state: 'uncommitted',
      reason: 'auto-commit-off',
    });
    expect(result.markers.get('b.md')).toMatchObject({ state: 'uncommitted', reason: 'abandoned' });
    expect(result.markers.has('x.md')).toBe(false);
  });

  it('shows an open operation of the path instead of the ledger entry', () => {
    const path = doc('a.md');
    const result = deriveCommitView({
      specId: TEST_SPEC_ID,
      workspaceId: TEST_WORKSPACE_ID,
      directory: DIRECTORY,
      journals: [entry('queued', [path])],
      batches: [],
      unreadable: 0,
      now: NOW,
      ledger: [ledgerEntry('a.md')],
    });
    expect(result.markers.get('a.md')?.state).toBe('pending');
  });

  it('puts the ledger and the policy into the fingerprint (the tree revision)', () => {
    const empty = withLedger([]);
    const one = withLedger([ledgerEntry('a.md')]);
    const manual = withLedger([], { policy: 'manual' });
    const auto = withLedger([], { policy: 'auto' });
    expect(
      new Set([empty, one, manual, auto].map((item) => JSON.stringify(item.fingerprint))).size,
    ).toBe(4);
    expect(manual.summary.policy).toBe('manual');
    expect(empty.summary).not.toHaveProperty('policy');
  });
});

describe('deriveCommitView', () => {
  it('is empty when nothing is in flight', () => {
    const empty = view([]);
    expect(empty.summary).toEqual({ pending: 0, failed: 0, recoveryRequired: 0, uncommitted: 0 });
    expect(empty.markers.size).toBe(0);
    expect(empty.capacity).toBe('open');
    expect(empty.checkoutBlocked).toBe(false);
    expect(emptyCommitView().fingerprint).toEqual(empty.fingerprint);
  });

  it('counts operations by state and finds the oldest pending one', () => {
    const result = view([
      entry('queued', [doc('a.md')], { operationId: id(1), sequence: 1, queuedAt: TEST_LATER }),
      entry('committing', [doc('b.md')], { operationId: id(2), sequence: 2 }),
      entry('files-writing', [doc('c.md')], {
        operationId: id(3),
        sequence: 3,
        createdAt: '2026-10-24T09:59:00.000Z',
      }),
      entry('commit-failed', [doc('d.md')], { operationId: id(4), sequence: 4 }),
      entry('recovery-required', [doc('e.md')], { operationId: id(5), sequence: 5 }),
    ]);
    expect(result.summary).toEqual({
      pending: 3,
      // Failed includes the operations that need the operator.
      failed: 2,
      recoveryRequired: 1,
      uncommitted: 0,
      oldestPendingAt: '2026-10-24T09:59:00.000Z',
    });
    expect([...result.markers.keys()].sort()).toEqual(['a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
  });

  it('shows the most serious state when several operations cover a path, the newest among equals', () => {
    const path = doc('a.md');
    const severity = view([
      entry('queued', [path], { operationId: id(1), sequence: 9 }),
      entry('commit-failed', [path], { operationId: id(3), sequence: 3 }),
    ]);
    expect(severity.markers.get('a.md')).toMatchObject({ state: 'failed', operationId: id(3) });
    const recovery = view([
      entry('commit-failed', [path], { operationId: id(3), sequence: 30 }),
      entry('recovery-required', [path], { operationId: id(4), sequence: 4 }),
    ]);
    expect(recovery.markers.get('a.md')).toMatchObject({ recoveryRequired: true });
    const equal = view([
      entry('queued', [path], { operationId: id(1), sequence: 1 }),
      entry('queued', [path], { operationId: id(2), sequence: 2 }),
    ]);
    expect(equal.markers.get('a.md')?.operationId).toBe(id(2));
  });

  it('keeps out what does not belong to the Specification or the checkout, and what has settled', () => {
    const result = view([
      entry('queued', [doc('a.md')], { operationId: id(1), specId: 'other-spec' }),
      entry('queued', [doc('b.md')], { operationId: id(2), workspaceId: 'other-checkout' }),
      entry('completed', [doc('c.md')], { operationId: id(3) }),
      entry('failed', [doc('d.md')], { operationId: id(4) }),
      // Another Specification's directory never maps onto a node of this tree.
      entry('queued', ['specs/active/elsewhere/e.md'], { operationId: id(5) }),
    ]);
    expect([...result.markers.keys()]).toEqual([]);
    expect(result.summary.pending).toBe(1);
  });

  it('counts an operation whose plan cannot be read without attributing it to a document', () => {
    const result = view([entry('queued', undefined)]);
    expect(result.summary.pending).toBe(1);
    expect(result.markers.size).toBe(0);
  });

  describe('holds', () => {
    it.each(['reserved', 'files-writing'] as const)(
      'holds the paths of a %s write, and a retry helps',
      (stage) => {
        const result = view([entry(stage, [doc('notes/a.md')])]);
        expect(result.holds.at('notes/a.md')).toEqual({
          cause: 'write-in-progress',
          retryAfterMs: BUSY_RETRY_AFTER_MS,
        });
        expect(result.holds.at('NOTES/A.MD')).toBeDefined();
        expect(result.holds.under('notes')).toBeDefined();
        expect(result.holds.under('')).toBeDefined();
        expect(result.holds.under('other')).toBeUndefined();
        expect(result.holds.at('notes/b.md')).toBeUndefined();
      },
    );

    it('holds a write-phase recovery with no retry, and ignores a commit-phase one', () => {
      const write = view([entry('recovery-required', [doc('a.md')], { recoveryPhase: 'write' })]);
      expect(write.holds.at('a.md')).toEqual({ cause: 'recovery-required' });
      const commit = view([entry('recovery-required', [doc('a.md')], { recoveryPhase: 'commit' })]);
      expect(commit.holds.at('a.md')).toBeUndefined();
    });

    it('does not hold the paths of queued, committing or failed operations', () => {
      for (const stage of ['queued', 'committing', 'commit-failed'] as const) {
        expect(view([entry(stage, [doc('a.md')])]).holds.at('a.md')).toBeUndefined();
      }
    });

    it.each([
      ['committing', { cause: 'commit-in-progress', retryAfterMs: BUSY_RETRY_AFTER_MS }],
      ['recovery-required', { cause: 'recovery-required' }],
    ] as const)('holds the paths of a %s batch', (state, hold) => {
      const result = view([], [batch(state, [doc('a.md')])]);
      expect(result.holds.at('a.md')).toEqual(hold);
    });

    it.each(['formed', 'failed', 'committed', 'dissolved'] as const)(
      'does not hold the paths of a %s batch',
      (state) => {
        expect(view([], [batch(state, [doc('a.md')])]).holds.at('a.md')).toBeUndefined();
      },
    );

    it('holds everything when the paths of a claim cannot be read', () => {
      const result = view([entry('reserved', undefined)]);
      expect(result.holds.at('anything.md')).toEqual({
        cause: 'write-in-progress',
        retryAfterMs: BUSY_RETRY_AFTER_MS,
      });
      expect(view([], [batch('committing', undefined)]).holds.under('x')).toBeDefined();
    });

    it('lets a hold that no wait lifts win over one that a wait lifts', () => {
      const result = view(
        [entry('files-writing', [doc('a.md')])],
        [batch('recovery-required', [doc('a.md')])],
      );
      expect(result.holds.at('a.md')).toEqual({ cause: 'recovery-required' });
    });

    it('ignores the batches of another Specification', () => {
      expect(
        view([], [batch('committing', [doc('a.md')], 'other-spec')]).holds.any(),
      ).toBeUndefined();
    });
  });

  describe('capacity and blockers', () => {
    const many = (count: number, stage: DocumentChangeStage): OperationPaths[] =>
      Array.from({ length: count }, (_, index) =>
        entry(stage, [], { operationId: id(index + 1), sequence: index + 1, specId: 'other-spec' }),
      );

    it('is open below the queue cap and full at it; waiting operations do not fill it', () => {
      expect(view(many(DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT - 1, 'queued')).capacity).toBe(
        'open',
      );
      expect(view(many(DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT, 'queued')).capacity).toBe(
        'queue-full',
      );
      expect(view(many(DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT, 'commit-failed')).capacity).toBe(
        'open',
      );
    });

    it('is held-limit when too many operations wait for a person', () => {
      expect(view(many(DOCUMENT_QUEUE_MAX_JOURNALS_PER_CHECKOUT, 'commit-failed')).capacity).toBe(
        'held-limit',
      );
    });

    it('counts only the journals of the checkout', () => {
      const elsewhere = many(DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT, 'queued').map((item) => ({
        ...item,
        journal: { ...item.journal, workspaceId: 'other-checkout' },
      }));
      expect(view(elsewhere).capacity).toBe('open');
    });

    it.each(['detached', 'no-commits', 'index-unreadable'])(
      'blocks the whole checkout on a failed commit that names %s',
      (reason) => {
        const result = view([entry('commit-failed', [doc('a.md')], { reason })]);
        expect(result.checkoutBlocked).toBe(true);
      },
    );

    it.each(['branch-changed', 'path-ignored'])(
      'blocks only the covered paths on a failed commit that names %s',
      (reason) => {
        const result = view([entry('commit-failed', [doc('a.md')], { reason })]);
        expect(result.checkoutBlocked).toBe(false);
        expect([...result.blockedPaths]).toEqual(['a.md']);
      },
    );

    it.each(['commit-failed', 'content-changed'])(
      'does not call %s a blocker of the checkout',
      (reason) => {
        const result = view([entry('commit-failed', [doc('a.md')], { reason })]);
        expect(result.checkoutBlocked).toBe(false);
        expect(result.blockedPaths.size).toBe(0);
      },
    );

    it('blocks writes while a journal cannot be read', () => {
      expect(view([], [], 1).checkoutBlocked).toBe(true);
    });
  });

  describe('fingerprint', () => {
    it('changes with every fact a response depends on and with nothing else', () => {
      const base = [entry('queued', [doc('a.md')])];
      const fingerprint = (journals: OperationPaths[], batches: BatchPaths[] = []): string =>
        JSON.stringify(view(journals, batches).fingerprint);
      const reference = fingerprint(base);
      expect(fingerprint([entry('queued', [doc('a.md')])])).toBe(reference);
      // Queued and committing look alike to a reader (both pending): nothing in a response differs.
      expect(fingerprint([entry('committing', [doc('a.md')])])).toBe(reference);
      for (const changed of [
        [entry('commit-failed', [doc('a.md')])],
        [entry('queued', [doc('a.md')], { attempts: 1 })],
        [entry('queued', [doc('a.md')], { reason: 'git-busy' })],
        [entry('queued', [doc('a.md')], { nextAttemptAt: TEST_LATER })],
        [entry('queued', [doc('b.md')])],
        [],
      ]) {
        expect(fingerprint(changed)).not.toBe(reference);
      }

      expect(fingerprint(base, [batch('committing', [doc('a.md')])])).not.toBe(reference);
    });

    it('does not depend on the clock', () => {
      const journals = [entry('queued', [doc('a.md')])];
      const at = (now: number): string =>
        JSON.stringify(
          deriveCommitView({
            specId: TEST_SPEC_ID,
            workspaceId: TEST_WORKSPACE_ID,
            directory: DIRECTORY,
            journals,
            batches: [],
            unreadable: 0,
            now,
          }).fingerprint,
        );
      expect(at(NOW)).toBe(at(NOW + 24 * 60 * 60 * 1000));
    });
  });
});
