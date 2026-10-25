import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, isApiError } from '../../api';
import { writeOutcomeUnknown } from '../../shared/http/apiErrorCode';
import { documentRawUrl } from './api';
import { createProjectDocumentsApi } from './api.project';

const operationId = '0b8f1c1e-0a11-4c6e-9a01-000000000001';

function build(get = vi.fn().mockResolvedValue({ documents: [] })) {
  const post = vi.fn().mockResolvedValue({ operationId, revision: 'r2' });
  const put = vi.fn().mockResolvedValue({ operationId, revision: 'r2', committed: true });
  const http = {
    request: vi.fn(),
    get,
    delete: vi.fn(),
    post,
    put,
    patch: vi.fn(),
    sse: vi.fn(),
  } as unknown as HttpRequestClient;
  const api = createProjectDocumentsApi(
    createApiTransport(http, { operation: 'documents.read', isOnline: () => true }),
    http,
  );
  return { api, get, post, put };
}

const httpError = (status: number, data?: unknown) =>
  new HttpClientError('failed', { kind: 'http', status, data });

describe('project documents adapter', () => {
  it('reads the archetype catalogue from the real route', async () => {
    const { api, get } = build(vi.fn().mockResolvedValue({ revision: 'r', documentTypes: [] }));
    const signal = new AbortController().signal;
    await api.catalogue(signal);
    expect(get).toHaveBeenCalledWith('/api/specs/archetypes', { signal });
  });

  it('reads the real document tree route and rejects an answer of the wrong shape', async () => {
    const { api, get } = build();
    const signal = new AbortController().signal;
    await api.documentTree('spec a', signal);
    expect(get).toHaveBeenCalledWith('/api/specs/spec%20a/document-tree', { signal });
    const broken = build(vi.fn().mockResolvedValue('<html>'));
    const error: unknown = await broken.api.documentTree('s').catch((failure: unknown) => failure);
    expect(isApiError(error) && error.kind).toBe('protocol');
  });

  it('sends each write to its D4 route with the contract body and its operation id', async () => {
    const { api, post, put } = build();
    await api.save('spec a', 'doc/1', { operationId, content: 'x', expectedRevision: '1' });
    expect(put).toHaveBeenCalledWith('/api/specs/spec%20a/documents/doc%2F1', {
      operationId,
      content: 'x',
      expectedRevision: '1',
    });
    await api.addDocuments('s', {
      operationId,
      documents: [{ path: 'a.md', type: 'note', content: '' }],
      folders: ['notes'],
    });
    expect(post).toHaveBeenLastCalledWith('/api/specs/s/documents', {
      operationId,
      documents: [{ path: 'a.md', type: 'note', content: '' }],
      folders: ['notes'],
    });
    await api.addFolder('s', { operationId, path: 'notes' });
    expect(post).toHaveBeenLastCalledWith('/api/specs/s/folders', { operationId, path: 'notes' });
    const operation = {
      operationId,
      action: 'classify' as const,
      kind: 'document' as const,
      documentId: 'u-1',
      type: 'research',
      expectedRevision: '1',
    };
    await api.operateDocument('s', operation);
    expect(post).toHaveBeenLastCalledWith('/api/specs/s/document-operations', operation);
  });

  it('turns a missing write route (404 without a documents code, or 405) into a definite not-implemented refusal', async () => {
    for (const failure of [
      httpError(404, {
        message: 'Route PUT:/api/specs/s/documents/d not found',
        error: 'Not Found',
      }),
      httpError(404, '<!doctype html>'),
      httpError(405, { error: 'Method Not Allowed' }),
    ]) {
      const { api, put } = build();
      put.mockRejectedValueOnce(failure);
      const error: unknown = await api
        .save('s', 'd', { operationId, content: 'x', expectedRevision: '1' })
        .catch((reason: unknown) => reason);
      expect(isApiError(error) && [error.code, error.outcome, error.kind]).toEqual([
        'not-implemented',
        'not-applied',
        'unavailable',
      ]);
      // Never an unknown outcome: nothing locks the tree.
      expect(writeOutcomeUnknown(error)).toBe(false);
    }
  });

  it('passes every answered refusal through unchanged, as the demo adapter does', async () => {
    for (const failure of [
      httpError(404, { error: 'DOCUMENT_NOT_FOUND', code: 'DOCUMENT_NOT_FOUND' }),
      httpError(409, { error: 'DOCUMENT_REVISION_CONFLICT', code: 'DOCUMENT_REVISION_CONFLICT' }),
      new HttpClientError('offline', { kind: 'network' }),
    ]) {
      const { api, post } = build();
      post.mockRejectedValueOnce(failure);
      await expect(api.addFolder('s', { operationId, path: 'n' })).rejects.toBe(failure);
    }
  });

  it('builds the raw URL of a document, inline or as a download', () => {
    expect(documentRawUrl('s', 'u-1')).toBe('/api/specs/s/documents/u-1/raw');
    expect(documentRawUrl('s', 'u-1', true)).toBe('/api/specs/s/documents/u-1/raw?download=1');
  });
});
