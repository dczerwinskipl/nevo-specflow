import type { HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, isApiError } from '../../api';
import { documentRawUrl } from './api';
import { createProjectDocumentsApi } from './api.project';

function build(get = vi.fn().mockResolvedValue({ documents: [] })) {
  const http = {
    request: vi.fn(),
    get,
    delete: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    sse: vi.fn(),
  } as unknown as HttpRequestClient;
  const api = createProjectDocumentsApi(
    createApiTransport(http, { operation: 'documents.read', isOnline: () => true }),
  );
  return { api, http };
}

describe('project documents adapter', () => {
  it('reads the real document tree route', async () => {
    const { api, http } = build();
    const signal = new AbortController().signal;
    await api.documentTree('spec a', signal);
    expect(http.get).toHaveBeenCalledWith('/api/specs/spec%20a/document-tree', { signal });
  });

  it('refuses every write before sending it: the project Runtime does not serve them yet', async () => {
    const { api, http } = build();
    const operationId = '0b8f1c1e-0a11-4c6e-9a01-000000000001';
    const attempts = [
      api.save('s', 'd', { operationId, content: 'x', expectedRevision: '1' }),
      api.addDocuments('s', { operationId, documents: [{ path: 'a.md', content: '' }] }),
      api.addFolder('s', { operationId, path: 'notes' }),
      api.operateDocument('s', {
        operationId,
        action: 'delete',
        kind: 'document',
        documentId: 'd',
        expectedRevision: '1',
      }),
    ];
    for (const attempt of attempts) {
      const error: unknown = await attempt.catch((failure: unknown) => failure);
      expect(isApiError(error) && [error.kind, error.code, error.outcome]).toEqual([
        'unavailable',
        'not-implemented',
        'not-applied',
      ]);
    }
    expect(http.post).not.toHaveBeenCalled();
    expect(http.put).not.toHaveBeenCalled();
  });

  it('builds the raw URL of a document, inline or as a download', () => {
    expect(documentRawUrl('s', 'u-1')).toBe('/api/specs/s/documents/u-1/raw');
    expect(documentRawUrl('s', 'u-1', true)).toBe('/api/specs/s/documents/u-1/raw?download=1');
  });
});
