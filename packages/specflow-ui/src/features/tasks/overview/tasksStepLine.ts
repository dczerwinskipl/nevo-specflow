import type { TFunction } from 'i18next';
import type { WorkflowOutline } from '@nevo/specflow-contracts/workflow';

/**
 * When the first Tasks appear, from the workflow's step that produces them (the Specification
 * projection's `outline.tasksStep`, present only while the run is certain to get there: every step
 * on the way leads to one step only): "Tasks appear when the workflow reaches Break the solution
 * down (step 4 of 7)." before the run is at that step, "… finishes." while it is at it. The step
 * number is its position in the workflow definition. Nothing without `tasksStep` (no producing
 * step, or a branch on the way) or while the projection is unknown.
 */
export function tasksStepLine(
  t: TFunction,
  outline: WorkflowOutline | undefined,
): string | undefined {
  const producing = outline?.tasksStep;
  if (!outline || !producing) {
    return undefined;
  }

  const values = { step: producing.title, position: producing.position, total: outline.stepCount };

  return outline.current?.step === producing.step
    ? t('specification.tasksAppearAfter', values)
    : t('specification.tasksAppearAt', values);
}
