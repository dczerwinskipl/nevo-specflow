import { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  bearerTokenCredentials,
  cookieCredentials,
  createHttpClient,
  customCredentials,
  HttpClientError,
  normalizeHttpError,
} from '../src';

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

  it('supports cookie-backed sessions without owning the session flow', async () => {
    const client = createHttpClient({ credentials: cookieCredentials() });
    client.axios.defaults.adapter = jsonAdapter((config) => {
      expect(config.withCredentials).toBe(true);
    });

    await client.get('/session');
  });

  it('resolves bearer tokens for every request instead of storing them', async () => {
    let token = 'first';
    const client = createHttpClient({
      credentials: bearerTokenCredentials(() => token),
    });

    const seen: string[] = [];
    client.axios.defaults.adapter = jsonAdapter((config) => {
      const value = config.headers.get('Authorization');
      if (typeof value === 'string') {
        seen.push(value);
      }
    });

    await client.get('/one');
    token = 'second';
    await client.get('/two');

    expect(seen).toEqual(['Bearer first', 'Bearer second']);
  });

  it('accepts custom credential providers for application-owned auth flows', async () => {
    const client = createHttpClient({
      credentials: customCredentials(({ url }) => ({
        headers: { 'X-Test-Identity': url ?? 'missing' },
      })),
    });

    client.axios.defaults.adapter = jsonAdapter((config) => {
      expect(config.headers.get('X-Test-Identity')).toBe('/resource');
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

  it('normalizes wrapper failures without taking over raw Axios recovery', async () => {
    const client = createHttpClient();
    client.axios.defaults.adapter = (config) =>
      Promise.reject(new AxiosError('offline', AxiosError.ERR_NETWORK, config));

    await expect(client.get('/offline')).rejects.toMatchObject({
      kind: 'network',
      code: AxiosError.ERR_NETWORK,
    });

    const normalized = normalizeHttpError(new AxiosError('offline', AxiosError.ERR_NETWORK));
    expect(normalized).toBeInstanceOf(HttpClientError);
  });
});
