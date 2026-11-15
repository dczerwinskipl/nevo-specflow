import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from '../definitions/model';
import { outlineOf } from './outline';

/** Only what the outline reads: the steps in declared order, their kinds and annotations. */
const definition = (producing?: string) =>
  ({
    entryStep: 'draft',
    steps: [
      { id: 'draft', title: 'Draft', kind: 'work', annotations: {} },
      {
        id: 'plan',
        title: 'Plan',
        kind: 'work',
        annotations: producing === 'plan' ? { produces: 'tasks' } : {},
      },
      { id: 'wait', title: 'Wait', kind: 'wait', annotations: {} },
    ],
  }) as unknown as WorkflowDefinition;

describe('outlineOf', () => {
  it('names the entry step as next before the first start', () => {
    expect(outlineOf(definition('plan'), { kind: 'not-started' })).toEqual({
      stepCount: 3,
      next: { step: 'draft', title: 'Draft', position: 1 },
      tasksStep: { step: 'plan', title: 'Plan', position: 2 },
    });
  });

  it('gives the current step and the one declared after it', () => {
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
});
