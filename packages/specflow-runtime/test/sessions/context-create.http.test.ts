import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CreateContextSessionResultSchema,
  type CreateContextSessionResult,
  type SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { associationTargets } from '../support/association-targets';

type Role = 'viewer' | 'developer' | 'admin';

let app: FastifyInstance | undefined,
  directory = '';
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = '';
  }
});

async function open(
  options: {
    role?: Role;
    scope?: Record<string, string>;
    enabled?: boolean;
    targets?: ReturnType<typeof associationTargets>;
  } = {},
) {
  directory = await mkdtemp(join(tmpdir(), 'nevo-context-create-'));
  const config = passwordConfig();
  const targets = options.targets ?? associationTargets();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: {
        assignments: options.role
          ? [{ userId: 'demo-user', role: options.role, scope: options.scope ?? {} }]
          : [],
      },
      sessions: {
        enabled: options.enabled ?? true,
        providers: { mock: { enabled: true } },
      },
    },
    { sessions: { storage: { directory, projectId: 'project' }, targets } },
  );

  return { server: app, targets };
}

const create = (
  server: FastifyInstance,
  specId: string,
  payload: Record<string, unknown> = {},
  requestId = randomUUID(),
) =>
  server.inject({
    method: 'POST',
    url: `/api/specs/${specId}/sessions`,
    payload: { requestId, providerId: 'mock', mode: 'read-only', ...payload },
  });

describe('POST /api/specs/:specId/sessions', () => {
  it('creates a Session associated with the Specification', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    const response = await create(server, 'S');
    expect(response.statusCode).toBe(201);
    const body = response.json<CreateContextSessionResult>();
    expect(Value.Check(CreateContextSessionResultSchema, body)).toBe(true);
    expect(body.association).toEqual({ specId: 'S', taskIds: [] });
    // The Session is a full Session; its scope now carries the home Specification.
    const snapshot = await server.inject(`/api/sessions/${body.sessionId}`);
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json<SessionSnapshot>().session.sessionId).toBe(body.sessionId);
  });

  it('creates a Session associated with Tasks of the Specification', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    const response = await create(server, 'S', { taskIds: ['TASK-01', 'TASK-02'] });
    expect(response.statusCode).toBe(201);
    expect(response.json<CreateContextSessionResult>().association).toEqual({
      specId: 'S',
      taskIds: ['TASK-01', 'TASK-02'],
    });
  });

  it('answers 404 for an unknown Specification and for an unknown or foreign Task', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    expect((await create(server, 'unknown')).json()).toEqual({ error: 'specification_not_found' });
    for (const taskIds of [['TASK-99'], ['TASK-T1']]) {
      const response = await create(server, 'S', { taskIds });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'specification_task_not_found' });
    }
  });

  it('answers 503 when the Engine source is unreadable and writes nothing', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    const response = await create(server, 'broken');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'specification_source_unavailable' });
    const unreadableTasks = await create(server, 'S', { taskIds: ['TASK-BROKEN'] });
    expect(unreadableTasks.statusCode).toBe(503);
  });

  it('rejects an invalid body as a Session input error', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    const response = await create(server, 'S', { taskIds: ['TASK-01', 'TASK-01'] });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('SESSION_INPUT_INVALID');
  });

  it.each<{ name: string; role?: Role; scope?: Record<string, string> }>([
    { name: 'viewer at the project', role: 'viewer' as const, scope: { projectId: 'project' } },
    {
      name: 'developer of another Specification',
      role: 'developer' as const,
      scope: { specId: 'T' },
    },
    { name: 'developer of one Session', role: 'developer' as const, scope: { sessionId: 'x' } },
    { name: 'no assignment', role: undefined, scope: undefined },
  ])('refuses $name with 403 before any Engine lookup', async ({ role, scope }) => {
    const { server, targets } = await open({
      ...(role ? { role } : {}),
      ...(scope ? { scope } : {}),
    });
    const response = await create(server, 'S');
    expect(response.statusCode).toBe(403);
    expect(targets.specification).not.toHaveBeenCalled();
  });

  it('lets developer@{specId} start a read-only Session in its Specification', async () => {
    const { server } = await open({ role: 'developer', scope: { specId: 'S' } });
    const response = await create(server, 'S');
    expect(response.statusCode).toBe(201);
    // The Session is reachable through the Specification-scoped grant.
    expect(
      (
        await server.inject(
          `/api/sessions/${response.json<CreateContextSessionResult>().sessionId}`,
        )
      ).statusCode,
    ).toBe(200);
  });

  it('requires project-scoped execute-write for a workspace-write Session', async () => {
    const scoped = await open({ role: 'developer', scope: { specId: 'S' } });
    expect((await create(scoped.server, 'S', { mode: 'workspace-write' })).statusCode).toBe(403);
    expect(scoped.targets.specification).not.toHaveBeenCalled();
    await app!.close();
    app = undefined;
    await rm(directory, { recursive: true, force: true });

    const project = await open({ role: 'developer', scope: { projectId: 'project' } });
    // Authorized, then refused by the provider: the mock provider has no workspace-write mode.
    const response = await create(project.server, 'S', { mode: 'workspace-write' });
    expect(response.statusCode).toBe(422);
  });

  it('answers SESSION_DISABLED before forbidden when managed Sessions are disabled', async () => {
    const { server, targets } = await open({ role: 'viewer', enabled: false });
    const response = await create(server, 'S');
    expect(response.statusCode).toBe(503);
    expect(response.json<{ code: string }>().code).toBe('SESSION_DISABLED');
    expect(targets.specification).not.toHaveBeenCalled();
  });

  it('replays the same request and refuses a reused requestId with another association', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    const requestId = randomUUID();
    const first = await create(server, 'S', {}, requestId);
    const replay = await create(server, 'S', {}, requestId);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const otherSpecification = await create(server, 'T', {}, requestId);
    expect(otherSpecification.statusCode).toBe(409);
    expect(otherSpecification.json<{ code: string }>().code).toBe('IDEMPOTENCY_CONFLICT');
    const otherTasks = await create(server, 'S', { taskIds: ['TASK-01'] }, requestId);
    expect(otherTasks.json<{ code: string }>().code).toBe('IDEMPOTENCY_CONFLICT');
    const standalone = await server.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { requestId, providerId: 'mock', mode: 'read-only' },
    });
    expect(standalone.statusCode).toBe(409);
    expect(standalone.json<{ code: string }>().code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('refuses a context create reusing a standalone requestId', async () => {
    const { server } = await open({ role: 'developer', scope: { projectId: 'project' } });
    const requestId = randomUUID();
    const standalone = await server.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { requestId, providerId: 'mock', mode: 'read-only' },
    });
    expect(standalone.statusCode).toBe(201);
    const context = await create(server, 'S', {}, requestId);
    expect(context.statusCode).toBe(409);
    expect(context.json<{ code: string }>().code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('is not served by a demo Runtime', async () => {
    const config = passwordConfig();
    app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' } },
      { dataMode: 'demo' },
    );
    expect((await create(app, 'S')).statusCode).toBe(404);
  });
});
