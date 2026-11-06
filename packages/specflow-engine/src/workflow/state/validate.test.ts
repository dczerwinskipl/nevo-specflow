import { describe, expect, it } from 'vitest';

import type { AttemptRecord, TaskRecord, WorkflowRun } from './model';
import {
  attention,
  endedAttempt,
  OTHER_SPEC,
  record,
  SPEC,
  task,
} from './store-contract.test-support';
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
  attention: [],
});

const active = { state: 'active', step: 'requirements', attempt: 2 } as const;

describe('validateExecutionSnapshot', () => {
  it('accepts coherent state, including an empty one', () => {
    expect(() => validateExecutionSnapshot(SPEC, { tasks: [], attention: [] })).not.toThrow();
    expect(() =>
      validateExecutionSnapshot(SPEC, {
        ...withRun({ position: active, attempts: [endedAttempt(1), open(2, 3)] }),
        tasks: [task('api'), task('web')],
        attention: [
          {
            ...attention({ kind: 'specification', specId: SPEC }),
            reason: 'task-escalated',
            taskIds: ['api', 'web'],
          },
          attention({ kind: 'task', specId: SPEC, taskId: 'web' }),
        ],
      }),
    ).not.toThrow();
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
      { specification: record('x', OTHER_SPEC), tasks: [], attention: [] },
    ],
    ['a Task of another Specification', { tasks: [task('api', 'api', OTHER_SPEC)], attention: [] }],
    ['two Tasks with one id', { tasks: [task('api'), task('api', 'again')], attention: [] }],
    [
      'an invalid Task run',
      {
        tasks: [
          {
            ...task('api'),
            run: { ...task('api').run, attempts: [open(1, 1)] },
          } satisfies TaskRecord,
        ],
        attention: [],
      },
    ],
    [
      'a draft Task that ran',
      {
        tasks: [
          {
            ...task('api'),
            status: 'draft',
            run: { ...task('api').run, position: { state: 'ready', step: 'implement' } },
          } satisfies TaskRecord,
        ],
        attention: [],
      },
    ],
    [
      'a cancelled Task with an active step',
      {
        tasks: [
          {
            ...task('api'),
            status: 'cancelled',
            run: {
              ...task('api').run,
              position: { state: 'active', step: 'implement', attempt: 1 },
              attempts: [open(1, 1, 'implement')],
            },
          } satisfies TaskRecord,
        ],
        attention: [],
      },
    ],
    [
      'two attention items for one subject',
      {
        ...withRun({}),
        attention: [
          attention({ kind: 'specification', specId: SPEC }),
          attention({ kind: 'specification', specId: SPEC }, 'solution'),
        ],
      },
    ],
    [
      'attention for a missing Specification run',
      { tasks: [], attention: [attention({ kind: 'specification', specId: SPEC })] },
    ],
    [
      'attention for a missing Task',
      { ...withRun({}), attention: [attention({ kind: 'task', specId: SPEC, taskId: 'api' })] },
    ],
    [
      'attention for another Specification',
      { ...withRun({}), attention: [attention({ kind: 'specification', specId: OTHER_SPEC })] },
    ],
    [
      'a task-escalated item without its Tasks',
      {
        ...withRun({}),
        attention: [
          { ...attention({ kind: 'specification', specId: SPEC }), reason: 'task-escalated' },
        ],
      },
    ],
    [
      'escalated Tasks on another reason',
      {
        ...withRun({}),
        attention: [{ ...attention({ kind: 'specification', specId: SPEC }), taskIds: ['api'] }],
      },
    ],
  ])('refuses %s', (_name, state) => {
    expect(() => validateExecutionSnapshot(SPEC, state)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});
