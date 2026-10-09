import type { HttpClient } from '@nevo/http-client';
import type {
  SpecificationWorkspaceResponse,
  SpecificationDocumentResponse,
} from '@nevo/specflow-contracts/specs/workspace';

export interface SpecificationApi {
  getSpecificationWorkspace(
    specId: string,
    signal?: AbortSignal,
  ): Promise<SpecificationWorkspaceResponse>;
  getDocument(
    specId: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<SpecificationDocumentResponse>;
}

export function createRuntimeSpecificationApi(client: HttpClient): SpecificationApi {
  const base = (specId: string) => '/api/specs/' + encodeURIComponent(specId);
  return {
    getSpecificationWorkspace: (specId, signal) =>
      client.get<SpecificationWorkspaceResponse>(base(specId) + '/workspace', { signal }),
    getDocument: (specId, documentId, signal) =>
      client.get<SpecificationDocumentResponse>(
        base(specId) + '/documents/' + encodeURIComponent(documentId),
        { signal },
      ),
  };
}
