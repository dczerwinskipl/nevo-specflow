import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@nevo/http-client';
import { createDemoSessionsApi } from './api.demo';

describe('demo sessions adapter', () => {
  it('scopes allocation and detail by specification and session identity', async () => {
    const http = createHttpClient();
    const post = vi.spyOn(http, 'post').mockResolvedValue({});
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const api = createDemoSessionsApi(http);
    const signal = new AbortController().signal;
    const input = {
      requestId: 'session-key',
      catalogueRevision: 'v4',
      providerId: 'codex',
      modelId: 'model-a',
      mode: 'agent',
    };
    await api.allocate('spec/a', input);
    await api.session('spec/a', 'session/b', signal);
    expect(post.mock.calls).toEqual([['/api/demo/specs/spec%2Fa/sessions', input]]);
    expect(get.mock.calls).toEqual([['/api/demo/specs/spec%2Fa/sessions/session%2Fb', { signal }]]);
  });
});
