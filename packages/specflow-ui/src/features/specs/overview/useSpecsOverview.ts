import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';

import type { SpecsOverview } from '@nevo/specflow-contracts/specs/overview';
import type { SpecsCollection, SpecsOverviewSource, SpecsOverviewState } from './model';
import type { SpecsOverviewApi } from './api';
import { specsOverviewKeys } from './queries';

export function useSpecsOverview(
  source: SpecsOverviewSource | SpecsOverviewApi,
  collection: SpecsCollection,
) {
  const query = useQuery({
    queryKey: specsOverviewKeys.collection(collection),
    queryFn: async ({ signal }): Promise<SpecsOverview> => {
      let projection: SpecsOverview;
      if ('getOverview' in source) {
        projection = await source.getOverview(collection, signal);
      } else {
        projection = await source.read(collection, signal);
      }
      if (projection.collection !== collection) {
        throw new Error('Specs projection scope mismatch.');
      }
      return projection;
    },
  });

  const state: SpecsOverviewState = {
    collection,
    projection: query.data?.collection === collection ? query.data : undefined,
    loading: query.isLoading,
    refreshing: query.isRefetching,
    error: query.isError,
    errorStatus: query.error && isHttpClientError(query.error) ? query.error.status : undefined,
  };

  return {
    state,
    refresh: () => {
      void query.refetch();
    },
  };
}
