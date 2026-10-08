import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';

import { defaultQueryClient } from '../../app/queryClient';
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
  readonly isMissingCapability: boolean;
  readonly refetch: () => Promise<unknown>;
}

export function useSpecificationWorkspace(
  specId: string,
  api?: SpecificationApi,
): UseSpecificationWorkspaceResult {
  const services = useSpecFlowServices();
  const activeApi = api ?? services.specificationApi;
  const contextClient = useContext(QueryClientContext);

  const query = useQuery(
    {
      queryKey: specificationKeys.detail(specId),
      queryFn: ({ signal }) => activeApi.getSpecificationWorkspace(specId, signal),
      enabled: Boolean(specId),
    },
    contextClient ?? defaultQueryClient,
  );

  const isMissingCapability = Boolean(
    query.error &&
    typeof query.error === 'object' &&
    'integrationState' in query.error &&
    (query.error as { integrationState?: unknown }).integrationState === 'api-needed',
  );

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
    isMissingCapability,
    refetch: query.refetch,
  };
}
