import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateTelemetrySnapshot,
  type TelemetrySnapshot,
  type TelemetryReading,
} from '@nevo/specflow-contracts/sessions';
import type { SessionDriver } from '../../src/features/sessions/providers/driver';
import { createRuntimeApp } from '../../src/server/app';
import { createMockDriver } from '../../src/features/sessions/providers/mock';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined;
let directory = '';
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function setup(role?: 'developer' | 'admin' | 'viewer', existingDirectory?: string) {
  directory = existingDirectory ?? (await mkdtemp(join(tmpdir(), 'specflow-telemetry-http-')));
  const baseDriver = createMockDriver(async (_invocation, emit) => {
    await emit({
      kind: 'usage',
      sampleId: 'tokens',
      basis: 'turn-total',
      counters: { inputTokens: 120, outputTokens: 9, cacheWriteTokens: 10 },
    });
    await emit({
      kind: 'measurement',
      metric: 'cost',
      sampleId: 'usd',
      basis: 'turn-total',
      value: {
        currency: 'USD',
        amount: '0.0123',
        basis: 'provider-reported',
        meaning: 'api-equivalent',
      },
    });
    await emit({
      kind: 'measurement',
      metric: 'context',
      sampleId: 'context',
      value: { contextGeneration: 'controlled-context', occupiedTokens: 200, capacityTokens: 1000 },
    });
    await emit({ kind: 'outcome', outcome: 'completed' });
  });
  const refresh = vi.fn(() =>
    Promise.resolve([
      {
        kind: 'measurement' as const,
        metric: 'limits' as const,
        sampleId: 'limits',
        value: {
          windows: [
            {
              windowId: 'primary',
              scope: 'account' as const,
              unit: 'percent' as const,
              used: '25',
              remaining: '75',
            },
          ],
        },
      },
    ]),
  );
  const driver: SessionDriver = {
    ...baseDriver,
    telemetry: {
      refreshableGroups: ['limits'],
      binding: () =>
        Promise.resolve({
          accountScope: 'controlled-account',
          credentialGeneration: 'synthetic-login',
        }),
      refresh,
    },
    contextScope: () => 'controlled-account',
  };
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: {
        ...config.authentication,
        mode: 'none',
        ...(role ? { localUserId: 'demo-user' } : {}),
      },
      ...(role
        ? {
            authorization: {
              assignments: [{ userId: 'demo-user', role, scope: { projectId: 'project' } }],
            },
          }
        : {}),
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' }, driver } },
  );

  return { driver, refresh };
}

async function create() {
  const result = await app!.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
  });
  expect(result.statusCode).toBe(201);

  return result.json<{ sessionId: string }>().sessionId;
}

function observed<T>(reading: TelemetryReading<T>): T {
  expect(reading.status).not.toBe('unavailable');
  if (reading.status === 'unavailable') {
    throw new Error('Expected an observed fixture value.');
  }

  return reading.value;
}

