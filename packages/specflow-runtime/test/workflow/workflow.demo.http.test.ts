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
import { createDemoEnvironment } from '../../src/demo';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function config() {
  const base = passwordConfig();

  return {
    ...base,
    authentication: { ...base.authentication, mode: 'none' as const, localUserId: 'demo-user' },
    authorization: {
      assignments: [{ userId: 'demo-user', role: 'developer' as const, scope: {} }],
    },
  };
}

async function open() {
  app = await createRuntimeApp(config(), { dataMode: 'demo' });

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
    // No checkout to archive in: Close is unavailable before the click; Abandon is the Engine's.
    expect(projection.specification?.exit).toEqual({
      close: { kind: 'unavailable', reason: 'no-repository' },
      abandon: { kind: 'allowed' },
    });
  });

  it('saves a Task document with revision checks and says it does not organize them', async () => {
    const server = await open();
    const base = '/api/specs/admission/tasks/expired-sessions';
    const tree = await json<TaskDocumentTree>(server, `${base}/document-tree`);
    expect(tree.capabilities).toEqual({ save: true, organize: false });
    const revision = tree.documents.find((document) => document.id === 'task')!.file!.revision;
    const save = (expectedRevision: string, operationId: string) =>
      server.inject({
        method: 'PUT',
        url: `${base}/documents/task`,
        payload: { content: '# Expired sessions\n', expectedRevision, operationId },
      });

    expect((await save(revision, '00000000-0000-4000-8000-0000000000a1')).statusCode).toBe(200);
    const stale = await save(revision, '00000000-0000-4000-8000-0000000000a2');
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
  });

  it('does not start when the demo workflow cannot be seeded', async () => {
    await expect(
      createRuntimeApp(config(), {
        dataMode: 'demo',
        demoEnvironment: createDemoEnvironment({
          seed: () => Promise.reject(new Error('The demo seed failed.')),
        }),
      }),
    ).rejects.toThrow('The demo seed failed.');
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
