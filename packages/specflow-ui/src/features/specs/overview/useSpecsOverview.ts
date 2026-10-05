import { useEffect, useState } from 'react';
import { isHttpClientError } from '@nevo/http-client';

import type { SpecsCollection, SpecsOverviewSource, SpecsOverviewState } from './model';

export function useSpecsOverview(source: SpecsOverviewSource, collection: SpecsCollection) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<SpecsOverviewState>({
    collection,
    loading: true,
    refreshing: false,
    error: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    setResult((previous) => {
      const projection =
        previous.projection?.collection === collection ? previous.projection : undefined;
      return {
        collection,
        projection,
        loading: !projection,
        refreshing: Boolean(projection),
        error: false,
      };
    });
    void source
      .read(collection, controller.signal)
      .then((projection) => {
        if (controller.signal.aborted) return;
        if (projection.collection !== collection)
          throw new Error('Specs projection scope mismatch.');
        setResult({ collection, projection, loading: false, refreshing: false, error: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((previous) => ({
          ...previous,
          collection,
          loading: false,
          refreshing: false,
          error: true,
          errorStatus: isHttpClientError(error) ? error.status : undefined,
        }));
      });
    return () => controller.abort();
  }, [source, collection, refreshKey]);

  const state =
    result.collection === collection
      ? result
      : { collection, loading: true, refreshing: false, error: false };
  return { state, refresh: () => setRefreshKey((key) => key + 1) };
}
