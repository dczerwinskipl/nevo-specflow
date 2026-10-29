import type { HttpRequestClient } from '@nevo/http-client';
import type {
  ArchetypeCatalogue,
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
    emulated: true,
    documentTree: (id, signal) => http.get<DocumentTree>(documentTreePath(id), { signal }),
    // The demo catalogue (a superset of the real `ArchetypeCatalogue`): its specifications were
    // created from it, including the demo-only owner archetype.
    catalogue: (signal) =>
      http.get<ArchetypeCatalogue>('/api/demo/specification-creation', { signal }),
    operateDocument: (id, input) =>
      http.post<DocumentOperationResult>(`${spec(id)}/document-operations`, input),
    addDocuments: (id, input) => http.post<DocumentOperationResult>(`${spec(id)}/documents`, input),
    addFolder: (id, input) => http.post<DocumentOperationResult>(`${spec(id)}/folders`, input),
    save: (id, document, input) =>
      http.put<SaveResult>(`${spec(id)}/documents/${encodeURIComponent(document)}`, input),
  };
}
