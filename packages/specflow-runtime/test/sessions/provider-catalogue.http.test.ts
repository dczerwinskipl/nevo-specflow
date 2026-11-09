import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProviderCatalogueSchema,
  type CreateContextSessionResult,
  type ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { associationTargets } from '../support/association-targets';

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

/** Opens the Runtime over the same Session store, as the local user with one assignment. */
async function open(role?: Role, scope: Record<string, string> = {}) {
  await app?.close();
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: {
        assignments: role ? [{ userId: 'demo-user', role, scope }] : [],
      },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    {
      sessions: { storage: { directory, projectId: 'project' }, targets: associationTargets() },
    },
  );

  return app;
}

const catalogue = (server: FastifyInstance, query = '') =>
  server.inject('/api/session-providers' + query);

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

  it('serves a Session manager the catalogue of that Session only', async () => {
    const { inS, inT } = await seed();
    const manager = await open('developer', { sessionId: inS });
    expect((await catalogue(manager, `?sessionId=${inS}`)).statusCode).toBe(200);
    expect((await catalogue(manager, `?sessionId=${inT}`)).statusCode).toBe(403);
    // Manage somewhere: an unknown Session is not found, as on every Session route.
    expect((await catalogue(manager, `?sessionId=${unknown}`)).statusCode).toBe(404);
    // Manage does not imply create.
    expect((await catalogue(manager)).statusCode).toBe(403);
    expect((await catalogue(manager, '?specId=S')).statusCode).toBe(403);

    // A Specification grant manages that Specification's Sessions, not another's.
    const specManager = await open('developer', { specId: 'S' });
    expect((await catalogue(specManager, `?sessionId=${inS}`)).statusCode).toBe(200);
    expect((await catalogue(specManager, `?sessionId=${inT}`)).statusCode).toBe(403);
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
