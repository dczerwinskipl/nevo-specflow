import type { RunPosition } from '@nevo/workflow';
import { describe, expect, it } from 'vitest';

import type { ExecutionTask, TaskStatus, WorkflowRun } from '../state/model';
import {
  closeBlockers,
  specificationLifecycleActions,
  type SpecificationExitState,
} from './blockers';

const SPEC = 'spec-1';
const runAt = (position: RunPosition): WorkflowRun => ({
  workflow: { id: 'flow', version: 1, revision: '0'.repeat(64) },
  position,
  attempts: [],
  returns: [],
});
const ACTIVE: RunPosition = { state: 'active', step: 'work', attempt: 1 };
const DONE: RunPosition = { state: 'terminal', outcome: 'completed' };

const task = (taskId: string, status: TaskStatus, position?: RunPosition): ExecutionTask => ({
  specId: SPEC,
  taskId,
  title: taskId,
  type: 'implementation',
  status,
  dependsOn: [],
  origin: { kind: 'manual', actorId: 'owner' },
  documents: [{ id: 'task', path: 'task.md', type: 'task' }],
  ...(position ? { run: runAt(position) } : {}),
});

const state = (overrides: Partial<SpecificationExitState> = {}): SpecificationExitState => ({
  specId: SPEC,
  bound: true,
  tasks: [],
  brokenTasks: [],
  pendingExecutionChange: false,
  pendingTaskDocuments: [],
  operationInProgress: false,
  ...overrides,
});

const specificationAt = (position: RunPosition) => ({
  specification: {
    specId: SPEC,
    archetype: 'feature',
    taskTypes: ['*'] as const,
    run: runAt(position),
  },
});

describe('closeBlockers', () => {
  it('lets a Specification without a run or Tasks close, bound to a workflow or not', () => {
    expect(closeBlockers(state())).toEqual([]);
    expect(closeBlockers(state({ bound: false }))).toEqual([]);
    expect(specificationLifecycleActions(state()).close).toEqual({ kind: 'allowed' });
  });

  it('lets a Specification close once its run ended and every Task ended or was cancelled', () => {
    const ended = state({
      ...specificationAt(DONE),
      tasks: [
        task('done', 'ready', DONE),
        task('dropped', 'cancelled'),
        task('stopped', 'cancelled', ACTIVE),
      ],
    });

    expect(closeBlockers(ended)).toEqual([]);
  });

  it('groups each kind of unfinished work and pending write, with its subjects', () => {
    const blocked = state({
      ...specificationAt({ state: 'ready', step: 'review' }),
      tasks: [
        task('draft-a', 'draft'),
        task('held', 'on-hold'),
        task('never-started', 'ready'),
        task('running', 'ready', ACTIVE),
        task('done', 'ready', DONE),
      ],
      brokenTasks: ['gone'],
      pendingExecutionChange: true,
      pendingTaskDocuments: ['running'],
      operationInProgress: true,
    });

    expect(closeBlockers(blocked).map(({ kind, subjectIds }) => ({ kind, subjectIds }))).toEqual([
      { kind: 'specification-run', subjectIds: [SPEC] },
      { kind: 'draft-tasks', subjectIds: ['draft-a'] },
      { kind: 'on-hold-tasks', subjectIds: ['held'] },
      { kind: 'unfinished-tasks', subjectIds: ['never-started', 'running'] },
      { kind: 'broken-tasks', subjectIds: ['gone'] },
      { kind: 'pending-execution-change', subjectIds: [SPEC] },
      { kind: 'pending-task-documents', subjectIds: ['running'] },
    ]);
    expect(closeBlockers(blocked).every((blocker) => blocker.message.length > 0)).toBe(true);
  });

  it('blocks a draft Task of a Specification that never started', () => {
    expect(closeBlockers(state({ tasks: [task('draft-a', 'draft')] }))).toMatchObject([
      { kind: 'draft-tasks', subjectIds: ['draft-a'] },
    ]);
  });
});

describe('specificationLifecycleActions', () => {
  it('offers Abandon while work is unfinished, and only once nothing is pending', () => {
    const open = state({ tasks: [task('draft-a', 'draft')] });
    expect(specificationLifecycleActions(open)).toEqual({
      close: { kind: 'blocked', blockers: closeBlockers(open) },
      abandon: { kind: 'allowed' },
    });

    const busy = specificationLifecycleActions({
      ...open,
      operationInProgress: true,
      pendingTaskDocuments: ['draft-a'],
    });
    expect(busy.abandon).toMatchObject({
      kind: 'blocked',
      blockers: [
        { kind: 'pending-task-documents', subjectIds: ['draft-a'] },
        { kind: 'operation-in-progress', subjectIds: [SPEC] },
      ],
    });
  });

  it('never offers Abandon for an ended or unconfigured Specification', () => {
    expect(specificationLifecycleActions(state(specificationAt(DONE))).abandon).toEqual({
      kind: 'unavailable',
      reason: 'ended',
    });
    expect(
      specificationLifecycleActions(
        state(specificationAt({ state: 'terminal', outcome: 'abandoned' })),
      ).abandon,
    ).toEqual({ kind: 'unavailable', reason: 'ended' });
    expect(specificationLifecycleActions(state({ bound: false })).abandon).toEqual({
      kind: 'unavailable',
      reason: 'not-configured',
    });
  });
});
