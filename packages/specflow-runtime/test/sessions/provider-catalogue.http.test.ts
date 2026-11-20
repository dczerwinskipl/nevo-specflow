import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderCatalogueSchema,
  type CreateContextSessionResult,
  type ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import type { RuntimeConfig } from '../../src/config/types';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createOwnerRuntimeApp } from '../support/owner-credential';
import {
  parseSessionsFeatureConfig,
  type SessionsFeatureConfig,
} from '../../src/features/sessions';
import { passwordConfig } from '../auth/support/config';
import { associationTargets } from '../support/association-targets';

// The mock driver (a test seam) additionally lists a provider-native read-only and writer mode, so
// the catalogue's `authorized` marking of a `workspace-write` mode is observable. Sessions here
// are created read-only and never run a Turn, so the mock's own validation is unchanged.
vi.mock('../../src/features/sessions/providers/mock', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/features/sessions/providers/mock')>();

  return {
    ...original,
    createMockDriver: (...args: Parameters<typeof original.createMockDriver>) => {
      const driver = original.createMockDriver(...args);

      return {
        ...driver,
        describe: () => ({
          ...driver.describe(),
          providerModes: [
            {
              modeId: 'plan',
              title: 'Plan',
              nativeMode: 'plan',
              mode: 'read-only' as const,
              readiness: 'ready' as const,
            },
            {
              modeId: 'agent',
              title: 'Agent',
              nativeMode: 'agent',
              mode: 'workspace-write' as const,
              readiness: 'ready' as const,
            },
          ],
        }),
      };
    },
  };
});

type Role = 'viewer' | 'developer' | 'admin';

/** A well-formed ID that no Session has. */
const unknown = '00000000-0000-4000-8000-0000000000ff';
let app: FastifyInstance | undefined,
  directory = '';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nevo-provider-catalogue-'));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(directory, { recursive: true, force: true });
});

async function start(config: RuntimeConfig, store?: InMemoryAuthenticationStore) {
  await app?.close();
  app = await createOwnerRuntimeApp(config, {
    ...(store ? { auth: { store } } : {}),
    sessions: { storage: { directory, projectId: 'project' }, targets: associationTargets() },
  });

  return app;
}

/** Opens the Runtime over the same Session store, as the local user with one assignment. */
function open(
  role?: Role,
  scope: Record<string, string> = {},
  sessions: SessionsFeatureConfig = { enabled: true, providers: { mock: { enabled: true } } },
) {
  const config = passwordConfig();

  return start({
    ...config,
    authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
    authorization: { assignments: role ? [{ userId: 'demo-user', role, scope }] : [] },
    sessions,
  });
}

const catalogue = (server: FastifyInstance, query = '', headers: Record<string, string> = {}) =>
  server.inject({ url: '/api/session-providers' + query, headers });

async function createIn(server: FastifyInstance, specId: string, providerId = 'mock') {
  return server.inject({
    method: 'POST',
    url: `/api/specs/${specId}/sessions`,
    payload: { requestId: randomUUID(), providerId, mode: 'read-only' },
  });
}

/** Sessions homed in S and T, created by a project developer. */
async function seed() {
  const server = await open('developer', { projectId: 'project' });
  const ids: string[] = [];
  for (const specId of ['S', 'T']) {
    const response = await createIn(server, specId);
    expect(response.statusCode, response.body).toBe(201);
    ids.push(response.json<CreateContextSessionResult>().sessionId);
  }

  return { inS: ids[0]!, inT: ids[1]! };
}

