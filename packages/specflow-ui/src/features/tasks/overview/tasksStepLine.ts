import type { TFunction } from 'i18next';
import type { WorkflowActionProjection, WorkflowOutline } from '@nevo/specflow-contracts/workflow';

/**
 * Which step creates the first Tasks (the Specification projection's `outline.tasksStep`, present
 * only while the run is certain to get there: every step on the way leads to one step only):
 * `The "Break the solution down" step (4 of 7) creates the tasks.` A producing step creates its Tasks with its finish (`materializeTasks`), so the line
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

/** What a Tasks section or page without Tasks says: a title and, while it applies, the step line. */
export interface EmptyTasks {
  readonly title: string;
  readonly line?: string;
  /** The workflow ended: no more Tasks come from it. */
  readonly ended: boolean;
}

/**
 * The empty Tasks of the Overview and the Tasks page: a workflow that ended creates no more Tasks,
 * so it says "No tasks were created" (never "yet", no step line); otherwise "No tasks yet" with the
 * step that creates them, when the Engine claims one.
 */
export function emptyTasks(
  t: TFunction,
  projection: WorkflowActionProjection | undefined,
): EmptyTasks {
  if (projection?.position.kind === 'terminal') {
    return { title: t('specification.tasksNoneCreated'), ended: true };
  }

  const line = tasksStepLine(t, projection?.outline);

  return { title: t('specification.tasksEmptyTitle'), ...(line ? { line } : {}), ended: false };
}
