import type { TFunction } from 'i18next';
import type { SemanticSupporting } from '../../../shared/operational-list';
import { taskAttentionOverlay, taskStatusSupporting } from '../read-model';
import type { TaskListRowView } from './taskListModel';

/** Statuses whose row names the dependencies (`after T-02, T-03`): the Task has not run yet. */
const NAMES_DEPENDENCIES = new Set(['draft', 'ready', 'on-hold', 'blocked']);

/**
 * The supporting line of a Tasks page row. A Task a person has to act on says so with the Engine's
 * reason (the attention overlay: "Requires attention · …", danger when it is broken); otherwise its
 * status line with the status mark: "Draft · needs approval · after T-02", "Waiting for T-02",
 * "In progress", "Completed".
 */
export function taskRowLine(row: TaskListRowView, t: TFunction): SemanticSupporting | undefined {
  const overlay = taskAttentionOverlay(
    {
      ...(row.attention ? { item: row.attention } : {}),
      ...(row.blocksSpecification ? { blocksSpecification: true } : {}),
      ...(row.broken ? { broken: true } : {}),
    },
    t,
  );
  if (overlay) {
    return overlay;
  }

  if (!row.statusId) {
    return undefined;
  }

  if (row.statusId === 'waiting' && row.waitingFor && row.waitingFor.length > 0) {
    return taskStatusSupporting(
      row.statusId,
      t('taskOverview.row.waitingFor', { ids: row.waitingFor.join(', ') }),
    );
  }

  const status =
    row.statusId === 'draft'
      ? t('taskAuthoring.tasks.draftLine')
      : t(`taskAuthoring.status.${row.statusId}`, { defaultValue: row.statusId });
  const after =
    NAMES_DEPENDENCIES.has(row.statusId) && row.dependsOn && row.dependsOn.length > 0
      ? t('taskAuthoring.tasks.after', { ids: row.dependsOn.join(', ') })
      : undefined;

  return taskStatusSupporting(row.statusId, after ? `${status} · ${after}` : status);
}
