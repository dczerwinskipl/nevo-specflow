import type {
  CreateOperationInspection,
  CreateOptions,
  CreateSpecRequest,
  CreatedSpec,
} from '@nevo/specflow-contracts/specs';
import type { ApiTransport } from '../../../api';

/**
 * Create asks the Engine to prepare a Git worktree, which takes seconds to minutes and has no server
 * time limit. The request is therefore NOT abandoned when the UI starts watching the operation
 * (soft deadline); this hard limit only bounds how long one browser attempt waits.
 */
export const createOperationHardLimitMs = 10 * 60 * 1000;

/** After this long without an answer the UI shows the operation as running and watches it. */
export const createSoftDeadlineMs = 15_000;

/** Port of the project Runtime Specification creation (the contracts `specs` context). */
export interface ProjectCreationApi {
  createOptions(signal?: AbortSignal): Promise<CreateOptions>;
  create(input: CreateSpecRequest, signal?: AbortSignal): Promise<CreatedSpec>;
  inspectOperation(operationId: string, signal?: AbortSignal): Promise<CreateOperationInspection>;
}

export const projectCreationKeys = {
  createOptions: ['specs', 'create', 'options'] as const,
};

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

export function createProjectCreationApi(api: ApiTransport): ProjectCreationApi {
  return {
    createOptions: (signal) =>
      api.get<CreateOptions>('/api/specs/create-options', {
        operation: 'specs.create.options',
        signal,
        isValid: (data) => isObject(data) && Array.isArray(data.workspaces),
      }),
    create: (input, signal) =>
      api.post<CreatedSpec, CreateSpecRequest>('/api/specs', input, {
        operation: 'specs.create',
        signal,
        timeoutMs: createOperationHardLimitMs,
        isValid: (data) => isObject(data) && typeof data.specId === 'string',
      }),
    inspectOperation: (operationId, signal) =>
      api.get<CreateOperationInspection>(
        `/api/specs/create/operations/${encodeURIComponent(operationId)}`,
        {
          operation: 'specs.create.inspect',
          signal,
          isValid: (data) => isObject(data) && typeof data.status === 'string',
        },
      ),
  };
}
