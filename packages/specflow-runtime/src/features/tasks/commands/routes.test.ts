// The Task command routes over HTTP with a fake command port: `spec.manage` before the body, the
// actor from the authenticated subject (never the body), the request schemas and the status of the
// workflow refusals. The Engine behind the routes: test/tasks/task-commands.http.test.ts.
import {
  ProjectControlLockError,
  TaskContextUnresolvedError,
  WorkflowError,
  type OwnerActor,
} from '@nevo/specflow-engine';
import { WorkflowErrorSchema } from '@nevo/specflow-contracts/workflow';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { noAuthConfig } from '../../../../test/auth/support/config';
import { createRuntimeApp } from '../../../server/app';
import type { TaskCommands } from './task-commands';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

interface Call {
  readonly name: string;
  readonly args: unknown[];
  readonly actor: OwnerActor;
}

function fakeCommands(calls: Call[], fail?: () => Error): TaskCommands {
  const run = <T>(name: string, args: unknown[], actor: OwnerActor, value: T): Promise<T> => {
    calls.push({ name, args, actor });

    return fail ? Promise.reject(fail()) : Promise.resolve(value);
  };

  return {
    create: (specId, input, actor) =>
      run('create', [specId, input], actor, { taskId: input.taskId, revision: 'r1' }),
    edit: (specId, taskId, input, actor) =>
      run('edit', [specId, taskId, input], actor, { taskId, revision: 'r2' }),
    remove: (specId, taskId, revision, actor) =>
      run('remove', [specId, taskId, revision], actor, { taskId }),
    setStatus: (specId, taskId, input, actor) =>
      run('setStatus', [specId, taskId, input], actor, { taskId, status: input.status }),
  };
}

async function listen(
  options: { role?: 'developer' | 'viewer'; commands?: TaskCommands | null } = {},
) {
  const calls: Call[] = [];
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authorization: {
        assignments: [
          { userId: 'demo-user', role: options.role ?? 'developer', scope: { specId: 'spec-1' } },
        ],
      },
    },
    options.commands === null
      ? {}
      : { tasks: { commands: options.commands ?? fakeCommands(calls) } },
  );
  apps.push(app);

  return { app, calls };
}

const create = { taskId: 'task-1', title: 'First', type: 'implementation' };

