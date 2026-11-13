import type { QueryClient } from '@tanstack/react-query';
import { invalidateSpecificationWorkspace } from '../../specs/read-model';

/**
 * Task authoring caches, under the Specification scope like the Task detail
 * (`['specifications', specId, 'task', taskId]`).
 */
export const taskAuthoringKeys = {
  specificationActions: (specId: string) => ['specifications', specId, 'workflow-actions'] as const,
  all: (specId: string) => ['specifications', specId, 'task-authoring'] as const,
  taskActions: (specId: string, taskId: string) =>
    [...taskAuthoringKeys.all(specId), taskId, 'actions'] as const,
  documents: (specId: string, taskId: string) =>
    [...taskAuthoringKeys.all(specId), taskId, 'documents'] as const,
  projectDocuments: (query: string) => ['docs', 'search', query] as const,
  catalogue: ['task-authoring', 'catalogue'] as const,
};

/**
 * After a Task command: a change of one Task can change what the others may do (dependencies,
 * removal) and the Specification's groups and progress, so every Task projection and detail of
 * the Specification, its workspace and its own projection are refreshed (only the active ones
 * refetch).
 */
export async function invalidateAfterTaskChange(queryClient: QueryClient, specId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: taskAuthoringKeys.all(specId) }),
    queryClient.invalidateQueries({ queryKey: ['specifications', specId, 'task'] }),
    queryClient.invalidateQueries({
      queryKey: taskAuthoringKeys.specificationActions(specId),
      exact: true,
    }),
    invalidateSpecificationWorkspace(queryClient, specId),
  ]);
}
