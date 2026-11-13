// The Task detail over one reading source: a single read per request, and a busy project lock is a
// retryable 503, not a generic failure.
import { ProjectControlLockError } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { noAuthConfig } from '../../../test/auth/support/config';
import { createRuntimeApp } from '../../server/app';
import { TaskSourceUnavailableError } from './engine/sources';
import type { TaskReadingSource } from './reads/facts';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function listen(reading: TaskReadingSource) {
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }] },
    },
    { tasks: { reading } },
  );
  apps.push(app);

  return app;
}

describe('Task detail read', () => {
  it('answers a busy project lock with a retryable 503 and an outage without Retry-After', async () => {
    let reads = 0;
    const busy = await listen({
      read: () => {
        reads += 1;

        return Promise.reject(
          new TaskSourceUnavailableError(new ProjectControlLockError('CONTROL_LOCK_BUSY', 'Busy.')),
        );
      },
    });
    const response = await busy.inject('/api/specs/spec-1/tasks/build');
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('1');
    expect(response.json()).toEqual({ error: 'specification_source_unavailable' });
    expect(reads).toBe(1);

    const down = await listen({
      read: () => Promise.reject(new TaskSourceUnavailableError(new Error('unreadable'))),
    });
    const outage = await down.inject('/api/specs/spec-1/tasks/build/history?token=t');
    expect(outage.statusCode).toBe(503);
    expect(outage.headers['retry-after']).toBeUndefined();
  });

  it('answers an unknown Task with 404 from the one read', async () => {
    const app = await listen({ read: () => Promise.resolve(null) });

    expect((await app.inject('/api/specs/spec-1/tasks/ghost')).statusCode).toBe(404);
  });
});
