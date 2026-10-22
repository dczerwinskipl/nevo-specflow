import type { ApiTransport } from '../../../api';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';

/** Operation name of the read (error classification, diagnostics). */
export const specsWorkspaceOperation = 'specs.workspace';

export interface SpecificationApi {
  getSpecificationWorkspace(
    specId: string,
    signal?: AbortSignal,
  ): Promise<SpecificationWorkspaceResponse>;
}

export function createRuntimeSpecificationApi(api: ApiTransport): SpecificationApi {
  const base = (specId: string) => '/api/specs/' + encodeURIComponent(specId);
  return {
    getSpecificationWorkspace: (specId, signal) =>
      api.get<SpecificationWorkspaceResponse>(base(specId) + '/workspace', {
        operation: specsWorkspaceOperation,
        signal,
      }),
  };
}
