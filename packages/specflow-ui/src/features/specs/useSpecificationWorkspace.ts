import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';

import { useSpecFlowServices } from '../../services';
import type { SpecificationApi } from './api';
import { specificationKeys } from './queries';
import type { SpecificationWorkspaceData } from './workspace/model';
import { mapWorkspaceResponse } from './workspace/mapWorkspaceResponse';

export interface UseSpecificationWorkspaceResult {
  readonly data: SpecificationWorkspaceData | undefined;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly isRefetching: boolean;
  readonly isError: boolean;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: unknown;
  readonly errorStatus: number | undefined;
  readonly isDomainNotFound: boolean;
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
    queryFn: async ({ signal }) =>
      mapWorkspaceResponse(await activeApi.getSpecificationWorkspace(specId, signal)),
    enabled: Boolean(specId),
  });

  const isDomainNotFound =
    isHttpClientError(query.error) &&
    query.error.status === 404 &&
    typeof query.error.data === 'object' &&
    query.error.data !== null &&
    'error' in query.error.data &&
    query.error.data.error === 'specification_not_found';

  const errorStatus =
    query.error && isHttpClientError(query.error)
      ? query.error.status
      : query.error &&
          typeof query.error === 'object' &&
          'status' in query.error &&
          typeof (query.error as { status?: unknown }).status === 'number'
        ? (query.error as { status: number }).status
        : undefined;

  return {
    data: query.data,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isRefetching: query.isRefetching,
    isError: query.isError,
    status: query.status,
    error: query.error,
    errorStatus,
    isDomainNotFound,
    refetch: query.refetch,
  };
}
