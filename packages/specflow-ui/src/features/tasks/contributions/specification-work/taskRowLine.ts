import type { TFunction } from 'i18next';
import type { TaskItem } from '../../read-model/model';
import type { TaskStatePresentation } from './presentation';

/** Statuses whose row names the dependencies (`after T-02, T-03`): the Task has not run yet. */
const NAMES_DEPENDENCIES = new Set(['draft', 'ready', 'waiting', 'on-hold', 'blocked']);

/**
 * The supporting line of a project-mode Task row: its presented status (`Draft · needs approval`,
 * `Waiting`, …) and, before it runs, the Tasks it comes after. Undefined without a project status.
 */
export function taskRowLine(
  task: Pick<TaskItem, 'statusId' | 'dependsOn'>,
  t: TFunction,
): { text: string; presentation?: TaskStatePresentation } | undefined {
  if (!task.statusId) {
    return undefined;
  }

  const status =
    task.statusId === 'draft'
      ? t('taskAuthoring.tasks.draftLine')
      : t(`taskAuthoring.status.${task.statusId}`, { defaultValue: task.statusId });
  const after =
    NAMES_DEPENDENCIES.has(task.statusId) && task.dependsOn && task.dependsOn.length > 0
      ? t('taskAuthoring.tasks.after', { ids: task.dependsOn.join(', ') })
      : undefined;

  return {
    text: after ? `${status} · ${after}` : status,
    // A draft needs the owner: shown like other attention, with its icon (never colour alone).
    ...(task.statusId === 'draft'
      ? {
          presentation: {
            icon: 'triangle-alert',
            tone: 'attention',
            iconClassName: 'text-status-attention',
            textClassName: 'text-status-attention font-medium',
          },
        }
      : {}),
  };
}

/** Cancelled Tasks (by a person or by an abandon) are named beside the progress, not counted. */
export const isCancelledTask = (task: Pick<TaskItem, 'statusId'>) =>
  task.statusId === 'cancelled' || task.statusId === 'abandoned';