describe('Session telemetry HTTP', () => {
  it('reads a bounded unavailable snapshot without a provider call and supports authorized conditional reads', async () => {
    const { refresh } = await setup();
    const id = await create();
    const response = await app!.inject(`/api/sessions/${id}/telemetry`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    const snapshot = response.json<TelemetrySnapshot>();
    expect(validateTelemetrySnapshot(snapshot)).toBe(true);
    expect(snapshot.usage.session.status).toBe('unavailable');
    expect(snapshot.limits.refreshable).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    const unchanged = await app!.inject({
      url: `/api/sessions/${id}/telemetry`,
      headers: { 'if-none-match': String(response.headers.etag) },
    });
    expect(unchanged.statusCode).toBe(304);
    expect(unchanged.body).toBe('');
  });
  it('publishes usage, precise cost and native context without loading conversation content', async () => {
    await setup();
    const id = await create();
    const result = await app!.inject({
      method: 'POST',
      url: `/api/sessions/${id}/turns`,
      payload: { requestId: randomUUID(), message: 'Controlled fixture only' },
    });
    expect(result.statusCode).toBe(202);
    await vi.waitFor(async () => {
      const response = await app!.inject(`/api/sessions/${id}/telemetry`);
      expect(response.statusCode).toBe(200);
      const snapshot = response.json<TelemetrySnapshot>();
      expect(validateTelemetrySnapshot(snapshot)).toBe(true);
      expect(observed(snapshot.usage.session)).toMatchObject({
        inputTokens: 120,
        outputTokens: 9,
        cacheWriteTokens: 10,
      });
      expect(observed(snapshot.cost.session)).toMatchObject({ amount: '0.0123', currency: 'USD' });
      // The no-effects mock has no verified native account/context binding.
      expect(snapshot.context).toMatchObject({ status: 'unavailable', reason: 'NOT_OBSERVED' });
      expect(snapshot.usage.turn?.turnId).toBe(result.json<{ turnId: string }>().turnId);
    });
  });
  it('durably replays refresh receipts and throttles a fresh request after completion', async () => {
    const { refresh } = await setup();
    const id = await create();
    const payload = { requestId: randomUUID(), groups: ['limits'] };
    const post = () =>
      app!.inject({ method: 'POST', url: `/api/sessions/${id}/telemetry/refresh`, payload });
    const first = await post();
    expect(first.statusCode).toBe(202);
    await vi.waitFor(async () => {
      const value = (await app!.inject(`/api/sessions/${id}/telemetry`)).json<TelemetrySnapshot>();
      expect(value.refresh.state).toBe('idle');
      expect(observed(value.limits).windows[0]?.remaining).toBe('75');
    });
    expect((await post()).json()).toEqual(first.json());
    expect(refresh).toHaveBeenCalledTimes(1);
    const throttled = await app!.inject({
      method: 'POST',
      url: `/api/sessions/${id}/telemetry/refresh`,
      payload: { ...payload, requestId: randomUUID() },
    });
    expect(throttled.statusCode).toBe(429);
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    const conflict = await app!.inject({
      method: 'POST',
      url: `/api/sessions/${id}/telemetry/refresh`,
      payload: { ...payload, groups: ['context'] },
    });
    expect(conflict.statusCode).toBe(409);
  });
  it('does not equate Session Manage with permission to read shared account limits', async () => {
    const { refresh } = await setup('developer');
    const id = await create();
    const response = await app!.inject(`/api/sessions/${id}/telemetry`);
    expect(response.statusCode).toBe(200);
    expect(response.json<TelemetrySnapshot>().limits).toEqual({
      status: 'unavailable',
      freshness: 'unknown',
      reason: 'NOT_AUTHORIZED',
      refreshable: false,
    });
    const denied = await app!.inject({
      method: 'POST',
      url: `/api/sessions/${id}/telemetry/refresh`,
      payload: { requestId: randomUUID(), groups: ['limits'] },
    });
    expect(denied.statusCode).toBe(403);
    expect(refresh).not.toHaveBeenCalled();
  });
  it('reprojects stored limits before honoring a validator after account-limit permission is lost', async () => {
    await setup('admin');
    const id = await create();
    const url = `/api/sessions/${id}/telemetry`;
    expect(
      (
        await app!.inject({
          method: 'POST',
          url: url + '/refresh',
          payload: { requestId: randomUUID(), groups: ['limits'] },
        })
      ).statusCode,
    ).toBe(202);
    await vi.waitFor(async () => {
      expect(
        observed((await app!.inject(url)).json<TelemetrySnapshot>().limits).windows,
      ).toHaveLength(1);
    });
    const admin = await app!.inject(url);
    await app!.close();
    await setup('developer', directory);
    const denied = await app!.inject({
      url,
      headers: { 'if-none-match': String(admin.headers.etag) },
    });
    expect(denied.statusCode).toBe(200);
    expect(denied.headers.etag).not.toBe(admin.headers.etag);
    expect(denied.json<TelemetrySnapshot>().limits).toEqual({
      status: 'unavailable',
      freshness: 'unknown',
      reason: 'NOT_AUTHORIZED',
      refreshable: false,
    });
    expect(
      (await app!.inject({ url, headers: { 'if-none-match': String(denied.headers.etag) } }))
        .statusCode,
    ).toBe(304);
  });
  it('rejects unsupported refresh groups and schema extensions without invoking a provider', async () => {
    const { refresh } = await setup();
    const id = await create();
    const post = (payload: unknown) =>
      app!.inject({
        method: 'POST',
        url: `/api/sessions/${id}/telemetry/refresh`,
        payload: payload as object,
      });
    expect((await post({ requestId: randomUUID(), groups: ['context'] })).statusCode).toBe(422);
    expect(
      (await post({ requestId: randomUUID(), groups: ['limits'], prompt: 'must not run' }))
        .statusCode,
    ).toBe(400);
    expect(refresh).not.toHaveBeenCalled();
  });
  it('delivers telemetry invalidation through the existing live Session stream', async () => {
    await setup();
    const id = await create();
    const initial = (await app!.inject(`/api/sessions/${id}/telemetry`)).json<TelemetrySnapshot>();
    const address = await app!.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    const stream = await fetch(`${address}/api/sessions/${id}/events?after=${initial.eventSeq}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
    });
    const reader = stream.body!.getReader();
    try {
      expect(stream.status).toBe(200);
      await reader.read(); // connected comment: the replay/live handoff is established.
      const result = await app!.inject({
        method: 'POST',
        url: `/api/sessions/${id}/turns`,
        payload: { requestId: randomUUID(), message: 'Controlled stream fixture only' },
      });
      expect(result.statusCode).toBe(202);
      const decoder = new TextDecoder();
      let data = '';
      while (!data.includes('"kind":"telemetry"')) {
        const next = await reader.read();
        expect(next.done).toBe(false);
        if (!(next.value instanceof Uint8Array)) {
          throw new Error('Expected a binary SSE frame.');
        }

        data += decoder.decode(next.value, { stream: true });
      }

      expect(data).toContain('"telemetryRevision":');
      const latest = (await app!.inject(`/api/sessions/${id}/telemetry`)).json<TelemetrySnapshot>();
      expect(latest.revision).toBeGreaterThan(initial.revision);
      expect(latest.eventSeq).toBeGreaterThan(initial.eventSeq);
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });
});
