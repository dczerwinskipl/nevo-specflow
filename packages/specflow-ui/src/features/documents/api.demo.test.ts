import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, HttpClientError } from '@nevo/http-client';
import { apiErrorCode } from '../../shared/http/apiErrorCode';
import { createDemoDocumentsApi } from './api.demo';

describe('demo documents adapter', () => {
  it('scopes tree and save by specification and document identity', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const put = vi.spyOn(http, 'put').mockResolvedValue({ revision: '2' });
    const api = createDemoDocumentsApi(http);
    const signal = new AbortController().signal;
    await api.documentTree('spec/a', signal);
    await api.save('spec/a', 'doc/c', { content: '# Draft', expectedRevision: '1' });
    expect(get.mock.calls).toEqual([['/api/demo/specs/spec%2Fa/document-tree', { signal }]]);
    expect(put).toHaveBeenCalledWith('/api/demo/specs/spec%2Fa/documents/doc%2Fc', {
      content: '# Draft',
      expectedRevision: '1',
    });
  });
  it('propagates conflict failures without fixture success and exposes the error code', async () => {
    const http = createHttpClient();
    const error = new HttpClientError('Conflict', {
      kind: 'http',
      status: 409,
      data: { error: 'demo_document_revision_conflict' },
    });
    vi.spyOn(http, 'put').mockRejectedValue(error);
    await expect(
      createDemoDocumentsApi(http).save('s', 'd', { content: 'Draft', expectedRevision: 'old' }),
    ).rejects.toBe(error);
    expect(apiErrorCode(error)).toBe('demo_document_revision_conflict');
    expect(apiErrorCode(new Error('untyped'))).toBeUndefined();
  });
});
