import type { TFunction } from 'i18next';
import type { SemanticSupporting } from '../../../shared/operational-list';
import { getTaskStatePresentation } from '../read-model';
import { needsPerson } from './presentation';
import type { TaskListRowView } from './taskListModel';

/** Statuses whose row names the dependencies (`after T-02, T-03`): the Task has not run yet. */
const NAMES_DEPENDENCIES = new Set(['draft', 'ready', 'on-hold', 'blocked']);

/**
 * The supporting line of a Tasks page row. A Task a person has to act on says so with the reason
 * ("Requires attention · …", danger when it is broken); otherwise its status line: "Draft · needs
 * approval · after T-02" in the neutral tone, "Waiting for T-02", "In progress", "Completed".
 */
export function taskRowLine(row: TaskListRowView, t: TFunction): SemanticSupporting | undefined {
  const attentionReason =
    row.attention?.reason ??
    (row.blocksSpecification ? t('taskOverview.row.blocksSpecification') : undefined);
  if (needsPerson(row)) {
    return {
      text: attentionReason
        ? t('taskOverview.row.attention', { reason: attentionReason })
        : t('taskOverview.row.attentionOnly'),
      tone: row.broken ? 'danger' : 'attention',
      icon: row.broken ? 'circle-alert' : 'triangle-alert',
    };
  }

  if (!row.statusId) {
    return undefined;
  }

  if (row.statusId === 'waiting' && row.waitingFor && row.waitingFor.length > 0) {
    return {
      text: t('taskOverview.row.waitingFor', { ids: row.waitingFor.join(', ') }),
      icon: 'clock',
    };
  }

  const status =
    row.statusId === 'draft'
      ? t('taskAuthoring.tasks.draftLine')
      : t(`taskAuthoring.status.${row.statusId}`, { defaultValue: row.statusId });
  const after =
    NAMES_DEPENDENCIES.has(row.statusId) && row.dependsOn && row.dependsOn.length > 0
      ? t('taskAuthoring.tasks.after', { ids: row.dependsOn.join(', ') })
      : undefined;
  const presentation = getTaskStatePresentation({ lifecycle: row.lifecycle });

  return {
    text: after ? `${status} · ${after}` : status,
    // A status is not attention: a draft, an on-hold or blocked Task without an attention item reads
    // neutral (approving or resuming is an available action). Only progress and completion tone.
    ...(row.lifecycle !== 'in_progress' && row.lifecycle !== 'completed'
      ? {}
      : {
          ...(presentation.tone ? { tone: presentation.tone } : {}),
          ...(presentation.icon ? { icon: presentation.icon } : {}),
          ...(presentation.iconClassName ? { iconClassName: presentation.iconClassName } : {}),
        }),
  };
}
