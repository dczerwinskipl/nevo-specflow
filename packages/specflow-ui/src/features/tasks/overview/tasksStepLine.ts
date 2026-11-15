import type { TFunction } from 'i18next';
import type { WorkflowOutline } from '@nevo/specflow-contracts/workflow';

/**
 * When the first Tasks appear, from the workflow's step that produces them (the Specification
 * projection's `outline.tasksStep`, present only while the run can still reach that step through
 * transitions): "Tasks appear when the workflow reaches Break the solution down (step 4 of 7)."
 * before the first start and while the run is at an earlier step, "… finishes." while it is at that
 * step. Nothing without a reachable producing step, at a later step (a loop back is no promise) or
 * while the projection is unknown.
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
  const current = outline.current;
  if (!current || current.position < producing.position) {
    return t('specification.tasksAppearAt', values);
  }

  return current.position === producing.position
    ? t('specification.tasksAppearAfter', values)
    : undefined;
}
