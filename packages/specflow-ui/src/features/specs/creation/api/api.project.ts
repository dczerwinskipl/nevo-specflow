import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import type {
  CreateOperationAccepted,
  CreateOperationInspection,
  CreateOptions,
  CreateSpecRequest,
  CreatedSpec,
} from '@nevo/specflow-contracts/specs';
import type { ApiTransport } from '../../../../api';

/**
 * Create asks the Engine to prepare a Git worktree, which takes seconds to minutes and has no server
 * time limit. The UI asks for async mode (`Prefer: respond-async`), so the answer is a quick 202 and
 * the operation is watched; this hard limit bounds how long one browser attempt waits, both for a
 * synchronous answer of an older Runtime and for the watching of an accepted operation.
 */
export const createOperationHardLimitMs = 10 * 60 * 1000;

/** RFC 7240 request header that makes the Runtime answer 202 and continue the work detached. */
export const respondAsyncHeaders = { Prefer: 'respond-async' } as const;

/** Create options inspect Git state per request; allow more than the shared 10 s client default. */
const createOptionsTimeoutMs = 30_000;

/**
 * What the project Create form sends: the contract request (`CreateSpecRequest`) with the archetype
 * selection (archetype, version, catalogue revision and the ticked optional templates). Adding own
 * files or folders at Create is not offered, so those fields are never sent.
 */
export type ProjectCreateRequest = Omit<CreateSpecRequest, 'addedDocuments' | 'folders'>;

/** Port of the project Runtime Specification creation (the contracts `specs` context). */
export interface ProjectCreationApi {
  createOptions(signal?: AbortSignal): Promise<CreateOptions>;
  /**
   * The archetype catalogue (`GET /api/specs/archetypes`), the same `ArchetypeCatalogue` the demo
   * embeds in its creation catalogue; the Create form chooses the archetype from it.
   */
  archetypes(signal?: AbortSignal): Promise<ArchetypeCatalogue>;
  /**
   * Sends the request asking for async mode. The Runtime answers 202 (`CreateOperationAccepted`: the
   * work continues detached, watch the operation) or, when it does not know the preference, the
   * synchronous 201 `CreatedSpec`.
   */
  create(
    input: ProjectCreateRequest,
    signal?: AbortSignal,
  ): Promise<CreatedSpec | CreateOperationAccepted>;
  inspectOperation(operationId: string, signal?: AbortSignal): Promise<CreateOperationInspection>;
  /** URL of the live progress stream (SSE) of one Create operation, next to its inspection route. */
  operationEventsUrl(operationId: string): string;
}

const operationPath = (operationId: string) =>
  `/api/specs/create/operations/${encodeURIComponent(operationId)}`;

/** Route of the Create progress stream; owned by the Create feature, not by `shared/operations`. */
export const createOperationEventsUrl = (operationId: string) =>
  `${operationPath(operationId)}/events`;

export const projectCreationKeys = {
  createOptions: ['specs', 'create', 'options'] as const,
  archetypes: ['specs', 'create', 'archetypes'] as const,
};

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

export function createProjectCreationApi(api: ApiTransport): ProjectCreationApi {
  return {
    createOptions: (signal) =>
      api.get<CreateOptions>('/api/specs/create-options', {
        operation: 'specs.create.options',
        signal,
        timeoutMs: createOptionsTimeoutMs,
        isValid: (data) => isObject(data) && Array.isArray(data.workspaces),
      }),
    archetypes: (signal) =>
      api.get<ArchetypeCatalogue>('/api/specs/archetypes', {
        operation: 'specs.create.archetypes',
        signal,
        isValid: (data) =>
          isObject(data) && typeof data.revision === 'string' && Array.isArray(data.archetypes),
      }),
    create: (input, signal) =>
      api.post<CreatedSpec | CreateOperationAccepted, ProjectCreateRequest>('/api/specs', input, {
        operation: 'specs.create',
        signal,
        timeoutMs: createOperationHardLimitMs,
        headers: respondAsyncHeaders,
        // 201 carries the result, 202 only the accepted operation (told apart by their shape).
        isValid: (data) =>
          isObject(data) &&
          (typeof data.specId === 'string' ||
            (data.status === 'in-progress' && typeof data.operationId === 'string')),
      }),
    inspectOperation: (operationId, signal) =>
      api.get<CreateOperationInspection>(operationPath(operationId), {
        operation: 'specs.create.inspect',
        signal,
        isValid: (data) => isObject(data) && typeof data.status === 'string',
      }),
    operationEventsUrl: createOperationEventsUrl,
  };
}
