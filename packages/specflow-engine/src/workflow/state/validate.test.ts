import { describe, expect, it } from 'vitest';

import type { AttemptRecord, TaskRunRecord, WorkflowRun } from './model';
import {
  endedAttempt,
  manifest,
  OTHER_SPEC,
  record,
  runRecord,
  SPEC,
} from './store-contract.test-support';
import { assertNoNewIssues, validateExecutionState, type ExecutionState } from './validate';

const open = (attempt: number, sequence: number, step = 'requirements'): AttemptRecord => ({
  step,
  attempt,
  sequence,
  startedAt: '2026-11-05T10:00:00.000Z',
});

const NONE = { manifests: [], runs: [], folders: [] } as const;

const withRun = (run: Partial<WorkflowRun>): ExecutionState => ({
  ...NONE,
  specification: { ...record('requirements'), run: { ...record('requirements').run, ...run } },
});

/** `api` and `web` are registered with their manifests and folders; `runs` are the run records. */
const withRuns = (...runs: TaskRunRecord[]): ExecutionState => ({
  specification: record('requirements'),
  index: { tasks: [{ id: 'api' }, { id: 'web' }] },
  manifests: [manifest('api'), manifest('web')],
  folders: ['api', 'web'],
  runs,
});

const active = { state: 'active', step: 'requirements', attempt: 2 } as const;

describe('validateExecutionState', () => {
  it('accepts coherent state, including an empty one', () => {
    expect(validateExecutionState(SPEC, NONE)).toEqual([]);
    const run = {
      ...record('requirements').run,
      position: active,
      attempts: [endedAttempt(1), open(2, 3)],
    };
    expect(
      validateExecutionState(SPEC, {
        ...withRuns(runRecord('api'), runRecord('web')),
        specification: { ...record('requirements'), run },
        manifests: [manifest('api'), { ...manifest('web'), dependsOn: ['api'] }],
      }),
    ).toEqual([]);
    // A registered Task without a run record has not started.
    expect(validateExecutionState(SPEC, withRuns(runRecord('api')))).toEqual([]);
    expect(() =>
      validateExecutionState(
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
      { ...NONE, specification: record('x', OTHER_SPEC) },
    ],
    ['a Task run of another Specification', withRuns(runRecord('api', OTHER_SPEC))],
    ['two Task runs with one id', withRuns(runRecord('api'), runRecord('api'))],
    [
      'an invalid Task run',
      withRuns({ ...runRecord('api'), run: { ...runRecord('api').run, attempts: [open(1, 1)] } }),
    ],
  ])('refuses %s', (_name, state) => {
    expect(() => validateExecutionState(SPEC, state)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});

describe('Task resource issues of the execution state', () => {
  it('reports inconsistencies between the Task files instead of failing', () => {
    const state: ExecutionState = {
      ...withRuns(runRecord('api'), runRecord('gone')),
      manifests: [manifest('api')],
      folders: ['api', 'stray'],
    };

    expect(validateExecutionState(SPEC, state)).toEqual([
      { kind: 'dangling', taskId: 'web', reason: 'missing-folder' },
      { kind: 'unregistered', taskId: 'stray' },
      { kind: 'broken', taskId: 'gone', reason: 'unregistered-run' },
    ]);
  });

  it('lets a change keep the issues the state has, but not add one', () => {
    const before = [{ kind: 'unregistered', taskId: 'stray' }] as const;
    expect(() => assertNoNewIssues(before, before)).not.toThrow();
    expect(() => assertNoNewIssues(before, [])).not.toThrow();
    expect(() => assertNoNewIssues(before, [...before, { kind: 'cycle', taskId: 'api' }])).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});
