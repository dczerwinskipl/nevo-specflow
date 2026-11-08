import { describe, expect, it } from 'vitest';

import type { AttemptRecord, TaskRecord, WorkflowRun } from './model';
import { endedAttempt, OTHER_SPEC, record, SPEC, task } from './store-contract.test-support';
import { validateExecutionSnapshot, type ExecutionState } from './validate';

const open = (attempt: number, sequence: number, step = 'requirements'): AttemptRecord => ({
  step,
  attempt,
  sequence,
  startedAt: '2026-11-05T10:00:00.000Z',
});

const withRun = (run: Partial<WorkflowRun>): ExecutionState => ({
  specification: { ...record('requirements'), run: { ...record('requirements').run, ...run } },
  tasks: [],
});

/** The Specification lists `api` and `web`; `tasks` are the records that exist. */
const withTasks = (...tasks: TaskRecord[]): ExecutionState => ({
  specification: record('requirements', SPEC, ['api', 'web']),
  tasks,
});

const active = { state: 'active', step: 'requirements', attempt: 2 } as const;

describe('validateExecutionSnapshot', () => {
  it('accepts coherent state, including an empty one', () => {
    expect(() => validateExecutionSnapshot(SPEC, { tasks: [] })).not.toThrow();
    const run = {
      ...record('requirements').run,
      position: active,
      attempts: [endedAttempt(1), open(2, 3)],
    };
    expect(() =>
      validateExecutionSnapshot(SPEC, {
        specification: { ...record('requirements', SPEC, ['api', 'web']), run },
        tasks: [task('api'), { ...task('web'), dependsOn: ['api'] }],
      }),
    ).not.toThrow();
    // A listed Task without a record is that Task broken, not incoherent state.
    expect(() => validateExecutionSnapshot(SPEC, withTasks(task('api')))).not.toThrow();
    expect(() =>
      validateExecutionSnapshot(
        SPEC,
        withRun({
          attempts: [endedAttempt(1)],
          returns: [
            {
              sequence: 2,
              at: '2026-11-05T10:00:02.000Z',
              from: { state: 'ready', step: 'x' },
              to: 'requirements',
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it.each<[string, ExecutionState]>([
    [
      'an active position without its attempt',
      withRun({ position: active, attempts: [endedAttempt(1)] }),
    ],
    [
      'an active position whose attempt already ended',
      withRun({ position: active, attempts: [endedAttempt(1), endedAttempt(2)] }),
    ],
    ['an open attempt while no step is active', withRun({ attempts: [open(1, 1)] })],
    [
      'two open attempts',
      withRun({ position: active, attempts: [open(1, 1, 'other'), open(2, 2)] }),
    ],
    ['an attempt number gap', withRun({ attempts: [endedAttempt(1), endedAttempt(3, 2)] })],
    ['a duplicate attempt number', withRun({ attempts: [endedAttempt(1), endedAttempt(1, 2)] })],
    ['attempts that do not start at 1', withRun({ attempts: [endedAttempt(2, 1)] })],
    ['a repeated sequence', withRun({ attempts: [endedAttempt(1), endedAttempt(2, 1)] })],
    [
      'a sequence shared by an attempt and a return',
      withRun({
        attempts: [endedAttempt(1)],
        returns: [
          { sequence: 1, at: '2026-11-05T10:00:02.000Z', from: { state: 'not-started' }, to: 'x' },
        ],
      }),
    ],
    ['a decreasing sequence', withRun({ attempts: [endedAttempt(1, 2), endedAttempt(2, 1)] })],
    [
      'an ended attempt without an outcome',
      withRun({ attempts: [{ ...open(1, 1), endedAt: '2026-11-05T10:00:01.000Z' }] }),
    ],
    [
      'an outcome without an end',
      withRun({
        attempts: [{ ...endedAttempt(1), endedAt: undefined }],
      }),
    ],
    [
      'a Specification record of another Specification',
      { specification: record('x', OTHER_SPEC), tasks: [] },
    ],
    ['a Task of another Specification', withTasks(task('api', 'api', OTHER_SPEC))],
    ['two Tasks with one id', withTasks(task('api'), task('api', 'again'))],
    ['a Task the Specification does not list', withTasks(task('other'))],
    ['a Task without a Specification', { tasks: [task('api')] }],
    [
      'a dependency on a Task that is not listed',
      withTasks({ ...task('api'), dependsOn: ['ghost'] }),
    ],
    [
      'a dependency cycle',
      withTasks({ ...task('api'), dependsOn: ['web'] }, { ...task('web'), dependsOn: ['api'] }),
    ],
    [
      'an invalid Task run',
      withTasks({
        ...task('api'),
        run: { ...task('api').run, attempts: [open(1, 1)] },
      } satisfies TaskRecord),
    ],
    [
      'a draft Task that ran',
      withTasks({
        ...task('api'),
        status: 'draft',
        run: { ...task('api').run, position: { state: 'ready', step: 'implement' } },
      } satisfies TaskRecord),
    ],
    [
      'a cancelled Task with an active step',
      withTasks({
        ...task('api'),
        status: 'cancelled',
        run: {
          ...task('api').run,
          position: { state: 'active', step: 'implement', attempt: 1 },
          attempts: [open(1, 1, 'implement')],
        },
      } satisfies TaskRecord),
    ],
  ])('refuses %s', (_name, state) => {
    expect(() => validateExecutionSnapshot(SPEC, state)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});
