import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createAuthorization, type Scope } from '@nevo/authorization';
import { SpecCapabilities, ProjectGitCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import { createRequestAuthorization } from '../../src/features/auth/authorization/request-authorization';
import { registerRuntimeErrorHandler } from '../../src/server/error-handler';
import { specFlowRoleCapabilities } from '../../src/server/roles';
import { SettingsCapabilities } from '../../src/features/settings';
import { taskReadEndpoint } from '../../src/features/tasks/endpoint';
import { specificationWorkspaceEndpoint } from '../../src/features/specs/workspace/endpoint';
import { PageLeases } from '../../src/features/tasks/reads/page-leases';
import { createDemoTaskSources } from '../../src/features/tasks';
import { createDemoSpecsRepositories } from '../../src/features/specs';
import type { SessionReference, SessionReferenceOwner } from '../../src/features/sessions';
import { sessionScope } from '../../src/features/sessions/scope';

vi.mock('../../src/features/sessions/scope', async (original) => {
  const actual = await original<typeof import('../../src/features/sessions/scope')>();

  return { ...actual, sessionScope: vi.fn(actual.sessionScope) };
});

type Role = 'viewer' | 'developer' | 'admin';
const SPEC = 'admission';
const grants: Record<string, Scope | undefined> = {
  global: {},
  project: { projectId: 'demo-project' },
  spec: { specId: SPEC },
  session: { sessionId: 'session-a' },
  otherProject: { projectId: 'other-project' },
  otherSpec: { specId: 'other' },
  none: undefined,
};

async function fixture(role: Role, grant: Scope | undefined) {
  const demo = createDemoSpecsRepositories(),
    sources = createDemoTaskSources(demo.catalogue);
  const definition = (await sources.definitions!.resolve(SPEC, 'TASK-03'))!;
  const execution = (await sources.execution!.inspect(definition.identity, definition.version))!;
  const link = (sessionId: string) => ({
    state: 'available' as const,
    target: { kind: 'session' as const, sessionId },
  });
  definition.dependencies = [
    { taskId: 'dependency-a', title: 'Dependency A', link: link('session-a') },
    { taskId: 'dependency-b', title: 'Dependency B', link: link('session-b') },
  ];
  execution.requirements = [
    {
      id: 'gate',
      definitionRevision: '1',
      source: {
        kind: 'human-gate',
        gateId: 'gate',
        phase: 'exit',
        role: 'owner',
        scope: 'task',
        targetId: 'TASK-03',
      },
      key: null,
      title: 'Inspect materials',
      instruction: null,
      state: 'pending',
      actions: [],
      evidence: [{ title: 'Evidence C', link: link('session-c') }],
    },
  ];
  execution.pendingCount = 1;
  execution.recovery = {
    id: 'recovery',
    state: 'required',
    summary: 'Recovery A',
    link: link('session-a'),
  };

  // session-a belongs to the Specification, session-b to another one, session-c is standalone.
  const owners: Record<string, SessionReference> = {
    'session-a': { ...definition.identity, specId: SPEC, sessionId: 'session-a' },
    'session-b': { ...definition.identity, specId: 'other', sessionId: 'session-b' },
  };
  const batches: string[][] = [];
  const sessions: SessionReferenceOwner = {
    resolve: () => Promise.reject(new Error('A read must resolve its references in one batch')),
    resolveMany: (ids) => {
      batches.push([...ids]);

      return Promise.resolve(
        new Map(ids.flatMap((id) => (owners[id] ? [[id, owners[id]] as const] : []))),
      );
    },
  };

  const subject = { kind: 'user' as const, id: 'alice' };
  const authorization = createAuthorization({
    resources: [
      SpecCapabilities,
      SessionCapabilities,
      SettingsCapabilities,
      ProjectGitCapabilities,
    ],
    roles: specFlowRoleCapabilities(),
    assignments: grant ? [{ subject, role, scope: grant }] : [],
  });
  const authz = createRequestAuthorization({ mode: 'subject', subject }, authorization);
  const app = Fastify();
  registerRuntimeErrorHandler(app);
  app.decorateRequest('authz', { getter: () => authz });
  app.register(taskReadEndpoint, {
    dependencies: {
      ...sources,
      definitions: { resolve: () => Promise.resolve(definition) },
      execution: { inspect: () => Promise.resolve(execution) },
      leases: new PageLeases(),
      projectId: () => 'demo-project',
      sessions,
    },
  });
  app.register(specificationWorkspaceEndpoint, {
    repository: demo.workspaceRepository,
    contributions: {
      ...demo.contributions,
      sessions: () =>
        Promise.resolve({
          section: {
            state: 'available',
            data: {
              items: ['session-a', 'session-b', 'session-c'].map((id) => ({
                id,
                title: 'Title ' + id,
                taskIds: [],
                status: 'active' as const,
                providerId: 'codex',
                updatedAt: '2026-11-08T00:00:00.000Z',
              })),
              attention: [],
            },
          },
        }),
    },
    sessions,
    projectId: () => 'demo-project',
  });

  return { app, batches };
}

describe('Session references in Specification and Task reads', () => {
  it.each(
    (['viewer', 'developer', 'admin'] as const).flatMap((role) =>
      Object.keys(grants).map((grant) => ({ role, grant })),
    ),
  )(
    '$role@$grant sees only the Specification Sessions its grant covers',
    async ({ role, grant }) => {
      const { app, batches } = await fixture(role, grants[grant]);
      try {
        const workspace = await app.inject(`/api/specs/${SPEC}/workspace`);
        const task = await app.inject(`/api/specs/${SPEC}/tasks/TASK-03`);
        // spec.view at specScope = {projectId, specId} gates both reads: a project grant covers
        // the Specification, a Session-only, other-project or other-Specification grant does not.
        const readable = grant === 'global' || grant === 'project' || grant === 'spec';
        expect([workspace.statusCode, task.statusCode]).toEqual(readable ? [200, 200] : [403, 403]);
        if (!readable) {
          return;
        }

        // Every built-in role carries session.view, scoped {projectId, specId, sessionId}.
        expect(workspace.body).toContain('session-a');
        expect(task.body).toContain('session-a');
        // The workspace lists only its own Specification's Sessions; a Task may reference another
        // Specification's Session, visible only where the grant covers that Specification.
        expect(workspace.body).not.toContain('session-b');
        expect(task.body.includes('session-b')).toBe(grant !== 'spec');
        // A standalone or unknown Session never resolves to a reference.
        expect(workspace.body).not.toContain('session-c');
        expect(task.body).not.toContain('session-c');

        // One batch per read, never a per-reference loop.
        expect(batches).toEqual([
          ['session-a', 'session-b', 'session-c'],
          expect.arrayContaining(['session-a', 'session-b', 'session-c']),
        ]);
        expect(batches[1]).toHaveLength(3);
      } finally {
        await app.close();
      }
    },
  );

  it('takes the Session reference scope from sessionScope in both projections', async () => {
    const { app } = await fixture('viewer', grants.spec);
    const spy = vi.mocked(sessionScope);
    try {
      spy.mockClear();
      expect((await app.inject(`/api/specs/${SPEC}/workspace`)).statusCode).toBe(200);
      expect(spy.mock.calls).toContainEqual([
        expect.objectContaining({
          projectId: 'demo-project',
          specId: SPEC,
          sessionId: 'session-a',
        }),
        SessionCapabilities.capabilities.View,
      ]);
      spy.mockClear();
      expect((await app.inject(`/api/specs/${SPEC}/tasks/TASK-03`)).statusCode).toBe(200);
      expect(spy.mock.calls).toContainEqual([
        expect.objectContaining({
          projectId: 'demo-project',
          specId: SPEC,
          sessionId: 'session-a',
        }),
        SessionCapabilities.capabilities.View,
      ]);
    } finally {
      await app.close();
    }
  });
});
