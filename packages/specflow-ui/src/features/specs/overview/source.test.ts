import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, HttpClientError } from '@nevo/http-client';
import { createApiTransport } from '../../../api';

import { createSpecsFixture } from '../../../../test-support/specs/overview/fixtures';
import { createRuntimeSpecsOverviewApi } from './api';

const transport = (client: ReturnType<typeof createHttpClient>) =>
  createApiTransport(client, { operation: 'specs.read' });

describe('Runtime Specs Overview API', () => {
  it('reads the typed collection through the shared HTTP client with cancellation', async () => {
    const client = createHttpClient();
    const projection = createSpecsFixture('archive');
    const get = vi.spyOn(client, 'get').mockResolvedValue(projection);
    const signal = new AbortController().signal;

    expect(
      await createRuntimeSpecsOverviewApi(transport(client)).getOverview('archive', signal),
    ).toEqual(projection);
    expect(get).toHaveBeenCalledWith('/api/specs/overview', {
      params: { collection: 'archive' },
      signal,
      timeoutMs: 30_000,
    });
  });

  it('propagates transport errors without a fixture fallback', async () => {
    const client = createHttpClient();
    vi.spyOn(client, 'get').mockRejectedValue(new Error('authentication_required'));
    await expect(
      createRuntimeSpecsOverviewApi(transport(client)).getOverview(
        'current',
        new AbortController().signal,
      ),
    ).rejects.toThrow('authentication_required');
  });

  it('classifies a failed read once, with its operation', async () => {
    const client = createHttpClient();
    vi.spyOn(client, 'get').mockRejectedValue(
      new HttpClientError('x', { kind: 'http', status: 403, data: { error: 'forbidden' } }),
    );
    await expect(
      createRuntimeSpecsOverviewApi(transport(client)).getOverview('current'),
    ).rejects.toMatchObject({ kind: 'forbidden', operation: 'specs.overview', status: 403 });
  });
});
