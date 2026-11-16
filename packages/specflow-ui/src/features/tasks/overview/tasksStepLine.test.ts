import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { tasksStepLine } from './tasksStepLine';

const t = ((key: string, values?: Record<string, unknown>) =>
  [key, JSON.stringify(values)].join(' ')) as unknown as TFunction;
const step = (position: number) => ({ step: 's' + position, title: 'Step ' + position, position });
const at = (position: number) => ({ stepCount: 7, current: step(position), tasksStep: step(4) });
const finishes = 'specification.tasksAppearAfter {"step":"Step 4","position":4,"total":7}';

describe('tasksStepLine', () => {
  it('names the finish of the producing step in every state the run is certain to reach it', () => {
    expect(tasksStepLine(t, { stepCount: 7, next: step(1), tasksStep: step(4) })).toBe(finishes);
    expect(tasksStepLine(t, at(2))).toBe(finishes);
    expect(tasksStepLine(t, at(4))).toBe(finishes);
    // A later step whose only way on loops back to the producing step: the Engine claims it.
    expect(tasksStepLine(t, at(5))).toBe(finishes);
  });

  it('says nothing when the Engine claims no Tasks step, or while the projection is unknown', () => {
    expect(tasksStepLine(t, { stepCount: 7, current: step(2) })).toBeUndefined();
    expect(tasksStepLine(t, undefined)).toBeUndefined();
  });
});
