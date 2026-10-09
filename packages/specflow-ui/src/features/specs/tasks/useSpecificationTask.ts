import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';
import { useSpecFlowServices } from '../../../services';
import type { SpecificationApi } from '../api';
import { specificationKeys } from '../queries';

export function useSpecificationTask(
  specId: string,
  taskId: string,
  api?: SpecificationApi,
  enabled = true,
) {
  const services = useSpecFlowServices();
  const activeApi = api ?? services.specificationApi;
  const query = useQuery({
    queryKey: specificationKeys.task(specId, taskId),
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
