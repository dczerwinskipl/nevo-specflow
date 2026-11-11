import { describe, expect, it } from 'vitest';

import type { TaskType, WorkflowDefinition } from '../definitions/model';
import type { TaskRecord } from '../state/model';
import {
  LEFT_OUT_OF_BREAKDOWN,
  allTasksClosed,
  applyTaskDecisions,
  applyTaskEffects,
  decideTaskStatus,
  materializeTasks,
  taskReadiness,
  tasksStuck,
  type MaterializeTasksInput,
  type TaskDecision,
  type TaskProposal,
} from './tasks';

const workflow: WorkflowDefinition = {
  id: 'task-standard',
  version: 1,
  title: 'Task',
  description: 'Task.',
  entryStep: 'implement',
  steps: [],
  returns: [],
  annotations: { subject: 'task' },
};
const implementation: TaskType = {
  id: 'implementation',
  title: 'Implementation',
  description: 'Code.',
  useWhen: 'Code.',
  workflow: 'task-standard',
};

const input = (
  proposals: TaskProposal[],
  overrides: Partial<MaterializeTasksInput> = {},
): MaterializeTasksInput => ({
  specId: 'spec',
  proposals,
  existing: [],
  allowedTypes: ['*'],
  taskType: (id) => (id === 'implementation' ? implementation : undefined),
  workflow: (id) => (id === 'task-standard' ? workflow : undefined),
  origin: { step: 'breakdown', attempt: 1 },
  at: 'now',
  ...overrides,
});

const drafts = (proposals: TaskProposal[], overrides: Partial<MaterializeTasksInput> = {}) =>
  materializeTasks(input(proposals, overrides)).changed;

const proposal = (id: string, dependsOn: string[] = []): TaskProposal => ({
  id,
  title: id.toUpperCase(),
  type: 'implementation',
  dependsOn,
});

const ready = (task: TaskRecord): TaskRecord => ({ ...task, status: 'ready' });

describe('materializeTasks', () => {
  it('creates draft Tasks pinned to their type workflow', () => {
    const result = materializeTasks(input([proposal('api')]));

    expect(result.created).toEqual(['api']);
    expect(result.changed).toMatchObject([
      {
        taskId: 'api',
        type: 'implementation',
        status: 'draft',
        origin: { step: 'breakdown', attempt: 1 },
        run: { workflow: { id: 'task-standard' }, position: { state: 'not-started' } },
      },
    ]);
  });

  it('takes the list as every draft: revises listed drafts and cancels the others', () => {
    const [api, docs] = drafts([proposal('api'), proposal('docs')]) as [TaskRecord, TaskRecord];
    const core = ready(drafts([proposal('core')])[0]!);
    const result = materializeTasks(
      input([{ ...proposal('api', ['core']), title: 'API v2' }, proposal('web', ['api'])], {
        existing: [api, docs, core],
        origin: { step: 'breakdown', attempt: 2 },
      }),
    );

    expect(result.created).toEqual(['web']);
    expect(result.changed).toMatchObject([
      {
        taskId: 'api',
        title: 'API v2',
        dependsOn: ['core'],
        status: 'draft',
        origin: { attempt: 2 },
      },
      { taskId: 'web', status: 'draft' },
      {
        taskId: 'docs',
        status: 'cancelled',
        statusChange: { source: 'decision', at: 'now', reason: LEFT_OUT_OF_BREAKDOWN },
      },
    ]);
  });

  it.each<[string, MaterializeTasksInput, string]>([
    ['an invalid id', input([proposal('Not Valid')]), 'WORKFLOW_INPUT_INVALID'],
    ['a duplicate id', input([proposal('api'), proposal('api')]), 'WORKFLOW_INPUT_INVALID'],
    ['an unknown dependency', input([proposal('api', ['ghost'])]), 'WORKFLOW_INPUT_INVALID'],
    [
      'a dependency cycle',
      input([proposal('a', ['b']), proposal('b', ['a'])]),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'a type outside the allowed list',
      input([proposal('api')], { allowedTypes: ['documentation'] }),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'an undefined type',
      input([{ ...proposal('api'), type: 'research' }]),
      'WORKFLOW_NOT_CONFIGURED',
    ],
    ['a Windows device name as id', input([proposal('con')]), 'WORKFLOW_INPUT_INVALID'],
    [
      'a title over the stored limit',
      input([{ ...proposal('api'), title: 'x'.repeat(201) }]),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'a summary over the stored limit',
      input([{ ...proposal('api'), summary: 'x'.repeat(4001) }]),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'more dependencies than stored',
      input([
        ...Array.from({ length: 101 }, (_, index) => proposal(`d${index}`)),
        proposal(
          'api',
          Array.from({ length: 101 }, (_, index) => `d${index}`),
        ),
      ]),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'more Tasks than a Specification holds',
      input([proposal('extra')], {
        existing: [
          ...drafts(Array.from({ length: 100 }, (_, index) => proposal(`a${index}`))),
          ...drafts(Array.from({ length: 100 }, (_, index) => proposal(`b${index}`))),
        ].map(ready),
      }),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'a Task that is no longer a draft',
      input([proposal('api')], { existing: [ready(drafts([proposal('api')])[0]!)] }),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'a dependency on a cancelled Task',
      input([proposal('web', ['api'])], {
        existing: [{ ...drafts([proposal('api')])[0]!, status: 'cancelled' }],
      }),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'a dependency on a draft the list leaves out',
      input([proposal('web', ['api'])], { existing: drafts([proposal('api')]) }),
      'WORKFLOW_INPUT_INVALID',
    ],
  ])('rejects %s', (_name, value, code) => {
    expect(() => materializeTasks(value)).toThrow(expect.objectContaining({ code }));
  });
});

