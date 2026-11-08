import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { openSessionStore } from '../../src/features/sessions/persistence/store';
import type { AssociationWrite } from '../../src/features/sessions/persistence/protocol';
import { sessionScope } from '../../src/features/sessions/scope';
import { passwordConfig } from '../auth/support/config';

vi.mock('../../src/features/sessions/scope', async (original) => {
  const actual = await original<typeof import('../../src/features/sessions/scope')>();

  return { ...actual, sessionScope: vi.fn(actual.sessionScope) };
});

type Role = 'viewer' | 'developer' | 'admin';
type Grant = 'global' | 'project' | 'spec' | 'session' | 'none';
interface Seeded {
  /** Associated with S. */
  a: string;
  /** Associated with S; the target of the write-execution checks. */
  w: string;
  /** Associated with T. */
  b: string;
  /** Standalone. */
  c: string;
}

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

/** Seeds the store directly: the composed create route is not this task's subject. */
async function seed(): Promise<Seeded> {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-association-authz-'));
  const store = await openSessionStore({ directory, projectId: 'project' });
  try {
    const create = async (association?: AssociationWrite) =>
      (
        await store.call<{ sessionId: string }>({
          op: 'create',
          actor: 'someone-else',
          input: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
          ...(association ? { association } : {}),
        })
      ).sessionId;
    const spec = (specId: string): AssociationWrite => ({ specId, taskIds: [], origin: 'user' });

    return {
      a: await create(spec('S')),
      w: await create(spec('S')),
      b: await create(spec('T')),
      c: await create(),
    };
  } finally {
    await store.close();
  }
}

function grantScope(grant: Grant, seeded: Seeded): Record<string, string> | undefined {
  return {
    global: {},
    project: { projectId: 'project' },
    spec: { specId: 'S' },
    session: { sessionId: seeded.a },
    none: undefined,
  }[grant];
}

async function open(role: Role, grant: Grant, seeded: Seeded) {
  const config = passwordConfig();
  const scope = grantScope(grant, seeded);
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: {
        assignments: scope ? [{ userId: 'demo-user', role, scope }] : [],
      },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' } } },
  );

  return app;
}

/** Section 6.1 written out: the target scope each check runs at. */
function targets(seeded: Seeded) {
  const session = (sessionId: string, specId?: string) => ({
    projectId: 'project',
    ...(specId ? { specId } : {}),
    sessionId,
  });

  return {
    a: session(seeded.a, 'S'),
    b: session(seeded.b, 'T'),
    c: session(seeded.c),
    create: { projectId: 'project' },
    // execute-write never carries the home Specification.
    write: session(seeded.w),
    // The write Session's own (Specification-bearing) scope gates the manage precheck.
    manageW: session(seeded.w, 'S'),
  };
}

const roleCapabilities: Record<Role, readonly string[]> = {
  viewer: ['view'],
  developer: ['view', 'create', 'manage', 'delete', 'execute-write'],
  admin: ['view', 'create', 'manage', 'delete', 'execute-write', 'view-provider-limits'],
};

/** Directional coverage: every granted dimension must match the target. */
function allowed(
  role: Role,
  grant: Record<string, string> | undefined,
  capabilities: readonly string[],
  target: Record<string, string>,
) {
  return (
    grant !== undefined &&
    capabilities.every((capability) => roleCapabilities[role].includes(capability)) &&
    Object.entries(grant).every(([key, value]) => target[key] === value)
  );
}

const status = (permitted: boolean): unknown =>
  permitted ? (expect.not.stringMatching(/^403$/) as unknown) : '403';