describe('Task command routes', () => {
  it('creates a Task as the authenticated subject and answers 201 with the revision', async () => {
    const { app, calls } = await listen();
    const response = await app.inject({
      method: 'POST',
      url: '/api/specs/spec-1/tasks',
      payload: { ...create, dependsOn: ['task-0'] },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ taskId: 'task-1', revision: 'r1' });
    expect(calls).toEqual([
      {
        name: 'create',
        args: ['spec-1', { ...create, dependsOn: ['task-0'] }],
        actor: {
          class: 'human',
          details: {
            actorId: JSON.stringify({ kind: 'user', id: 'demo-user' }),
            trust: 'authenticated',
          },
        },
      },
    ]);
  });

  it('refuses an actor, an executor or a type change named in the body (400) without a call', async () => {
    const { app, calls } = await listen();
    const actor = { class: 'human', details: { actorId: 'someone-else', trust: 'authenticated' } };
    for (const request of [
      { method: 'POST' as const, url: '/api/specs/spec-1/tasks', payload: { ...create, actor } },
      {
        method: 'PATCH' as const,
        url: '/api/specs/spec-1/tasks/task-1',
        payload: { expectedRevision: 'r1', executor: 'agent' },
      },
      {
        method: 'PATCH' as const,
        url: '/api/specs/spec-1/tasks/task-1',
        payload: { expectedRevision: 'r1', type: 'spike' },
      },
      {
        method: 'PUT' as const,
        url: '/api/specs/spec-1/tasks/task-1/status',
        payload: { status: 'draft' },
      },
    ]) {
      expect((await app.inject(request)).statusCode, `${request.method} ${request.url}`).toBe(400);
    }

    expect(calls).toEqual([]);
  });

  it('requires spec.manage on the Specification for every command', async () => {
    const { app, calls } = await listen({ role: 'viewer' });
    for (const request of [
      { method: 'POST' as const, url: '/api/specs/spec-1/tasks', payload: create },
      {
        method: 'PATCH' as const,
        url: '/api/specs/spec-1/tasks/task-1',
        payload: { expectedRevision: 'r1', title: 'New' },
      },
      { method: 'DELETE' as const, url: '/api/specs/spec-1/tasks/task-1?expectedRevision=r1' },
      {
        method: 'PUT' as const,
        url: '/api/specs/spec-1/tasks/task-1/status',
        payload: { status: 'ready' },
      },
      // A Specification outside the assignment scope.
      { method: 'POST' as const, url: '/api/specs/spec-2/tasks', payload: create },
    ]) {
      expect((await app.inject(request)).statusCode, `${request.method} ${request.url}`).toBe(403);
    }

    expect(calls).toEqual([]);
  });

  it('edits, removes and decides the status through the port', async () => {
    const { app, calls } = await listen();
    const edit = await app.inject({
      method: 'PATCH',
      url: '/api/specs/spec-1/tasks/task-1',
      payload: { expectedRevision: 'r1', summary: null, context: null, dependsOn: [] },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/specs/spec-1/tasks/task-1?expectedRevision=r2',
    });
    const status = await app.inject({
      method: 'PUT',
      url: '/api/specs/spec-1/tasks/task-1/status',
      payload: { status: 'on-hold', reason: 'Later' },
    });

    expect([edit.statusCode, remove.statusCode, status.statusCode]).toEqual([200, 200, 200]);
    expect(edit.json()).toEqual({ taskId: 'task-1', revision: 'r2' });
    expect(remove.json()).toEqual({ taskId: 'task-1' });
    expect(status.json()).toEqual({ taskId: 'task-1', status: 'on-hold' });
    expect(calls.map((call) => [call.name, call.args])).toEqual([
      [
        'edit',
        [
          'spec-1',
          'task-1',
          { expectedRevision: 'r1', summary: null, context: null, dependsOn: [] },
        ],
      ],
      ['remove', ['spec-1', 'task-1', 'r2']],
      ['setStatus', ['spec-1', 'task-1', { status: 'on-hold', reason: 'Later' }]],
    ]);
  });

  it.each([
    ['WORKFLOW_SUBJECT_NOT_FOUND', 404],
    ['WORKFLOW_TASK_REVISION_CONFLICT', 409],
    ['WORKFLOW_TASK_EXISTS', 409],
    ['WORKFLOW_TASK_NOT_REMOVABLE', 409],
    ['WORKFLOW_TASK_BUSY', 409],
    ['WORKFLOW_SPECIFICATION_ENDED', 409],
    ['WORKFLOW_TASK_CONTEXT_UNRESOLVED', 422],
    ['WORKFLOW_TASK_TYPE_NOT_ALLOWED', 422],
    ['WORKFLOW_INPUT_INVALID', 422],
  ] as const)('answers the refusal %s with %i and the Engine explanation', async (code, status) => {
    const { app } = await listen({
      commands: fakeCommands([], () => new WorkflowError(code, `Refused: ${code}.`)),
    });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/specs/spec-1/tasks/task-1',
      payload: { expectedRevision: 'r0', title: 'New' },
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: code, code, message: `Refused: ${code}.` });
    expect(Value.Check(WorkflowErrorSchema, response.json())).toBe(true);
  });

  it('names the context entries that do not resolve in details.unresolved', async () => {
    const unresolved = [{ index: 1, key: 'specification-document:ux', reason: 'not-found' }];
    const { app } = await listen({
      commands: fakeCommands(
        [],
        () =>
          new TaskContextUnresolvedError(
            'task-1',
            [
              {
                index: 1,
                entry: { kind: 'specification-document', id: 'ux', required: true },
                reason: 'not-found',
              },
            ],
            'Replace or remove it.',
          ),
      ),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/specs/spec-1/tasks',
      payload: create,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ details: { unresolved } });
    expect(Value.Check(WorkflowErrorSchema, response.json())).toBe(true);
  });

  it('answers corrupt state, a busy lock and a Runtime without an Engine with 503', async () => {
    const corrupt = await listen({
      commands: fakeCommands([], () => new WorkflowError('WORKFLOW_STATE_CORRUPT', 'At /x.')),
    });
    const busy = await listen({
      commands: fakeCommands(
        [],
        () => new ProjectControlLockError('CONTROL_LOCK_BUSY', 'The project is busy.'),
      ),
    });
    const none = await listen({ commands: null });
    for (const [app, code, retry] of [
      [corrupt.app, 'WORKFLOW_STATE_CORRUPT', undefined],
      [busy.app, 'CONTROL_LOCK_BUSY', '1'],
      [none.app, 'WORKFLOW_UNAVAILABLE', undefined],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/specs/spec-1/tasks',
        payload: create,
      });
      expect(response.statusCode, code).toBe(503);
      expect(response.json()).toMatchObject({ error: code, code });
      // Only a busy lock is worth a retry soon.
      expect(response.headers['retry-after'], code).toBe(retry);
    }
  });

  it('records the trusted local identity with trust local', async () => {
    const calls: Call[] = [];
    const { localUserId: _unused, ...authentication } = noAuthConfig().authentication;
    const app = await createRuntimeApp(
      { ...noAuthConfig(), authentication },
      { tasks: { commands: fakeCommands(calls) } },
    );
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/specs/spec-1/tasks',
      payload: create,
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(calls[0]?.actor).toEqual({
      class: 'human',
      details: { actorId: 'runtime:trusted-local', trust: 'local' },
    });
  });

  it('lets any other failure reach the Runtime error handler (500)', async () => {
    const { app } = await listen({ commands: fakeCommands([], () => new Error('defect')) });
    const response = await app.inject({
      method: 'POST',
      url: '/api/specs/spec-1/tasks',
      payload: create,
    });

    expect(response.statusCode).toBe(500);
  });
});
