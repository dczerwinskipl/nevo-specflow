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

export function defaultSpecsSource(
  clientOrApi?: HttpClient | SpecsOverviewApi,
): SpecsOverviewSource {
  if (clientOrApi && 'getOverview' in clientOrApi) {
    return {
      sample: clientOrApi.sample,
      read: (collection, signal) => clientOrApi.getOverview(collection, signal),
    };
  }

  if (import.meta.env.DEV && import.meta.env.VITE_SPECFLOW_SAMPLE_DATA === 'true') {
    const fixtureApi = createFixtureSpecsOverviewApi();
    return {
      sample: true,
      read: (collection, signal) => fixtureApi.getOverview(collection, signal),
    };
  }

  if (clientOrApi) {
    return createRuntimeSpecsSource(clientOrApi);
  }

  return {
    read: async (collection, signal) => {
      const { createHttpClient } = await import('@nevo/http-client');
      return createRuntimeSpecsSource(createHttpClient()).read(collection, signal);
    },
  };
}

export function createRuntimeSpecsSource(client: HttpClient): SpecsOverviewSource {
  const api = createRuntimeSpecsOverviewApi(client);
  return {
    read: (collection, signal) => api.getOverview(collection, signal),
  };
}
