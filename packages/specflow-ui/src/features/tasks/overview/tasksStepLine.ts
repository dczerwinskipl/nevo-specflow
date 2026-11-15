import type { TFunction } from 'i18next';
import type { WorkflowOutline } from '@nevo/specflow-contracts/workflow';

/**
 * When the first Tasks appear, from the workflow's step that produces them (the Specification
 * projection's `outline.tasksStep`): "Tasks appear when the workflow reaches Break the solution
 * down (step 4 of 7)." before that step, "… finishes." while the run is at it. Nothing without such
 * a step, once the run passed it or ended, or while the projection is unknown.
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
  if (!current) {
    // Before the first start `next` is the entry step; once the run ended there is neither.
    return outline.next ? t('specification.tasksAppearAt', values) : undefined;
  }

  if (current.position < producing.position) {
    return t('specification.tasksAppearAt', values);
  }

  return current.position === producing.position
    ? t('specification.tasksAppearAfter', values)
    : undefined;
}
