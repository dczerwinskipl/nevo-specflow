import type { TaskGroup } from '../model';
export { getTaskStatePresentation, type TaskStatePresentation } from '../model';

export function getGroupTone(group: TaskGroup): 'attention' | 'info' | 'neutral' | 'success' {
  if (
    group.tasks.some((t) => {
      const info = t.additionalInfo?.toLowerCase();
      return (
        t.lifecycle === 'blocked' ||
        (info ? info.includes('wymaga decyzji') || info.includes('decision') : false)
      );
    })
  ) {
    return 'attention';
  }
  if (
    group.tasks.some((t) => {
      const info = t.additionalInfo?.toLowerCase();
      return (
        t.lifecycle === 'in_progress' ||
        (info ? info.includes('agent pracuje') || info.includes('working') : false)
      );
    })
  ) {
    return 'info';
  }
  if (group.tasks.length > 0 && group.tasks.every((t) => t.lifecycle === 'completed')) {
    return 'success';
  }
  return 'neutral';
}
