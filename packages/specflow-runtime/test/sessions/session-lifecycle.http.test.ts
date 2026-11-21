import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SessionErrorSchema,
  sessionValidators,
  type SessionCommandResult,
  type SessionSnapshot,
  type StartTurnResult,
  type WorkPage,
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

async function open() {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-lifecycle-http-'));
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: {
        assignments: [{ userId: 'demo-user', role: 'developer', scope: { projectId: 'project' } }],
      },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' } } },
  );

  return app;
}

/** Every answer of this scenario must be a contract shape, success or refusal. */
function expectBody(
  response: LightMyRequestResponse,
  status: number,
  validate: (value: unknown) => boolean,
) {
  expect(response.statusCode).toBe(status);
  expect(validate(response.json())).toBe(true);
}

const sessionError = (value: unknown) => Value.Check(SessionErrorSchema, value);

describe('managed Session lifecycle across the Runtime HTTP API', () => {
  it('creates, runs, reads, renames, archives, restores and deletes one Session on the mock provider', async () => {
    const runtime = await open();
    const base = '/api/sessions';
    const post = (path: string, payload: object) =>
      runtime.inject({ method: 'POST', url: base + path, payload });
    const read = (path: string) => runtime.inject(base + path);

    const created = await post('', {
      requestId: randomUUID(),
      providerId: 'mock',
      mode: 'read-only',
    });
    expectBody(created, 201, sessionValidators.createResult);
    const sessionId = created.json<{ sessionId: string }>().sessionId;
    const session = '/' + sessionId;

    const started = await post(session + '/turns', { requestId: randomUUID(), message: 'Hello' });
    expectBody(started, 202, sessionValidators.startResult);
    const { turnId } = started.json<StartTurnResult>();
    // The SQLite worker persists the outcome and telemetry asynchronously: on a loaded Windows runner
    // that exceeds the 1 s waitFor default (as in #142). The polls still pass as soon as it lands.
    const settled = { timeout: 10_000, interval: 100 };
    await vi.waitFor(async () => {
      const current = await read(session);
      expectBody(current, 200, sessionValidators.snapshot);
      expect(current.json<SessionSnapshot>().entries.at(-1)?.kind).toBe('outcome');
    }, settled);

    const work = await read(session + '/turns/' + turnId + '/work');
    expectBody(work, 200, sessionValidators.work);
    expect(work.json<WorkPage>().counts).toEqual({
      total: 1,
      inProgress: 0,
      byKind: { commentary: 1, reasoning: 0, interaction: 0, tool: 0 },
    });

    // The settled Turn may still publish its last telemetry revision; revalidate once it is stable.
    await vi.waitFor(async () => {
      const telemetry = await read(session + '/telemetry');
      expectBody(telemetry, 200, sessionValidators.telemetry);
      const etag = telemetry.headers.etag;
      expect(typeof etag).toBe('string');
      const unchanged = await runtime.inject({
        url: base + session + '/telemetry',
        headers: { 'if-none-match': String(etag) },
      });
      expect(unchanged.statusCode).toBe(304);
      expect(unchanged.body).toBe('');
    }, settled);

    const renamed = await post(session + '/rename', { requestId: randomUUID(), title: 'Release' });
    expectBody(renamed, 200, sessionValidators.sessionCommandResult);
    expect(renamed.json<SessionCommandResult>().session.title).toBe('Release');

    const archived = await post(session + '/archive', { requestId: randomUUID() });
    expectBody(archived, 200, sessionValidators.sessionCommandResult);
    expect(archived.json<SessionCommandResult>().session).toMatchObject({
      archivedAt: expect.any(String) as string,
      capabilities: { start: false },
    });
    const refused = await post(session + '/turns', { requestId: randomUUID(), message: 'No' });
    expectBody(refused, 409, sessionError);
    expect(refused.json()).toMatchObject({ code: 'SESSION_ARCHIVED' });

    const restored = await post(session + '/unarchive', { requestId: randomUUID() });
    expectBody(restored, 200, sessionValidators.sessionCommandResult);
    expect(restored.json<SessionCommandResult>().session.archivedAt).toBeUndefined();
    expect(restored.json<SessionCommandResult>().session.capabilities.start).toBe(true);
    const restoredSnapshot = await read(session);
    expectBody(restoredSnapshot, 200, sessionValidators.snapshot);
    expect(restoredSnapshot.json<SessionSnapshot>().session.title).toBe('Release');

    const deleted = await runtime.inject({ method: 'DELETE', url: base + session });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    const gone = await read(session);
    expectBody(gone, 404, sessionError);
    expect(gone.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});
