import type { HttpClient } from '@nevo/http-client';

import type { SpecificationScenario, SpecificationWorkspaceData } from './workspace/model';

export interface SpecificationApi {
  getSpecificationWorkspace(
    specId: string,
    signal?: AbortSignal,
  ): Promise<SpecificationWorkspaceData>;
}

export function createRuntimeSpecificationApi(client: HttpClient): SpecificationApi {
  return {
    getSpecificationWorkspace: (specId, signal) =>
      client.get<SpecificationWorkspaceData>(`/api/specs/${encodeURIComponent(specId)}/workspace`, {
        signal,
      }),
  };
}

export function createFixtureSpecificationApi(
  defaultScenario: SpecificationScenario = 'working',
): SpecificationApi {
  return {
    getSpecificationWorkspace: async (specId, signal) => {
      const { createSpecificationWorkspaceFixture } = await import('./workspace/fixtures');
      signal?.throwIfAborted();
      let scenario = defaultScenario;
      if (specId.includes('empty')) {
        scenario = 'empty';
      } else if (specId.includes('preparing')) {
        scenario = 'preparing';
      } else if (specId.includes('conflict')) {
        scenario = 'git-conflict';
      } else if (specId.includes('no-git')) {
        scenario = 'no-git';
      }
      return createSpecificationWorkspaceFixture(scenario, specId);
    },
  };
}
