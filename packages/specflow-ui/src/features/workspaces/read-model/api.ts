import type { WorkspaceList } from '@nevo/specflow-contracts/workspaces';
import type { ApiTransport } from '../../../api';

/** Operation name of the read (error classification, diagnostics). */
export const workspacesReadOperation = 'workspaces.read';

/** Port of `GET /api/workspaces`: the same route in the project Runtime and in the demo Runtime. */
export interface WorkspaceApi {
  list(signal?: AbortSignal): Promise<WorkspaceList>;
}

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

export function createRuntimeWorkspaceApi(api: ApiTransport): WorkspaceApi {
  return {
    list: (signal) =>
      api.get<WorkspaceList>('/api/workspaces', {
        operation: workspacesReadOperation,
        signal,
        isValid: (data) =>
          isObject(data) &&
          typeof data.projectFolderId === 'string' &&
          Array.isArray(data.workspaces),
      }),
  };
}
