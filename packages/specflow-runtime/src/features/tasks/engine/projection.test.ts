import type {
  ExecutionCatalogue,
  ExecutionInspection,
  ExecutionReading,
  WorkflowDefinition,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { executionFactsOf, historyFactsOf, type InspectionBasis } from './projection';

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

function basis(tasks: unknown[]): InspectionBasis {
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
    facts: new Map(),
    attention: [],
    progress: { completed: 0, total: tasks.length, cancelled: 0, onHold: 0 },
    preparation: 'prepared',
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
});
