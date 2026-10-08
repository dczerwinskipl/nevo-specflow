import type { HttpClient } from '@nevo/http-client';

import type { SpecificationScenario, SpecificationWorkspaceData } from './workspace/model';

export interface SpecificationApi {
  getSpecificationWorkspace(
    specId: string,
    signal?: AbortSignal,
  ): Promise<SpecificationWorkspaceData>;
}

export class SpecificationWorkspaceUnavailableError extends Error {
  readonly integrationState: 'api-needed' | 'unavailable';
  readonly status?: number;

  constructor(
    message: string,
    options?: {
      readonly integrationState?: 'api-needed' | 'unavailable';
      readonly status?: number;
    },
  ) {
    super(message);
    this.name = 'SpecificationWorkspaceUnavailableError';
    this.integrationState = options?.integrationState ?? 'api-needed';
    this.status = options?.status;
  }
}

/**
 * Returns an unavailable SpecificationApi indicating that the backend runtime
 * workspace read-model endpoint (`/api/specs/:specId/workspace`) is not yet implemented.
 * This is the production default until the backend runtime workspace capability is built.
 */
export function createUnavailableSpecificationApi(
  reason = 'Specification workspace read-model needed: endpoint /api/specs/:specId/workspace is not implemented in runtime.',
): SpecificationApi {
  return {
    getSpecificationWorkspace: () =>
      Promise.reject(
        new SpecificationWorkspaceUnavailableError(reason, {
          integrationState: 'api-needed',
        }),
      ),
  };
}

/**
 * Prototype adapter for planned backend runtime endpoint.
 * WARNING: The backend runtime endpoint `/api/specs/:specId/workspace` is not yet implemented
 * and must not be treated as an authoritative runtime contract. Production services compose
 * `createUnavailableSpecificationApi()` by default until the runtime capability is officially delivered.
 */
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
