import { type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import { createHttpClient, customCredentials } from './index';

function jsonAdapter(assertConfig?: (config: Parameters<AxiosAdapter>[0]) => void): AxiosAdapter {
  return (config) => {
    assertConfig?.(config);
    return Promise.resolve({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

describe('createHttpClient', () => {
  it('uses bounded defaults and returns response data', async () => {
    const client = createHttpClient({ baseURL: '/api' });
    client.axios.defaults.adapter = jsonAdapter();

    await expect(client.get<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
    expect(client.axios.defaults.baseURL).toBe('/api');
    expect(client.axios.defaults.timeout).toBe(10_000);
    expect(client.axios.defaults.allowAbsoluteUrls).toBe(false);
  });

  it('applies resolved credentials to each request', async () => {
    const client = createHttpClient({
      credentials: customCredentials(({ method, url }) => ({
        headers: {
          'X-Test-Method': method ?? 'missing',
          'X-Test-Url': url ?? 'missing',
        },
        withCredentials: true,
      })),
    });

    client.axios.defaults.adapter = jsonAdapter((config) => {
      expect(config.headers.get('X-Test-Method')).toBe('get');
      expect(config.headers.get('X-Test-Url')).toBe('/resource');
      expect(config.withCredentials).toBe(true);
    });

    await client.get('/resource');
  });

  it('preserves errors owned by an external authentication flow', async () => {
    const authError = new Error('interactive login required');
    const client = createHttpClient({
      credentials: customCredentials(() => {
        throw authError;
      }),
    });

    await expect(client.get('/resource')).rejects.toBe(authError);
  });
});
