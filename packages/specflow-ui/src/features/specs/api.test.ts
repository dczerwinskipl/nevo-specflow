import { createHttpClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSpecificationApi } from './api';

describe('SpecificationApi transport', () => {
  it('uses one client for Specification workspace and document reads with cancellation', async () => {
    const http = createHttpClient();
    const get = vi.spyOn(http, 'get').mockResolvedValue({});
    const api = createRuntimeSpecificationApi(http);
    const signal = new AbortController().signal;
    await api.getSpecificationWorkspace('a b', signal);
    await api.getDocument('admission', 'spec', signal);
    expect(get).toHaveBeenNthCalledWith(1, '/api/specs/a%20b/workspace', { signal });
    expect(get).toHaveBeenNthCalledWith(2, '/api/specs/admission/documents/spec', { signal });
  });
});
