import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';

import { useRouter } from '@tanstack/react-router';
import type { SpecFlowAppServices } from '../../../services';
import type { SpecificationApi } from './api';
import { specificationKeys } from './queries';
import { asApiError } from '../../../api';
import { getHttpErrorStatus } from '../../../shared/http/httpErrorStatus';
import type { SpecificationWorkspaceData } from './model';
import { mapWorkspaceResponse } from './mapWorkspaceResponse';

export interface UseSpecificationWorkspaceResult {
  readonly data: SpecificationWorkspaceData | undefined;
  readonly isLoading: boolean;
  readonly fetchStatus?: 'fetching' | 'paused' | 'idle';
  readonly isPending: boolean;
  readonly isRefetching: boolean;
  readonly isError: boolean;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: unknown;
  readonly errorStatus: number | undefined;
  readonly isDomainNotFound: boolean;
  /** The Runtime has no source for this read at all (permanent; retrying cannot help). */
  readonly isNotInRuntime: boolean;
  readonly refetch: () => Promise<unknown>;
}

export function useSpecificationWorkspace(
  specId: string,
  api?: SpecificationApi,
): UseSpecificationWorkspaceResult {
  // Services are resolved lazily inside the query function, so observers that are disabled
  // (no matched Specification) or rendered outside a routed context never need them.
  const router = useRouter({ warn: false });

  const query = useQuery({
    queryKey: specificationKeys.detail(specId),
    queryFn: async ({ signal }) =>
      mapWorkspaceResponse(
        await (api ?? requireServices(router).specificationApi).getSpecificationWorkspace(
          specId,
          signal,
        ),
      ),
    enabled: Boolean(specId),
  });

  const isDomainNotFound =
    isHttpClientError(query.error) &&
    query.error.status === 404 &&
    typeof query.error.data === 'object' &&
    query.error.data !== null &&
    'error' in query.error.data &&
    query.error.data.error === 'specification_not_found';

  const errorStatus = getHttpErrorStatus(query.error);
  const isNotInRuntime =
    asApiError(query.error, { operation: 'specs.workspace', method: 'GET' })?.reason ===
    'not-in-runtime';

  return {
    data: query.data,
    isLoading: query.isLoading,
    fetchStatus: query.fetchStatus,
    isPending: query.isPending,
    isRefetching: query.isRefetching,
    isError: query.isError,
    status: query.status,
    error: query.error,
    errorStatus,
    isDomainNotFound,
    isNotInRuntime,
    refetch: query.refetch,
  };
}

function requireServices(router: ReturnType<typeof useRouter> | undefined): SpecFlowAppServices {
  const services = (
    router?.options.context as { readonly services?: SpecFlowAppServices } | undefined
  )?.services;
  if (!services) throw new Error('useSpecificationWorkspace requires the SpecFlow Router context');
  return services;
}
