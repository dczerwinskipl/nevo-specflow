import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './ApiError';
import { createApiTransport } from './transport';

function fakeHttp(overrides: Partial<HttpRequestClient> = {}): HttpRequestClient {
  return {
    request: vi.fn(),
    get: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
    put: vi.fn().mockResolvedValue({ ok: true }),
    patch: vi.fn().mockResolvedValue({ ok: true }),
    sse: vi.fn(),
    ...overrides,
  };
}

describe('createApiTransport', () => {
  it('passes the request through and returns the data', async () => {
    const http = fakeHttp();
    const signal = new AbortController().signal;
    const api = createApiTransport(http, { operation: 'specs.create' });
    await expect(api.get('/api/x', { signal, params: { a: 1 }, timeoutMs: 5 })).resolves.toEqual({
      ok: true,
    });
    expect(http.get).toHaveBeenCalledWith('/api/x', { signal, params: { a: 1 }, timeoutMs: 5 });
    await api.post('/api/x', { b: 2 }, { operation: 'specs.create.send', timeoutMs: 9 });
    // Transport-level options never reach the HTTP client.
    expect(http.post).toHaveBeenCalledWith('/api/x', { b: 2 }, { timeoutMs: 9 });
  });

  it('turns an HTTP failure into an ApiError named after the operation', async () => {
    const http = fakeHttp({
      get: vi
        .fn()
        .mockRejectedValue(
          new HttpClientError('x', { kind: 'http', status: 403, data: { error: 'forbidden' } }),
        ),
    });
    const api = createApiTransport(http, { operation: 'specs.create' });
    await expect(api.get('/api/x', { operation: 'specs.create.options' })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'forbidden',
      operation: 'specs.create.options',
    });
  });

  it('applies the context code table with the request method', async () => {
    const http = fakeHttp({
      post: vi.fn().mockRejectedValue(
        new HttpClientError('x', {
          kind: 'http',
          status: 503,
          data: { error: 'CREATE_RECOVERY_REQUIRED', code: 'CREATE_RECOVERY_REQUIRED' },
        }),
      ),
    });
    const api = createApiTransport(http, {
      operation: 'specs.create',
      codes: { CREATE_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' } },
    });
    await expect(api.post('/api/specs', {})).rejects.toMatchObject({
      kind: 'recovery-required',
      outcome: 'unknown',
    });
  });

  it('rethrows a cancellation unchanged', async () => {
    const cancelled = new HttpClientError('cancelled', { kind: 'cancelled' });
    const api = createApiTransport(fakeHttp({ get: vi.fn().mockRejectedValue(cancelled) }), {
      operation: 'x',
    });
    await expect(api.get('/api/x')).rejects.toBe(cancelled);
  });

  it('rethrows errors that are not HTTP failures (programming and session errors)', async () => {
    const failure = new TypeError('bug');
    const api = createApiTransport(fakeHttp({ get: vi.fn().mockRejectedValue(failure) }), {
      operation: 'x',
    });
    await expect(api.get('/api/x')).rejects.toBe(failure);
  });

  it('classifies a mutation timeout as an unknown outcome', async () => {
    const http = fakeHttp({
      post: vi.fn().mockRejectedValue(new HttpClientError('t', { kind: 'timeout' })),
    });
    const error = await createApiTransport(http, { operation: 'x' })
      .post('/api/x', {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'timeout', outcome: 'unknown' });
  });

  describe('offline pre-check', () => {
    it('fails a mutation before dispatch with a not-applied outcome', async () => {
      const http = fakeHttp();
      const api = createApiTransport(http, { operation: 'x', isOnline: () => false });
      await expect(api.post('/api/x', {})).rejects.toMatchObject({
        kind: 'network',
        outcome: 'not-applied',
        retryable: true,
      });
      expect(http.post).not.toHaveBeenCalled();
    });

    it('does not block reads', async () => {
      const http = fakeHttp();
      const api = createApiTransport(http, { operation: 'x', isOnline: () => false });
      await api.get('/api/x');
      expect(http.get).toHaveBeenCalledOnce();
    });
  });

  it('rejects an answer of the wrong shape as a protocol error', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue('<html>spa</html>') });
    const api = createApiTransport(http, { operation: 'x' });
    await expect(
      api.get('/api/x', { isValid: (data) => typeof data === 'object' }),
    ).rejects.toMatchObject({ kind: 'protocol', outcome: 'not-applied' });
  });
});
