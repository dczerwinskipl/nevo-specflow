import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { HttpClientError, normalizeHttpError } from './errors';

function requestConfig(): InternalAxiosRequestConfig {
  return {
    headers: new AxiosHeaders(),
  };
}

describe('normalizeHttpError', () => {
  it('preserves an already normalized error', () => {
    const original = new HttpClientError('failed', { kind: 'unexpected' });

    expect(normalizeHttpError(original)).toBe(original);
  });

  it('normalizes cancelled requests', () => {
    const normalized = normalizeHttpError(
      new AxiosError('cancelled', AxiosError.ERR_CANCELED, requestConfig()),
    );

    expect(normalized).toMatchObject({
      kind: 'cancelled',
      code: AxiosError.ERR_CANCELED,
    });
  });

  it('normalizes HTTP responses with status and response data', () => {
    const config = requestConfig();
    const normalized = normalizeHttpError(
      new AxiosError('request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
        data: { message: 'nope' },
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config,
      }),
    );

    expect(normalized).toMatchObject({
      kind: 'http',
      status: 500,
      code: AxiosError.ERR_BAD_RESPONSE,
      data: { message: 'nope' },
    });
  });

  it('normalizes transport failures as network errors', () => {
    const normalized = normalizeHttpError(
      new AxiosError('offline', AxiosError.ERR_NETWORK, requestConfig()),
    );

    expect(normalized).toMatchObject({
      kind: 'network',
      code: AxiosError.ERR_NETWORK,
    });
  });

  it('normalizes timeouts as their own kind', () => {
    const normalized = normalizeHttpError(
      new AxiosError('timeout of 10ms exceeded', AxiosError.ECONNABORTED, requestConfig()),
    );

    expect(normalized).toMatchObject({ kind: 'timeout', code: AxiosError.ECONNABORTED });
  });

  it('exposes lower-case response headers on http errors', () => {
    const normalized = normalizeHttpError(
      new AxiosError('x', AxiosError.ERR_BAD_REQUEST, requestConfig(), undefined, {
        status: 429,
        statusText: '',
        data: {},
        headers: { 'Retry-After': '3' },
        config: requestConfig(),
      } as never),
    );

    expect(normalized.headers).toEqual({ 'retry-after': '3' });
  });

  it('normalizes non-Axios failures as unexpected errors', () => {
    const cause = new Error('boom');
    const normalized = normalizeHttpError(cause);

    expect(normalized).toMatchObject({
      kind: 'unexpected',
      cause,
    });
  });
});
