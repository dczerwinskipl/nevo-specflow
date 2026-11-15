/** Task query keys stay under the Specification scope for coordinated cache invalidation. */
export const taskKeys = {
  detail: (specId: string, taskId: string) => ['specifications', specId, 'task', taskId] as const,
  /** The Tasks page reads (every Task, or only those blocking the Specification). */
  lists: (specId: string) => ['specifications', specId, 'task-list'] as const,
  list: (specId: string, blocking: 'specification' | undefined) =>
    [...taskKeys.lists(specId), blocking ?? 'all'] as const,
};