describe('Session authorization at the associated Session scope', () => {
  const cases = (['viewer', 'developer', 'admin'] as const).flatMap((role) =>
    (['global', 'project', 'spec', 'session'] as const).map((grant) => ({ role, grant })),
  );
  it.each([...cases, { role: 'developer' as const, grant: 'none' as const }])(
    '$role@$grant',
    async ({ role, grant }) => {
      const seeded = await seed();
      const server = await open(role, grant, seeded);
      const scope = grantScope(grant, seeded),
        target = targets(seeded);
      const can = (capabilities: readonly string[], at: Record<string, string>): unknown =>
        status(allowed(role, scope, capabilities, at));
      const post = (sessionId: string, path: string, payload: object) =>
        server.inject({ method: 'POST', url: `/api/sessions/${sessionId}/${path}`, payload });
      const observed: Record<string, string> = {},
        expected: Record<string, unknown> = {};
      const record = (name: string, statusCode: number, expectation: unknown) => {
        observed[name] = String(statusCode);
        expected[name] = expectation;
      };

      for (const key of ['a', 'b', 'c'] as const) {
        const id = seeded[key];
        record(
          'view ' + key,
          (await server.inject('/api/sessions/' + id)).statusCode,
          can(['view'], target[key]),
        );
        record(
          'telemetry ' + key,
          (await server.inject(`/api/sessions/${id}/telemetry`)).statusCode,
          can(['view'], target[key]),
        );
        record(
          'rename ' + key,
          (await post(id, 'rename', { requestId: randomUUID(), title: 'Renamed' })).statusCode,
          can(['view', 'manage'], target[key]),
        );
        record(
          'limits ' + key,
          (await post(id, 'telemetry/refresh', { requestId: randomUUID(), groups: ['limits'] }))
            .statusCode,
          can(['view', 'manage', 'view-provider-limits'], target[key]),
        );
        if (!allowed(role, scope, ['view'], target[key])) {
          // A permitted stream stays open; only the refusal is observable through inject.
          record(
            'events ' + key,
            (await server.inject(`/api/sessions/${id}/events`)).statusCode,
            '403',
          );
        }
      }

      record(
        'create',
        (
          await server.inject({
            method: 'POST',
            url: '/api/sessions',
            payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
          })
        ).statusCode,
        can(['create'], target.create),
      );
      record(
        'write Turn',
        (
          await post(seeded.w, 'turns', {
            requestId: randomUUID(),
            message: 'Write',
            mode: 'workspace-write',
          })
        ).statusCode,
        allowed(role, scope, ['view', 'manage'], target.manageW)
          ? can(['execute-write'], target.write)
          : '403',
      );
      for (const key of ['a', 'b', 'c'] as const) {
        record(
          'delete ' + key,
          (await server.inject({ method: 'DELETE', url: '/api/sessions/' + seeded[key] }))
            .statusCode,
          can(['delete'], target[key]),
        );
      }

      expect(observed).toEqual(expected);
    },
  );

  it('lets viewer@{specId} view the Specification Sessions but not manage, delete or create', async () => {
    const seeded = await seed();
    const server = await open('viewer', 'spec', seeded);
    const view = await server.inject('/api/sessions/' + seeded.a);
    expect(view.statusCode).toBe(200);
    expect(view.json<SessionSnapshot>().session.capabilities).toMatchObject({
      view: true,
      manage: false,
      delete: false,
      executeWrite: false,
      start: false,
    });
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/sessions/${seeded.a}/archive`,
          payload: { requestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await server.inject({ method: 'DELETE', url: '/api/sessions/' + seeded.a })).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('lets developer@{specId} manage any Session of S but never write-execute or reach others', async () => {
    const seeded = await seed();
    const server = await open('developer', 'spec', seeded);
    const view = await server.inject('/api/sessions/' + seeded.a);
    expect(view.statusCode).toBe(200);
    // Created by another actor: the creator is audit metadata, never an ACL.
    expect(view.json<SessionSnapshot>().session.capabilities).toMatchObject({
      view: true,
      manage: true,
      delete: true,
      executeWrite: false,
    });
    expect((await server.inject('/api/sessions/' + seeded.b)).statusCode).toBe(403);
    expect((await server.inject('/api/sessions/' + seeded.c)).statusCode).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/sessions/${seeded.w}/turns`,
          payload: { requestId: randomUUID(), message: 'Write', mode: 'workspace-write' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { requestId: randomUUID(), providerId: 'mock', mode: 'workspace-write' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await server.inject({ method: 'DELETE', url: '/api/sessions/' + seeded.a })).statusCode,
    ).toBe(204);
  });

  it('takes every Session route scope from sessionScope with the store-derived identity', async () => {
    const seeded = await seed();
    const server = await open('admin', 'project', seeded);
    const spy = vi.mocked(sessionScope);
    spy.mockClear();
    const identity = { projectId: 'project', specId: 'S', sessionId: seeded.a };
    expect((await server.inject('/api/sessions/' + seeded.a)).statusCode).toBe(200);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/sessions/${seeded.a}/rename`,
          payload: { requestId: randomUUID(), title: 'Renamed' },
        })
      ).statusCode,
    ).toBe(200);
    await server.inject({
      method: 'POST',
      url: `/api/sessions/${seeded.a}/telemetry/refresh`,
      payload: { requestId: randomUUID(), groups: ['limits'] },
    });
    await server.inject({
      method: 'POST',
      url: `/api/sessions/${seeded.a}/turns`,
      payload: { requestId: randomUUID(), message: 'Write', mode: 'workspace-write' },
    });
    expect(
      (await server.inject({ method: 'DELETE', url: '/api/sessions/' + seeded.a })).statusCode,
    ).toBe(204);
    // Every call receives the store-derived identity, including the home Specification.
    expect(spy.mock.calls.map(([called]) => called)).toEqual(spy.mock.calls.map(() => identity));
    expect([...new Set(spy.mock.calls.map(([, capability]) => capability))].sort()).toEqual([
      'session.delete',
      'session.execute-write',
      'session.manage',
      'session.view',
      'session.view-provider-limits',
    ]);
    const write = spy.mock.calls.findIndex(
      ([, capability]) => capability === 'session.execute-write',
    );
    expect(spy.mock.results[write]!.value).toEqual({ projectId: 'project', sessionId: seeded.a });
  });
});
