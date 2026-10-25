import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { passwordConfig } from '../auth/support/config';

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
  app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: {
        assignments: [{ userId: 'demo-user', role: 'developer', scope: { projectId: 'project' } }],
      },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { auth: { store }, sessions: { storage: { directory, projectId: 'project' } } },
  );
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
  return { store, authId, cookie, sessionId, origin };
}
describe('live Session stream authorization and replay', () => {
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
