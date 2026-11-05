import { describe, expect, it } from 'vitest';

import type { TaskType, WorkflowDefinition } from '../definitions/model';
import type { TaskRecord } from '../state/model';
import {
  allTasksTerminal,
  applyTaskEffects,
  materializeTasks,
  taskReadiness,
  tasksStuck,
  type MaterializeTasksInput,
  type TaskProposal,
} from './tasks';

const workflow: WorkflowDefinition = {
  id: 'task-standard',
  version: 1,
  title: 'Task',
  description: 'Task.',
  subject: 'task',
  entryStep: 'implement',
  steps: [],
  returns: [],
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
  origin: { step: 'create-tasks', attempt: 1 },
  ...overrides,
});

const proposal = (id: string, dependsOn: string[] = []): TaskProposal => ({
  id,
  title: id.toUpperCase(),
  type: 'implementation',
  dependsOn,
});

describe('materializeTasks', () => {
  it('creates not-started Tasks pinned to their type workflow', () => {
    const [created] = materializeTasks(input([proposal('api')]));

    expect(created).toMatchObject({
      taskId: 'api',
      type: 'implementation',
      origin: { step: 'create-tasks', attempt: 1 },
      run: { workflow: { id: 'task-standard' }, position: { state: 'not-started' } },
    });
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
        existing: materializeTasks(
          input(Array.from({ length: 100 }, (_, index) => proposal(`a${index}`))),
        ).concat(
          materializeTasks(input(Array.from({ length: 100 }, (_, index) => proposal(`b${index}`)))),
        ),
      }),
      'WORKFLOW_INPUT_INVALID',
    ],
  ])('rejects %s', (_name, value, code) => {
    expect(() => materializeTasks(value)).toThrow(expect.objectContaining({ code }));
  });
});

describe('Task effects and readiness', () => {
  const [api, screen] = materializeTasks(input([proposal('api'), proposal('screen', ['api'])])) as [
    TaskRecord,
    TaskRecord,
  ];
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

  it('blocks only Tasks that have not started, and unblocks them again', () => {
    const blocked = applyTaskEffects([started, screen], ['block-pending-tasks'], 'now');
    expect(blocked.map((task) => task.taskId)).toEqual(['screen']);
    expect(taskReadiness(blocked[0]!, [started, ...blocked])).toEqual({ kind: 'blocked' });
    expect(applyTaskEffects(blocked, ['unblock-tasks'], 'later')[0]).not.toHaveProperty('blocked');
  });

  it('also blocks a Task that is ready after its own return but never had an attempt', () => {
    const returned: TaskRecord = {
      ...api,
      run: {
        ...api.run,
        position: { state: 'ready', step: 'implement' },
        returns: [
          {
            sequence: 1,
            at: 'now',
            from: { state: 'not-started' },
            to: 'implement',
          },
        ],
      },
    };

    expect(
      applyTaskEffects([returned], ['block-pending-tasks'], 'now').map((task) => task.taskId),
    ).toEqual(['api']);
  });

  it('reports only direct dependencies and is stuck behind an abandoned one', () => {
    const third = materializeTasks(
      input([proposal('docs', ['screen'])], { existing: [api, screen] }),
    )[0]!;
    const tasks = [ended(api, 'abandoned'), screen, third];

    expect(taskReadiness(screen, tasks)).toEqual({ kind: 'dependencies', waitingFor: ['api'] });
    expect(taskReadiness(third, tasks)).toEqual({ kind: 'dependencies', waitingFor: ['screen'] });
    expect(tasksStuck(tasks)).toBe(true);
  });

  it('is stuck only when no open Task can progress without the owner', () => {
    const [blockedApi] = applyTaskEffects([api], ['block-pending-tasks'], 'now') as [TaskRecord];

    // `screen` waits for a blocked Task: nothing can move.
    expect(tasksStuck([blockedApi, screen])).toBe(true);
    // `api` can start, so `screen` will follow.
    expect(tasksStuck([api, screen])).toBe(false);
    expect(tasksStuck([started, screen])).toBe(false);
    // Nothing open: the wait completes instead.
    expect(tasksStuck([ended(api, 'abandoned')])).toBe(false);
  });

  it('treats zero Tasks as all terminal', () => {
    expect(allTasksTerminal([])).toBe(true);
    expect(allTasksTerminal([ended(api, 'completed'), screen])).toBe(false);
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