describe('GET /api/session-providers by start context', () => {
  it('serves a Specification starter the catalogue of that Specification only', async () => {
    const server = await open('developer', { specId: 'S' });
    const own = await catalogue(server, '?specId=S');
    expect(own.statusCode, own.body).toBe(200);
    expect(Value.Check(ProviderCatalogueSchema, own.json())).toBe(true);
    expect((await catalogue(server, '?specId=T')).statusCode).toBe(403);
    // No project-level create follows from a Specification grant.
    expect((await catalogue(server)).statusCode).toBe(403);
  });

  it.each<{ name: string; role?: Role; scope?: Record<string, string> }>([
    { name: 'a viewer at the project', role: 'viewer', scope: { projectId: 'project' } },
    { name: 'a manager of one Session', role: 'developer', scope: { sessionId: unknown } },
    { name: 'no assignment' },
  ])('refuses ?specId to $name', async ({ role, scope }) => {
    const server = await open(role, scope);
    expect((await catalogue(server, '?specId=S')).statusCode).toBe(403);
  });

  it('serves Session- and Specification-scoped managers only the catalogues they manage', async () => {
    const { inS, inT } = await seed();
    const config = passwordConfig();
    const store = new InMemoryAuthenticationStore();
    const server = await start(
      {
        ...config,
        authentication: {
          ...config.authentication,
          users: {
            ...config.authentication.users,
            'session-manager': { name: 'Session manager' },
            'spec-manager': { name: 'Specification manager' },
          },
        },
        authorization: {
          assignments: [
            { userId: 'session-manager', role: 'developer', scope: { sessionId: inS } },
            { userId: 'spec-manager', role: 'developer', scope: { specId: 'S' } },
          ],
        },
        sessions: { enabled: true, providers: { mock: { enabled: true } } },
      },
      store,
    );

    function headersFor(userId: string) {
      const session = store.createSession({ userId, authenticatedWith: { kind: 'password' } });

      return { cookie: authCookieNames(config.server.port).session + '=' + session };
    }

    const manager = headersFor('session-manager');
    expect((await catalogue(server, `?sessionId=${inS}`, manager)).statusCode).toBe(200);
    expect((await catalogue(server, `?sessionId=${inT}`, manager)).statusCode).toBe(403);
    // Manage somewhere: an unknown Session is not found, as on every Session route.
    expect((await catalogue(server, `?sessionId=${unknown}`, manager)).statusCode).toBe(404);
    // Manage does not imply create.
    expect((await catalogue(server, '', manager)).statusCode).toBe(403);
    expect((await catalogue(server, '?specId=S', manager)).statusCode).toBe(403);

    const specManager = headersFor('spec-manager');
    expect((await catalogue(server, `?sessionId=${inS}`, specManager)).statusCode).toBe(200);
    expect((await catalogue(server, `?sessionId=${inT}`, specManager)).statusCode).toBe(403);
  });

  it('refuses a caller without Manage anywhere alike for a known and an unknown Session', async () => {
    const { inS } = await seed();
    const viewer = await open('viewer', { projectId: 'project' });
    for (const sessionId of [inS, unknown]) {
      expect((await catalogue(viewer, `?sessionId=${sessionId}`)).statusCode).toBe(403);
    }
  });

  it('keeps the project rule without a context and rejects both contexts together', async () => {
    const server = await open('developer', { projectId: 'project' });
    expect((await catalogue(server)).statusCode).toBe(200);
    const both = await catalogue(server, `?specId=S&sessionId=${unknown}`);
    expect(both.statusCode).toBe(400);
    expect(both.json<{ code: string }>().code).toBe('SESSION_INPUT_INVALID');
    // The query is closed and its values are bounded.
    expect((await catalogue(server, '?projectId=project')).statusCode).toBe(400);
    expect((await catalogue(server, '?sessionId=not-a-session')).statusCode).toBe(400);
  });

  async function expectWriterMode(server: FastifyInstance, query: string, authorized: boolean) {
    const read = await catalogue(server, query);
    expect(read.statusCode, read.body).toBe(200);
    const modes = read
      .json<{ items: ProviderDescriptor[] }>()
      .items.find((item) => item.providerId === 'mock')?.providerModes;
    expect(modes?.find((mode) => mode.modeId === 'plan')?.authorized).toBe(true);
    expect(modes?.find((mode) => mode.modeId === 'agent')?.authorized).toBe(authorized);
  }

  it('authorizes a writer mode with a project grant', async () => {
    const project = await open('developer', { projectId: 'project' });
    await expectWriterMode(project, '', true);
  });

  it('authorizes a writer mode with a Session grant', async () => {
    const project = await open('developer', { projectId: 'project' });
    const created = await createIn(project, 'S');
    expect(created.statusCode, created.body).toBe(201);
    const { sessionId } = created.json<CreateContextSessionResult>();
    const manager = await open('developer', { sessionId });
    await expectWriterMode(manager, `?sessionId=${sessionId}`, true);
  });

  it('refuses a writer mode with a Specification grant in both contexts', async () => {
    const inSpec = await open('developer', { specId: 'S' });
    const created = await createIn(inSpec, 'S');
    expect(created.statusCode, created.body).toBe(201);
    const { sessionId } = created.json<CreateContextSessionResult>();
    await expectWriterMode(inSpec, '?specId=S', false);
    await expectWriterMode(inSpec, `?sessionId=${sessionId}`, false);
  });

  it('lets developer@S read the catalogue and start a Session in S, and refuses T', async () => {
    const server = await open('developer', { specId: 'S' });
    const read = await catalogue(server, '?specId=S');
    expect(read.statusCode).toBe(200);
    const provider = read
      .json<{ items: ProviderDescriptor[] }>()
      .items.find((item) => item.readiness === 'ready');
    expect(provider).toBeDefined();

    const created = await createIn(server, 'S', provider!.providerId);
    expect(created.statusCode, created.body).toBe(201);
    const { sessionId, association } = created.json<CreateContextSessionResult>();
    expect(association).toEqual({ specId: 'S', taskIds: [] });
    // The composer of the started Session reads the catalogue for it.
    expect((await catalogue(server, `?sessionId=${sessionId}`)).statusCode).toBe(200);

    expect((await catalogue(server, '?specId=T')).statusCode).toBe(403);
    expect((await createIn(server, 'T', provider!.providerId)).statusCode).toBe(403);
  });
});

