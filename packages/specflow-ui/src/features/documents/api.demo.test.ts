import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, HttpClientError } from '@nevo/http-client';
import { apiErrorCode } from '../../shared/http/apiErrorCode';
import { createDemoDocumentsApi } from './api.demo';

describe('demo documents adapter', () => {
  it('scopes tree and save by specification and document identity', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const put = vi.spyOn(http, 'put').mockResolvedValue({ revision: '2' });
    const operationId = '0b8f1c1e-0a11-4c6e-9a01-000000000001';
    const api = createDemoDocumentsApi(http);
    const signal = new AbortController().signal;
    await api.documentTree('spec/a', signal);
    await api.save('spec/a', 'doc/c', { operationId, content: '# Draft', expectedRevision: '1' });
    // The tree is the real route, served by the demo Runtime too; writes are the demo emulation.
    expect(get.mock.calls).toEqual([['/api/specs/spec%2Fa/document-tree', { signal }]]);
    expect(put).toHaveBeenCalledWith('/api/demo/specs/spec%2Fa/documents/doc%2Fc', {
      operationId,
      content: '# Draft',
      expectedRevision: '1',
    });
  });
  it('reads the catalogue from the demo creation catalogue (its specifications were created from it)', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({ revision: 'r', documentTypes: [] });
    const signal = new AbortController().signal;
    await createDemoDocumentsApi(http).catalogue(signal);
    expect(get).toHaveBeenCalledWith('/api/demo/specification-creation', { signal });
  });
  it('propagates conflict failures without fixture success and exposes the error code', async () => {
    const http = createHttpClient();
    const error = new HttpClientError('Conflict', {
      kind: 'http',
      status: 409,
      data: { error: 'DOCUMENT_REVISION_CONFLICT', code: 'DOCUMENT_REVISION_CONFLICT' },
    });
    vi.spyOn(http, 'put').mockRejectedValue(error);
    await expect(
      createDemoDocumentsApi(http).save('s', 'd', {
        operationId: '0b8f1c1e-0a11-4c6e-9a01-000000000002',
        content: 'Draft',
        expectedRevision: 'old',
      }),
    ).rejects.toBe(error);
    expect(apiErrorCode(error)).toBe('DOCUMENT_REVISION_CONFLICT');
    expect(apiErrorCode(new Error('untyped'))).toBeUndefined();
  });
});
