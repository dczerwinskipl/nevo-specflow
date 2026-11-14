import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SpecificationWorkspaceResponseSchema,
  type SpecificationWorkspaceResponse,
} from '@nevo/specflow-contracts/specs/workspace';
import { createRuntimeApp } from '../../src/server/app';
import { openSessionStore } from '../../src/features/sessions/persistence/store';
import type {
  AssociationWrite,
  SessionView,
} from '../../src/features/sessions/persistence/protocol';
import type { SpecificationWorkspaceRepository } from '../../src/features/specs/workspace/repository';
import { createMockDriver } from '../../src/features/sessions/providers/mock';
import type { SessionDriver } from '../../src/features/sessions/providers/driver';
import { passwordConfig } from '../auth/support/config';
import { associationTargets } from '../support/association-targets';
import { sessionReferences } from '../support/session-references';
import type { SpecFlowEngine } from '@nevo/specflow-engine';
import { createEngineAssociationTargets } from '../../src/features/session-associations';

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

const unavailable = { state: 'unavailable', reason: 'not_implemented' } as const;
/** The Specification identity of `S` and `T`; Sessions come from the association contribution. */
const workspaceRepository: SpecificationWorkspaceRepository = {
  readSpecification(specId) {
    return Promise.resolve(
      specId === 'S' || specId === 'T'
        ? {
            revision: 'revision-1',
            workspaceId: '0b8f1c1e-0a11-4c6e-9a01-000000000001',
            specification: {
              id: specId,
              title: 'Specification ' + specId,
              summary: '',
              preparationState: 'prepared',
              attention: [],
            },
            sections: { repository: unavailable, changes: unavailable },
            actions: {
              executeTasks: { available: false, reason: 'not_implemented' },
              startSession: { available: false, reason: 'sessions_disabled' },
            },
          }
        : null,
    );
  },
};

async function seed(
  build: (
    create: (association?: AssociationWrite, title?: string) => Promise<string>,
  ) => Promise<string[]>,
  store = { archive: [] as string[], rename: [] as string[] },
) {
  directory = await mkdtemp(join(tmpdir(), 'nevo-workspace-sessions-'));
  const opened = await openSessionStore({ directory, projectId: 'project' });
  try {
    const ids = await build(
      async (association, title) =>
        (
          await opened.call<{ sessionId: string }>({
            op: 'create',
            actor: 'someone-else',
            input: {
              requestId: randomUUID(),
              providerId: 'mock',
              mode: 'read-only',
              ...(title ? { title } : {}),
              // A titled Session names the catalogue's model; an untitled one names none.
              ...(title ? { modelId: 'mock' } : {}),
            },
            ...(association ? { association } : {}),
          })
        ).sessionId,
    );
    for (const sessionId of store.archive) {
      await opened.call({
        op: 'archive',
        actor: 'someone-else',
        sessionId,
        input: { requestId: randomUUID() },
      });
    }

    for (const sessionId of store.rename) {
      // The worker stores millisecond timestamps. Advance beyond the creates before renaming,
      // so this fixture proves a strictly later update even on a coarse platform clock.
      const createdBy = Date.now();
      await vi.waitFor(() => expect(Date.now()).toBeGreaterThan(createdBy), { interval: 1 });
      const renamed = await opened.call<SessionView>({
        op: 'rename',
        actor: 'someone-else',
        sessionId,
        input: { requestId: randomUUID(), title: 'Renamed later' },
      });
      expect(Date.parse(renamed.session.updatedAt)).toBeGreaterThan(createdBy);
    }

    return ids;
  } finally {
    await opened.close();
  }
}

async function open(
  role: Role | undefined,
  scope: Record<string, string> = {},
  sessions: { enabled?: boolean; mock?: boolean; driver?: SessionDriver } = {},
) {
  directory ||= await mkdtemp(join(tmpdir(), 'nevo-workspace-sessions-'));
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: role ? [{ userId: 'demo-user', role, scope }] : [] },
      sessions: {
        enabled: sessions.enabled ?? true,
        providers: { mock: { enabled: sessions.mock ?? true } },
      },
    },
    {
      specs: { workspaceRepository },
      sessions: {
        storage: { directory, projectId: 'project' },
        targets: associationTargets(),
        ...(sessions.driver ? { driver: sessions.driver } : {}),
      },
    },
  );

  return app;
}

async function workspace(server: FastifyInstance, specId = 'S') {
  const response = await server.inject(`/api/specs/${specId}/workspace`);
  expect(response.statusCode, response.body).toBe(200);
  const body = response.json<SpecificationWorkspaceResponse>();
  expect(Value.Check(SpecificationWorkspaceResponseSchema, body)).toBe(true);

  return body;
}

