import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerOperationListRoute } from './list-route';
import type { OperationListSource } from './operation-source';
import { createOperationProgressRegistry } from './progress-registry';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const registry = createOperationProgressRegistry();
const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';

/** A second feature with its own kind and its own admission policy: one registration. */
async function fakeFeature(options: { allowed: boolean }) {
  const app = Fastify();
  apps.push(app);
  const source: OperationListSource = {
    kind: 'widget-build',
    list: () =>
      Promise.resolve([
        {
          operationId,
          state: 'in-progress' as const,
          title: 'Build widget',
          updatedAt: new Date().toISOString(),
        },
      ]),
  };
  registerOperationListRoute(app, {
    path: '/api/widgets/operations',
    sources: [source],
    registry,
    authorize: () => undefined,
    canView: () => options.allowed,
  });
  await app.ready();
  return app;
}

describe('registerOperationListRoute (reuse by another feature)', () => {
  it('serves the feature kinds under the feature path with the generic contract', async () => {
    const app = await fakeFeature({ allowed: true });
    const response = await app.inject('/api/widgets/operations');
    expect(response.statusCode, response.body).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      items: [{ operationId, kind: 'widget-build', status: 'in-progress', title: 'Build widget' }],
      counts: { inProgress: 1 },
      truncated: false,
    });
  });

  it('lets the feature admission policy hide rows', async () => {
    const app = await fakeFeature({ allowed: false });
    const response = await app.inject('/api/widgets/operations');
    expect(JSON.parse(response.body)).toMatchObject({ items: [], counts: { inProgress: 0 } });
  });

  it('keeps feature errors out of the response', async () => {
    const app = Fastify();
    apps.push(app);
    registerOperationListRoute(app, {
      path: '/x/operations',
      sources: [{ kind: 'k', list: () => Promise.reject(new Error('C:\\secret\\path leaked')) }],
      registry,
      authorize: () => undefined,
      canView: () => true,
    });
    const response = await app.inject('/x/operations');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret');
    expect(JSON.parse(response.body)).toEqual({
      error: 'OPERATIONS_UNAVAILABLE',
      code: 'OPERATIONS_UNAVAILABLE',
    });
  });
});
