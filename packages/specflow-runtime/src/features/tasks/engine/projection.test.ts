import type {
  ExecutionCatalogue,
  ExecutionInspection,
  ExecutionReading,
  TaskLane,
  WorkflowDefinition,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { workspaceTasksOf } from '../workspace/engine-contribution';
import { executionFactsOf, historyFactsOf, taskStatusOf, type InspectionBasis } from './projection';

const transition = (
  id: string,
  target: WorkflowDefinition['steps'][number]['transitions'][number]['target'],
  extra = {},
) => ({
  id,
  target,
  continuation: 'owner-action' as const,
  feedback: 'optional' as const,
  annotations: { session: 'fresh' as const, effects: [], escalate: false },
  ...extra,
});

const workflow = {
  id: 'implement',
  version: 1,
  title: 'Implement',
  description: 'Build and review.',
  entryStep: 'build',
  returns: [],
  annotations: { subject: 'task' },
  steps: [
    {
      id: 'build',
      kind: 'work',
      title: 'Build',
      purpose: 'Build it.',
      executors: ['agent', 'human'],
      annotations: { interaction: 'interactive' },
      transitions: [transition('built', { kind: 'step', step: 'review' })],
    },
    {
      id: 'review',
      kind: 'work',
      title: 'Review',
      purpose: '',
      executors: ['human'],
      annotations: { interaction: 'interactive' },
      transitions: [
        transition('pass', { kind: 'terminal', outcome: 'completed' }, { result: 'pass' }),
        transition(
          'fail',
          { kind: 'step', step: 'build' },
          { result: 'fail', feedback: 'required' },
        ),
      ],
    },
  ],
} as unknown as WorkflowDefinition;

const catalogue = {
  workflow: (id: string) => (id === 'implement' ? workflow : undefined),
  taskType: (id: string) =>
    id === 'implementation' ? { id, title: 'Implementation', workflow: 'implement' } : undefined,
} as unknown as ExecutionCatalogue;

const owner = { class: 'human', details: { actorId: 'user:ann', trust: 'authenticated' } } as const;

function task(taskId: string, extra: Record<string, unknown> = {}) {
  return {
    record: {
      specId: 'spec',
      taskId,
      title: `Task ${taskId}`,
      type: 'implementation',
      status: 'ready',
      dependsOn: [],
      origin: { kind: 'manual', actorId: 'user:ann' },
      documents: [{ id: 'task', path: 'task.md', type: 'task' }],
      ...extra,
    },
    revision: `rev-${taskId}`,
    readiness: { kind: 'ready' },
  };
}

const active = task('build', {
  run: {
    workflow: { id: 'implement', version: 1, revision: 'pin' },
    position: { state: 'active', step: 'review', attempt: 1 },
    attempts: [
      {
        step: 'build',
        attempt: 1,
        sequence: 1,
        startedAt: '2026-11-12T10:00:00Z',
        endedAt: '2026-11-12T11:00:00Z',
        actor: owner,
        finishedBy: owner,
        outcome: { kind: 'transition', transition: 'built', feedback: 'Done.', artifacts: [] },
      },
      { step: 'review', attempt: 1, sequence: 2, startedAt: '2026-11-12T11:00:00Z', actor: owner },
    ],
    returns: [],
  },
});

function basis(
  tasks: unknown[],
  lanes: Record<string, TaskLane> = {},
  extra: Partial<ExecutionReading> = {},
): InspectionBasis {
  const inspection = {
    specId: 'spec',
    tasks,
    brokenTasks: [],
    issues: [],
    attention: [],
  } as unknown as ExecutionInspection;
  const reading: ExecutionReading = {
    inspection,
    actions: new Map(),
    lanes: new Map(Object.entries(lanes)),
    progress: { completed: 0, total: tasks.length },
    preparation: 'prepared',
    ...extra,
  };

  return {
    projectId: 'project',
    workspaceId: 'workspace',
    specificationTitle: 'Spec',
    catalogue,
    inspection,
    reading,
  };
}

describe('Engine Task projection', () => {
  it('projects an active run with the executors, transitions and hand-off of its pinned definition', () => {
    const entry = {
      ...active,
      handoff: {
        kind: 'transition',
        from: { step: 'build', attempt: 1 },
        transition: 'built',
        feedback: 'Done.',
        artifacts: [],
      },
    };
    const facts = executionFactsOf(basis([entry]), entry as never)!;

    expect(facts.definitionVersion).toBe('rev-build');
    expect(facts.workflow.definition.steps.map(({ step }) => [step.id, step.executors])).toEqual([
      ['build', ['agent', 'human']],
      ['review', ['human']],
    ]);
    expect(facts.workflow.position).toMatchObject({
      state: 'active',
      key: { specId: 'spec', taskId: 'build', stepId: 'review', attempt: 1 },
    });
    expect(facts.workflow.transitions).toEqual([
      expect.objectContaining({
        id: 'pass',
        result: 'pass',
        feedbackRequired: false,
        target: { kind: 'terminal', status: 'completed', outcome: 'success' },
      }),
      expect.objectContaining({ id: 'fail', feedbackRequired: true }),
    ]);
    expect(facts.workflow.previousFeedback).toEqual({
      key: { specId: 'spec', taskId: 'build', stepId: 'build', attempt: 1 },
      result: null,
      text: 'Done.',
    });
    // No legacy human-requirement projection: that section stays unavailable.
    expect(facts.requirements).toBeUndefined();
    expect(facts.workflow.position).toMatchObject({
      actor: { class: 'human', actorId: 'user:ann' },
    });
    expect(taskStatusOf('in-progress')).toEqual({
      id: 'in-progress',
      label: 'In progress',
      lifecycle: 'in_progress',
    });
  });

  it('lists the attempts newest first with who worked on them', () => {
    const history = historyFactsOf(basis([active]), active as never)!;

    expect(history.items.map((item) => [item.id, item.result, item.actor])).toEqual([
      ['review-1', null, { class: 'human', actorId: 'user:ann' }],
      ['build-1', 'built', { class: 'human', actorId: 'user:ann' }],
    ]);
    expect(history.items[1]!.transitionedTo).toMatchObject({
      kind: 'step',
      step: { id: 'review' },
    });
  });

  it('has no execution or history once the pinned definition changed', () => {
    const changed = { ...active, definitionChanged: true };

    expect(executionFactsOf(basis([changed]), changed as never)).toBeUndefined();
    expect(historyFactsOf(basis([changed]), changed as never)).toBeUndefined();
  });

  it('groups the workspace Tasks by their Engine lanes and passes progress and preparation on', () => {
    const tasks = ['draft-1', 'build', 'ready-1', 'waiting-1', 'blocked-1', 'done-1', 'gone-1'].map(
      (taskId) => task(taskId),
    );
    const contribution = workspaceTasksOf(
      basis(
        tasks,
        {
          'draft-1': 'needs-approval',
          build: 'in-progress',
          'ready-1': 'ready',
          'waiting-1': 'waiting',
          'blocked-1': 'blocked',
          'done-1': 'done',
          'gone-1': 'ended',
        },
        { progress: { completed: 1, total: 6 }, preparation: 'preparing' },
      ),
    );

    expect(contribution.preparationState).toBe('preparing');
    expect(contribution.section).toMatchObject({
      state: 'available',
      data: {
        groups: [
          {
            id: 'needs-approval',
            tasks: [
              {
                id: 'draft-1',
                status: { id: 'draft' },
                type: { id: 'implementation', title: 'Implementation' },
                dependsOn: [],
              },
            ],
          },
          { id: 'in-progress', tasks: [{ id: 'build' }] },
          { id: 'ready', tasks: [{ id: 'ready-1' }] },
          { id: 'waiting', tasks: [{ id: 'waiting-1' }] },
          { id: 'blocked', tasks: [{ id: 'blocked-1', status: { id: 'blocked' } }] },
          { id: 'done', tasks: [{ id: 'done-1' }] },
          { id: 'held', tasks: [{ id: 'gone-1', status: { id: 'abandoned' } }] },
        ],
        completed: 1,
        total: 6,
      },
    });
  });
});
