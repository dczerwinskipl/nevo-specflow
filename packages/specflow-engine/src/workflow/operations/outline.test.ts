import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from '../definitions/model';
import { outlineOf } from './outline';

const to = (step: string) => ({ target: { kind: 'step', step } });
const end = { target: { kind: 'terminal', outcome: 'completed' } };

/** Only what the outline reads: the steps in declared order, their transitions and annotations. */
const definition = (producing?: string) =>
  ({
    entryStep: 'draft',
    steps: [
      { id: 'draft', title: 'Draft', kind: 'work', annotations: {}, transitions: [to('plan')] },
      {
        id: 'plan',
        title: 'Plan',
        kind: 'work',
        annotations: producing === 'plan' ? { produces: 'tasks' } : {},
        transitions: [to('wait')],
      },
      { id: 'wait', title: 'Wait', kind: 'wait', annotations: {}, transitions: [end] },
    ],
  }) as unknown as WorkflowDefinition;

/**
 * draft → review; review → back to draft or fork; fork → b or c; c → fork or the end; nothing leads
 * to a.
 */
const branching = {
  entryStep: 'draft',
  steps: [
    { id: 'draft', title: 'Draft', kind: 'work', annotations: {}, transitions: [to('review')] },
    {
      id: 'review',
      title: 'Review',
      kind: 'work',
      annotations: {},
      transitions: [to('draft'), to('fork')],
    },
    { id: 'fork', title: 'Fork', kind: 'work', annotations: {}, transitions: [to('b'), to('c')] },
    { id: 'a', title: 'A', kind: 'work', annotations: { produces: 'tasks' }, transitions: [end] },
    { id: 'b', title: 'B', kind: 'work', annotations: {}, transitions: [end] },
    { id: 'c', title: 'C', kind: 'work', annotations: {}, transitions: [to('fork'), end] },
  ],
} as unknown as WorkflowDefinition;

/** draft → plan → review; review → back to plan (two transitions) or the end; plan produces Tasks. */
const loop = {
  entryStep: 'draft',
  steps: [
    { id: 'draft', title: 'Draft', kind: 'work', annotations: {}, transitions: [to('plan')] },
    {
      id: 'plan',
      title: 'Plan',
      kind: 'work',
      annotations: { produces: 'tasks' },
      transitions: [to('review')],
    },
    {
      id: 'review',
      title: 'Review',
      kind: 'work',
      annotations: {},
      transitions: [to('plan'), to('plan'), end],
    },
  ],
} as unknown as WorkflowDefinition;

