import type {
  AttentionItem,
  BrokenTaskFacts,
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
function scenario(
  overrides: Record<string, TaskFacts> = {},
  attention: AttentionItem[] = [stuckItem, contextItem],
  broken: BrokenTaskFacts[] = [],
) {
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

  return basisOf(all, attention, broken);
}

function basisOf(
  all: Record<string, TaskFacts>,
  attention: AttentionItem[] = [],
  broken: BrokenTaskFacts[] = [],
) {
  const inspection = {
    specId: SPEC,
    tasks: Object.keys(all).map((taskId) => ({
      record: { taskId, title: `Title ${taskId}`, type: 'implementation', dependsOn: [] },
    })),
    brokenTasks: broken.map((task) => task.taskId),
    attention,
  } as unknown as ExecutionInspection;
  const reading = {
    inspection,
    facts: new Map(Object.entries(all)),
    broken,
    progress: { completed: 1, total: 8, cancelled: 1, ended: 0, onHold: 1 },
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
      waiting: ['awaited-1', 'waiting-1'],
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
    expect(groupIds(finished.groups).done).toEqual(['done-1', 'ready-1']);
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
    const ids = (tasks: readonly { id: string }[]) => tasks.map((task) => task.id);
    expect(
      data.overview.rows.map((row) => [row.groupId, row.count, ids(row.tasks), row.more]),
    ).toEqual([
      ['needs-approval', 1, ['t-04'], 0],
      ['in-progress', 1, ['build'], 0],
      ['ready', 1, ['ready-1'], 0],
      ['cannot-start', 1, ['t-07'], 0],
      ['waiting', 2, ['awaited-1', 'waiting-1'], 0],
      ['on-hold', 1, ['t-05'], 0],
    ]);
    // Each preview Task is the Tasks page row itself (one projection), with its attention item.
    const page = taskListOf(scenario(), {}).groups.flatMap((group) => group.tasks);
    for (const task of data.overview.rows.flatMap((row) => row.tasks)) {
      expect(task).toEqual(page.find((row) => row.id === task.id));
    }

    expect(
      data.overview.rows.find((row) => row.groupId === 'cannot-start')?.tasks[0],
    ).toMatchObject({
      title: 'Title t-07',
      type: { id: 'implementation', title: 'Implementation' },
      status: { id: 'blocked', lifecycle: 'blocked' },
      attention: { reason: 'context-unresolved', action: 'edit-context' },
    });
    expect(data.overview.compact).toEqual([
      { groupId: 'done', name: 'Done', count: 1 },
      { groupId: 'cancelled', name: 'Cancelled', count: 1 },
    ]);
    expect(data.overview.stuck).toEqual([
      { taskId: 't-04', title: 'Title t-04', cause: 'draft' },
      { taskId: 't-05', title: 'Title t-05', cause: 'on-hold' },
    ]);
    expect(data).toMatchObject({ completed: 1, total: 8, cancelled: 1, ended: 0, onHold: 1 });
    expect(data.attention).toEqual([
      {
        id: 'specification-attention',
        kind: 'specification',
        title: 'Implementation',
        priority: 'normal',
        reason: stuckItem.message,
        code: 'tasks-stuck',
        // The item's step, so a client's action can name it.
        stepTitle: 'Implementation',
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

  it('carries the recorded hold reason of a Task on hold only', () => {
    const basis = scenario();
    const records = basis.reading.inspection.tasks.map((entry) => entry.record) as unknown as {
      taskId: string;
      status?: string;
      statusChange?: { source: string; reason?: string };
    }[];
    Object.assign(
      records.find((record) => record.taskId === 't-05')!,
      {
        status: 'on-hold',
        statusChange: { source: 'decision', at: '2026-11-16T10:00:00Z', reason: 'Waiting for IT.' },
      },
    );
    Object.assign(
      records.find((record) => record.taskId === 'gone-1')!,
      {
        status: 'cancelled',
        statusChange: { source: 'decision', at: '2026-11-16T10:00:00Z', reason: 'Not needed.' },
      },
    );
    const rows = taskListOf(basis, {}).groups.flatMap((group) => group.tasks);

    expect(rows.find((row) => row.id === 't-05')).toMatchObject({ holdReason: 'Waiting for IT.' });
    expect(rows.find((row) => row.id === 'gone-1')).not.toHaveProperty('holdReason');
  });
});

describe('the blocking filter', () => {
  it('keeps only the Tasks the current tasks-stuck names, in their normal groups', () => {
    const list = taskListOf(scenario(), { blocking: 'specification' });

    expect(groupIds(list.groups)).toEqual({ 'needs-approval': ['t-04'], 'on-hold': ['t-05'] });
    expect(list.filter).toEqual({ blocking: 'specification', matched: 2, total: 9 });
    expect(list.groups[0]!.tasks[0]).toMatchObject({ blocksSpecification: { cause: 'draft' } });
  });

  it('lists a broken blocking Task as a Cannot start row, so the filter never opens empty', () => {
    const brokenStuck: AttentionItem = {
      ...stuckItem,
      taskIds: ['gone'],
      blocking: [{ taskId: 'gone', cause: 'broken' }],
    };
    const brokenItem: AttentionItem = {
      subject: { kind: 'task', specId: SPEC, taskId: 'gone' },
      reason: 'task-broken',
      actor: 'owner',
      action: 'restore-task',
      message: 'The files of the task are inconsistent: restore them from Git.',
    };
    const list = taskListOf(
      scenario({}, [brokenItem, brokenStuck], [{ taskId: 'gone', reason: 'missing-folder' }]),
      { blocking: 'specification' },
    );

    expect(list.groups).toEqual([
      expect.objectContaining({
        id: 'cannot-start',
        tasks: [
          {
            id: 'gone',
            status: { id: 'broken', label: 'Broken', lifecycle: 'blocked' },
            broken: { reason: 'missing-folder' },
            blocksSpecification: { cause: 'broken' },
            // Its own item: the row's overlay, as for a readable Task.
            attention: brokenItem,
          },
        ],
      }),
    ]);
    expect(list.filter).toEqual({ blocking: 'specification', matched: 1, total: 10 });

    const section = workspaceTasksOf(
      scenario({}, [brokenItem, brokenStuck], [{ taskId: 'gone', reason: 'missing-folder' }]),
    ).section;
    expect(section).toMatchObject({
      data: {
        overview: { stuck: [{ taskId: 'gone', cause: 'broken' }] },
        attention: [{ id: 'task-broken.gone', title: 'gone', priority: 'critical' }, {}],
      },
    });
  });

  it('shows nothing once nothing blocks the specification any more', () => {
    const list = taskListOf(scenario({}, [contextItem]), { blocking: 'specification' });

    expect(list.groups).toEqual([]);
    expect(list.filter).toEqual({ blocking: 'specification', matched: 0, total: 9 });
  });
});

/** Facts of the A3 example mixes (contract amendment A3), by kind. */
const kinds = {
  progress: () => facts({ position: { state: 'active', step: 'implement', attempt: 1 } }),
  ready: () => facts(),
  cannot: () =>
    blocked([
      { kind: 'context-unresolved', entries: [{ index: 0, kind: 'path', reason: 'not-found' }] },
    ]),
  waiting: (on = 'p-1') =>
    blocked([{ kind: 'dependencies', waitingFor: [on], unsatisfiable: [] }], {
      dependencyWait: { waitingFor: [on], unsatisfiable: [] },
    }),
  hold: () => blocked([{ kind: 'status', status: 'on-hold' }], { preparation: 'on-hold' }),
  done: () => facts({ position: { state: 'terminal', outcome: 'completed' }, startable: false }),
  cancelled: () => blocked([{ kind: 'status', status: 'cancelled' }], { preparation: 'cancelled' }),
} satisfies Record<string, (on?: string) => TaskFacts>;
type Kind = keyof typeof kinds;
const PREFIX: Record<Kind, string> = {
  progress: 'p',
  ready: 'r',
  cannot: 'c',
  waiting: 'w',
  hold: 'h',
  done: 'd',
  cancelled: 'x',
};

function mix(counts: Partial<Record<Kind, number>>, over: Record<string, TaskFacts> = {}) {
  const all: Record<string, TaskFacts> = {};
  for (const [kind, count] of Object.entries(counts) as [Kind, number][]) {
    for (let index = 1; index <= count; index += 1) {
      all[`${PREFIX[kind]}-${index}`] = kinds[kind]();
    }
  }

  return { ...all, ...over };
}

const heldBlocking = (taskId: string, dependents: string[]): AttentionItem => ({
  subject: { kind: 'task', specId: SPEC, taskId },
  reason: 'on-hold-blocking',
  actor: 'owner',
  action: 'resume-task',
  secondaryAction: 'cancel-task',
  message: `The task is on hold and holds up ${dependents.join(', ')}.`,
  blocks: { taskIds: dependents },
});

function preview(basis: ReturnType<typeof basisOf>) {
  const section = workspaceTasksOf(basis).section;
  if (section.state !== 'available') {
    throw new Error('unavailable');
  }

  return section.data.overview;
}

const shown = (overview: ReturnType<typeof preview>) =>
  overview.rows.map((row) => [row.groupId, row.tasks.map((task) => task.id), row.more]);

describe('the Overview preview of the A3 examples', () => {
  it('7 Tasks just after the breakdown: two rows per group, then how many more', () => {
    const overview = preview(basisOf(mix({ ready: 3, waiting: 4 })));

    expect(shown(overview)).toEqual([
      ['ready', ['r-1', 'r-2'], 1],
      ['waiting', ['w-1', 'w-2'], 2],
    ]);
    expect(overview.compact).toEqual([]);
  });

  it('12 Tasks: Done is a count, the other groups at most two rows', () => {
    const overview = preview(basisOf(mix({ progress: 3, ready: 2, waiting: 4, hold: 1, done: 2 })));

    expect(shown(overview)).toEqual([
      ['in-progress', ['p-1', 'p-2'], 1],
      ['ready', ['r-1', 'r-2'], 0],
      ['waiting', ['w-1', 'w-2'], 2],
      ['on-hold', ['h-1'], 0],
    ]);
    expect(overview.compact).toEqual([{ groupId: 'done', name: 'Done', count: 2 }]);
  });

  it('25 Tasks: the held Task two Tasks wait on carries its attention item', () => {
    const tasks = mix(
      { progress: 4, ready: 3, cannot: 1, waiting: 5, hold: 1, done: 10, cancelled: 1 },
      { 'w-4': kinds.waiting('h-1'), 'w-5': kinds.waiting('h-1') },
    );
    const overview = preview(basisOf(tasks, [heldBlocking('h-1', ['w-4', 'w-5'])]));

    expect(shown(overview)).toEqual([
      ['in-progress', ['p-1', 'p-2'], 2],
      ['ready', ['r-1', 'r-2'], 1],
      ['cannot-start', ['c-1'], 0],
      ['waiting', ['w-1', 'w-2'], 3],
      ['on-hold', ['h-1'], 0],
    ]);
    expect(overview.rows.flatMap((row) => row.tasks)).toHaveLength(8);
    expect(overview.compact).toEqual([
      { groupId: 'done', name: 'Done', count: 10 },
      { groupId: 'cancelled', name: 'Cancelled', count: 1 },
    ]);
    expect(overview.rows.find((row) => row.groupId === 'on-hold')?.tasks[0]).toMatchObject({
      status: { id: 'on-hold' },
      attention: { reason: 'on-hold-blocking', blocks: { taskIds: ['w-4', 'w-5'] } },
    });
  });
});

/** Every Task in one group, so the order compares Tasks of every kind. */
const ONE_GROUP = parseDashboardGrouping({
  groups: [{ id: 'all', name: 'All', summary: 'row', collapsed: false, when: {} }],
  other: { id: 'other', name: 'Other', summary: 'row', collapsed: false },
});

describe('the importance order inside a group', () => {
  it('puts attention first, then a held Task others wait on, then the rest in Task order', () => {
    const tasks = {
      'h-a': kinds.hold(),
      'h-b': kinds.hold(),
      'h-c': kinds.hold(),
      'w-1': kinds.waiting('h-b'),
      'w-2': kinds.waiting('h-c'),
    };
    const basis = basisOf(tasks, [heldBlocking('h-c', ['w-2'])]);

    // One comparator for the Tasks page and the preview.
    expect(groupIds(taskListOf(basis, {}).groups)['on-hold']).toEqual(['h-c', 'h-b', 'h-a']);
    expect(shown(preview(basis))).toContainEqual(['on-hold', ['h-c', 'h-b'], 1]);
  });

  it('ranks in progress after held-with-dependents in a mixed group, stable otherwise', () => {
    const tasks = {
      'a-ready': kinds.ready(),
      'b-progress': kinds.progress(),
      'c-cannot': kinds.cannot(),
      'd-waiting': kinds.waiting('c-cannot'),
      'e-ready': kinds.ready(),
      'f-attention': kinds.ready(),
    };
    const item: AttentionItem = {
      ...contextItem,
      subject: { kind: 'task', specId: SPEC, taskId: 'f-attention' },
    };

    expect(groupIds(taskListOf(basisOf(tasks, [item]), {}, ONE_GROUP).groups).all).toEqual([
      'f-attention',
      'c-cannot',
      'b-progress',
      'a-ready',
      'd-waiting',
      'e-ready',
    ]);
  });

  it('never ranks a cancelled Task up for its dependents: it holds nothing up', () => {
    const tasks = {
      'a-ready': kinds.ready(),
      'b-cancelled': kinds.cancelled(),
      'c-waiting': kinds.waiting('b-cancelled'),
    };

    expect(groupIds(taskListOf(basisOf(tasks), {}, ONE_GROUP).groups).all).toEqual([
      'a-ready',
      'b-cancelled',
      'c-waiting',
    ]);
  });

  it('keeps the Engine id order on ties, broken Tasks in their place', () => {
    const own = (taskId: string): AttentionItem => ({
      ...contextItem,
      subject: { kind: 'task', specId: SPEC, taskId },
    });
    const basis = basisOf(
      { 'a-attention': kinds.ready(), 'c-attention': kinds.ready() },
      [own('a-attention'), own('c-attention')],
      [{ taskId: 'b-gone', reason: 'missing-folder' }],
    );

    expect(groupIds(taskListOf(basis, {}, ONE_GROUP).groups).all).toEqual([
      'a-attention',
      'b-gone',
      'c-attention',
    ]);
  });

  it("carries the Specification's escalation item on the Task row it names", () => {
    const escalated: AttentionItem = {
      subject: { kind: 'specification', specId: SPEC },
      step: 'implementation',
      reason: 'task-escalated',
      actor: 'owner',
      action: 'review-tasks',
      message: 'h-b escalated: it needs a decision.',
      taskIds: ['h-b'],
    };
    const basis = basisOf({ 'h-a': kinds.hold(), 'h-b': kinds.hold() }, [escalated]);
    const rows = taskListOf(basis, {}).groups.flatMap((group) => group.tasks);

    expect(rows.map((row) => [row.id, row.attention?.reason])).toEqual([
      ['h-b', 'task-escalated'],
      ['h-a', undefined],
    ]);
  });
});

describe('the group filter', () => {
  it('keeps only the Tasks of that group, with how many match out of all', () => {
    const basis = basisOf(mix({ progress: 1, waiting: 2, done: 1 }));

    const list = taskListOf(basis, { group: 'waiting' });
    expect(groupIds(list.groups)).toEqual({ waiting: ['w-1', 'w-2'] });
    expect(list.filter).toEqual({ group: 'waiting', matched: 2, total: 4 });

    // A group with no Task now (or no such group) opens empty, never another group.
    const empty = taskListOf(basis, { group: 'on-hold' });
    expect(empty.groups).toEqual([]);
    expect(empty.filter).toEqual({ group: 'on-hold', matched: 0, total: 4 });
  });
});
