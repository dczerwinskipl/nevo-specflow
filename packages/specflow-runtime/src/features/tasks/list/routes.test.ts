// The Tasks page route over HTTP with a fake source: `spec.view`, the validated `blocking` search
// value and the read outcomes. The Engine behind it: test/tasks/task-overview.http.test.ts.
import { ProjectControlLockError } from '@nevo/specflow-engine';
import type { TaskListQuery, TaskListResponse } from '@nevo/specflow-contracts/tasks';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { noAuthConfig } from '../../../../test/auth/support/config';
import { createRuntimeApp } from '../../../server/app';
import { TaskSourceUnavailableError } from '../engine/sources';
import type { TaskListSource } from './read-task-list';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const empty: TaskListResponse = {
  specId: 'spec-1',
  groups: [],
  progress: { completed: 0, total: 0, cancelled: 0, onHold: 0 },
  attention: [],
};

async function listen(source: TaskListSource, role: 'developer' | 'viewer' | 'none' = 'viewer') {
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authorization: {
        assignments:
          role === 'none' ? [] : [{ userId: 'demo-user', role, scope: { specId: 'spec-1' } }],
      },
    },
    { tasks: { list: source } },
  );
  apps.push(app);

  return app;
}

describe('GET /api/specs/:specId/tasks', () => {
  it('passes the validated filter to the source and answers its list', async () => {
    const queries: TaskListQuery[] = [];
    const app = await listen({
      read: (_specId, query) => {
        queries.push(query);

        return Promise.resolve({
          ...empty,
          filter: { blocking: 'specification', matched: 0, total: 0 },
        });
      },
    });

    const filtered = await app.inject({ url: '/api/specs/spec-1/tasks?blocking=specification' });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.headers['cache-control']).toBe('no-store');
    expect(filtered.json()).toMatchObject({ filter: { blocking: 'specification' } });
    await app.inject({ url: '/api/specs/spec-1/tasks' });
    expect(queries).toEqual([{ blocking: 'specification' }, {}]);

    // Only the one search value exists; an id list or another value is refused before the read.
    for (const url of [
      '/api/specs/spec-1/tasks?blocking=a,b',
      '/api/specs/spec-1/tasks?taskIds=a',
    ]) {
      expect((await app.inject({ url })).statusCode).toBe(400);
    }

    expect(queries).toHaveLength(2);
  });

  it('answers 404 for an unknown specification and 503 when the Engine cannot read it', async () => {
    const missing = await listen({ read: () => Promise.resolve(null) });
    expect((await missing.inject({ url: '/api/specs/spec-1/tasks' })).json()).toEqual({
      error: 'specification_not_found',
    });

    const busy = await listen({
      read: () =>
        Promise.reject(
          new TaskSourceUnavailableError(new ProjectControlLockError('CONTROL_LOCK_BUSY', 'busy')),
        ),
    });
    const answer = await busy.inject({ url: '/api/specs/spec-1/tasks' });
    expect(answer.statusCode).toBe(503);
    expect(answer.headers['retry-after']).toBe('1');
  });

  it('needs spec.view on the specification', async () => {
    const app = await listen({ read: () => Promise.resolve(empty) }, 'none');

    expect((await app.inject({ url: '/api/specs/spec-1/tasks' })).statusCode).toBe(403);
  });
});
