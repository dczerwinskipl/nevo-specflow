import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createManagedSessionsApi } from './api';
import { fullTelemetrySnapshot } from './context/sessionTelemetry.stories-support';

const sessionId = '00000000-0000-4000-8000-000000000001';
const turnId = '00000000-0000-4000-8000-000000000002';
const interactionId = '00000000-0000-4000-8000-000000000003';

function apiAnswering(post: unknown) {
  const http = { post: vi.fn().mockResolvedValue(post) };

  return {
    http,
    api: createManagedSessionsApi(http as unknown as HttpRequestClient),
  };
}

describe('managed Session command responses', () => {
  it('returns acknowledgements of the contract shape', async () => {
    await expect(
      apiAnswering({ sessionId }).api.create({
        requestId: turnId,
        providerId: 'mock',
        mode: 'read-only',
      }),
    ).resolves.toEqual({ sessionId });
    await expect(
      apiAnswering({ turnId }).api.start(sessionId, { requestId: turnId, message: 'Hi' }),
    ).resolves.toEqual({ turnId });
    await expect(apiAnswering({ turnId }).api.cancel(sessionId, turnId, turnId)).resolves.toEqual({
      turnId,
    });
    await expect(
      apiAnswering({ turnId, interactionId }).api.respond(sessionId, interactionId, {
        requestId: turnId,
        kind: 'permission',
        decision: 'allow',
      }),
    ).resolves.toEqual({ turnId, interactionId });
  });

  it('posts reconcile with the given request id and validates the settled outcome', async () => {
    const { api, http } = apiAnswering({ turnId, outcome: 'interrupted', reconciled: true });
    await expect(api.reconcile(sessionId, turnId, interactionId)).resolves.toEqual({
      turnId,
      outcome: 'interrupted',
      reconciled: true,
    });
    expect(http.post).toHaveBeenCalledWith(
      '/api/sessions/' + sessionId + '/turns/' + turnId + '/reconcile',
      { requestId: interactionId },
      {},
    );
  });

  it.each([
    ['create', { id: 'not-a-session-id' }],
    ['start', {}],
    ['cancel', { turnId, extra: true }],
    ['respond', { turnId }],
    ['reconcile', { turnId, outcome: 'unknown', reconciled: true }],
  ] as const)(
    'treats an invalid %s acknowledgement as an outcome-unknown protocol error',
    async (command, body) => {
      const { api } = apiAnswering(body);
      const calls = {
        create: () => api.create({ requestId: turnId, providerId: 'mock', mode: 'read-only' }),
        start: () => api.start(sessionId, { requestId: turnId, message: 'Hi' }),
        cancel: () => api.cancel(sessionId, turnId, turnId),
        respond: () =>
          api.respond(sessionId, interactionId, {
            requestId: turnId,
            kind: 'permission',
            decision: 'allow',
          }),
        reconcile: () => api.reconcile(sessionId, turnId, turnId),
      };
      await expect(calls[command]()).rejects.toMatchObject({
        name: 'ApiError',
        kind: 'protocol',
        outcome: 'unknown',
      });
    },
  );
});

describe('managed Session management commands', () => {
  const session = {
    sessionId,
    projectId: 'project',
    title: 'Renamed',
    providerId: 'mock',
    mode: 'read-only',
    readiness: 'ready',
    capabilities: {
      view: true,
      manage: true,
      start: true,
      cancel: false,
      questions: true,
      permissions: true,
      delete: true,
    },
    createdAt: '2026-11-08T10:00:00Z',
    updatedAt: '2026-11-08T10:00:00Z',
  };

  it.each([
    ['rename', { requestId: turnId, title: 'Renamed' }],
    ['archive', { requestId: turnId }],
    ['unarchive', { requestId: turnId }],
  ] as const)('posts %s and validates the returned Session', async (command, input) => {
    const { api, http } = apiAnswering({ session });
    const call = {
      rename: () => api.rename(sessionId, { requestId: turnId, title: 'Renamed' }),
      archive: () => api.archive(sessionId, { requestId: turnId }),
      unarchive: () => api.unarchive(sessionId, { requestId: turnId }),
    }[command];
    await expect(call()).resolves.toEqual({ session });
    expect(http.post).toHaveBeenCalledWith('/api/sessions/' + sessionId + '/' + command, input, {});
  });

  it('treats a Session command answer of the wrong shape as an outcome-unknown error', async () => {
    await expect(
      apiAnswering({ session: { sessionId } }).api.archive(sessionId, { requestId: turnId }),
    ).rejects.toMatchObject({ name: 'ApiError', kind: 'protocol', outcome: 'unknown' });
  });

  it('deletes with a body-less DELETE and classifies 404 SESSION_NOT_FOUND', async () => {
    const http = {
      delete: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new HttpClientError('gone', {
            kind: 'http',
            status: 404,
            data: { error: 'session_error', code: 'SESSION_NOT_FOUND', message: 'gone' },
          }),
        ),
    };
    const api = createManagedSessionsApi(http as unknown as HttpRequestClient);
    await expect(api.delete(sessionId)).resolves.toBeUndefined();
    expect(http.delete).toHaveBeenCalledWith('/api/sessions/' + sessionId, {});
    await expect(api.delete(sessionId)).rejects.toMatchObject({
      kind: 'not-found',
      code: 'SESSION_NOT_FOUND',
      outcome: 'not-applied',
    });
  });
});

