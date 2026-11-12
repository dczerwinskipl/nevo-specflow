// The Task document routes with a fake source: View for reads, Manage for writes (before the body),
// the document refusals and the shapes. The Engine behind them: test/tasks/task-commands.http.test.ts.
import { randomUUID } from 'node:crypto';

import { DocumentError } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { noAuthConfig } from '../../../../test/auth/support/config';
import { createRuntimeApp } from '../../../server/app';
import type { TaskDocumentSource } from './task-document-source';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const OPERATION = randomUUID();
const commit = { state: 'pending', reason: 'settling' } as const;
const written = { id: 'task', path: 'task.md', revision: 'r2', type: 'task' };

function fakeSource(calls: string[], fail?: () => Error): TaskDocumentSource {
  const run = <T>(name: string, value: T): Promise<T> => {
    calls.push(name);

    return fail ? Promise.reject(fail()) : Promise.resolve(value);
  };

  const result = {
    operationId: OPERATION,
    revision: 'registry-2',
    documents: [written],
    removedDocumentIds: [],
    folders: [],
    commit,
  };

  return {
    tree: (_specId, taskId) =>
      run('tree', {
        taskId,
        registryRevision: 'registry-1',
        writable: true,
        documents: [
          {
            id: 'task',
            path: 'task.md',
            type: 'task',
            classification: 'registered',
            required: true,
          },
        ],
      }),
    read: (_specId, _taskId, documentId) =>
      run('read', {
        id: documentId,
        path: 'task.md',
        title: 'T',
        classification: 'registered',
        type: 'task',
        kind: 'text',
        mediaType: 'text/markdown',
        size: 4,
        revision: 'r1',
        editable: true,
        content: '# T\n',
      }),
    save: () => run('save', { operationId: OPERATION, document: written, commit }),
    create: () => run('create', result),
    operate: () => run('operate', result),
  };
}

async function listen(role: 'developer' | 'viewer', source: TaskDocumentSource) {
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role, scope: { specId: 'spec-1' } }] },
    },
    { documents: { taskDocuments: source } },
  );
  apps.push(app);

  return app;
}

const base = '/api/specs/spec-1/tasks/build';
const save = { operationId: OPERATION, content: 'text', expectedRevision: 'r1' };

describe('Task document routes', () => {
  it('reads with spec.view and refuses writes without spec.manage before calling the source', async () => {
    const calls: string[] = [];
    const app = await listen('viewer', fakeSource(calls));

    const tree = await app.inject(`${base}/document-tree`);
    expect(tree.statusCode, tree.body).toBe(200);
    expect(tree.json()).toMatchObject({ taskId: 'build', registryRevision: 'registry-1' });
    expect((await app.inject(`${base}/documents/task`)).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'PUT', url: `${base}/documents/task`, payload: save }))
        .statusCode,
    ).toBe(403);
    expect(calls).toEqual(['tree', 'read']);
  });

  it('writes through the source and answers its refusals with the document error body', async () => {
    const calls: string[] = [];
    const app = await listen('developer', fakeSource(calls));
    const saved = await app.inject({ method: 'PUT', url: `${base}/documents/task`, payload: save });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ document: written });
    const deleted = await app.inject({
      method: 'POST',
      url: `${base}/document-operations`,
      payload: {
        operationId: OPERATION,
        action: 'delete',
        kind: 'document',
        documentId: 'notes',
        expectedRevision: 'r1',
      },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(calls).toEqual(['save', 'operate']);

    const refusing = await listen(
      'developer',
      fakeSource([], () => new DocumentError('DOCUMENT_PROTECTED', 'task.md stays.')),
    );
    const refused = await refusing.inject({
      method: 'POST',
      url: `${base}/document-operations`,
      payload: {
        operationId: OPERATION,
        action: 'delete',
        kind: 'document',
        documentId: 'task',
        expectedRevision: 'r1',
      },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'DOCUMENT_PROTECTED', code: 'DOCUMENT_PROTECTED' });
  });
});
