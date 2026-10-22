import { describe, expect, it } from 'vitest';

import { buildOperationList } from './list-service';
import type { OperationListSource, OperationSourceRow } from './operation-source';
import { createOperationProgressRegistry } from './progress-registry';

const kind = 'specification-create';
const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const iso = (agoMs: number) => new Date(NOW - agoMs).toISOString();
const id = (n: number) => `3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f${String(n).padStart(2, '0')}`;
const min = 60_000;

function source(rows: readonly OperationSourceRow[]): OperationListSource {
  return { kind, list: () => Promise.resolve(rows) };
}

function run(
  rows: readonly OperationSourceRow[],
  options: {
    registry?: ReturnType<typeof createOperationProgressRegistry>;
    limit?: number;
    statuses?: string[];
    admit?: (specId: string | undefined) => boolean;
  } = {},
) {
  return buildOperationList({
    sources: [source(rows)],
    registry: options.registry ?? createOperationProgressRegistry(),
    now: new Date(NOW),
    admit: (row) => (options.admit ? options.admit(row.subject?.specId) : true),
    ...(options.statuses ? { statuses: new Set(options.statuses) } : {}),
    limit: options.limit ?? 20,
  });
}

const row = (n: number, over: Partial<OperationSourceRow> = {}): OperationSourceRow => ({
  operationId: id(n),
  state: 'in-progress',
  updatedAt: iso(0),
  ...over,
});

describe('buildOperationList status table', () => {
  it('journal completed: completed for 10 minutes, then gone', async () => {
    const result = await run([
      row(1, { state: 'completed', updatedAt: iso(9 * min) }),
      row(2, { state: 'completed', updatedAt: iso(11 * min) }),
    ]);
    expect(result.items.map((item) => item.operationId)).toEqual([id(1)]);
    expect(result.items[0]).toMatchObject({ status: 'completed', finishedAt: iso(9 * min) });
    expect(result.counts.completed).toBe(1);
  });

  it('journal recovery-required stays, with its known code', async () => {
    const result = await run([
      row(1, {
        state: 'recovery-required',
        code: 'CREATE_JOURNAL_CORRUPT',
        updatedAt: iso(99 * min),
      }),
    ]);
    expect(result.items[0]).toMatchObject({
      status: 'recovery-required',
      code: 'CREATE_JOURNAL_CORRUPT',
    });
  });

  it('non terminal journal + live registry: in-progress with the live steps', async () => {
    const registry = createOperationProgressRegistry({ now: () => new Date(NOW) });
    const live = registry.begin({ operationId: id(1), kind, steps: ['a', 'b'] });
    live.step('a', 'running');
    const result = await run([row(1, { updatedAt: iso(30 * min), currentStep: 'old' })], {
      registry,
    });
    expect(result.items[0]).toMatchObject({
      status: 'in-progress',
      currentStep: 'a',
      steps: [
        { id: 'a', status: 'running' },
        { id: 'b', status: 'pending' },
      ],
    });
  });

  it('non terminal journal + registry failure / recovery', async () => {
    const registry = createOperationProgressRegistry({ now: () => new Date(NOW) });
    registry.begin({ operationId: id(1), kind, steps: ['a'] }).fail('COMMIT_BLOCKED');
    registry.begin({ operationId: id(2), kind, steps: ['a'] }).recoveryRequired();
    const result = await run([row(1), row(2)], { registry });
    expect(result.items.map((item) => [item.operationId, item.status, item.code])).toEqual([
      [id(2), 'recovery-required', undefined],
      [id(1), 'failed', 'COMMIT_BLOCKED'],
    ]);
  });

  it('non terminal journal without a writer: in-progress within 5 minutes, interrupted after', async () => {
    const result = await run([
      row(1, { updatedAt: iso(4 * min), currentStep: 'reserving' }),
      row(2, { updatedAt: iso(6 * min) }),
    ]);
    const byId = new Map(result.items.map((item) => [item.operationId, item]));
    expect(byId.get(id(1))).toMatchObject({ status: 'in-progress', currentStep: 'reserving' });
    expect(byId.get(id(2))).toMatchObject({
      status: 'recovery-required',
      code: 'OPERATION_INTERRUPTED',
    });
  });

  it('registry-only: running is listed, a finished one is not', async () => {
    const registry = createOperationProgressRegistry({ now: () => new Date(NOW) });
    registry.begin({ operationId: id(1), kind, steps: ['a'] });
    registry.begin({ operationId: id(2), kind, steps: ['a'] }).fail('BRANCH_PROTECTED');
    registry.begin({ operationId: id(3), kind: 'other', steps: ['a'] });
    const result = await run([], { registry });
    expect(result.items.map((item) => item.operationId)).toEqual([id(1)]);
  });
});

describe('buildOperationList shaping', () => {
  it('orders recovery, failed, in-progress by recency, then completed; counts after admission', async () => {
    const result = await run(
      [
        row(1, { updatedAt: iso(1 * min) }),
        row(2, { updatedAt: iso(2 * min) }),
        row(3, { state: 'completed', updatedAt: iso(3 * min) }),
        row(4, { state: 'recovery-required', updatedAt: iso(50 * min) }),
        row(5, { subject: { specId: 'hidden' } }),
      ],
      { admit: (specId) => specId !== 'hidden' },
    );
    expect(result.items.map((item) => item.operationId)).toEqual([id(4), id(1), id(2), id(3)]);
    expect(result.counts).toEqual({ inProgress: 2, recoveryRequired: 1, failed: 0, completed: 1 });
  });

  it('lists at most five completed rows, newest first', async () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      row(index + 1, { state: 'completed', updatedAt: iso((index + 1) * min) }),
    );
    const result = await run(rows);
    expect(result.items.map((item) => item.operationId)).toEqual([1, 2, 3, 4, 5].map(id));
    expect(result.counts.completed).toBe(5);
  });

  it('applies limit and status filter; counts stay unfiltered', async () => {
    const rows = [
      ...[1, 2, 3].map((n) => row(n, { updatedAt: iso(n * 1000) })),
      row(4, { state: 'recovery-required' }),
    ];
    const limited = await run(rows, { limit: 2 });
    expect(limited.items).toHaveLength(2);
    expect(limited.truncated).toBe(true);
    const filtered = await run(rows, { statuses: ['in-progress'], limit: 3 });
    expect(filtered.items).toHaveLength(3);
    expect(filtered.truncated).toBe(false);
    expect(filtered.counts.recoveryRequired).toBe(1);
    expect(filtered.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it('uses the registry start when the journal has none, and keeps the journal start otherwise', async () => {
    const registry = createOperationProgressRegistry({ now: () => new Date(NOW - 2 * min) });
    registry.begin({ operationId: id(1), kind, steps: ['a'] });
    registry.begin({ operationId: id(2), kind, steps: ['a'] });
    const result = await run([row(1), row(2, { startedAt: iso(20 * min) })], { registry });
    const byId = new Map(result.items.map((item) => [item.operationId, item]));
    expect(byId.get(id(1))?.startedAt).toBe(iso(2 * min));
    expect(byId.get(id(2))?.startedAt).toBe(iso(20 * min));
  });
});
