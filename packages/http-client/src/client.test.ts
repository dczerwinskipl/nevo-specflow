import { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import { createHttpClient } from './client';
import { customCredentials } from './credentials';

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
          'X-Test-Method': method,
          'X-Test-Url': url,
        },
        includeCookies: true,
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

  describe('getResponse', () => {
    // Like Axios' own adapters, settles through the request's `validateStatus`.
    function adapter(
      status: number,
      headers: Record<string, string>,
      data?: unknown,
    ): AxiosAdapter {
      return (config) => {
        const response = { data, status, statusText: String(status), headers, config };
        if (config.validateStatus && !config.validateStatus(status)) {
          return Promise.reject(
            new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, null, response),
          );
        }

        return Promise.resolve(response);
      };
    }

    it('returns status, body and the requested headers of a 200', async () => {
      const client = createHttpClient();
      client.axios.defaults.adapter = adapter(
        200,
        { etag: '"r1"', 'x-other': 'hidden' },
        { ok: true },
      );

      await expect(client.getResponse('/resource', { responseHeaders: ['ETag'] })).resolves.toEqual(
        { status: 200, data: { ok: true }, headers: { etag: '"r1"' } },
      );
    });

    it('treats 304 as a result without a body and forwards If-None-Match', async () => {
      const client = createHttpClient();
      client.axios.defaults.adapter = (config) => {
        expect(config.headers.get('If-None-Match')).toBe('"r1"');

        return adapter(304, { etag: '"r1"' }, '')(config);
      };

      await expect(
        client.getResponse('/resource', {
          headers: { 'If-None-Match': '"r1"' },
          responseHeaders: ['etag'],
        }),
      ).resolves.toEqual({ status: 304, headers: { etag: '"r1"' } });
    });

    it('omits a requested header the response does not carry', async () => {
      const client = createHttpClient();
      client.axios.defaults.adapter = adapter(200, {}, { ok: true });

      await expect(client.getResponse('/resource', { responseHeaders: ['etag'] })).resolves.toEqual(
        { status: 200, data: { ok: true }, headers: {} },
      );
    });

    it('still throws a normalized error for other non-2xx statuses', async () => {
      const client = createHttpClient();
      client.axios.defaults.adapter = adapter(404, {}, { code: 'NOT_FOUND' });

      await expect(client.getResponse('/resource')).rejects.toMatchObject({
        name: 'HttpClientError',
        status: 404,
      });
    });
  });
});
