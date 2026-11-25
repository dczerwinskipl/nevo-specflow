import { describe, expect, it } from 'vitest';

import {
  createArchiveItem,
  createSpecItem,
  createSpecsFixture,
  waitingForTasks,
  workflowFixtures,
} from '../../../../test-support/specs/overview/fixtures';
import { sectionTranslationKey } from './model';
import {
  archiveRow,
  currentRow,
  overviewCapabilities,
  sortArchiveItems,
  rowMetadata,
  rowProgress,
  workflowLine,
} from './presentation';

describe('Specs Overview presentation boundary', () => {
  it('keeps identity facts ordered beneath the title and limits PR metadata to Current', () => {
    const source = createSpecItem({
      key: 'UI-1234',
      tags: ['UI', 'Navigation', 'Extra'],
      pullRequests: [{ number: 62, url: 'https://example.test/pull/62' }],
    });
    const current = currentRow(source);
    expect(rowMetadata(current)).toEqual([
      { id: 'key', kind: 'key', value: 'UI-1234' },
      { id: 'tag-0', kind: 'tag', value: 'UI' },
      { id: 'tag-1', kind: 'tag', value: 'Navigation' },
      { id: 'omitted', kind: 'omitted', value: '+1' },
      { id: 'pr', kind: 'pr' },
    ]);
    expect(
      rowMetadata(archiveRow(createArchiveItem(source))).some((fact) => fact.kind === 'pr'),
    ).toBe(false);
  });
  it('projects empty, valid and malformed progress independently of row composition', () => {
    expect(rowProgress({ completed: 0, total: 0 })).toBe('empty');
    expect(rowProgress({ completed: 50, total: 100 })).toBe('ready');
    for (const progress of [
      { completed: 1, total: 0 },
      { completed: 1.5, total: 3 },
      { completed: 0, total: Infinity },
      { completed: -1, total: 3 },
    ]) {
      expect(rowProgress(progress)).toBe('invalid');
    }
  });
  it('sorts the displayed milestone using completion precedence, invalid dates last and stable identity ties', () => {
    const items = [
      createArchiveItem({ id: 'invalid', completedAt: 'broken', archivedAt: '2099-01-01' }),
      createArchiveItem({ id: 'older', completedAt: '2026-01-01', archivedAt: '2099-01-01' }),
      createArchiveItem({ id: 'b', archivedAt: '2026-09-01' }),
      createArchiveItem({ id: 'a', archivedAt: '2026-09-01' }),
    ];
    expect(sortArchiveItems(items).map((item) => item.id)).toEqual(['a', 'b', 'older', 'invalid']);
    expect(items[0]!.id).toBe('invalid');
  });
  it('derives row summary and concurrent qualifier from the simplified Current model', () => {
    const source = createSpecsFixture().items[0]!;
    const row = currentRow(source);

    expect(row.sectionId).toBe('requires-attention');
    expect(row.summary).toEqual({ kind: 'attention', reason: 'input' });
    // The workflow position is the one qualifier under attention; it wins over the Session count.
    expect(row.workflow).toEqual({
      kind: 'step',
      title: 'Waiting for Tasks',
      position: { position: 6, total: 7 },
      detail: { kind: 'tasks-in-progress', count: 2 },
    });
    expect(row.qualifier).toBeUndefined();
    expect(currentRow({ ...source, workflow: null }).qualifier).toEqual({ executionCount: 1 });
    expect(row).not.toHaveProperty('signals');
    expect(row).not.toHaveProperty('currentExecutions');
    expect(JSON.stringify(row)).not.toContain('TASK-');

    expect(
      currentRow({
        ...source,
        workflow: workflowFixtures.notStarted,
        classification: { section: 'not-started' },
        currentExecutions: [],
      }).sectionId,
    ).toBe('not-started');
  });

  it('says where the workflow stands, never what the manifest status says', () => {
    const summary = (workflow: Parameters<typeof workflowLine>[0], section = 'in-progress') =>
      currentRow(
        createSpecItem({
          workflow,
          classification: { section } as ReturnType<typeof createSpecItem>['classification'],
        }),
      ).summary;

    expect(summary(workflowFixtures.notStarted, 'not-started')).toEqual({
      kind: 'workflow',
      line: { kind: 'not-started' },
    });
    expect(summary(workflowFixtures.waiting)).toEqual({
      kind: 'workflow',
      line: {
        kind: 'step',
        title: 'Waiting for Tasks',
        position: { position: 6, total: 7 },
        detail: { kind: 'tasks-ready', count: 5 },
      },
    });
    expect(summary(workflowFixtures.completed, 'ended')).toEqual({
      kind: 'workflow',
      line: { kind: 'ended', outcome: 'completed' },
    });
  });

  it.each([
    [workflowFixtures.agentWorking, { kind: 'agent-working' }],
    [workflowFixtures.ownerWorking, { kind: 'in-progress' }],
    [workflowFixtures.readyForNextStep, { kind: 'ready' }],
    [waitingForTasks({ readyToStart: 0, inProgress: 3 }), { kind: 'tasks-in-progress', count: 3 }],
    [
      waitingForTasks({ readyToStart: 0, inProgress: 0, open: 2, total: 12 }),
      { kind: 'waiting-for', count: 2, total: 12 },
    ],
  ] as const)('names what step %j waits for', (workflow, detail) => {
    expect(workflowLine(workflow)).toMatchObject({ kind: 'step', detail });
  });

  it('names no step whose workflow changed under the run', () => {
    expect(workflowLine({ kind: 'step', state: 'ready' })).toEqual({
      kind: 'step',
      detail: { kind: 'ready' },
    });
  });

  it('keeps unknown status and progress explicit in the presentation model', () => {
    const row = currentRow(
      createSpecItem({
        workflow: null,
        classification: { section: 'unknown' },
        progress: null,
        signals: null,
        currentExecutions: null,
      }),
    );
    expect(row.progress).toBeNull();
    expect(row.sectionId).toBe('unknown');
    expect(row.summary).toEqual({ kind: 'unknown' });
    expect(row.qualifier).toBeUndefined();
  });

  it('preserves Requires attention when its semantic reason is not classified yet', () => {
    expect(
      currentRow(
        createSpecItem({
          classification: { section: 'requires-attention' },
        }),
      ).summary,
    ).toEqual({ kind: 'attention' });
  });

  it('maps stable Current section IDs to frontend-owned translations', () => {
    expect(sectionTranslationKey).toEqual({
      'requires-attention': 'specifications.sections.requiresAttention',
      'in-progress': 'specifications.sections.inProgress',
      'not-started': 'specifications.sections.notStarted',
      ended: 'specifications.sections.ended',
      unknown: 'specifications.sections.unknown',
    });
  });

  it('counts the executing Sessions when the workflow position is not known', () => {
    const row = currentRow(
      createSpecItem({
        workflow: null,
        classification: { section: 'in-progress' },
        currentExecutions: [
          { sessionId: 'one', agentRole: 'Implementer', taskIds: ['TASK-1'] },
          { sessionId: 'two', agentRole: 'Reviewer', taskIds: ['TASK-2'] },
        ],
      }),
    );

    expect(row.summary).toEqual({ kind: 'sessions', executionCount: 2 });
    expect(row.qualifier).toBeUndefined();
  });

  it('links exactly one PR but never chooses a representative for several', () => {
    const single = currentRow(createSpecsFixture().items[0]!);
    expect(single.pullRequests).toEqual({
      kind: 'single',
      number: 27,
      href: 'https://example.test/pull/27',
    });

    const multiple = currentRow(
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

  it('provides complete Archive fixture metadata while keeping it optional in the API', () => {
    const archive = createSpecsFixture('archive');
    expect(archive.items).toHaveLength(18);
    for (const item of archive.items) {
      expect(item.key).toMatch(/^(UI|RT|CORE)-[0-9]+$/);
      expect(item.tags?.length).toBeGreaterThan(0);
      expect(item.pullRequests?.length).toBeGreaterThan(0);
      const row = archiveRow(item);
      expect(row.key).toBe(item.key);
      expect(row.tags.length).toBeGreaterThan(0);
    }

    const missing = archiveRow(createArchiveItem({ key: undefined, tags: [], pullRequests: [] }));
    expect(missing.key).toBeUndefined();
    expect(missing.tags).toEqual([]);
    expect(missing.pullRequests).toBeUndefined();
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
    [
      { completedAt: '', archivedAt: '2026-09-25T09:00:00Z' },
      { kind: 'completed', timestamp: '' },
    ],
  ])('uses only authoritative Archive lifecycle data: %j', (timestamps, history) => {
    const row = archiveRow(createArchiveItem({ ...timestamps, updatedAt: '2099-01-01T00:00:00Z' }));

    expect(row.history).toEqual(history);
    expect(row).not.toHaveProperty('summary');
    expect(row).not.toHaveProperty('sectionId');
    expect(JSON.stringify(row)).not.toContain('2099');
  });
});

describe('Specs Overview capabilities', () => {
  const unknown = (id: string) =>
    createSpecItem({
      id,
      workflow: null,
      classification: { section: 'unknown' },
      progress: null,
      signals: null,
      currentExecutions: null,
    });

  it('has status and progress when the Runtime provides them', () => {
    expect(overviewCapabilities(createSpecsFixture())).toEqual({ status: true, progress: true });
  });

  it('has neither when every specification is of unknown status without progress', () => {
    expect(
      overviewCapabilities({ ...createSpecsFixture(), items: [unknown('a'), unknown('b')] }),
    ).toEqual({ status: false, progress: false });
  });

  it('has status as soon as one specification has a real section, and progress on its own', () => {
    const base = createSpecsFixture();
    expect(
      overviewCapabilities({
        ...base,
        items: [unknown('a'), createSpecItem({ id: 'b', progress: null })],
      }),
    ).toEqual({ status: true, progress: false });
    expect(
      overviewCapabilities({
        ...base,
        items: [{ ...unknown('a'), progress: { completed: 1, total: 2 } }],
      }),
    ).toEqual({ status: false, progress: true });
  });

  it('keeps the full layout for an empty list and the archive', () => {
    expect(overviewCapabilities({ ...createSpecsFixture(), items: [] })).toEqual({
      status: true,
      progress: true,
    });
    expect(overviewCapabilities(createSpecsFixture('archive'))).toEqual({
      status: true,
      progress: true,
    });
  });

  it('keeps the updated time out of the row facts (the flat list shows it in its own column)', () => {
    const row = currentRow(createSpecItem({ updatedAt: '2026-10-01T12:00:00Z' }));
    expect(row.updatedAt).toBe('2026-10-01T12:00:00Z');
    expect(rowMetadata(row).map((fact) => fact.kind)).not.toContain('updated');
  });
});
