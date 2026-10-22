import type { HttpRequestClient } from '@nevo/http-client';
import type {
  DemoDocumentTree,
  DemoDocumentOperationInput,
  DemoDocumentOperationResult,
  DemoDocumentsInput,
  DemoDocumentsResult,
  DemoFolderInput,
  DemoSaveInput,
} from '@nevo/specflow-contracts/demo';
import type { DocumentsApi } from './api';

/** Demo-runtime adapter of {@link DocumentsApi}; a real adapter can sit beside it. */
export function createDemoDocumentsApi(http: HttpRequestClient): DocumentsApi {
  const spec = (id: string) => `/api/demo/specs/${encodeURIComponent(id)}`;
  return {
    documentTree: (id, signal) =>
      http.get<DemoDocumentTree>(`${spec(id)}/document-tree`, { signal }),
    operateDocument: (id, input: DemoDocumentOperationInput) =>
      http.post<DemoDocumentOperationResult>(`${spec(id)}/document-operations`, input),
    addDocuments: (id, input: DemoDocumentsInput) =>
      http.post<DemoDocumentsResult>(`${spec(id)}/documents`, input),
    addFolder: (id, input: DemoFolderInput) =>
      http.post<{ folders: string[] }>(`${spec(id)}/folders`, input),
    save: (id, document, input: DemoSaveInput) =>
      http.put<{ revision: string }>(
        `${spec(id)}/documents/${encodeURIComponent(document)}`,
        input,
      ),
  };
}
