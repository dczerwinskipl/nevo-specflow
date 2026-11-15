import { useTranslation } from 'react-i18next';
import { InlineNote } from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { openTasksText } from './presentation';

type FinishTransition = NonNullable<
  WorkflowActionProjection['actions']['finish']
>['transitions'][number];

/**
 * The finish dialog can take a `tasks-open` result itself: the Engine says the finish's own input
 * closes every open Task (`resolvableByFinish`) and each of them is a draft of this step that the
 * dialog leaves out when it is unticked. Tasks closed only by a decision are cancelled in Tasks; the
 * dialog sends no decisions.
 */
export function closableInFinishDialog(transition: FinishTransition): boolean {
  return (
    transition.unavailable === 'tasks-open' &&
    transition.resolvableByFinish === true &&
    (transition.closableTasks ?? []).every((task) => task.by === 'left-out')
  );
}

/** The open Tasks still open after the dialog's own choices (its unticked drafts are cancelled). */
export function stillOpenAfterFinish(
  transition: FinishTransition,
  droppedDrafts: readonly string[],
) {
  return (transition.openTasks ?? []).filter((task) => !droppedDrafts.includes(task.taskId));
}

/**
 * Why a result that completes the Specification waits for open Tasks, in the finish dialog: when
 * the finish can close them, which Tasks are still open after the unticked drafts and how to close
 * them (untick them here, or cancel them in Tasks); otherwise which Tasks are open.
 */
export function FinishTasksOpenNote({
  transition,
  droppedDrafts,
}: {
  readonly transition: FinishTransition;
  readonly droppedDrafts: readonly string[];
}) {
  const { t } = useTranslation();
  if (transition.resolvableByFinish !== true) {
    return (
      <InlineNote tone="attention" data-finish-tasks-open="">
        {t('workflowExecution.finish.tasksOpen', {
          tasks: openTasksText(t, transition.openTasks ?? []),
        })}
      </InlineNote>
    );
  }

  const open = stillOpenAfterFinish(transition, droppedDrafts);
  if (open.length === 0) {
    return (
      <InlineNote tone="info" data-finish-tasks-open="resolved">
        {t('workflowExecution.finish.tasksClosedByFinish')}
      </InlineNote>
    );
  }

  const leftOut = new Set(
    (transition.closableTasks ?? [])
      .filter((task) => task.by === 'left-out')
      .map((task) => task.taskId),
  );
  const untick = open.filter((task) => leftOut.has(task.taskId));
  const cancel = open.filter((task) => !leftOut.has(task.taskId));

  return (
    <InlineNote tone="attention" data-finish-tasks-open="resolvable">
      {[
        t('workflowExecution.finish.tasksStillOpen', { tasks: openTasksText(t, open) }),
        ...(untick.length > 0
          ? [
              t('workflowExecution.finish.untickToClose', {
                tasks: untick.map((task) => task.taskId).join(', '),
              }),
            ]
          : []),
        ...(cancel.length > 0
          ? [
              t('workflowExecution.finish.cancelToClose', {
                tasks: cancel.map((task) => task.taskId).join(', '),
              }),
            ]
          : []),
      ].join(' ')}
    </InlineNote>
  );
}
