import { describe, expect, it } from 'vitest';
import { overviewGroups, parseOverviewGroups } from './groups';
import { sampleSpecsOverview } from './sample';

describe('backend-owned Overview configuration and sample classification', () => {
  it('supplies the four default presentation groups in precedence order', () => {
    expect(overviewGroups().map((group) => group.id)).toEqual([
      'requires-attention',
      'active',
      'ready',
      'draft',
    ]);
    const projection = sampleSpecsOverview('active');
    expect(
      projection.items
        .filter((item) => item.groupId === 'requires-attention')
        .map((item) => item.id),
    ).toEqual(['admission', 'security', 'review']);
    expect(projection.items.find((item) => item.id === 'admission')).toMatchObject({
      groupId: 'requires-attention',
      concurrentWork: { executionCount: 1 },
    });
    expect(projection.items.find((item) => item.id === 'providers')).toMatchObject({
      groupId: 'active',
      overviewSummary: { kind: 'active' },
    });
    expect(projection.items.find((item) => item.id === 'packaging')?.groupId).toBe('ready');
    expect(projection.items.find((item) => item.id === 'localization')?.groupId).toBe('draft');
    expect(new Set(projection.items.map((item) => item.id)).size).toBe(projection.items.length);
  });
  it('enables and orders standard IDs from project configuration without label/rule DSL', () => {
    const groups = parseOverviewGroups({
      overview: {
        groups: [
          { id: 'draft', order: 10 },
          { id: 'ready', order: 20 },
        ],
      },
    });
    const result = sampleSpecsOverview('active', groups);
    expect(result.groups).toEqual(groups);
    expect(result.items.map((item) => item.groupId)).toEqual(['ready', 'draft']);
    expect(parseOverviewGroups(undefined)).toEqual(overviewGroups());
    expect(parseOverviewGroups({ overview: { groups: [] } })).toEqual([]);
  });
  it.each([
    { overview: { groups: [{ id: 'working', order: 1 }] } },
    { overview: { groups: [{ id: 'active', order: 1, label: 'Active' }] } },
    {
      overview: {
        groups: [
          { id: 'active', order: 1 },
          { id: 'active', order: 2 },
        ],
      },
    },
    { overview: { groups: [{ id: 'active', order: 'one' }] } },
  ])('rejects malformed/unsupported configuration: %j', (value) => {
    expect(() => parseOverviewGroups(value)).toThrow();
  });
});
