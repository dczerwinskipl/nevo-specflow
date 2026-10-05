import type { SpecsOverviewSource } from './model';
import { createHttpClient, type HttpClient } from '@nevo/http-client';
import type { SpecsOverviewProjection } from '@nevo/specflow-contracts/specs-overview';

// Kept as an explicit unavailable source for integration fixtures.
export const unavailableSpecsSource: SpecsOverviewSource = {
  read: () => Promise.reject(new Error('Specs overview projection is not configured.')),
};

export function defaultSpecsSource(): SpecsOverviewSource {
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
  return createRuntimeSpecsSource();
}

export function createRuntimeSpecsSource(
  client: HttpClient = createHttpClient(),
): SpecsOverviewSource {
  return {
    read: (collection, signal) =>
      client.get<SpecsOverviewProjection>('/api/specs/overview', {
        params: { collection },
        signal,
      }),
  };
}