const row = { providerId: 'mock', updatedAt: '2026-11-08T00:00:00.000Z' };
/** A stored mock Session row: the catalogue's provider title, no model, its own update time. */
const mockRow = {
  providerId: 'mock',
  providerTitle: 'Controlled mock (test only)',
  updatedAt: expect.any(String) as unknown,
};
/** The catalogue's model of a titled seeded Session. */
const mockModel = { modelId: 'mock', modelTitle: 'Deterministic test model' };
const spec = (specId: string, taskIds: string[] = []): AssociationWrite => ({
  specId,
  taskIds,
  origin: 'user',
});

describe('project-mode workspace sessions section', () => {
  it('lists the associated, non-archived Sessions newest first with readiness status', async () => {
    const archived: string[] = [];
    const [older, , archivedOne, newer] = await seed(
      async (create) => {
        const ids = [
          await create(spec('S'), 'Older'),
          await create(spec('T')),
          await create(spec('S')),
          await create(spec('S', ['TASK-01'])),
          await create(),
        ];
        archived.push(ids[2]!);

        return ids;
      },
      { archive: archived, rename: [] },
    );
    const body = await workspace(await open('viewer', { projectId: 'project' }));
    expect(body.sections.sessions).toEqual({
      state: 'available',
      data: {
        items: [
          // Untitled: the server never invents a title.
          { id: newer, taskIds: ['TASK-01'], status: 'quiet', ...mockRow },
          { id: older, title: 'Older', taskIds: [], status: 'quiet', ...mockRow, ...mockModel },
        ],
        attention: [],
      },
    });
    expect(JSON.stringify(body)).not.toContain(archivedOne!);
    // Equal status: the most recently updated Session.
    expect(body.recommendedSessionId).toBe(newer);
    // One "Session started" event per listed Session, bound to it, newest first.
    expect(body.sections.activity).toEqual({
      state: 'available',
      data: {
        items: [
          {
            id: 'session-started.' + newer,
            occurredAt: expect.any(String) as unknown,
            kind: 'session',
            event: 'session_started',
            title: '',
            description: 'Session started',
            targetId: newer,
            relatedSessionId: newer,
          },
          expect.objectContaining({
            id: 'session-started.' + older,
            title: 'Older',
            targetId: older,
            relatedSessionId: older,
          }),
        ],
      },
    });
  });

  it('applies the effective readiness and keeps the provider facts for Continue session', async () => {
    const [session] = await seed(async (create) => [await create(spec('S'), 'Plan')]);
    const mock = createMockDriver();
    const driver: SessionDriver = {
      ...mock,
      describe: () => ({ ...mock.describe(), readiness: 'authenticationRequired' }),
    };
    const body = await workspace(await open('viewer', { projectId: 'project' }, { driver }));
    expect(body.sections.sessions).toMatchObject({
      state: 'available',
      data: {
        items: [{ id: session, status: 'authenticationRequired', ...mockRow, ...mockModel }],
      },
    });
    // A sign-in is no reason to recommend, but the only Session is still the recommendation.
    expect(body.recommendedSessionId).toBe(session);
  });

  it('recommends the most recently updated Session', async () => {
    const renamed: string[] = [];
    const [older] = await seed(
      async (create) => {
        const ids = [await create(spec('S')), await create(spec('S'))];
        renamed.push(ids[0]!);

        return ids;
      },
      { archive: [], rename: renamed },
    );
    expect(
      (await workspace(await open('viewer', { projectId: 'project' }))).recommendedSessionId,
    ).toBe(older);
  });

  it('caps the section at 100 rows and reports hasMore', async () => {
    await seed(async (create) => {
      const ids: string[] = [];
      for (let index = 0; index < 101; index += 1) {
        ids.push(await create(spec('S')));
      }

      return ids;
    });
    const body = await workspace(await open('viewer', { specId: 'S' }));
    expect(body.sections.sessions.state).toBe('available');
    if (body.sections.sessions.state === 'available') {
      expect(body.sections.sessions.data.items).toHaveLength(100);
      expect(body.sections.sessions.data.hasMore).toBe(true);
    }
  }, 120000);

  it.each<{
    name: string;
    role: Role;
    scope: Record<string, string>;
    sessions: { enabled?: boolean; mock?: boolean };
    action: { available: boolean; reason?: string };
  }>([
    {
      name: 'available to a developer with a ready provider',
      role: 'developer',
      scope: { specId: 'S' },
      sessions: {},
      action: { available: true },
    },
    {
      name: 'forbidden to a viewer',
      role: 'viewer',
      scope: { projectId: 'project' },
      sessions: {},
      action: { available: false, reason: 'forbidden' },
    },
    {
      name: 'no_provider without a usable provider',
      role: 'developer',
      scope: { projectId: 'project' },
      sessions: { mock: false },
      action: { available: false, reason: 'no_provider' },
    },
    {
      name: 'forbidden before no_provider',
      role: 'viewer',
      scope: { projectId: 'project' },
      sessions: { mock: false },
      action: { available: false, reason: 'forbidden' },
    },
    {
      name: 'sessions_disabled before forbidden',
      role: 'viewer',
      scope: { projectId: 'project' },
      sessions: { enabled: false },
      action: { available: false, reason: 'sessions_disabled' },
    },
  ])('startSession is $name', async ({ role, scope, sessions, action }) => {
    await seed(() => Promise.resolve([]));
    const body = await workspace(await open(role, scope, sessions));
    expect(body.actions.startSession).toEqual(action);
    if (action.reason === 'sessions_disabled') {
      expect(body.sections.sessions).toEqual({
        state: 'unavailable',
        reason: 'source_unavailable',
      });
    }
  });
});

