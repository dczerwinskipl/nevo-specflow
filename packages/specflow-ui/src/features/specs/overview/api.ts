import type { HttpRequestClient } from '@nevo/http-client';
import type { SpecsOverview } from '@nevo/specflow-contracts/specs/overview';

import type { SpecsCollection } from './model';

/**
 * The Engine verifies Git/worktree state per read and can take longer than the shared 10 s client
 * default on slow machines; give this read an explicit, higher limit.
 */
const overviewReadTimeoutMs = 30_000;

export interface SpecsOverviewApi {
  getOverview(collection: SpecsCollection, signal?: AbortSignal): Promise<SpecsOverview>;
}

export function createRuntimeSpecsOverviewApi(client: HttpRequestClient): SpecsOverviewApi {
  return {
    getOverview: (collection, signal) =>
      client.get<SpecsOverview>('/api/specs/overview', {
        params: { collection },
        signal,
        timeoutMs: overviewReadTimeoutMs,
      }),
  };
}
