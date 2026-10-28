import type { HttpRequestClient } from '@nevo/http-client';
import {
  type ArchetypeCatalogue,
  type CreateDocumentsInput,
  type DocumentOperationInput,
  type DocumentOperationResult,
  type DocumentTree,
  type SaveInput,
  type SaveResult,
} from '@nevo/specflow-contracts/documents';
import type { ApiTransport } from '../../api';
import { isArchetypeCatalogue } from '../../shared/http/isArchetypeCatalogue';
import { documentTreePath, type CreateFolderInput, type DocumentsApi } from './api';

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

const specPath = (specId: string) => `/api/specs/${encodeURIComponent(specId)}`;

/**
 * Project-runtime adapter of {@link DocumentsApi}, the only module that knows the project routes:
 * the real tree and catalogue reads (classified, shape-checked) and the writes of
 * `docs/reference/api/specification-documents.md` in the contract's shapes. Each write carries its
 * `operationId` (idempotency key): fresh for every user action, the same only when the same request
 * is retried after an unanswered attempt. Writes go through the same client as the demo adapter's,
 * so a refusal reaches the UI in the same form in both modes. A write is acknowledged once it is on
 * disk; its `commit` is the Engine's and is not shown yet.
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
      http.put<SaveResult>(
        `${specPath(specId)}/documents/${encodeURIComponent(documentId)}`,
        input,
      ),
    addDocuments: (specId, input: CreateDocumentsInput) =>
      http.post<DocumentOperationResult>(`${specPath(specId)}/documents`, input),
    addFolder: (specId, input: CreateFolderInput) =>
      http.post<DocumentOperationResult>(`${specPath(specId)}/folders`, input),
    operateDocument: (specId, input: DocumentOperationInput) =>
      http.post<DocumentOperationResult>(`${specPath(specId)}/document-operations`, input),
  };
}
