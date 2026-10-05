import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@nevo/http-client';
import { createRuntimeSpecsSource } from './source';
import { createSpecsFixture } from './fixtures';

describe('Runtime Specs source', () => {
  it('reads the shared projection through HTTP with collection and cancellation', async () => {
    const client = createHttpClient();
    const projection = { ...createSpecsFixture('archive'), sample: true };
    const get = vi.spyOn(client, 'get').mockResolvedValue(projection);
    const signal = new AbortController().signal;
    expect(await createRuntimeSpecsSource(client).read('archive', signal)).toEqual(projection);
    expect(get).toHaveBeenCalledWith('/api/specs/overview', {
      params: { collection: 'archive' },
      signal,
    });
  });
  it('propagates authentication and transport errors rather than returning fake data', async () => {
    const client = createHttpClient();
    vi.spyOn(client, 'get').mockRejectedValue(new Error('authentication_required'));
    await expect(
      createRuntimeSpecsSource(client).read('active', new AbortController().signal),
    ).rejects.toThrow('authentication_required');
  });
});
