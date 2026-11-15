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

/** draft → review; review → back to draft or fork; fork → b or c; nothing leads to a. */
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
    { id: 'c', title: 'C', kind: 'work', annotations: {}, transitions: [to('fork')] },
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

  it('follows transitions in a branching workflow and never claims an unreachable Tasks step', () => {
    // The declared successor is one of the targets: it is next, whatever else is possible.
    expect(outlineOf(branching, { kind: 'at', step: 'review' }).next?.step).toBe('fork');
    // The declared successor (a) is not a target, and two steps are: no next.
    const fork = outlineOf(branching, { kind: 'at', step: 'fork' });
    expect(fork.next).toBeUndefined();
    // The only target, declared earlier: it is next.
    expect(outlineOf(branching, { kind: 'at', step: 'c' }).next?.step).toBe('fork');
    // `a` produces Tasks but no transition leads to it.
    expect(fork.tasksStep).toBeUndefined();
    expect(outlineOf(branching, { kind: 'not-started' }).tasksStep).toBeUndefined();
  });
});
