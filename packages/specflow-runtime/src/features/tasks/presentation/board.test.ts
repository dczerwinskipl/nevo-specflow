import type {
  AttentionItem,
  ExecutionCatalogue,
  ExecutionInspection,
  ExecutionReading,
  TaskFacts,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { taskListOf } from '../list/read-task-list';
import { workspaceTasksOf } from '../workspace/engine-contribution';
import { DEFAULT_DASHBOARD_GROUPING, parseDashboardGrouping } from './default-grouping';

const SPEC = 'spec';
const catalogue = {
  taskType: (id: string) => (id === 'implementation' ? { id, title: 'Implementation' } : undefined),
} as unknown as ExecutionCatalogue;

const facts = (over: Partial<TaskFacts> = {}): TaskFacts => ({
  preparation: 'ready',
  escalated: false,
  position: { state: 'not-started' },
  startable: true,
  startBlockers: [],
  definitionChanged: false,
  ...over,
});
const blocked = (startBlockers: TaskFacts['startBlockers'], over: Partial<TaskFacts> = {}) =>
  facts({ startable: false, startBlockers, ...over });
const contextItem: AttentionItem = {
  subject: { kind: 'task', specId: SPEC, taskId: 't-07' },
  step: 'implement',
  reason: 'context-unresolved',
  actor: 'owner',
  action: 'edit-context',
  message: '1 required context entry does not resolve: edit the context before the task can start.',
};
const stuckItem: AttentionItem = {
  subject: { kind: 'specification', specId: SPEC },
  step: 'implementation',
  stepTitle: 'Implementation',
  reason: 'tasks-stuck',
  actor: 'owner',
  action: 'review-tasks',
  message:
    'The specification cannot continue until 2 tasks move: t-04 is a draft, t-05 is on hold.',
  taskIds: ['t-04', 't-05'],
  blocking: [
    { taskId: 't-04', cause: 'draft' },
    { taskId: 't-05', cause: 'on-hold' },
  ],
};

/** The control-center scenario: one Task per default group, a context blocker and a stuck wait. */
function scenario(overrides: Record<string, TaskFacts> = {}, attention = [stuckItem, contextItem]) {
  const all: Record<string, TaskFacts> = {
    't-04': blocked([{ kind: 'status', status: 'draft' }], { preparation: 'draft' }),
    build: facts({
      position: { state: 'active', step: 'implement', attempt: 1 },
      startable: false,
    }),
    'ready-1': facts(),
    't-07': blocked(
      [{ kind: 'context-unresolved', entries: [{ index: 0, kind: 'path', reason: 'not-found' }] }],
      { attention: contextItem },
    ),
    'waiting-1': blocked([{ kind: 'dependencies', waitingFor: ['build'], unsatisfiable: [] }], {
      dependencyWait: { waitingFor: ['build'], unsatisfiable: [] },
    }),
    'awaited-1': blocked([{ kind: 'context-awaited', entries: [{ index: 0, kind: 'path' }] }]),
    't-05': blocked([{ kind: 'status', status: 'on-hold' }], { preparation: 'on-hold' }),
    'done-1': facts({ position: { state: 'terminal', outcome: 'completed' }, startable: false }),
    'gone-1': blocked([{ kind: 'status', status: 'cancelled' }], { preparation: 'cancelled' }),
    ...overrides,
  };
  const inspection = {
    specId: SPEC,
    tasks: Object.keys(all).map((taskId) => ({
      record: { taskId, title: `Title ${taskId}`, type: 'implementation', dependsOn: [] },
    })),
    brokenTasks: [],
  } as unknown as ExecutionInspection;
  const reading = {
    inspection,
    facts: new Map(Object.entries(all)),
    attention,
    progress: { completed: 1, total: 8, cancelled: 1, onHold: 1 },
    preparation: 'preparing',
  } as unknown as ExecutionReading;

  return { reading, catalogue };
}

const groupIds = (groups: readonly { id: string; tasks: readonly { id: string }[] }[]) =>
  Object.fromEntries(groups.map((group) => [group.id, group.tasks.map((task) => task.id)]));

describe('the default dashboard grouping', () => {
  it('maps the neutral facts to one group each: Cannot start is not Ready to start', () => {
    const list = taskListOf(scenario(), {});

    expect(groupIds(list.groups)).toEqual({
      'needs-approval': ['t-04'],
      'in-progress': ['build'],
      ready: ['ready-1'],
      'cannot-start': ['t-07'],
      // Normal dependency waiting and an awaited process artifact are waits, not blockers.
      waiting: ['waiting-1', 'awaited-1'],
      'on-hold': ['t-05'],
      done: ['done-1'],
      cancelled: ['gone-1'],
    });
    expect(list.groups.find((group) => group.id === 'cancelled')).toMatchObject({
      summary: 'compact',
      collapsed: true,
    });
    const row = list.groups.flatMap((group) => group.tasks).find((task) => task.id === 't-07');
    expect(row).toMatchObject({
      status: { id: 'blocked', label: 'Cannot start', lifecycle: 'blocked' },
      facts: { attention: { reason: 'context-unresolved', action: 'edit-context' } },
    });
  });

  it('moves a Task with its facts: started, finished, held', () => {
    const started = taskListOf(
      scenario({
        'ready-1': facts({
          position: { state: 'active', step: 'implement', attempt: 1 },
          startable: false,
        }),
      }),
      {},
    );
    expect(groupIds(started.groups)['in-progress']).toEqual(['build', 'ready-1']);

    const finished = taskListOf(
      scenario({
        'ready-1': facts({
          position: { state: 'terminal', outcome: 'completed' },
          startable: false,
        }),
      }),
      {},
    );
    expect(groupIds(finished.groups).done).toEqual(['ready-1', 'done-1']);
    expect(groupIds(finished.groups)).not.toHaveProperty('ready');

    // The context was fixed: the blocker and its attention are gone, it is ready to start.
    const fixed = taskListOf(scenario({ 't-07': facts() }, [stuckItem]), {});
    expect(groupIds(fixed.groups).ready).toEqual(['ready-1', 't-07']);
    expect(fixed.attention.map((item) => item.reason)).toEqual(['tasks-stuck']);
  });

  it('is validated data: a repeated id or an unknown fact is refused', () => {
    const groups = DEFAULT_DASHBOARD_GROUPING.groups;
    expect(() =>
      parseDashboardGrouping({ ...DEFAULT_DASHBOARD_GROUPING, groups: [...groups, groups[0]] }),
    ).toThrow('repeats a group id');
    expect(() =>
      parseDashboardGrouping({
        ...DEFAULT_DASHBOARD_GROUPING,
        groups: [{ ...groups[0], when: { attention: true } }],
      }),
    ).toThrow('schema');
  });
});

describe('the Overview tasks section', () => {
  it('summarizes the groups, marks attention rows and explains why the specification is stuck', () => {
    const contribution = workspaceTasksOf(scenario());
    if (contribution.section.state !== 'available') {
      throw new Error('unavailable');
    }

    const { data } = contribution.section;
    expect(data.overview.rows.map((row) => [row.groupId, row.count, row.tasks, row.more])).toEqual([
      // Named by Requires attention: by id only.
      ['needs-approval', 1, [{ id: 't-04' }], 0],
      ['in-progress', 1, [{ id: 'build', title: 'Title build' }], 0],
      ['ready', 1, [{ id: 'ready-1', title: 'Title ready-1' }], 0],
      ['cannot-start', 1, [{ id: 't-07' }], 0],
      [
        'waiting',
        2,
        [
          { id: 'waiting-1', title: 'Title waiting-1' },
          { id: 'awaited-1', title: 'Title awaited-1' },
        ],
        0,
      ],
      ['on-hold', 1, [{ id: 't-05' }], 0],
    ]);
    expect(data.overview.compact).toEqual([
      { groupId: 'done', name: 'Done', count: 1 },
      { groupId: 'cancelled', name: 'Cancelled', count: 1 },
    ]);
    expect(data.overview.stuck).toEqual([
      { taskId: 't-04', title: 'Title t-04', cause: 'draft' },
      { taskId: 't-05', title: 'Title t-05', cause: 'on-hold' },
    ]);
    expect(data).toMatchObject({ completed: 1, total: 8, cancelled: 1, onHold: 1 });
    expect(data.attention).toEqual([
      {
        id: 'specification-attention',
        kind: 'specification',
        title: 'Implementation',
        priority: 'normal',
        reason: stuckItem.message,
        code: 'tasks-stuck',
        actor: 'owner',
        action: 'review-tasks',
        taskIds: ['t-04', 't-05'],
        blocking: stuckItem.blocking,
      },
      expect.objectContaining({
        id: 'task-attention.t-07',
        kind: 'task',
        title: 'Title t-07',
        targetId: 't-07',
        code: 'context-unresolved',
        action: 'edit-context',
      }),
    ]);
    const rows = data.groups.flatMap((group) => group.tasks);
    expect(rows.filter((row) => row.attention).map((row) => row.id)).toEqual([
      't-04',
      't-07',
      't-05',
    ]);
  });
});

describe('the blocking filter', () => {
  it('keeps only the Tasks the current tasks-stuck names, in their normal groups', () => {
    const list = taskListOf(scenario(), { blocking: 'specification' });

    expect(groupIds(list.groups)).toEqual({ 'needs-approval': ['t-04'], 'on-hold': ['t-05'] });
    expect(list.filter).toEqual({ blocking: 'specification', matched: 2, total: 9 });
    expect(list.groups[0]!.tasks[0]).toMatchObject({ blocksSpecification: { cause: 'draft' } });
  });

  it('shows nothing once nothing blocks the specification any more', () => {
    const list = taskListOf(scenario({}, [contextItem]), { blocking: 'specification' });

    expect(list.groups).toEqual([]);
    expect(list.filter).toEqual({ blocking: 'specification', matched: 0, total: 9 });
  });
});
