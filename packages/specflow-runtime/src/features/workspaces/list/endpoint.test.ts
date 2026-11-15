import { createAuthorization, type RoleAssignment } from '@nevo/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { WorkspaceCapabilities, type WorkspaceList } from '@nevo/specflow-contracts/workspaces';
import { SpecificationError } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequestAuthorization } from '../../auth/authorization/request-authorization';
import { registerRuntimeErrorHandler } from '../../../server/error-handler';
import { routeTestApp } from '../../../../test/support/route-app';
import { workspaceListEndpoint, type WorkspaceListSource } from './endpoint';

const PROJECT = 'project-1';
const PRIMARY = '0b8f1c1e-0a11-4c6e-9a01-000000000001';
const LINKED = '0b8f1c1e-0a11-4c6e-9a01-000000000002';

const registry: WorkspaceList = {
  projectFolderId: PRIMARY,
  workspaces: [
    {
      workspaceId: PRIMARY,
      kind: 'primary',
      name: 'acme-app',
      path: '/work/acme-app',
      available: true,
      isRuntimeWorkspace: true,
      specifications: [{ specId: 'visible', title: 'Visible' }],
      dirty: false,
    },
    {
      workspaceId: LINKED,
      kind: 'linked',
      name: 'hidden-work',
      path: '/work/acme-app-worktrees/hidden-work',
      available: false,
      unavailableReason: 'checkout-mismatch',
      isRuntimeWorkspace: false,
      specifications: [{ specId: 'hidden', title: 'Hidden title' }],
    },
  ],
};

/*
 * Every built-in role carries `spec.view` beside `workspace.view`, so the per-Specification filter is
 * observable only with a policy that separates them: `lister` lists workspaces, `reader` reads
 * Specifications, `viewer` has both.
 */
const roles = {
  lister: [WorkspaceCapabilities.capabilities.View],
  reader: [SpecCapabilities.capabilities.View],
  viewer: [WorkspaceCapabilities.capabilities.View, SpecCapabilities.capabilities.View],
};
const user = (id: string) => ({ kind: 'user' as const, id });
const assignments: RoleAssignment[] = [
  // A project lister who may read one of the two bound Specifications.
  { subject: user('alice'), role: 'lister', scope: { projectId: PROJECT } },
  { subject: user('alice'), role: 'reader', scope: { specId: 'visible' } },
  // A viewer bounded to one Specification: no project-wide workspace list.
  { subject: user('carol'), role: 'viewer', scope: { specId: 'visible' } },
];
const authorization = createAuthorization({
  resources: [WorkspaceCapabilities, SpecCapabilities],
  roles,
  assignments,
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function listApp(source: WorkspaceListSource | undefined) {
  const app = routeTestApp();
  apps.push(app);
  registerRuntimeErrorHandler(app);
  // The caller is the `x-user` header; without it the request is unauthenticated.
  app.decorateRequest('authz', {
    getter(this: { headers: Record<string, unknown> }) {
      const id = this.headers['x-user'];

      return createRequestAuthorization(
        typeof id === 'string'
          ? { mode: 'subject', subject: user(id) }
          : { mode: 'unauthenticated' },
        authorization,
      );
    },
  });
  app.register(workspaceListEndpoint, { ...(source ? { source } : {}), projectId: () => PROJECT });
  await app.ready();

  return app;
}

const as = (id?: string) => ({
  url: '/api/workspaces',
  ...(id ? { headers: { 'x-user': id } } : {}),
});

describe('GET /api/workspaces', () => {
  it('lists every workspace to a project lister and only the Specifications they may view', async () => {
    const source = vi.fn<WorkspaceListSource>(() => Promise.resolve(structuredClone(registry)));
    const app = await listApp(source);

    const listed = await app.inject(as('alice'));
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(listed.json()).toEqual({
      projectFolderId: PRIMARY,
      workspaces: [
        registry.workspaces[0],
        // Still listed, with its closed reason; the hidden title is left out without a trace.
        { ...registry.workspaces[1], specifications: [] },
      ],
    });
    expect(listed.body).not.toContain('Hidden title');

    // 401 first, then 403 for no grant and for a grant bounded to a Specification, all before the
    // registry is read.
    source.mockClear();
    expect((await app.inject(as())).statusCode).toBe(401);
    for (const id of ['bob', 'carol']) {
      const forbidden = await app.inject(as(id));
      expect(forbidden.statusCode, id).toBe(403);
      expect(forbidden.json()).toEqual({ error: 'forbidden' });
    }

    expect(source).not.toHaveBeenCalled();

    // An unreadable Specification source is an outage of the list, without the Engine's message.
    source.mockRejectedValueOnce(new SpecificationError('SPEC_SOURCE_INVALID', 'C:/secret/path'));
    const outage = await app.inject(as('alice'));
    expect(outage.statusCode).toBe(503);
    expect(outage.body).not.toContain('secret');

    // Without a source (no Engine, no demo data): 401, then 503 before 403.
    const unavailable = await listApp(undefined);
    expect((await unavailable.inject(as())).statusCode).toBe(401);
    for (const id of ['alice', 'bob']) {
      const response = await unavailable.inject(as(id));
      expect(response.statusCode, id).toBe(503);
      expect(response.json()).toEqual({
        error: 'WORKSPACES_UNAVAILABLE',
        code: 'WORKSPACES_UNAVAILABLE',
      });
    }
  });
});
