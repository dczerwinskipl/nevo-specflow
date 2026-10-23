import type { SpecsOverview } from '@nevo/specflow-contracts/specs/overview';

import type { ApiTransport } from '../../../../api';
import type { SpecsCollection } from '../model';

/**
 * The Engine verifies Git/worktree state per read and can take longer than the shared 10 s client
 * default on slow machines; give this read an explicit, higher limit.
 */
const overviewReadTimeoutMs = 30_000;

/** Operation name of the read (error classification, diagnostics). */
export const specsOverviewOperation = 'specs.overview';

export interface SpecsOverviewApi {
  getOverview(collection: SpecsCollection, signal?: AbortSignal): Promise<SpecsOverview>;
}

export function createRuntimeSpecsOverviewApi(api: ApiTransport): SpecsOverviewApi {
  return {
    getOverview: (collection, signal) =>
      api.get<SpecsOverview>('/api/specs/overview', {
        operation: specsOverviewOperation,
        params: { collection },
        signal,
        timeoutMs: overviewReadTimeoutMs,
      }),
  };
}
