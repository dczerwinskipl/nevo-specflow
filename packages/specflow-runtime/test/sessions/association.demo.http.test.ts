import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SessionAssociationReadSchema,
  SessionListPageSchema,
  type SessionAssociationRead,
  type SessionListPage,
} from '@nevo/specflow-contracts/sessions';
import type { DemoCatalogue, DemoSessionResult } from '@nevo/specflow-contracts/demo';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function open(scope: Record<string, string> = {}) {
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope }] },
    },
    { dataMode: 'demo' },
  );

  return app;
}

async function read(server: FastifyInstance, sessionId: string) {
  const response = await server.inject(`/api/sessions/${sessionId}/association`);
  if (response.statusCode === 200) {
    expect(Value.Check(SessionAssociationReadSchema, response.json())).toBe(true);
  }

  return response;
}

describe('demo Session association (catalogue port)', () => {
  it('reads a seeded Session with its Specification and execution Tasks', async () => {
    const response = await read(await open(), 'sample-session-24');
    expect(response.statusCode).toBe(200);
    expect(response.json<SessionAssociationRead>()).toEqual({
      sessionId: 'sample-session-24',
      association: {
        kind: 'specification',
        specification: {
          state: 'available',
          value: {
            specId: 'admission',
            key: 'UI-1234',
            title: 'Deterministic admission and execution boundaries',
            collection: 'current',
          },
        },
        tasks: [
          {
            state: 'available',
            value: { taskId: 'TASK-02', title: expect.stringContaining('TASK-02') as unknown },
          },
        ],
      },
    });
  });

  it('reads a Session allocated in this environment', async () => {
    const server = await open();
    const catalogue = (
      await server.inject('/api/demo/specification-creation')
    ).json<DemoCatalogue>();
    const created = await server.inject({
      method: 'POST',
      url: '/api/demo/specs/admission/sessions',
      payload: {
        requestId: 'session-1',
        catalogueRevision: catalogue.revision,
        providerId: 'codex',
        modelId: 'model-a',
        mode: 'agent',
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const { sessionId } = created.json<DemoSessionResult>();
    const response = await read(server, sessionId);
    expect(response.json<SessionAssociationRead>().association).toMatchObject({
      kind: 'specification',
      specification: { state: 'available', value: { specId: 'admission' } },
      tasks: [],
    });

    // The section lists it first (the newest) next to the seeded Sessions.
    const workspace = (
      await server.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>();
    expect(workspace.sections.sessions.state).toBe('available');
    if (workspace.sections.sessions.state === 'available') {
      expect(workspace.sections.sessions.data.items.map((item) => item.id)).toEqual([
        sessionId,
        'sample-session-24',
        'sample-session-23',
      ]);
    }

    // Attention first: the seeded Session asking for input.
    expect(workspace.recommendedSessionId).toBe('sample-session-23');
  });

  it('answers forbidden without spec.view and 404 for an unknown Session', async () => {
    const scoped = await open({ sessionId: 'sample-session-24' });
    expect((await read(scoped, 'sample-session-24')).json<SessionAssociationRead>()).toEqual({
      sessionId: 'sample-session-24',
      association: { kind: 'specification', specification: { state: 'forbidden' }, tasks: [] },
    });
    await app!.close();
    const unknown = await read(await open(), 'sample-session-0');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json<{ code: string }>().code).toBe('SESSION_NOT_FOUND');
  });

  it('has no composed create in demo mode', async () => {
    const server = await open();
    const response = await server.inject({
      method: 'POST',
      url: '/api/specs/admission/sessions',
      payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
    });
    expect(response.statusCode).toBe(404);
    // The workspace action names the demo start route instead.
    const workspace = (
      await server.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>();
    expect(workspace.actions.startSession).toEqual({
      available: true,
      path: '/api/demo/specs/admission/sessions',
    });
  });
});

describe('demo Session list (catalogue source)', () => {
  const list = async (server: FastifyInstance, query = '') => {
    const response = await server.inject(`/api/sessions${query}`);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<SessionListPage>();
    expect(Value.Check(SessionListPageSchema, body)).toBe(true);

    return body;
  };

  it('lists a Specification’s seeded and allocated Sessions newest first, paged', async () => {
    const server = await open({ specId: 'admission' });
    const seeded = await list(server, '?specId=admission');
    expect(seeded.items.map((item) => [item.sessionId, item.readiness, item.association])).toEqual([
      [
        'sample-session-24',
        'busy',
        { kind: 'specification', specId: 'admission', taskIds: ['TASK-02'] },
      ],
      [
        'sample-session-23',
        'requiresAttention',
        { kind: 'specification', specId: 'admission', taskIds: [] },
      ],
    ]);

    const catalogue = (
      await server.inject('/api/demo/specification-creation')
    ).json<DemoCatalogue>();
    const allocated = (
      await server.inject({
        method: 'POST',
        url: '/api/demo/specs/admission/sessions',
        payload: {
          requestId: 'session-1',
          catalogueRevision: catalogue.revision,
          providerId: 'codex',
          modelId: 'model-a',
          mode: 'agent',
        },
      })
    ).json<DemoSessionResult>().sessionId;
    const first = await list(server, '?specId=admission&limit=2');
    expect(first.items.map((item) => item.sessionId)).toEqual([allocated, 'sample-session-24']);
    expect(first.items[0]).toMatchObject({
      providerId: 'codex',
      providerTitle: 'Codex',
      modelId: 'model-a',
      modelTitle: 'Model A · demo',
    });
    // Seeded catalogue Sessions run on the first available demo provider and its first model.
    expect(first.items[1]).toMatchObject({
      providerId: 'codex',
      providerTitle: 'Codex',
      modelId: 'model-a',
      modelTitle: 'Model A · demo',
    });
    const section = (
      await server.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>().sections.sessions;
    expect(section.state === 'available' ? section.data.items.slice(0, 2) : []).toMatchObject([
      { id: allocated, providerId: 'codex', modelTitle: 'Model A · demo', status: 'quiet' },
      { id: 'sample-session-24', providerTitle: 'Codex', updatedAt: expect.any(String) as unknown },
    ]);
    const second = await list(
      server,
      `?specId=admission&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    expect(second.items.map((item) => item.sessionId)).toEqual(['sample-session-23']);
    expect(second.nextCursor).toBeUndefined();

    expect((await list(server, '?specId=admission&archived=only')).items).toEqual([]);
    expect((await list(server, '?standalone=true')).items).toEqual([]);
    const foreign = await server.inject(
      `/api/sessions?specId=admission&taskId=TASK-02&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    expect(foreign.json<{ code: string }>().code).toBe('SESSION_CURSOR_INVALID');
  });

  it('applies the same scope rules as project mode', async () => {
    const scoped = await open({ specId: 'admission' });
    const unfiltered = await scoped.inject('/api/sessions');
    expect(unfiltered.statusCode).toBe(400);
    expect(unfiltered.json<{ code: string }>().code).toBe('SESSION_LIST_SCOPE_REQUIRED');
    await app!.close();
    // A Session-scoped grant lists that Session, redacted, and cannot filter by Specification.
    const session = await open({ sessionId: 'sample-session-24' });
    expect((await list(session)).items.map((item) => item.association)).toEqual([
      { kind: 'restricted' },
    ]);
    expect((await session.inject('/api/sessions?specId=admission')).statusCode).toBe(403);
  });
});
