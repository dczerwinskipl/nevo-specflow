import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@nevo/http-client';
import { createRequestTimeoutMs, demoCreationKeys } from './api.demo';
import { createDemoCreationApi } from './api.demo';

describe('demo creation adapter', () => {
  it('sends the atomic create with its operation id and time-box', async () => {
    const http = createHttpClient();
    const post = vi.spyOn(http, 'post').mockResolvedValue({});
    const body = {
      operationId: '7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77',
      title: 'Płatności',
      catalogueRevision: 'v4',
      archetypeId: 'feature',
      archetypeVersion: '2',
      optionalDocumentIds: [],
      target: { kind: 'new-worktree' as const },
    };
    await createDemoCreationApi(http).create(body);
    expect(post.mock.calls).toEqual([
      ['/api/demo/specifications', body, { timeoutMs: createRequestTimeoutMs }],
    ]);
  });
  it('reads create-options and the operation status without any scenario parameter', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const api = createDemoCreationApi(http);
    const signal = new AbortController().signal;
    await api.createOptions(signal);
    await api.operationStatus('op/1', signal);
    expect(get.mock.calls).toEqual([
      ['/api/demo/specs/create-options', { signal }],
      ['/api/demo/specifications/operations/op%2F1', { signal }],
    ]);
    expect(demoCreationKeys.createOptions).toEqual(['demo-create-options']);
  });
  it('scopes the catalogue identity through the application client', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const signal = new AbortController().signal;
    await createDemoCreationApi(http).catalogue('spec/a', signal);
    expect(get.mock.calls).toEqual([
      ['/api/demo/specification-creation?specId=spec%2Fa', { signal }],
    ]);
    expect(demoCreationKeys.catalogue('a')).not.toEqual(demoCreationKeys.catalogue('b'));
  });
});
