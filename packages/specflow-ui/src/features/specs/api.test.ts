import { createHttpClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSpecificationApi } from './api';

describe('SpecificationApi transport', () => {
  it('uses one client for workspace, document, and task reads with cancellation', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const api = createRuntimeSpecificationApi(http);
    const signal = new AbortController().signal;
    await api.getSpecificationWorkspace('a b', signal);
    await api.getDocument('admission', 'spec', signal);
    await api.getTask('admission', 'TASK-02', signal);
    expect(get).toHaveBeenNthCalledWith(1, '/api/specs/a%20b/workspace', { signal });
    expect(get).toHaveBeenNthCalledWith(2, '/api/specs/admission/documents/spec', { signal });
    expect(get).toHaveBeenNthCalledWith(3, '/api/specs/admission/tasks/TASK-02', { signal });
  });
});
