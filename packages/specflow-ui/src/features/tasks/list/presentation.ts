import type { TaskListGroupView } from './taskListModel';

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
