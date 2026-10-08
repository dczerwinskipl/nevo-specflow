import type { HttpClient } from '@nevo/http-client';

import type { SpecsOverviewSource } from './model';
import {
  createFixtureSpecsOverviewApi,
  createRuntimeSpecsOverviewApi,
  type SpecsOverviewApi,
} from './api';

export type { SpecsOverviewApi };

// Kept as an explicit unavailable source for integration fixtures.
export const unavailableSpecsSource: SpecsOverviewSource = {
  read: () => Promise.reject(new Error('Specs overview projection is not configured.')),
};

export function createSpecsSourceFromApi(api: SpecsOverviewApi): SpecsOverviewSource {
  return {
    sample: api.sample,
    read: (collection, signal) => api.getOverview(collection, signal),
  };
}

export function defaultSpecsSource(
  clientOrApi: HttpClient | SpecsOverviewApi,
): SpecsOverviewSource {
  if ('getOverview' in clientOrApi) {
    return createSpecsSourceFromApi(clientOrApi);
  }

  if (import.meta.env.DEV && import.meta.env.VITE_SPECFLOW_SAMPLE_DATA === 'true') {
    const fixtureApi = createFixtureSpecsOverviewApi();
    return createSpecsSourceFromApi(fixtureApi);
  }

  return createRuntimeSpecsSource(clientOrApi);
}

export function createRuntimeSpecsSource(client: HttpClient): SpecsOverviewSource {
  const api = createRuntimeSpecsOverviewApi(client);
  return {
    read: (collection, signal) => api.getOverview(collection, signal),
  };
}
