import { describe, expect, it } from 'vitest';
import { createSpecItem, createSpecsFixture, createArchiveItem } from './fixtures';
import { activeRow, archiveRow } from './presentation';
import { groupTranslationKey } from './model';

describe('Specs Overview presentation boundary', () => {
  it('preserves backend classification and bounded concurrent work without leaking evidence', () => {
    const source = createSpecsFixture().items[0]!;
    const row = activeRow(source);
    expect(row.groupId).toBe('requires-attention');
    expect(row.summary).toEqual({ kind: 'attention', reason: 'input' });
    expect(row.qualifier).toEqual({ executionCount: 1 });
    expect(row).not.toHaveProperty('signals');
    expect(row).not.toHaveProperty('currentExecutions');
    expect(JSON.stringify(row)).not.toContain('TASK-');
    expect(
      activeRow({
        ...source,
        groupId: 'draft',
        overviewSummary: { kind: 'draft' },
        concurrentWork: undefined,
      }).groupId,
    ).toBe('draft');
  });
  it('maps stable group IDs to frontend-owned translations', () => {
    expect(groupTranslationKey).toEqual({
      'requires-attention': 'specs.groups.requiresAttention',
      active: 'specs.groups.active',
      ready: 'specs.groups.ready',
      draft: 'specs.groups.draft',
    });
  });
  it('does not interpret unavailable evidence as calm state or reclassify the row', () => {
    const row = activeRow({ ...createSpecsFixture().items[0]!, steeringAvailable: false });
    expect(row.summary).toEqual({ kind: 'unavailable' });
    expect(row.groupId).toBe('requires-attention');
  });
  it('links exactly one PR but never chooses a representative for several', () => {
    const single = activeRow(createSpecsFixture().items[0]!);
    expect(single.pullRequests).toEqual({
      kind: 'single',
      number: 27,
      href: 'https://example.test/pull/27',
    });
    const multiple = activeRow(
      createSpecItem({
        pullRequests: [1, 2, 3].map((number) => ({
          number,
          url: `https://example.test/${number}`,
        })),
        tags: ['one', 'two', 'three'],
      }),
    );
    expect(multiple.pullRequests).toEqual({ kind: 'multiple', count: 3 });
    expect(multiple.tags).toEqual(['one', 'two']);
    expect(multiple.omittedTags).toBe(1);
  });
  it.each([
    [
      { completedAt: '2026-09-22T14:00:00Z' },
      { kind: 'completed', timestamp: '2026-09-22T14:00:00Z' },
    ],
    [
      { archivedAt: '2026-09-25T09:00:00Z' },
      { kind: 'archived', timestamp: '2026-09-25T09:00:00Z' },
    ],
    [
      { completedAt: '2026-09-22T14:00:00Z', archivedAt: '2026-09-25T09:00:00Z' },
      { kind: 'completed', timestamp: '2026-09-22T14:00:00Z' },
    ],
    [{}, { kind: 'archived', timestamp: undefined }],
  ])('uses only authoritative Archive lifecycle data: %j', (timestamps, history) => {
    const row = archiveRow(createArchiveItem({ ...timestamps, updatedAt: '2099-01-01T00:00:00Z' }));
    expect(row.history).toEqual(history);
    expect(row).not.toHaveProperty('summary');
    expect(row).not.toHaveProperty('groupId');
    expect(JSON.stringify(row)).not.toContain('2099');
  });
});