describe('managed Session telemetry', () => {
  const telemetrySessionId = fullTelemetrySnapshot.sessionId;
  const withGet = (getResponse: unknown) => {
    const http = { getResponse: vi.fn().mockResolvedValue(getResponse) };

    return { http, api: createManagedSessionsApi(http as unknown as HttpRequestClient) };
  };

  it('reads the snapshot with its entity tag', async () => {
    const { api, http } = withGet({
      status: 200,
      data: fullTelemetrySnapshot,
      headers: { etag: '"t42"' },
    });
    await expect(api.telemetry(telemetrySessionId)).resolves.toEqual({
      kind: 'snapshot',
      snapshot: fullTelemetrySnapshot,
      etag: '"t42"',
    });
    expect(http.getResponse).toHaveBeenCalledWith(
      '/api/sessions/' + telemetrySessionId + '/telemetry',
      { signal: undefined, responseHeaders: ['etag'] },
    );
  });

  it('revalidates with If-None-Match and reports 304 as not modified', async () => {
    const { api, http } = withGet({ status: 304, headers: { etag: '"t42"' } });
    await expect(api.telemetry(telemetrySessionId, '"t42"')).resolves.toEqual({
      kind: 'not-modified',
    });
    expect(http.getResponse.mock.calls[0]![1]).toMatchObject({
      headers: { 'If-None-Match': '"t42"' },
    });
  });

  it('rejects a snapshot that breaks the contract', async () => {
    const { api } = withGet({
      status: 200,
      data: { ...fullTelemetrySnapshot, extra: true },
      headers: {},
    });
    await expect(api.telemetry(telemetrySessionId)).rejects.toMatchObject({ kind: 'protocol' });
  });

  const receipt = {
    requestId: turnId,
    acceptedGroups: ['limits'],
    state: 'queued',
    telemetryRevision: 43,
  };

  it('posts a limits refresh and validates the 202 receipt', async () => {
    const { api, http } = apiAnswering(receipt);
    await expect(
      api.refreshTelemetry(telemetrySessionId, { requestId: turnId, groups: ['limits'] }),
    ).resolves.toEqual(receipt);
    expect(http.post).toHaveBeenCalledWith(
      '/api/sessions/' + telemetrySessionId + '/telemetry/refresh',
      { requestId: turnId, groups: ['limits'] },
      {},
    );
  });

  it.each([
    [
      429,
      { error: 'rate_limited' },
      { 'retry-after': '20' },
      { kind: 'rate-limited', retryAfterMs: 20_000 },
    ],
    [403, { error: 'forbidden' }, {}, { kind: 'forbidden' }],
    [
      422,
      { error: 'session_error', code: 'CAPABILITY_UNSUPPORTED', message: 'unsupported' },
      {},
      { code: 'CAPABILITY_UNSUPPORTED' },
    ],
  ] as const)('classifies a %s refresh refusal', async (status, data, headers, expected) => {
    const http = {
      post: vi.fn().mockRejectedValue(
        new HttpClientError('refused', {
          kind: 'http',
          status,
          headers,
          data,
        }),
      ),
    };
    const api = createManagedSessionsApi(http as unknown as HttpRequestClient);
    await expect(
      api.refreshTelemetry(telemetrySessionId, { requestId: turnId, groups: ['limits'] }),
    ).rejects.toMatchObject({ name: 'ApiError', ...expected });
  });
});
