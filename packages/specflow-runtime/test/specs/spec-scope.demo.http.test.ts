import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SpecificationTaskResponse } from '@nevo/specflow-contracts/tasks';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function open(scope: Record<string, string>) {
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope }] },
    },
    { dataMode: 'demo' },
  );

  return app;
}

describe('Specification reads at {projectId, specId} (wired by the Runtime)', () => {
  it.each<{ name: string; scope: Record<string, string>; readable: boolean }>([
    { name: 'project', scope: { projectId: 'demo-project' }, readable: true },
    { name: 'Specification', scope: { specId: 'admission' }, readable: true },
    { name: 'other Specification', scope: { specId: 'other' }, readable: false },
    { name: 'other project', scope: { projectId: 'other-project' }, readable: false },
  ])('a viewer at the $name scope', async ({ scope, readable }) => {
    const server = await open(scope);
    const workspace = await server.inject('/api/specs/admission/workspace');
    const task = await server.inject('/api/specs/admission/tasks/TASK-03');
    const tree = await server.inject('/api/specs/admission/document-tree');
    expect([workspace.statusCode, task.statusCode, tree.statusCode]).toEqual(
      readable ? [200, 200, 200] : [403, 403, 403],
    );

    const overview = await server.inject('/api/specs/overview');
    const listed = overview.statusCode === 200 && overview.body.includes('"id":"admission"');
    expect(listed).toBe(readable);
    if (!readable) {
      return;
    }

    const history = task.json<SpecificationTaskResponse>().snapshot!.sections.history;
    if (history.state !== 'available') {
      throw new Error('Expected a history page handle');
    }

    const page = await server.inject(
      '/api/specs/admission/tasks/TASK-03/history?token=' + encodeURIComponent(history.data.token),
    );
    expect(page.statusCode).toBe(200);
  });
});
