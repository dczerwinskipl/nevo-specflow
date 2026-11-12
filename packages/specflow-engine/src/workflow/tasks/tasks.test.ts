import { describe, expect, it } from 'vitest';

import type { TaskType, WorkflowDefinition } from '../definitions/model';
import { newRun } from '@nevo/workflow';

import type { ExecutionTask, WorkflowActor } from '../state/model';
import {
  LEFT_OUT_OF_BREAKDOWN,
  allTasksClosed,
  applyTaskDecisions,
  applyTaskEffects,
  decideTaskStatus,
  effectiveTaskTypes,
  materializeTasks,
  resolveTaskType,
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
  origin: { kind: 'produced', step: 'breakdown', attempt: 1 },
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

const ready = (task: ExecutionTask): ExecutionTask => ({ ...task, status: 'ready' });

describe('materializeTasks', () => {
  it('creates draft Tasks without a run: their first start pins the workflow', () => {
    const result = materializeTasks(input([proposal('api')]));

    expect(result.created).toEqual(['api']);
    expect(result.changed).toMatchObject([
      {
        taskId: 'api',
        type: 'implementation',
        status: 'draft',
        origin: { step: 'breakdown', attempt: 1 },
      },
    ]);
    expect(result.changed[0]?.run).toBeUndefined();
  });

  it('takes the list as every draft: revises listed drafts and cancels the others', () => {
    const [api, docs] = drafts([proposal('api'), proposal('docs')]) as [
      ExecutionTask,
      ExecutionTask,
    ];
    const core = ready(drafts([proposal('core')])[0]!);
    const result = materializeTasks(
      input([{ ...proposal('api', ['core']), title: 'API v2' }, proposal('web', ['api'])], {
        existing: [api, docs, core],
        origin: { kind: 'produced', step: 'breakdown', attempt: 2 },
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

describe('the drafts a producing step owns (D06)', () => {
  const manual = (id: string): ExecutionTask => ({
    specId: 'spec',
    taskId: id,
    title: id.toUpperCase(),
    type: 'implementation',
    status: 'draft',
    dependsOn: [],
    origin: { kind: 'manual', actorId: 'owner' },
    documents: [{ id: 'task', path: 'task.md', type: 'task' }],
  });
  const manualDrafts = [manual('m1'), manual('m2'), manual('m3')];

  it('keeps every manual draft when a breakdown drafts nothing', () => {
    expect(materializeTasks(input([], { existing: manualDrafts }))).toEqual({
      changed: [],
      created: [],
    });
  });

  it('revises and cancels only the drafts of the same step, from any earlier attempt', () => {
    const own = drafts([proposal('api'), proposal('docs')]);
    const other = drafts([proposal('spike')], {
      origin: { kind: 'produced', step: 'research', attempt: 1 },
    });
    const result = materializeTasks(
      input([{ ...proposal('api', ['m1']), title: 'API v2' }], {
        existing: [...own, ...other, ...manualDrafts],
        origin: { kind: 'produced', step: 'breakdown', attempt: 3 },
      }),
    );

    expect(result.created).toEqual([]);
    expect(result.changed).toMatchObject([
      { taskId: 'api', title: 'API v2', dependsOn: ['m1'], origin: { attempt: 3 } },
      { taskId: 'docs', status: 'cancelled', statusChange: { reason: LEFT_OUT_OF_BREAKDOWN } },
    ]);
  });

  it.each([
    ['a manual draft', manual('m1'), 'created by hand'],
    [
      "another step's draft",
      drafts([proposal('m1')], { origin: { kind: 'produced', step: 'research', attempt: 1 } })[0]!,
      'drafted by the step "research"',
    ],
  ])('refuses to list %s', (_name, existing, message) => {
    expect(() => materializeTasks(input([proposal('m1')], { existing: [existing] }))).toThrow(
      expect.objectContaining({
        code: 'WORKFLOW_INPUT_INVALID',
        message: expect.stringContaining(message) as unknown,
      }),
    );
  });
});

describe('the effective Task Type policy (D04)', () => {
  it.each([
    [
      'the run snapshot wins over the live binding',
      { specification: { taskTypes: ['a'] }, binding: { workflow: 'w', taskTypes: ['b'] } },
      ['a'],
    ],
    [
      'the run snapshot allowing every type',
      { specification: { taskTypes: ['*'] }, binding: { workflow: 'w', taskTypes: ['b'] } },
      ['*'],
    ],
    ['no run: the live binding', { binding: { workflow: 'w', taskTypes: ['b'] } }, ['b']],
    ['no run: a binding without taskTypes', { binding: { workflow: 'w' } }, ['*']],
    ['no run and no binding', {}, ['*']],
  ] as const)('%s', (_name, value, expected) => {
    expect(effectiveTaskTypes(value as Parameters<typeof effectiveTaskTypes>[0])).toEqual(expected);
  });

  const resolve = (type: string, allowed: readonly string[], workflows = true) =>
    resolveTaskType({
      type,
      allowed: allowed,
      taskType: (id) => (id === 'implementation' ? implementation : undefined),
      workflow: (id) => (workflows && id === 'task-standard' ? workflow : undefined),
    });

  it('resolves an allowed type to its Task workflow', () => {
    expect(resolve('implementation', ['implementation']).workflow.id).toBe('task-standard');
  });

  it.each([
    ['an undefined type', () => resolve('research', ['*']), 'WORKFLOW_DEFINITION_MISSING'],
    [
      'a type the policy does not allow',
      () => resolve('implementation', ['ui']),
      'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
    ],
    [
      'a type whose workflow is missing',
      () => resolve('implementation', ['*'], false),
      'WORKFLOW_DEFINITION_MISSING',
    ],
  ])('refuses %s', (_name, run, code) => {
    expect(run).toThrow(expect.objectContaining({ code }));
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
    ExecutionTask,
    ExecutionTask,
  ];
  const api = ready(draftApi);
  const screen = ready(draftScreen);
  const attempt = { step: 'implement', attempt: 1, sequence: 1, startedAt: 'now' };
  const started: ExecutionTask = {
    ...api,
    run: {
      ...newRun<WorkflowActor>(workflow),
      position: { state: 'active', step: 'implement', attempt: 1 },
      attempts: [attempt],
    },
  };
  const ended = (task: ExecutionTask, outcome: 'completed' | 'abandoned'): ExecutionTask => ({
    ...task,
    run: {
      ...newRun<WorkflowActor>(workflow),
      position: { state: 'terminal', outcome },
      attempts: [attempt],
    },
  });
  const decide = (task: ExecutionTask, status: TaskDecision['status'], reason?: string) =>
    decideTaskStatus(
      task,
      { taskId: task.taskId, status, ...(reason !== undefined ? { reason } : {}) },
      'later',
    );

  it('approves only drafts', () => {
    expect(applyTaskEffects([draftApi, screen], ['approve-draft-tasks'])).toEqual([api]);
    expect(applyTaskEffects([draftApi], [])).toEqual([]);
  });

  it.each<[ExecutionTask['status'], TaskDecision['status']]>([
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

  it.each<[string, ExecutionTask, TaskDecision['status']]>([
    ['a cancelled Task', { ...api, status: 'cancelled' }, 'ready'],
    ['a draft put on hold', draftApi, 'on-hold'],
    ['a decision that changes nothing', api, 'ready'],
    ['an unknown status', api, 'done' as TaskDecision['status']],
    ['a Task whose run ended', ended(api, 'completed'), 'cancelled'],
  ])('refuses %s', (_name, task, status) => {
    expect(() => decide(task, status)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }),
    );
  });

  it.each<TaskDecision['status']>(['on-hold', 'cancelled'])(
    'refuses to set a Task with an active attempt %s (active-attempt)',
    (status) => {
      expect(() => decide(started, status)).toThrow(
        expect.objectContaining({
          code: 'WORKFLOW_TASK_BLOCKED',
          message: expect.stringContaining('active-attempt') as unknown,
        }),
      );
    },
  );

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
    const done: ExecutionTask = {
      ...api,
      run: {
        ...newRun<WorkflowActor>(workflow),
        position: { state: 'terminal', outcome: 'completed' },
      },
    };
    expect(taskReadiness(screen, [done, screen])).toEqual({ kind: 'ready' });
  });
});
