import { isHttpClientError, type HttpRequestClient } from '@nevo/http-client';
import {
  type ArchetypeCatalogue,
  type CreateDocumentsInput,
  type DocumentOperationInput,
  type DocumentOperationResult,
  type DocumentTree,
  type SaveInput,
  type SaveResult,
} from '@nevo/specflow-contracts/documents';
import { ApiError, readServerCode, type ApiTransport } from '../../api';
import { isArchetypeCatalogue } from '../../shared/http/isArchetypeCatalogue';
import { documentTreePath, type CreateFolderInput, type DocumentsApi } from './api';

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

const specPath = (specId: string) => `/api/specs/${encodeURIComponent(specId)}`;

/**
 * A write route this Runtime does not serve (no route: a `404` without any code, or `405`):
 * a definite refusal, nothing was applied. It reads as the `not-implemented` refusal the tree
 * reports for every write action of a Runtime without the write routes; never as an unknown
 * outcome, so it never locks the tree.
 */
function routeMissing(error: unknown, operation: string): ApiError | undefined {
  if (!isHttpClientError(error) || error.kind !== 'http') return undefined;
  const code = readServerCode(error.data);
  // A 404 that names any code (`DOCUMENT_NOT_FOUND`, `specification_not_found`) is an answer of
  // the route; only a bare 404 (Fastify's "Route … not found", an HTML page) means no route.
  const missing = error.status === 405 || (error.status === 404 && code === undefined);
  return missing
    ? new ApiError({
        kind: 'unavailable',
        operation,
        outcome: 'not-applied',
        retryable: false,
        status: error.status,
        code: 'not-implemented',
        reason: 'not-in-runtime',
        cause: error,
      })
    : undefined;
}

/** Sends a write; every other failure reaches the caller exactly as the demo adapter's do. */
async function write<T>(operation: string, send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    throw routeMissing(error, operation) ?? error;
  }
}

/**
 * Project-runtime adapter of {@link DocumentsApi}, the only module that knows the project routes:
 * the real tree and catalogue reads (classified, shape-checked) and the D4 writes of
 * `docs/reference/api/specification-documents.md`, in the contract's shapes, each carrying its
 * `operationId` (idempotency key). Writes go through the same client as the demo adapter's, so a
 * refusal reaches the UI in the same form in both modes.
 *
 * Until a Runtime serves the writes, its tree reports every write action and capability as
 * unavailable (`not-implemented`) and the UI offers none of them; a write that still reaches a
 * Runtime without the route is the definite `not-implemented` refusal above.
 */
export function createProjectDocumentsApi(
  api: ApiTransport,
  http: HttpRequestClient,
): DocumentsApi {
  return {
    emulated: false,
    documentTree: (specId, signal) =>
      api.get<DocumentTree>(documentTreePath(specId), {
        operation: 'documents.tree',
        signal,
        isValid: (data) => isObject(data) && Array.isArray(data.documents),
      }),
    catalogue: (signal) =>
      api.get<ArchetypeCatalogue>('/api/specs/archetypes', {
        operation: 'documents.catalogue',
        signal,
        // The same check as Create's read of this route: both fill one cache entry.
        isValid: isArchetypeCatalogue,
      }),
    save: (specId, documentId, input: SaveInput) =>
      write('documents.save', () =>
        http.put<SaveResult>(
          `${specPath(specId)}/documents/${encodeURIComponent(documentId)}`,
          input,
        ),
      ),
    addDocuments: (specId, input: CreateDocumentsInput) =>
      write('documents.create', () =>
        http.post<DocumentOperationResult>(`${specPath(specId)}/documents`, input),
      ),
    // The contract names the route but no body; the body is the demo's (`operationId`, `path`).
    addFolder: (specId, input: CreateFolderInput) =>
      write('documents.create-folder', () =>
        http.post<DocumentOperationResult>(`${specPath(specId)}/folders`, input),
      ),
    operateDocument: (specId, input: DocumentOperationInput) =>
      write('documents.operate', () =>
        http.post<DocumentOperationResult>(`${specPath(specId)}/document-operations`, input),
      ),
  };
}
