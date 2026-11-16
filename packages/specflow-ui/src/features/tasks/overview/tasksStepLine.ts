import type { TFunction } from 'i18next';
import type { WorkflowOutline } from '@nevo/specflow-contracts/workflow';

/**
 * When the first Tasks appear, from the workflow's step that produces them (the Specification
 * projection's `outline.tasksStep`, present only while the run is certain to get there: every step
 * on the way leads to one step only): "Tasks appear when Break the solution down (step 4 of 7)
 * finishes." A producing step creates its Tasks with its finish (`materializeTasks`), so the line
 * is the same before the run reaches that step and while it is at it; the Overview and the Tasks
 * page both use it. The step number is its position in the workflow definition. Nothing without
 * `tasksStep` (no producing step, or a branch on the way) or while the projection is unknown.
 */
export function tasksStepLine(
  t: TFunction,
  outline: WorkflowOutline | undefined,
): string | undefined {
  const producing = outline?.tasksStep;
  if (!outline || !producing) {
    return undefined;
  }

  return t('specification.tasksAppearAfter', {
    step: producing.title,
    position: producing.position,
    total: outline.stepCount,
  });
}
