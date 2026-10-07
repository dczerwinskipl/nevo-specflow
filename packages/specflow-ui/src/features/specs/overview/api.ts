import type { HttpClient } from '@nevo/http-client';
import type { SpecsOverview } from '@nevo/specflow-contracts/specs/overview';

import type { SpecsCollection } from './model';

export interface SpecsOverviewApi {
  readonly sample?: boolean;
  getOverview(collection: SpecsCollection, signal?: AbortSignal): Promise<SpecsOverview>;
}

export function createRuntimeSpecsOverviewApi(client: HttpClient): SpecsOverviewApi {
  return {
    getOverview: (collection, signal) =>
      client.get<SpecsOverview>('/api/specs/overview', {
        params: { collection },
        signal,
      }),
  };
}

export function createFixtureSpecsOverviewApi(): SpecsOverviewApi {
  return {
    sample: true,
    getOverview: async (collection, signal) => {
      const { createSpecsFixture } = await import('./fixtures');
      signal?.throwIfAborted();
      return createSpecsFixture(collection);
    },
  };
}
