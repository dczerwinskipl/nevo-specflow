import type { TFunction } from 'i18next';
import type { SemanticSupporting } from '../../../shared/operational-list';
import {
  taskAttentionOverlay,
  taskStatusSupporting,
  type TaskAttentionOverlay,
  type TaskAttentionSource,
} from '../read-model';
import type { TaskListRowView } from './taskListModel';

/** Statuses whose row names the dependencies (`after T-02, T-03`): the Task has not run yet. */
const NAMES_DEPENDENCIES = new Set(['draft', 'ready', 'on-hold', 'blocked']);

/** The status column of a Task row, in reading order. */
export interface TaskRowLines {
  /** The status mark and label: "On hold", "Waiting for T-02", "Draft · needs approval". */
  readonly status: SemanticSupporting;
  /**
   * The one supporting line under the status: the attention overlay when the Engine reports one
   * (it is added under the status, never in its place), else the hold reason verbatim or the
   * dependencies ("after T-02").
   */
  readonly supporting?:
    | { readonly kind: 'overlay'; readonly overlay: TaskAttentionOverlay }
    | { readonly kind: 'text'; readonly text: string };
}

/** What the Engine reported about the row, for `taskRequiresAttention` and the overlay. */
export function taskRowAttention(
  row: TaskListRowView,
  specificationTitle?: string,
): TaskAttentionSource {
  return {
    ...(row.attention ? { item: row.attention } : {}),
    ...(row.blocksSpecification ? { blocksSpecification: true } : {}),
    ...(row.broken ? { broken: true } : {}),
    ...(specificationTitle ? { specificationTitle } : {}),
    // An escalated Task's hold reason is its feedback.
    ...(row.holdReason ? { feedback: row.holdReason } : {}),
  };
}

/**
 * The status column of a Task row: its status (always, with the status mark) and one supporting
 * line. "On hold" is the label and the reason the supporting line, so the reason is never prefixed
 * with the status again.
 */
export function taskRowLines(
  row: TaskListRowView,
  t: TFunction,
  specificationTitle?: string,
): TaskRowLines {
  const overlay = taskAttentionOverlay(taskRowAttention(row, specificationTitle), t);
  const waitingFor =
    row.statusId === 'waiting' && row.waitingFor && row.waitingFor.length > 0
      ? row.waitingFor
      : undefined;
  const label = waitingFor
    ? t('taskOverview.row.waitingFor', { ids: waitingFor.join(', ') })
    : row.statusId === 'draft'
      ? t('taskAuthoring.tasks.draftLine')
      : t(`taskAuthoring.status.${row.statusId}`, { defaultValue: row.statusId });
  const after =
    NAMES_DEPENDENCIES.has(row.statusId) && row.dependsOn && row.dependsOn.length > 0
      ? t('taskAuthoring.tasks.after', { ids: row.dependsOn.join(', ') })
      : undefined;
  const text = (row.statusId === 'on-hold' ? row.holdReason : undefined) ?? after;

  return {
    status: taskStatusSupporting(row.statusId, label),
    ...(overlay
      ? { supporting: { kind: 'overlay', overlay } }
      : text
        ? { supporting: { kind: 'text', text } }
        : {}),
  };
}