describe('GET /api/session-providers under project policy and workstation enablement', () => {
  const items = async (server: FastifyInstance, query = '') => {
    const response = await catalogue(server, query);
    expect(response.statusCode, response.body).toBe(200);
    expect(Value.Check(ProviderCatalogueSchema, response.json())).toBe(true);

    return response.json<{ items: ProviderDescriptor[] }>().items;
  };

  it('lists each withheld provider as unavailable with its reason, and refuses to start it', async () => {
    const server = await open(
      'developer',
      { projectId: 'project' },
      parseSessionsFeatureConfig({
        project: {
          enabled: true,
          providers: { mock: { allowed: true }, codex: { allowed: true } },
        },
        // A provider the project does not allow stays not allowed, whatever the workstation says.
        local: { providers: { codex: { enabled: false }, claude: { enabled: false } } },
      }),
    );
    const listed = await items(server);
    expect(listed.map((item) => [item.providerId, item.readiness, item.reasonCode])).toEqual([
      ['mock', 'ready', undefined],
      ['claude', 'unavailable', 'NOT_ALLOWED_BY_PROJECT'],
      ['codex', 'unavailable', 'NOT_ENABLED_ON_WORKSTATION'],
      ['antigravity', 'unavailable', 'NOT_ALLOWED_BY_PROJECT'],
    ]);
    expect(listed[1]!.reason).toContain('sessions.providers.claude.allowed: true');
    expect(listed[2]!.reason).toContain('.nevo/local/config.yaml');
    for (const providerId of ['claude', 'codex', 'antigravity']) {
      const created = await createIn(server, 'S', providerId);
      expect(created.statusCode).toBe(503);
      expect(created.json()).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    }

    // Read for a Specification the withheld entries keep their configuration reason.
    expect((await items(server, '?specId=S')).slice(1).map((item) => item.reasonCode)).toEqual([
      'NOT_ALLOWED_BY_PROJECT',
      'NOT_ENABLED_ON_WORKSTATION',
      'NOT_ALLOWED_BY_PROJECT',
    ]);
  });

  it('serves no catalogue and starts nothing while the project disables Sessions, whatever is local', async () => {
    const server = await open(
      'developer',
      { projectId: 'project' },
      parseSessionsFeatureConfig({
        project: {
          enabled: false,
          providers: { mock: { allowed: true }, claude: { allowed: true } },
        },
        local: { providers: { mock: { enabled: true }, claude: { enabled: true } } },
      }),
    );
    for (const response of [await catalogue(server), await createIn(server, 'S')]) {
      expect(response.statusCode, response.body).toBe(503);
      expect(response.json()).toMatchObject({ code: 'SESSION_DISABLED' });
    }
  });
});
