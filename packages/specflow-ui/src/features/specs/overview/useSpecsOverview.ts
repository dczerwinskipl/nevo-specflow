import { useQuery } from '@tanstack/react-query';
import { asApiError } from '../../../api';

import type { SpecsCollection, SpecsOverviewState } from './model';
import { specsOverviewOperation, type SpecsOverviewApi } from './api';
import { specsOverviewQueryOptions } from './queries';

export function useSpecsOverview(api: SpecsOverviewApi, collection: SpecsCollection) {
  const query = useQuery(specsOverviewQueryOptions(api, collection));
  const failure = asApiError(query.error, { operation: specsOverviewOperation, method: 'GET' });
  // The whole Specs area is denied or unknown to this session: nothing cached may stay on screen.
  const denied =
    failure?.kind === 'forbidden' || failure?.kind === 'unauthenticated' || failure?.status === 404;

  const state: SpecsOverviewState = {
    collection,
    projection:
      query.data?.collection === collection && !(query.isError && denied) ? query.data : undefined,
    loading: query.isLoading && !query.data,
    paused: query.isPending && query.fetchStatus === 'paused',
    refreshing: query.isRefetching,
    error: query.isError,
    accessDenied: failure?.kind === 'forbidden',
  };

  return {
    state,
    refresh: () => {
      void query.refetch();
    },
  };
}
