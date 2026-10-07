import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';

import { useSpecFlowServices } from '../../services';
import type { SpecificationApi } from './api';
import { specificationKeys } from './queries';
import type { SpecificationWorkspaceData } from './workspace/model';

export interface UseSpecificationWorkspaceResult {
  readonly data: SpecificationWorkspaceData | undefined;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly isRefetching: boolean;
  readonly isError: boolean;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: unknown;
  readonly errorStatus: number | undefined;
  readonly refetch: () => Promise<unknown>;
}

export function useSpecificationWorkspace(
  specId: string,
  api?: SpecificationApi,
): UseSpecificationWorkspaceResult {
  const services = useSpecFlowServices();
  const activeApi = api ?? services.specificationApi;

  const query = useQuery({
    queryKey: specificationKeys.detail(specId),
    queryFn: ({ signal }) => activeApi.getSpecificationWorkspace(specId, signal),
    enabled: Boolean(specId),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isRefetching: query.isRefetching,
    isError: query.isError,
    status: query.status,
    error: query.error,
    errorStatus: query.error && isHttpClientError(query.error) ? query.error.status : undefined,
    refetch: query.refetch,
  };
}
