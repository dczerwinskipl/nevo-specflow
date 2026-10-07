import type { HttpClient } from '@nevo/http-client';
import type { SpecsOverview } from '@nevo/specflow-contracts/specs/overview';

import type { SpecsOverviewSource } from './model';

// Kept as an explicit unavailable source for integration fixtures.
export const unavailableSpecsSource: SpecsOverviewSource = {
  read: () => Promise.reject(new Error('Specs overview projection is not configured.')),
};

export function defaultSpecsSource(client: HttpClient): SpecsOverviewSource {
  if (import.meta.env.DEV && import.meta.env.VITE_SPECFLOW_SAMPLE_DATA === 'true') {
    return {
      sample: true,
      read: async (collection, signal) => {
        const { createSpecsFixture } = await import('./fixtures');
        signal.throwIfAborted();
        return createSpecsFixture(collection);
      },
    };
  }

  return createRuntimeSpecsSource(client);
}

export function createRuntimeSpecsSource(client: HttpClient): SpecsOverviewSource {
  return {
    read: (collection, signal) =>
      client.get<SpecsOverview>('/api/specs/overview', {
        params: { collection },
        signal,
      }),
  };
}
