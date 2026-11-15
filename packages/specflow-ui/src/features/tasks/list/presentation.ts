import type { TaskListGroupView, TaskListRowView } from './taskListModel';

/** The row needs a person: an attention item, the Specification's `tasks-stuck`, or broken files. */
export const needsPerson = (row: TaskListRowView): boolean =>
  row.attention !== undefined || row.blocksSpecification === true || row.broken === true;

/**
 * The group header's dot follows the rows' lifecycle only: a group is presentation, never
 * attention (a flagged row carries its own marker and reason).
 */
export function getGroupTone(group: TaskListGroupView): 'info' | 'neutral' | 'success' {
  if (group.rows.some((row) => row.lifecycle === 'in_progress')) {
    return 'info';
  }

  if (group.rows.length > 0 && group.rows.every((row) => row.lifecycle === 'completed')) {
    return 'success';
  }

  return 'neutral';
}