describe('workspace Session references when the Engine registry is unreadable', () => {
  it('keeps the section rows (store identity) and hides the other references', async () => {
    const archived: string[] = [];
    const [visible, hidden] = await seed(
      async (create) => {
        const ids = [await create(spec('S')), await create(spec('S'))];
        archived.push(ids[1]!);

        return ids;
      },
      { archive: archived, rename: [] },
    );
    const failing = {
      readRegistry: () => Promise.reject(new Error('registry unreadable')),
    } as unknown as SpecFlowEngine;
    const config = passwordConfig();
    app = await createRuntimeApp(
      {
        ...config,
        authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
        authorization: {
          assignments: [{ userId: 'demo-user', role: 'viewer', scope: { projectId: 'project' } }],
        },
        sessions: { enabled: true, providers: { mock: { enabled: true } } },
      },
      {
        specs: {
          workspaceRepository: {
            async readSpecification(specId) {
              const read = await workspaceRepository.readSpecification(specId);

              // An Engine attention item naming the archived Session: resolved through the registry.
              return (
                read && {
                  ...read,
                  specification: {
                    ...read.specification,
                    attention: [
                      { id: 'a', kind: 'session', title: 'Hidden', reason: 'r', targetId: hidden! },
                    ],
                  },
                }
              );
            },
          },
        },
        sessions: {
          storage: { directory, projectId: 'project' },
          targets: {
            ...associationTargets(),
            workspaces: (specIds: readonly string[]) =>
              createEngineAssociationTargets(failing).workspaces(specIds),
          },
        },
      },
    );
    const body = await workspace(app);
    expect(body.sections.sessions).toMatchObject({ data: { items: [{ id: visible }] } });
    expect(body.specification.attention).toEqual([]);
  });
});

describe('workspace Session recommendation', () => {
  it('recommends the first candidate the caller may view', async () => {
    const hidden = '00000000-0000-4000-8000-000000000001';
    const visible = '00000000-0000-4000-8000-000000000002';
    const config = passwordConfig();
    app = await createRuntimeApp(
      {
        ...config,
        authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
        authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }] },
      },
      {
        specs: {
          workspaceRepository,
          contributions: {
            sessions: () =>
              Promise.resolve({
                section: {
                  state: 'available',
                  data: {
                    items: [
                      { id: hidden, taskIds: [], status: 'attention', ...row },
                      { id: visible, taskIds: [], status: 'quiet', ...row },
                    ],
                    attention: [],
                  },
                },
                recommendedSessionIds: [hidden, visible],
                sessionStarts: [
                  { sessionId: hidden, title: 'Hidden', createdAt: '2026-11-08T10:00:00.000Z' },
                  { sessionId: visible, createdAt: '2026-11-08T09:00:00.000Z' },
                ],
              }),
          },
        },
        // `hidden` resolves to no association, so no grant can view it here.
        sessions: {
          references: sessionReferences((sessionId) =>
            Promise.resolve(
              sessionId === visible
                ? { sessionId, specId: 'S', projectId: 'project', workspaceId: 'workspace' }
                : null,
            ),
          ),
        },
      },
    );
    const body = await workspace(app);
    expect(body.recommendedSessionId).toBe(visible);
    // The activity history is authorized per Session: the caller sees the other event, not this one.
    expect(body.sections.activity).toEqual({
      state: 'available',
      data: { items: [expect.objectContaining({ id: `session-started.${visible}` })] },
    });
    expect(JSON.stringify(body)).not.toContain(hidden);
    expect(JSON.stringify(body)).not.toContain('Hidden');
  });
});
