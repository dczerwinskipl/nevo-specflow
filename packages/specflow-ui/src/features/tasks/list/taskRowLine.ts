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
  /** The attention overlay when the Engine reports one: added under the status, never in its place. */
  readonly overlay?: TaskAttentionOverlay;
  /**
   * The supporting text: the hold reason verbatim, else the dependencies ("after T-02"). With an
   * overlay only a hold reason stays (the reason the Task is held is never hidden by the attention
   * it causes), and not for an escalation, whose overlay already quotes it.
   */
  readonly text?: string;
  /** The status line says more than the status's name (the Tasks it waits for). */
  readonly statusAddsDetail: boolean;
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
 * The status column of a Task row: its status (always, with the status mark), then the attention
 * overlay and the supporting text. "On hold" is the label and the reason the supporting text, so
 * the reason is never prefixed with the status again.
 */
export function taskRowLines(
  row: TaskListRowView,
  t: TFunction,
  specificationTitle?: string,
  titleOf?: (taskId: string) => string | undefined,
): TaskRowLines {
  const overlay = taskAttentionOverlay(
    {
      ...taskRowAttention(row, specificationTitle),
      ...(titleOf ? { titleOf } : {}),
    },
    t,
  );
  const waitingFor =
    row.statusId === 'waiting' && row.waitingFor && row.waitingFor.length > 0
      ? row.waitingFor
      : undefined;
  // One Task it waits for by its title (its key when the title is not known here); more by count,
  // never a list of keys (owner, 2026-11-25: keys read as noise).
  const label = waitingFor
    ? waitingFor.length === 1
      ? t('taskOverview.row.waitingFor', { ids: titleOf?.(waitingFor[0]!) ?? waitingFor[0] })
      : t('taskOverview.row.waitingForCount', { count: waitingFor.length })
    : row.statusId === 'draft'
      ? t('taskAuthoring.tasks.draftLine')
      : t(`taskAuthoring.status.${row.statusId}`, { defaultValue: row.statusId });
  const after =
    NAMES_DEPENDENCIES.has(row.statusId) && row.dependsOn && row.dependsOn.length > 0
      ? t('taskAuthoring.tasks.after', {
          // Named by title when it is known (keys read as noise); the key only without one.
          ids: row.dependsOn.map((id) => titleOf?.(id) ?? id).join(', '),
        })
      : undefined;
  const holdReason = row.statusId === 'on-hold' ? row.holdReason : undefined;
  const text = overlay
    ? row.attention?.reason === 'task-escalated'
      ? undefined
      : holdReason
    : (holdReason ?? after);

  return {
    status: taskStatusSupporting(row.statusId, label),
    ...(overlay ? { overlay } : {}),
    ...(text ? { text } : {}),
    statusAddsDetail: waitingFor !== undefined,
  };
}
