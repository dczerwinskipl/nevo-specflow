import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sessionValidators,
  type SessionCommandResult,
  type SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined,
  directory = '';
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});
async function open(role: 'developer' | 'viewer' = 'developer') {
  directory ||= await mkdtemp(join(tmpdir(), 'nevo-session-management-http-'));
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: {
        assignments: [{ userId: 'demo-user', role, scope: { projectId: 'project' } }],
      },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' } } },
  );

  return app;
}

async function createSession() {
  const created = await app!.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
  });
  expect(created.statusCode).toBe(201);

  return created.json<{ sessionId: string }>().sessionId;
}

const post = (sessionId: string, path: string, payload: object) =>
  app!.inject({ method: 'POST', url: '/api/sessions/' + sessionId + '/' + path, payload });
const snapshot = async (sessionId: string) =>
  (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();

describe('managed Session rename, archive and delete HTTP', () => {
  it('renames with a closed, idempotent response and validates the title', async () => {
    await open();
    const sessionId = await createSession();
    const payload = { requestId: randomUUID(), title: '  Release notes ' };
    const renamed = await post(sessionId, 'rename', payload);
    expect(renamed.statusCode).toBe(200);
    expect(sessionValidators.sessionCommandResult(renamed.json())).toBe(true);
    expect(renamed.json<SessionCommandResult>().session).toMatchObject({
      title: 'Release notes',
      capabilities: { manage: true, delete: true, start: true },
    });
    const replay = await post(sessionId, 'rename', payload);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<SessionCommandResult>().session.title).toBe('Release notes');
    expect((await post(sessionId, 'rename', { ...payload, title: 'Other' })).json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    for (const title of ['', '   ', 'x'.repeat(257)]) {
      expect((await post(sessionId, 'rename', { requestId: randomUUID(), title })).statusCode).toBe(
        400,
      );
    }

    expect(
      (await post(sessionId, 'rename', { requestId: randomUUID(), title: 'a', extra: true }))
        .statusCode,
    ).toBe(400);
    expect((await snapshot(sessionId)).session.title).toBe('Release notes');
    expect(
      (await post(randomUUID(), 'rename', { requestId: randomUUID(), title: 'Missing' })).json(),
    ).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('keeps an archived Session readable but refuses new Turns until unarchived', async () => {
    await open();
    const sessionId = await createSession();
    const archived = await post(sessionId, 'archive', { requestId: randomUUID() });
    expect(archived.statusCode).toBe(200);
    expect(sessionValidators.sessionCommandResult(archived.json())).toBe(true);
    expect(typeof archived.json<SessionCommandResult>().session.archivedAt).toBe('string');
    expect(archived.json<SessionCommandResult>().session.capabilities.start).toBe(false);
    expect((await snapshot(sessionId)).session.archivedAt).toBe(
      archived.json<SessionCommandResult>().session.archivedAt,
    );
    const start = await post(sessionId, 'turns', { requestId: randomUUID(), message: 'No' });
    expect(start.statusCode).toBe(409);
    expect(start.json()).toMatchObject({ code: 'SESSION_ARCHIVED' });
    const respond = await post(sessionId, 'interactions/' + randomUUID() + '/respond', {
      requestId: randomUUID(),
      kind: 'permission',
      decision: 'deny',
    });
    expect(respond.statusCode).toBe(409);
    expect(respond.json()).toMatchObject({ code: 'SESSION_ARCHIVED' });
    expect((await app!.inject('/api/sessions/' + sessionId + '/telemetry')).statusCode).toBe(200);
    const restored = await post(sessionId, 'unarchive', { requestId: randomUUID() });
    expect(restored.statusCode).toBe(200);
    expect(restored.json<SessionCommandResult>().session.archivedAt).toBeUndefined();
    expect(restored.json<SessionCommandResult>().session.capabilities.start).toBe(true);
    const turn = await post(sessionId, 'turns', { requestId: randomUUID(), message: 'Yes' });
    expect(turn.statusCode).toBe(202);
    await vi.waitFor(async () =>
      expect((await snapshot(sessionId)).entries.at(-1)?.kind).toBe('outcome'),
    );
  });

  it('deletes a settled Session with 204 and answers 404 afterwards', async () => {
    await open();
    const sessionId = await createSession();
    const other = await createSession();
    expect(
      (await post(sessionId, 'turns', { requestId: randomUUID(), message: 'Hi' })).statusCode,
    ).toBe(202);
    await vi.waitFor(async () =>
      expect((await snapshot(sessionId)).entries.at(-1)?.kind).toBe('outcome'),
    );
    const deleted = await app!.inject({ method: 'DELETE', url: '/api/sessions/' + sessionId });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    for (const response of [
      await app!.inject('/api/sessions/' + sessionId),
      await app!.inject({ method: 'DELETE', url: '/api/sessions/' + sessionId }),
      await post(sessionId, 'rename', { requestId: randomUUID(), title: 'Gone' }),
      await app!.inject('/api/sessions/' + sessionId + '/events'),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    }

    expect((await app!.inject('/api/sessions/' + other)).statusCode).toBe(200);
  });

  it('requires session.manage for rename/archive and session.delete for delete', async () => {
    await open('developer');
    const sessionId = await createSession();
    await app!.close();
    await open('viewer');
    const view = await snapshot(sessionId);
    expect(view.session.capabilities).toMatchObject({ view: true, manage: false, delete: false });
    for (const [path, body] of [
      ['rename', { title: 'Denied' }],
      ['archive', {}],
      ['unarchive', {}],
    ] as const) {
      expect((await post(sessionId, path, { requestId: randomUUID(), ...body })).statusCode).toBe(
        403,
      );
    }

    expect(
      (await app!.inject({ method: 'DELETE', url: '/api/sessions/' + sessionId })).statusCode,
    ).toBe(403);
    expect((await snapshot(sessionId)).session.title).toBeUndefined();
  });
});
