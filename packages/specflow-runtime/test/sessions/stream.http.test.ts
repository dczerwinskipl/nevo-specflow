import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { passwordConfig } from '../auth/support/config';

const activity = vi.hoisted(() => ({ events: 0, identity: 0 }));
vi.mock('../../src/features/sessions/persistence/store', async (original) => {
  const actual = await original<typeof import('../../src/features/sessions/persistence/store')>();
  return {
    ...actual,
    async openSessionStore(...args: Parameters<typeof actual.openSessionStore>) {
      const store = await actual.openSessionStore(...args);
      return {
        ...store,
        call(command: Parameters<typeof store.call>[0]) {
          if (command.op === 'events') activity.events++;
          if (command.op === 'identity') activity.identity++;
          return store.call(command);
        },
      };
    },
  };
});

let app: FastifyInstance | undefined;
let directory = '';
const controllers: AbortController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await app?.close();
  app = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup() {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-stream-'));
  const store = new InMemoryAuthenticationStore();
  const authId = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const users = ['demo-user', 'reader-1', 'reader-2', 'reader-3'];
  const base = passwordConfig();
  const reopen = () =>
    createRuntimeApp(
      {
        ...base,
        authentication: {
          ...base.authentication,
          users: Object.fromEntries(users.map((id) => [id, { name: id }])),
        },
        authorization: {
          assignments: users.map((userId) => ({
            userId,
            role: 'developer',
            scope: { projectId: 'project' },
          })),
        },
        sessions: { enabled: true, providers: { mock: { enabled: true } } },
      },
      { auth: { store }, sessions: { storage: { directory, projectId: 'project' } } },
    );
  app = await reopen();
  const cookie = 'nevo_session_4318=' + authId;
  const created = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { cookie },
    payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
  });
  expect(created.statusCode).toBe(201);
  const sessionId = created.json<{ sessionId: string }>().sessionId;
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  return { store, authId, cookie, sessionId, origin, reopen };
}
describe('live Session stream authorization and replay', () => {
  it('keeps 32 idle sockets event-driven while revalidating authorization', async () => {
    const { store, cookie, sessionId, origin } = await setup();
    const cookies = [
      cookie,
      ...['reader-1', 'reader-2', 'reader-3'].map(
        (userId) =>
          'nevo_session_4318=' +
          store.createSession({ userId, authenticatedWith: { kind: 'password' } }),
      ),
    ];
    await Promise.all(
      cookies.flatMap((actorCookie) =>
        Array.from({ length: 8 }, async () => {
          const controller = new AbortController();
          controllers.push(controller);
          const response = await fetch(origin + '/api/sessions/' + sessionId + '/events', {
            headers: { cookie: actorCookie },
            signal: controller.signal,
          });
          expect(response.status).toBe(200);
          expect((await response.body!.getReader().read()).done).toBe(false);
        }),
      ),
    );
    const before = { ...activity };
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const measured = {
      durationMs: Math.round(performance.now() - started),
      eventReads: activity.events - before.events,
      identityReads: activity.identity - before.identity,
    };
    process.stdout.write('SSE_IDLE_32 ' + JSON.stringify(measured) + '\n');
    if (!process.env.NEVO_MEASURE_BASELINE) {
      expect(measured.eventReads).toBe(0);
      expect(measured.identityReads).toBeGreaterThanOrEqual(32);
      expect(measured.identityReads).toBeLessThanOrEqual(64);
    }
  });
  it('requires a fresh snapshot when the replay cursor is outside retained history', async () => {
    const { cookie, sessionId, reopen } = await setup();
    await app!.inject({
      method: 'POST',
      url: '/api/sessions/' + sessionId + '/turns',
      headers: { cookie },
      payload: { requestId: randomUUID(), message: 'Expire replay' },
    });
    await vi.waitFor(async () =>
      expect(
        (await app!.inject({ url: '/api/sessions/' + sessionId, headers: { cookie } }))
          .json<SessionSnapshot>()
          .entries.at(-1)?.kind,
      ).toBe('outcome'),
    );
    await app!.close();
    // Controlled offline fixture: no production writer bypasses the singleton owner.
    const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
    db.prepare('UPDATE events SET at=0 WHERE session=?').run(sessionId);
    db.close();
    app = await reopen();
    const response = await app.inject({
      url: '/api/sessions/' + sessionId + '/events?after=0',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: resync-required');
    expect(response.body).not.toContain('event: session-change');
  });
  it('replays from the snapshot sequence without losing an intervening Turn', async () => {
    const { cookie, sessionId, origin } = await setup();
    const snapshot = (
      await app!.inject({ url: '/api/sessions/' + sessionId, headers: { cookie } })
    ).json<SessionSnapshot>();
    await app!.inject({
      method: 'POST',
      url: '/api/sessions/' + sessionId + '/turns',
      headers: { cookie },
      payload: { requestId: randomUUID(), message: 'Between snapshot and stream' },
    });
    await vi.waitFor(async () =>
      expect(
        (await app!.inject({ url: '/api/sessions/' + sessionId, headers: { cookie } }))
          .json<SessionSnapshot>()
          .entries.at(-1)?.kind,
      ).toBe('outcome'),
    );
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(origin + '/api/sessions/' + sessionId + '/events', {
      headers: { cookie, 'Last-Event-ID': String(snapshot.eventSeq) },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let text = '';
    await vi.waitFor(
      async () => {
        const value: unknown = (await reader.read()).value;
        if (value instanceof Uint8Array) text += new TextDecoder().decode(value);
        expect(text).toContain('"outcome":"completed"');
      },
      { timeout: 3000 },
    );
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
    expect(ids[0]).toBe(snapshot.eventSeq + 1);
    expect(ids.every((value, index) => value === snapshot.eventSeq + index + 1)).toBe(true);
  });
  it('closes an existing stream after its authentication session is revoked', async () => {
    const { store, authId, cookie, sessionId, origin } = await setup();
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(origin + '/api/sessions/' + sessionId + '/events?after=0', {
      headers: { cookie },
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    store.deleteSession(authId);
    // A real socket proves authorization is refreshed after the initial request hook.
    const closed = reader.read();
    const deadline = setTimeout(() => controller.abort(), 3000);
    try {
      expect(await closed).toMatchObject({ done: true });
    } finally {
      clearTimeout(deadline);
    }
    expect(
      (await app!.inject({ url: '/api/sessions/' + sessionId, headers: { cookie } })).statusCode,
    ).toBe(401);
  });
  it('rejects conflicting replay cursors before opening a stream', async () => {
    const { cookie, sessionId } = await setup();
    const response = await app!.inject({
      url: '/api/sessions/' + sessionId + '/events?after=0',
      headers: { cookie, 'last-event-id': '1' },
    });
    expect(response.statusCode).toBe(400);
  });
});
