import type { HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createManagedSessionsApi } from './api';

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