describe('leaving out a draft another Task depends on', () => {
  it('cancels the draft; the dependent Task is then stuck (tasksStuck), not refused', () => {
    const existing = drafts([proposal('api'), proposal('web', ['api'])]).map((task) =>
      task.taskId === 'web' ? ready(task) : task,
    );

    const result = materializeTasks(input([], { existing }));

    expect(result.changed).toMatchObject([{ taskId: 'api', status: 'cancelled' }]);
    expect(tasksStuck([existing[1]!, ...result.changed], [])).toBe(true);
  });
});

describe('Task status, readiness and the wait', () => {
  const [draftApi, draftScreen] = drafts([proposal('api'), proposal('screen', ['api'])]) as [
    TaskRecord,
    TaskRecord,
  ];
  const api = ready(draftApi);
  const screen = ready(draftScreen);
  const attempt = { step: 'implement', attempt: 1, sequence: 1, startedAt: 'now' };
  const started: TaskRecord = {
    ...api,
    run: {
      ...api.run,
      position: { state: 'active', step: 'implement', attempt: 1 },
      attempts: [attempt],
    },
  };
  const ended = (task: TaskRecord, outcome: 'completed' | 'abandoned'): TaskRecord => ({
    ...task,
    run: { ...task.run, position: { state: 'terminal', outcome }, attempts: [attempt] },
  });
  const decide = (task: TaskRecord, status: TaskDecision['status'], reason?: string) =>
    decideTaskStatus(
      task,
      { taskId: task.taskId, status, ...(reason !== undefined ? { reason } : {}) },
      'later',
    );

  it('approves only drafts', () => {
    expect(applyTaskEffects([draftApi, screen], ['approve-draft-tasks'])).toEqual([api]);
    expect(applyTaskEffects([draftApi], [])).toEqual([]);
  });

  it.each<[TaskRecord['status'], TaskDecision['status']]>([
    ['draft', 'ready'],
    ['draft', 'cancelled'],
    ['ready', 'on-hold'],
    ['ready', 'cancelled'],
    ['on-hold', 'ready'],
    ['on-hold', 'cancelled'],
  ])('decides %s -> %s and records the decision', (from, to) => {
    expect(decide({ ...api, status: from }, to, ' Why. ')).toMatchObject({
      status: to,
      statusChange: { source: 'decision', at: 'later', reason: 'Why.' },
    });
  });

  it.each<[string, TaskRecord, TaskDecision['status']]>([
    ['a cancelled Task', { ...api, status: 'cancelled' }, 'ready'],
    ['a draft put on hold', draftApi, 'on-hold'],
    ['a decision that changes nothing', api, 'ready'],
    ['an unknown status', api, 'done' as TaskDecision['status']],
    ['a Task whose run ended', ended(api, 'completed'), 'cancelled'],
    ['a running Task cancelled', started, 'cancelled'],
  ])('refuses %s', (_name, task, status) => {
    expect(() => decide(task, status)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }),
    );
  });

  it('puts a running Task on hold', () => {
    expect(decide(started, 'on-hold')).toMatchObject({
      status: 'on-hold',
      run: { position: { state: 'active' } },
    });
  });

  it('applies decisions as a whole and refuses an unknown Task or two decisions for one', () => {
    expect(
      applyTaskDecisions([api, screen], [{ taskId: 'screen', status: 'on-hold' }], 'later'),
    ).toMatchObject([{ taskId: 'screen', status: 'on-hold' }]);
    for (const decisions of [
      [{ taskId: 'ghost', status: 'ready' }],
      [
        { taskId: 'api', status: 'on-hold' },
        { taskId: 'api', status: 'cancelled' },
      ],
    ] satisfies TaskDecision[][]) {
      expect(() => applyTaskDecisions([api, screen], decisions, 'later')).toThrow(
        expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }),
      );
    }
  });

  it('starts only a ready Task', () => {
    expect(taskReadiness(draftApi, [draftApi])).toEqual({ kind: 'status', status: 'draft' });
    expect(taskReadiness({ ...api, status: 'on-hold' }, [api])).toEqual({
      kind: 'status',
      status: 'on-hold',
    });
    expect(taskReadiness(api, [api])).toEqual({ kind: 'ready' });
  });

  it('reports only direct dependencies and is stuck behind an abandoned one', () => {
    const third = ready(drafts([proposal('docs', ['screen'])], { existing: [api, screen] })[0]!);
    const tasks = [ended(api, 'abandoned'), screen, third];

    expect(taskReadiness(screen, tasks)).toEqual({ kind: 'dependencies', waitingFor: ['api'] });
    expect(taskReadiness(third, tasks)).toEqual({ kind: 'dependencies', waitingFor: ['screen'] });
    expect(tasksStuck(tasks, [])).toBe(true);
  });

  it('is stuck only when no open Task can progress without the owner', () => {
    // `screen` waits for a draft, a held or a cancelled Task: nothing can move.
    expect(tasksStuck([draftApi, screen], [])).toBe(true);
    expect(tasksStuck([{ ...api, status: 'on-hold' }, screen], [])).toBe(true);
    expect(tasksStuck([{ ...api, status: 'cancelled' }, screen], [])).toBe(true);
    // `api` can start or is running (also when held while running), so `screen` will follow.
    expect(tasksStuck([api, screen], [])).toBe(false);
    expect(tasksStuck([started, screen], [])).toBe(false);
    expect(tasksStuck([{ ...started, status: 'on-hold' }, screen], [])).toBe(false);
    // Nothing open: the wait completes instead.
    expect(tasksStuck([ended(api, 'abandoned')], [])).toBe(false);
    // A broken Task (listed without a record) never progresses.
    expect(tasksStuck([ended(api, 'completed')], ['screen'])).toBe(true);
  });

  it('closes the wait when every Task ended or was cancelled', () => {
    expect(allTasksClosed([], [])).toBe(true);
    expect(allTasksClosed([ended(api, 'completed'), { ...screen, status: 'cancelled' }], [])).toBe(
      true,
    );
    expect(allTasksClosed([ended(api, 'completed'), screen], [])).toBe(false);
    expect(allTasksClosed([{ ...screen, status: 'on-hold' }], [])).toBe(false);
    expect(allTasksClosed([draftScreen], [])).toBe(false);
    expect(allTasksClosed([ended(api, 'completed')], ['screen'])).toBe(false);
  });

  it('waits for dependencies until they completed', () => {
    expect(taskReadiness(screen, [api, screen])).toEqual({
      kind: 'dependencies',
      waitingFor: ['api'],
    });
    const done: TaskRecord = {
      ...api,
      run: { ...api.run, position: { state: 'terminal', outcome: 'completed' } },
    };
    expect(taskReadiness(screen, [done, screen])).toEqual({ kind: 'ready' });
  });
});
