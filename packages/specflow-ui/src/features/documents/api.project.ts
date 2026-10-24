import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { ApiError, type ApiTransport } from '../../api';
import { documentTreePath, type DocumentsApi } from './api';

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

/**
 * A write the project Runtime does not serve yet (the D4 routes do not exist): refused before
 * anything is sent, so nothing was applied. The tree reports the same with the `not-implemented`
 * reason of every write action.
 */
function notImplemented(operation: string): Promise<never> {
  return Promise.reject(
    new ApiError({
      kind: 'unavailable',
      operation,
      outcome: 'not-applied',
      retryable: false,
      code: 'not-implemented',
      reason: 'not-in-runtime',
    }),
  );
}

/** Project-runtime adapter of {@link DocumentsApi}: the real tree read; writes unavailable. */
export function createProjectDocumentsApi(api: ApiTransport): DocumentsApi {
  return {
    documentTree: (specId, signal) =>
      api.get<DocumentTree>(documentTreePath(specId), {
        operation: 'documents.tree',
        signal,
        isValid: (data) => isObject(data) && Array.isArray(data.documents),
      }),
    operateDocument: () => notImplemented('documents.operate'),
    addDocuments: () => notImplemented('documents.create'),
    addFolder: () => notImplemented('documents.create-folder'),
    save: () => notImplemented('documents.save'),
  };
}
