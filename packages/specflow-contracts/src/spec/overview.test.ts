import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { SpecsOverviewProjectionSchema } from './overview';

const identity = {
  id: 'spec',
  title: 'Specification',
  updatedAt: '2026-10-01T12:00:00Z',
  progress: { completed: 2, total: 3 },
};
const archive = { collection: 'archive', revision: '1', groups: [], items: [identity] };

describe('collection-specific Specs Overview transport', () => {
  it('accepts Archive without Current steering fields or invented history', () => {
    expect(Value.Check(SpecsOverviewProjectionSchema, archive)).toBe(true);
  });
  it.each([
    { completedAt: '2026-09-01T12:00:00Z' },
    { archivedAt: '2026-09-02T12:00:00Z' },
    { completedAt: '2026-09-01T12:00:00Z', archivedAt: '2026-09-02T12:00:00Z' },
  ])('accepts authoritative lifecycle data: %j', (history) => {
    expect(
      Value.Check(SpecsOverviewProjectionSchema, {
        ...archive,
        items: [{ ...identity, ...history }],
      }),
    ).toBe(true);
  });
  it.each([
    { groupId: 'ready' },
    { overviewSummary: { kind: 'ready' } },
    { signals: [] },
    { currentExecutions: [] },
  ])('rejects fabricated Current fields in Archive: %j', (fields) => {
    expect(
      Value.Check(SpecsOverviewProjectionSchema, {
        ...archive,
        items: [{ ...identity, ...fields }],
      }),
    ).toBe(false);
  });
  it('requires Current classification and forbids Archive groups', () => {
    expect(Value.Check(SpecsOverviewProjectionSchema, { ...archive, collection: 'active' })).toBe(
      false,
    );
    expect(
      Value.Check(SpecsOverviewProjectionSchema, {
        ...archive,
        groups: [{ id: 'ready', order: 10 }],
      }),
    ).toBe(false);
    expect(
      Value.Check(SpecsOverviewProjectionSchema, {
        collection: 'active',
        revision: '1',
        groups: [{ id: 'draft', order: 10 }],
        items: [
          {
            ...identity,
            groupId: 'draft',
            overviewSummary: { kind: 'draft' },
            signals: [],
            currentExecutions: [],
          },
        ],
      }),
    ).toBe(true);
  });
});
