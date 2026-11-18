import type { TaskListQuery } from '@nevo/specflow-contracts/specs/workspace';

/** Task query keys stay under the Specification scope for coordinated cache invalidation. */
export const taskKeys = {
  detail: (specId: string, taskId: string) => ['specifications', specId, 'task', taskId] as const,
  /** The Tasks page reads (every Task, or one filter: blocking the Specification, one group). */
  lists: (specId: string) => ['specifications', specId, 'task-list'] as const,
  list: (specId: string, query: TaskListQuery) =>
    [
      ...taskKeys.lists(specId),
      query.blocking ? `blocking:${query.blocking}` : query.group ? `group:${query.group}` : 'all',
    ] as const,
};
