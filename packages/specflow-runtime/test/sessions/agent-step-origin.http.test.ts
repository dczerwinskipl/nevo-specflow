import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it } from 'vitest';
import type {
  AgentStepOrigin,
  CreateContextSessionResult,
  SessionListPage,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { associationTargets } from '../support/association-targets';

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

const origin: AgentStepOrigin = {
  stepId: 'implement',
  stepTitle: 'Implement',
  attempt: 2,
  taskId: 'T-1',
  taskTitle: 'Login form',
};

async function open(
  role: 'viewer' | 'developer',
  scope: Record<string, string>,
  origins: Map<string, AgentStepOrigin>,
) {
  await app?.close();
  directory ||= await mkdtemp(join(tmpdir(), 'nevo-agent-step-origin-'));
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: [{ userId: 'demo-user', role, scope }] },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    {
      sessions: {
        storage: { directory, projectId: 'project' },
        targets: associationTargets(),
        agentStepOrigins: (specId) =>
          Promise.resolve(specId === 'S' ? origins : new Map<string, AgentStepOrigin>()),
      },
    },
  );

  return app;
}

it('exposes the agent step origin on the Session list and the single Session read, to a Specification viewer only', async () => {
  const origins = new Map<string, AgentStepOrigin>();
  let server = await open('developer', { projectId: 'project' }, origins);
  const created = await server.inject({
    method: 'POST',
    url: '/api/specs/S/sessions',
    payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
  });
  expect(created.statusCode).toBe(201);
  const sessionId = created.json<CreateContextSessionResult>().sessionId;
  origins.set(sessionId, origin);

  const snapshot = await server.inject(`/api/sessions/${sessionId}`);
  expect(snapshot.json<SessionSnapshot>().session.agentStep).toEqual(origin);
  const list = await server.inject('/api/sessions?specId=S');
  expect(list.json<SessionListPage>().items.find((item) => item.sessionId === sessionId)).toEqual(
    expect.objectContaining({ agentStep: origin }),
  );

  // Session view without the Specification's view: the step and Task titles are not disclosed.
  server = await open('viewer', { sessionId }, origins);
  const restricted = await server.inject(`/api/sessions/${sessionId}`);
  expect(restricted.statusCode).toBe(200);
  expect(restricted.json<SessionSnapshot>().session.agentStep).toBeUndefined();
});

it('leaves the origin out of a list row whose Specification the caller may not view', async () => {
  const origins = new Map<string, AgentStepOrigin>();
  let server = await open('developer', { projectId: 'project' }, origins);
  const created = await server.inject({
    method: 'POST',
    url: '/api/specs/S/sessions',
    payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
  });
  const sessionId = created.json<CreateContextSessionResult>().sessionId;
  origins.set(sessionId, origin);

  server = await open('viewer', { sessionId }, origins);
  const row = (await server.inject('/api/sessions')).json<SessionListPage>().items[0];
  expect(row).toMatchObject({ sessionId, association: { kind: 'restricted' } });
  expect(row?.agentStep).toBeUndefined();
});
