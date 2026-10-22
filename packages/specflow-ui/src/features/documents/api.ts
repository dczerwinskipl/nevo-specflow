import type { HttpRequestClient } from '@nevo/http-client';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import type {
  DemoDocumentTree,
  DemoDocumentOperationInput,
  DemoDocumentOperationResult,
  DemoDocumentsInput,
  DemoDocumentsResult,
  DemoFolderInput,
  DemoSaveInput,
} from '@nevo/specflow-contracts/demo';

export interface DocumentApi {
  getDocument(
    specId: string,
    documentId: string,
    signal?: AbortSignal,
    revision?: string,
  ): Promise<SpecificationDocumentResponse>;
}

export function createRuntimeDocumentApi(http: HttpRequestClient): DocumentApi {
  return {
    getDocument: (specId, documentId, signal, revision) =>
      http.get<SpecificationDocumentResponse>(
        `/api/specs/${encodeURIComponent(specId)}/documents/${encodeURIComponent(documentId)}${revision === undefined ? '' : `?revision=${encodeURIComponent(revision)}`}`,
        { signal },
      ),
  };
}

/** Port of the document explorer and editor: tree, structural operations, import and save. */
export interface DocumentsApi {
  documentTree(specId: string, signal?: AbortSignal): Promise<DemoDocumentTree>;
  operateDocument(
    specId: string,
    input: DemoDocumentOperationInput,
  ): Promise<DemoDocumentOperationResult>;
  addDocuments(specId: string, input: DemoDocumentsInput): Promise<DemoDocumentsResult>;
  addFolder(specId: string, input: DemoFolderInput): Promise<{ folders: string[] }>;
  save(specId: string, documentId: string, input: DemoSaveInput): Promise<{ revision: string }>;
}
