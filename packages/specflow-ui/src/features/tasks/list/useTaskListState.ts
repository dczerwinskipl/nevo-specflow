import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import type { SpecificationWorkspaceData } from '../../specs/read-model';
import { taskKeys } from '../queries';
import type { TaskListState } from './TasksPage';
import { taskListViewOf, taskListViewOfWorkspace } from './taskListModel';

/**
 * The Tasks page's data. A project Runtime answers the Tasks page read (`blocking` resolved by the
 * Runtime when read, so a stale link never shows stale Tasks); the demo Runtime has none and its
 * workspace read carries the same grouping. A refresh after any Task change re-reads it (the Task
 * commands invalidate `taskKeys.lists`).
 */
export function useTaskListState(
  specId: string,
  blocking: boolean,
  source:
    | { readonly kind: 'project' }
    | { readonly kind: 'workspace'; readonly data?: SpecificationWorkspaceData },
): TaskListState {
  const { taskApi } = useAppServices();
  const project = source.kind === 'project' && taskApi.getTaskList !== undefined;
  const query = useQuery({
    queryKey: taskKeys.list(specId, blocking ? 'specification' : undefined),
    queryFn: ({ signal }) =>
      taskApi.getTaskList!(specId, blocking ? { blocking: 'specification' } : {}, signal),
    enabled: project,
    select: taskListViewOf,
  });

  if (source.kind === 'workspace') {
    return source.data
      ? { status: 'ready', view: taskListViewOfWorkspace(source.data, blocking) }
      : { status: 'loading' };
  }

  if (query.data) {
    return { status: 'ready', view: query.data };
  }

  return query.isError
    ? { status: 'failed', retry: () => void query.refetch() }
    : { status: 'loading' };
}
