import { isHttpClientError } from '@nevo/http-client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskSnapshot } from '@nevo/specflow-contracts/specs/workspace';
import { useAppServices } from '../../../app/useAppServices';
import { taskKeys } from '../queries';

export function useTaskHistory(specId: string, taskId: string, snapshot?: TaskSnapshot) {
  const { taskApi } = useAppServices();
  const client = useQueryClient();
  const section = snapshot?.sections.history;
  const token = section?.state === 'available' ? section.data.token : undefined;
  const query = useInfiniteQuery({
    queryKey: [...taskKeys.detail(specId, taskId), 'history', snapshot?.revision, token],
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(token && typeof taskApi.getHistory === 'function'),
    queryFn: ({ pageParam, signal }) => {
      if (!taskApi.getHistory || !token) {
        throw new Error('Task history reader unavailable');
      }

      return taskApi.getHistory(specId, taskId, token, pageParam, signal);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const retryPage = async () => {
    if (isHttpClientError(query.error) && query.error.status === 409) {
      await client.invalidateQueries({ queryKey: taskKeys.detail(specId, taskId), exact: true });
    } else {
      await query.fetchNextPage();
    }
  };

  return {
    ...query,
    retryPage,
    accessDenied: isHttpClientError(query.error) && query.error.status === 403,
    readerAvailable: typeof taskApi.getHistory === 'function',
  };
}
