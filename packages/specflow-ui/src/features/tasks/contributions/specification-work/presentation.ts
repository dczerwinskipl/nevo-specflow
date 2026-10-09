import type { TaskGroup } from '../../../specs/workspace/model';
export {
  getTaskStatePresentation,
  type TaskStatePresentation,
} from '../../../specs/workspace/model';

export function getGroupTone(group: TaskGroup): 'attention' | 'info' | 'neutral' | 'success' {
  if (group.tasks.some((t) => t.lifecycle === 'blocked' || t.attention)) {
    return 'attention';
  }
  if (group.tasks.some((t) => t.lifecycle === 'in_progress')) {
    return 'info';
  }
  if (group.tasks.length > 0 && group.tasks.every((t) => t.lifecycle === 'completed')) {
    return 'success';
  }
  return 'neutral';
}
