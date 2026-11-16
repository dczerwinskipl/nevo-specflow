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

  it('names next only when every step-leading transition leads to the same step', () => {
    // Back to draft or on to fork: ambiguous, even though fork is the declared successor.
    expect(outlineOf(branching, { kind: 'at', step: 'review' }).next).toBeUndefined();
    expect(outlineOf(branching, { kind: 'at', step: 'fork' }).next).toBeUndefined();
    // Its only target step, declared earlier; the transition that ends the run does not count.
    expect(outlineOf(branching, { kind: 'at', step: 'c' }).next?.step).toBe('fork');
    // Two transitions to the same step are one step.
    expect(outlineOf(loop, { kind: 'at', step: 'review' }).next).toEqual({
      step: 'plan',
      title: 'Plan',
      position: 2,
    });
  });

  it('claims the Tasks step only on an unambiguous path to it', () => {
    // `a` produces Tasks but no transition leads to it.
    expect(outlineOf(branching, { kind: 'at', step: 'fork' }).tasksStep).toBeUndefined();
    expect(outlineOf(branching, { kind: 'not-started' }).tasksStep).toBeUndefined();
    const plan = { step: 'plan', title: 'Plan', position: 2 };
    expect(outlineOf(loop, { kind: 'not-started' }).tasksStep).toEqual(plan);
    expect(outlineOf(loop, { kind: 'at', step: 'plan' }).tasksStep).toEqual(plan);
    // A rework loop back to the producing step is certain when it is the only way on.
    expect(outlineOf(loop, { kind: 'at', step: 'review' }).tasksStep).toEqual(plan);

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
});
