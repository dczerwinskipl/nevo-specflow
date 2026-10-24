import type { HttpRequestClient } from '@nevo/http-client';
import type {
  DocumentOperationResult,
  DocumentTree,
  SaveResult,
} from '@nevo/specflow-contracts/documents';
import { documentTreePath, type DocumentsApi } from './api';

/**
 * Demo-runtime adapter of {@link DocumentsApi}. The tree is the real route (served from the demo
 * data); the writes, which the project Runtime does not serve yet, are the demo emulation under
 * `/api/demo/specs/...` with the contract's shapes.
 */
export function createDemoDocumentsApi(http: HttpRequestClient): DocumentsApi {
  const spec = (id: string) => `/api/demo/specs/${encodeURIComponent(id)}`;
  return {
    documentTree: (id, signal) => http.get<DocumentTree>(documentTreePath(id), { signal }),
    operateDocument: (id, input) =>
      http.post<DocumentOperationResult>(`${spec(id)}/document-operations`, input),
    addDocuments: (id, input) => http.post<DocumentOperationResult>(`${spec(id)}/documents`, input),
    addFolder: (id, input) => http.post<DocumentOperationResult>(`${spec(id)}/folders`, input),
    save: (id, document, input) =>
      http.put<SaveResult>(`${spec(id)}/documents/${encodeURIComponent(document)}`, input),
  };
}
