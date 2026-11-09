import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SessionAssociationReadSchema,
  type CreateContextSessionResult,
  type SessionAssociationRead,
} from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { associationTargets } from '../support/association-targets';

type Role = 'viewer' | 'developer' | 'admin';
type Targets = ReturnType<typeof associationTargets>;

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
  role: Role | undefined,
  scope: Record<string, string> = {},
  targets: Targets = associationTargets(),
  enabled = true,
) {
  await app?.close();
  directory ||= await mkdtemp(join(tmpdir(), 'nevo-association-read-'));
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: role ? [{ userId: 'demo-user', role, scope }] : [] },
      sessions: { enabled, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' }, targets } },
  );

  return app;
}

/** Creates the Sessions as a project developer; the read then runs under its own grant. */
async function seed(...specs: { specId?: string; taskIds?: string[] }[]): Promise<string[]> {
  const server = await open('developer', { projectId: 'project' });
  const ids: string[] = [];
  for (const { specId, taskIds } of specs) {
    const response = await server.inject({
      method: 'POST',
      url: specId ? `/api/specs/${specId}/sessions` : '/api/sessions',
      payload: {
        requestId: randomUUID(),
        providerId: 'mock',
        mode: 'read-only',
        ...(taskIds ? { taskIds } : {}),
      },
    });
    expect(response.statusCode).toBe(201);
    ids.push(response.json<CreateContextSessionResult>().sessionId);
  }

  return ids;
}

async function read(server: FastifyInstance, sessionId: string) {
  const response = await server.inject(`/api/sessions/${sessionId}/association`);
  if (response.statusCode === 200) {
    expect(Value.Check(SessionAssociationReadSchema, response.json())).toBe(true);
  }

  return response;
}

describe('GET /api/sessions/:sessionId/association', () => {
  it('reads a standalone Session as standalone', async () => {
    const [standalone] = await seed({});
    const response = await read(await open('viewer', { projectId: 'project' }), standalone!);
    expect(response.json()).toEqual({
      sessionId: standalone,
      association: { kind: 'standalone' },
    });
  });

  it('reads the Specification and Tasks of an associated Session', async () => {
    const [sessionId] = await seed({ specId: 'S', taskIds: ['TASK-02', 'TASK-01'] });
    const response = await read(await open('viewer', { specId: 'S' }), sessionId!);
    expect(response.json<SessionAssociationRead>()).toEqual({
      sessionId,
      association: {
        kind: 'specification',
        specification: {
          state: 'available',
          value: { specId: 'S', key: 'S-1', title: 'Specification S', collection: 'current' },
        },
        // Tasks added together read in the registry's stable order.
        tasks: [
          { state: 'available', value: { taskId: 'TASK-01', title: 'First' } },
          { state: 'available', value: { taskId: 'TASK-02', title: 'Second' } },
        ],
      },
    });
  });

  it('reports an archived Specification in the archived collection', async () => {
    const [sessionId] = await seed({ specId: 'A' });
    const response = await read(await open('viewer', { projectId: 'project' }), sessionId!);
    expect(response.json<SessionAssociationRead>().association).toMatchObject({
      specification: { state: 'available', value: { collection: 'archived' } },
      tasks: [],
    });
  });

  it('keeps the association of a removed Specification and Task as missing', async () => {
    const [sessionId] = await seed({ specId: 'S', taskIds: ['TASK-01'] });
    const targets = associationTargets({
      specification: { S: { state: 'missing' } },
      tasks: { 'TASK-01': { state: 'missing' } },
    });
    const response = await read(
      await open('viewer', { projectId: 'project' }, targets),
      sessionId!,
    );
    expect(response.json<SessionAssociationRead>().association).toEqual({
      kind: 'specification',
      specification: { state: 'missing', id: 'S' },
      tasks: [{ state: 'missing', id: 'TASK-01' }],
    });
  });

  it('reports an unreadable Engine source as unavailable', async () => {
    const [sessionId] = await seed({ specId: 'S', taskIds: ['TASK-01'] });
    const targets = associationTargets({
      specification: { S: { state: 'unavailable' } },
      tasks: { 'TASK-01': { state: 'unavailable' } },
    });
    const response = await read(
      await open('viewer', { projectId: 'project' }, targets),
      sessionId!,
    );
    expect(response.json<SessionAssociationRead>().association).toEqual({
      kind: 'specification',
      specification: { state: 'unavailable' },
      tasks: [{ state: 'unavailable' }],
    });
  });

  it('answers forbidden without spec.view before any Engine lookup', async () => {
    const [sessionId] = await seed({ specId: 'S', taskIds: ['TASK-01'] });
    const targets = associationTargets();
    // A Session-scoped grant views the Session, never its Specification.
    const response = await read(
      await open('viewer', { sessionId: sessionId! }, targets),
      sessionId!,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json<SessionAssociationRead>().association).toEqual({
      kind: 'specification',
      specification: { state: 'forbidden' },
      tasks: [],
    });
    expect(targets.specification).not.toHaveBeenCalled();
    expect(targets.tasks).not.toHaveBeenCalled();
  });

  it('requires session.view at the Session scope', async () => {
    const [ofS, standalone] = await seed({ specId: 'S' }, {});
    const server = await open('viewer', { specId: 'T' });
    expect((await read(server, ofS!)).statusCode).toBe(403);
    expect((await read(server, standalone!)).statusCode).toBe(403);
    const unauthorized = await open(undefined);
    expect((await read(unauthorized, ofS!)).statusCode).toBe(403);
  });

  it('answers SESSION_NOT_FOUND for an unknown Session', async () => {
    await seed();
    const response = await read(await open('viewer', { projectId: 'project' }), randomUUID());
    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe('SESSION_NOT_FOUND');
  });

  it('answers SESSION_DISABLED when managed Sessions are disabled', async () => {
    const server = await open('viewer', { projectId: 'project' }, associationTargets(), false);
    const response = await read(server, randomUUID());
    expect(response.statusCode).toBe(503);
    expect(response.json<{ code: string }>().code).toBe('SESSION_DISABLED');
  });
});
