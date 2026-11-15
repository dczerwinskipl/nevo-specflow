import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { tasksStepLine } from './tasksStepLine';

const t = ((key: string, values?: Record<string, unknown>) =>
  [key, JSON.stringify(values)].join(' ')) as unknown as TFunction;
const step = (position: number) => ({ step: 's' + position, title: 'Step ' + position, position });
const at = (position: number) => ({ stepCount: 7, current: step(position), tasksStep: step(4) });
const reaches = 'specification.tasksAppearAt {"step":"Step 4","position":4,"total":7}';

describe('tasksStepLine', () => {
  it('names the producing step before the run reaches it, and its finish while at it', () => {
    expect(tasksStepLine(t, { stepCount: 7, next: step(1), tasksStep: step(4) })).toBe(reaches);
    expect(tasksStepLine(t, at(2))).toBe(reaches);
    expect(tasksStepLine(t, at(4))).toBe(
      'specification.tasksAppearAfter {"step":"Step 4","position":4,"total":7}',
    );
  });

  it('says nothing without a producing step, after it, once ended or unknown', () => {
    expect(tasksStepLine(t, { stepCount: 7, current: step(2) })).toBeUndefined();
    expect(tasksStepLine(t, at(5))).toBeUndefined();
    expect(tasksStepLine(t, { stepCount: 7, tasksStep: step(4) })).toBeUndefined();
    expect(tasksStepLine(t, undefined)).toBeUndefined();
  });
});
