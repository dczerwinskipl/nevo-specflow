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

  it("starts at the workspace's startSession path when it is known", async () => {
    const http = createHttpClient();
    const post = vi.spyOn(http, 'post').mockResolvedValue({});
    const input = {
      requestId: 'k',
      catalogueRevision: 'v4',
      providerId: 'codex',
      modelId: 'model-a',
      mode: 'agent',
    };
    await createDemoSessionsApi(http).allocate('a', input, '/api/demo/specs/a/sessions');
    expect(post.mock.calls).toEqual([['/api/demo/specs/a/sessions', input]]);
  });
});
