import { useQuery } from '@tanstack/react-query';
import type { TaskListQuery } from '@nevo/specflow-contracts/specs/workspace';
import { useAppServices } from '../../../app/useAppServices';
import { taskKeys } from '../queries';
import type { TaskListState } from './TasksPage';
import { taskListViewOf } from './taskListModel';

/**
 * The Tasks page's data: the Runtime's Tasks page read with its one filter (`blocking` or `group`,
 * resolved by the Runtime when read, so a stale link never shows stale Tasks). A refresh after any
 * Task change re-reads it (the Task commands invalidate `taskKeys.lists`).
 */
export function useTaskListState(specId: string, query: TaskListQuery): TaskListState {
  const { taskApi } = useAppServices();
  const result = useQuery({
    queryKey: taskKeys.list(specId, query),
    queryFn: ({ signal }) => taskApi.getTaskList(specId, query, signal),
    select: taskListViewOf,
  });

  if (result.data) {
    return { status: 'ready', view: result.data };
  }

  return result.isError
    ? { status: 'failed', retry: () => void result.refetch() }
    : { status: 'loading' };
}
