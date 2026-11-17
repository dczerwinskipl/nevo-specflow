import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { taskKeys } from '../queries';
import type { TaskListState } from './TasksPage';
import { taskListViewOf } from './taskListModel';

/**
 * The Tasks page's data: the Runtime's Tasks page read (`blocking` resolved by the Runtime when
 * read, so a stale link never shows stale Tasks). A refresh after any Task change re-reads it (the
 * Task commands invalidate `taskKeys.lists`).
 */
export function useTaskListState(specId: string, blocking: boolean): TaskListState {
  const { taskApi } = useAppServices();
  const query = useQuery({
    queryKey: taskKeys.list(specId, blocking ? 'specification' : undefined),
    queryFn: ({ signal }) =>
      taskApi.getTaskList(specId, blocking ? { blocking: 'specification' } : {}, signal),
    select: taskListViewOf,
  });

  if (query.data) {
    return { status: 'ready', view: query.data };
  }

  return query.isError
    ? { status: 'failed', retry: () => void query.refetch() }
    : { status: 'loading' };
}
