import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';
import { useSpecFlowServices } from '../../services';
import type { TaskApi } from './api';
import { taskKeys } from './queries';

export function useSpecificationTask(
  specId: string,
  taskId: string,
  api?: TaskApi,
  enabled = true,
) {
  const services = useSpecFlowServices();
  const activeApi = api ?? services.taskApi;
  const query = useQuery({
    queryKey: taskKeys.detail(specId, taskId),
    queryFn: ({ signal }) => activeApi.getTask(specId, taskId, signal),
    enabled: enabled && Boolean(specId) && Boolean(taskId),
  });
  const errorStatus = isHttpClientError(query.error) ? query.error.status : undefined;
  const isTaskNotFound =
    errorStatus === 404 &&
    isHttpClientError(query.error) &&
    typeof query.error.data === 'object' &&
    query.error.data !== null &&
    'error' in query.error.data &&
    query.error.data.error === 'specification_task_not_found';
  return { ...query, errorStatus, isTaskNotFound };
}
