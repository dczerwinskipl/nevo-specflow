import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SpecificationTaskResponseSchema,
  TaskListResponseSchema,
  type SpecificationTaskResponse,
  type TaskListResponse,
} from '@nevo/specflow-contracts/tasks';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { TaskDocumentTree } from '@nevo/specflow-contracts/tasks';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function open() {
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: {
        assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }],
      },
    },
    { dataMode: 'demo' },
  );

  return app;
}

async function json<T>(server: FastifyInstance, url: string): Promise<T> {
  const answer = await server.inject(url);
  expect(answer.statusCode, answer.body).toBe(200);

  return answer.json<T>();
}

const statuses = (list: TaskListResponse) =>
  Object.fromEntries(
    list.groups.flatMap((group) => group.tasks.map((row) => [row.id, row.status.id])),
  );

describe('demo Runtime: the Engine workflow over in-memory state', () => {
  it('serves the seeded Tasks, Task details and workflow actions of a project Runtime', async () => {
    const server = await open();

    const list = await json<TaskListResponse>(server, '/api/specs/admission/tasks');
    expect(Value.Check(TaskListResponseSchema, list)).toBe(true);
    expect(list.progress).toMatchObject({ completed: 1, total: 5 });
    expect(statuses(list)).toMatchObject({
      'admission-contract': 'completed',
      'queue-validation': 'in-progress',
      'expired-sessions': 'on-hold',
    });

    const detail = await json<SpecificationTaskResponse>(
      server,
      '/api/specs/admission/tasks/expired-sessions',
    );
    expect(Value.Check(SpecificationTaskResponseSchema, detail)).toBe(true);
    expect(detail.resource).toBeDefined();

    const projection = await json<WorkflowActionProjection>(
      server,
      '/api/specs/admission/workflow/actions',
    );
    expect(projection.position).toMatchObject({ kind: 'waiting' });

    const tree = await json<TaskDocumentTree>(
      server,
      '/api/specs/admission/tasks/expired-sessions/document-tree',
    );
    expect(tree.documents).toEqual([expect.objectContaining({ id: 'task', required: true })]);
  });

  it('applies a Start in memory: the next read shows the step running', async () => {
    const server = await open();
    const before = await json<WorkflowActionProjection>(
      server,
      '/api/specs/packaging/tasks/install-smoke/workflow/actions',
    );
    expect(before.position).toMatchObject({ kind: 'not-started' });

    const started = await server.inject({
      method: 'POST',
      url: '/api/specs/packaging/tasks/install-smoke/workflow/start',
      payload: {},
    });
    expect(started.statusCode, started.body).toBe(200);

    const after = await json<WorkflowActionProjection>(
      server,
      '/api/specs/packaging/tasks/install-smoke/workflow/actions',
    );
    expect(after.position).toMatchObject({ kind: 'active', step: { id: 'implement' } });
  });
});