describe('outlineOf', () => {
  it('names the entry step as next before the first start', () => {
    expect(outlineOf(definition('plan'), { kind: 'not-started' })).toEqual({
      stepCount: 3,
      next: { step: 'draft', title: 'Draft', position: 1 },
      tasksStep: { step: 'plan', title: 'Plan', position: 2 },
    });
  });

  it('gives the current step and the declared successor its transitions lead to', () => {
    expect(outlineOf(definition('plan'), { kind: 'at', step: 'plan' })).toEqual({
      stepCount: 3,
      current: { step: 'plan', title: 'Plan', position: 2 },
      next: { step: 'wait', title: 'Wait', position: 3 },
      tasksStep: { step: 'plan', title: 'Plan', position: 2 },
    });
  });

  it('has no next after the last step, no step once ended and no Tasks step when none produces', () => {
    expect(outlineOf(definition(), { kind: 'at', step: 'wait' })).toEqual({
      stepCount: 3,
      current: { step: 'wait', title: 'Wait', position: 3 },
    });
    expect(outlineOf(definition(), { kind: 'ended' })).toEqual({ stepCount: 3 });
  });

  it('names next only when every transition leads to the same step', () => {
    // Back to draft or on to fork: ambiguous, even though fork is the declared successor.
    expect(outlineOf(branching, { kind: 'at', step: 'review' }).next).toBeUndefined();
    expect(outlineOf(branching, { kind: 'at', step: 'fork' }).next).toBeUndefined();
    // Back to fork or the end: a finish may end the run, so there is no next.
    expect(outlineOf(branching, { kind: 'at', step: 'c' }).next).toBeUndefined();
    // Back to plan (twice) or the end: still no next.
    expect(outlineOf(loop, { kind: 'at', step: 'review' }).next).toBeUndefined();

    // Two transitions to the same step, declared earlier, are one step.
    const rework = {
      ...loop,
      steps: loop.steps.map((step) =>
        step.id === 'review' ? { ...step, transitions: [to('plan'), to('plan')] } : step,
      ),
    } as unknown as WorkflowDefinition;
    expect(outlineOf(rework, { kind: 'at', step: 'review' }).next).toEqual({
      step: 'plan',
      title: 'Plan',
      position: 2,
    });
  });

  it('has no next for a Review whose approval completes the run and changes go back to Implement', () => {
    const review = {
      entryStep: 'implement',
      steps: [
        {
          id: 'implement',
          title: 'Implement',
          kind: 'work',
          annotations: {},
          transitions: [to('review')],
        },
        {
          id: 'review',
          title: 'Review',
          kind: 'work',
          annotations: {},
          // approved → Completed, changes-requested → Implement.
          transitions: [end, to('implement')],
        },
      ],
    } as unknown as WorkflowDefinition;

    expect(outlineOf(review, { kind: 'at', step: 'review' })).toEqual({
      stepCount: 2,
      current: { step: 'review', title: 'Review', position: 2 },
    });
  });

  it('claims the Tasks step only on an unambiguous path to it', () => {
    // `a` produces Tasks but no transition leads to it.
    expect(outlineOf(branching, { kind: 'at', step: 'fork' }).tasksStep).toBeUndefined();
    expect(outlineOf(branching, { kind: 'not-started' }).tasksStep).toBeUndefined();
    const plan = { step: 'plan', title: 'Plan', position: 2 };
    expect(outlineOf(loop, { kind: 'not-started' }).tasksStep).toEqual(plan);
    expect(outlineOf(loop, { kind: 'at', step: 'plan' }).tasksStep).toEqual(plan);
    // Review may end the run instead of going back to plan: no promise.
    expect(outlineOf(loop, { kind: 'at', step: 'review' }).tasksStep).toBeUndefined();
    // A rework loop back to the producing step is certain when it is the only way on.
    const rework = {
      ...loop,
      steps: loop.steps.map((step) =>
        step.id === 'review' ? { ...step, transitions: [to('plan'), to('plan')] } : step,
      ),
    } as unknown as WorkflowDefinition;
    expect(outlineOf(rework, { kind: 'at', step: 'review' }).tasksStep).toEqual(plan);

    // A cycle that never reaches the producing step stops: no promise.
    const cycle = {
      entryStep: 'x',
      steps: [
        { id: 'x', title: 'X', kind: 'work', annotations: {}, transitions: [to('y')] },
        { id: 'y', title: 'Y', kind: 'work', annotations: {}, transitions: [to('x')] },
        {
          id: 'z',
          title: 'Z',
          kind: 'work',
          annotations: { produces: 'tasks' },
          transitions: [end],
        },
      ],
    } as unknown as WorkflowDefinition;
    expect(outlineOf(cycle, { kind: 'not-started' }).tasksStep).toBeUndefined();

    // fork leads only to a, but the way there from the entry branches at review: no promise.
    const toA = {
      ...branching,
      steps: branching.steps.map((step) =>
        step.id === 'fork' ? { ...step, transitions: [to('a')] } : step,
      ),
    } as unknown as WorkflowDefinition;
    expect(outlineOf(toA, { kind: 'at', step: 'fork' }).tasksStep?.step).toBe('a');
    expect(outlineOf(toA, { kind: 'not-started' }).tasksStep).toBeUndefined();
  });

  it('claims no Tasks step when a step before it can end the run', () => {
    // draft → triage; triage → plan or the end (rejected); plan produces Tasks.
    const triage = {
      entryStep: 'draft',
      steps: [
        { id: 'draft', title: 'Draft', kind: 'work', annotations: {}, transitions: [to('triage')] },
        {
          id: 'triage',
          title: 'Triage',
          kind: 'work',
          annotations: {},
          transitions: [to('plan'), end],
        },
        {
          id: 'plan',
          title: 'Plan',
          kind: 'work',
          annotations: { produces: 'tasks' },
          transitions: [end],
        },
      ],
    } as unknown as WorkflowDefinition;

    expect(outlineOf(triage, { kind: 'not-started' }).tasksStep).toBeUndefined();
    expect(outlineOf(triage, { kind: 'at', step: 'draft' }).tasksStep).toBeUndefined();
    expect(outlineOf(triage, { kind: 'at', step: 'triage' }).tasksStep).toBeUndefined();
    // At the producing step itself it is certain, whatever its own transitions.
    expect(outlineOf(triage, { kind: 'at', step: 'plan' }).tasksStep?.step).toBe('plan');
  });
});
