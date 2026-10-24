import type { HttpRequestClient } from '@nevo/http-client';
import type {
  ArchetypeCatalogue,
  CreateDocumentsInput,
  DocumentContent,
  DocumentOperationInput,
  DocumentOperationResult,
  DocumentTree,
  SaveInput,
  SaveResult,
} from '@nevo/specflow-contracts/documents';
import type { DemoFolderInput } from '@nevo/specflow-contracts/demo';

const specPath = (specId: string) => `/api/specs/${encodeURIComponent(specId)}`;

export interface DocumentApi {
  getDocument(
    specId: string,
    documentId: string,
    signal?: AbortSignal,
    revision?: string,
  ): Promise<DocumentContent>;
}

/** Document reads use the real routes in every Runtime (the demo Runtime serves them too). */
export function createRuntimeDocumentApi(http: HttpRequestClient): DocumentApi {
  return {
    getDocument: (specId, documentId, signal, revision) =>
      http.get<DocumentContent>(
        `${specPath(specId)}/documents/${encodeURIComponent(documentId)}${revision === undefined ? '' : `?revision=${encodeURIComponent(revision)}`}`,
        { signal },
      ),
  };
}

/**
 * URL of a document's bytes (`GET .../raw`): an image source or a download link. Served with the
 * safe headers of the contract in every Runtime.
 */
export function documentRawUrl(specId: string, documentId: string, download = false): string {
  return `${specPath(specId)}/documents/${encodeURIComponent(documentId)}/raw${download ? '?download=1' : ''}`;
}

/** The body of a folder creation (the contract names the route but no body; see the demo schema). */
export type CreateFolderInput = DemoFolderInput;

/**
 * Port of the document explorer and editor: the tree read and the write operations, all in the
 * shapes of the documents contract (`@nevo/specflow-contracts/documents`). Every write carries its
 * `operationId` (idempotency key).
 */
export interface DocumentsApi {
  documentTree(specId: string, signal?: AbortSignal): Promise<DocumentTree>;
  /**
   * The archetype catalogue the Specifications were created from: the type titles, `useWhen` and
   * instructions the tree and the New document / Assign type chooser show (texts as delivered).
   */
  catalogue(signal?: AbortSignal): Promise<ArchetypeCatalogue>;
  operateDocument(specId: string, input: DocumentOperationInput): Promise<DocumentOperationResult>;
  addDocuments(specId: string, input: CreateDocumentsInput): Promise<DocumentOperationResult>;
  addFolder(specId: string, input: CreateFolderInput): Promise<DocumentOperationResult>;
  save(specId: string, documentId: string, input: SaveInput): Promise<SaveResult>;
}

/** The document tree read, the same route in the demo and the project Runtime. */
export const documentTreePath = (specId: string) => `${specPath(specId)}/document-tree`;
