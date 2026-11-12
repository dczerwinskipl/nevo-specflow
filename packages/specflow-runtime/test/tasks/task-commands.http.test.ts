// Linux integration (real Git, real Engine, project mode): the Task commands and the Engine-backed
// Task reads through the composed Runtime. Run through tools/dev/linux-test.sh.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationFromRequestForTesting as createSpecificationFromRequest,
  installDefinitionsForTesting,
} from '@nevo/specflow-engine/testing';
import {
  SpecificationTaskResponseSchema,
  TaskDocumentTreeSchema,
  type SpecificationTaskResponse,
  type TaskDocumentTree,
} from '@nevo/specflow-contracts/tasks';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeApp } from '../../src/server/app';
import { noAuthConfig } from '../auth/support/config';

const roots: string[] = [];
const timeoutMs = process.platform === 'win32' ? 180000 : 60000;

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-task-http-')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  const engine = await bootstrapProjectHome(root);
  await installDefinitionsForTesting(engine);

  return engine;
}

describe('Task commands and reads against the real Engine', () => {
  it(
    'creates a Task, reads it without a 503 and refuses an edit planned against a stale revision',
    async () => {
      const engine = await project();
      const { specId } = await createSpecificationFromRequest(engine, {
        archetype: { id: 'minimal', version: 1 },
        operationId: randomUUID(),
        title: 'Task HTTP',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      const app = await createRuntimeApp(
        {
          ...noAuthConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
        },
        { specs: { engine } },
      );
      try {
        const created = await app.inject({
          method: 'POST',
          url: `/api/specs/${specId}/tasks`,
          payload: { taskId: 'build', title: 'Build it', type: 'implementation' },
        });
        expect(created.statusCode, created.body).toBe(201);
        const { revision } = created.json<{ taskId: string; revision: string }>();

        const detail = await app.inject(`/api/specs/${specId}/tasks/build`);
        expect(detail.statusCode, detail.body).toBe(200);
        const task = detail.json<SpecificationTaskResponse>();
        expect(Value.Check(SpecificationTaskResponseSchema, task)).toBe(true);
        expect(task.task).toEqual({
          id: 'build',
          title: 'Build it',
          status: { id: 'draft', label: 'Draft', lifecycle: 'pending' },
        });
        expect(task.resource).toMatchObject({
          revision,
          type: 'implementation',
          status: 'draft',
          dependsOn: [],
          // The person behind the request, recorded by the Engine.
          origin: { kind: 'manual', actorId: JSON.stringify({ kind: 'user', id: 'demo-user' }) },
          context: null,
          readiness: { kind: 'status', status: 'draft' },
          position: { state: 'not-started' },
          definitionChanged: false,
        });
        expect(task.snapshot?.sections.work).toMatchObject({
          state: 'available',
          data: { position: { state: 'not_started' } },
        });
        expect(task.snapshot?.sections.document).toMatchObject({
          state: 'available',
          data: { id: 'task' },
        });
        expect(task.snapshot?.sections.history.state).toBe('available');

        const workspace = await app.inject(`/api/specs/${specId}/workspace`);
        expect(workspace.statusCode, workspace.body).toBe(200);
        const body = workspace.json<SpecificationWorkspaceResponse>();
        expect(body.specification.preparationState).toBe('preparing');
        expect(body.sections.tasks).toMatchObject({
          state: 'available',
          data: {
            groups: [{ id: 'needs-approval', tasks: [{ id: 'build', title: 'Build it' }] }],
            completed: 0,
            total: 1,
          },
        });

        const documents = await app.inject(`/api/specs/${specId}/tasks/build/document-tree`);
        expect(documents.statusCode, documents.body).toBe(200);
        const tree = documents.json<TaskDocumentTree>();
        expect(Value.Check(TaskDocumentTreeSchema, tree)).toBe(true);
        expect(tree.documents).toEqual([
          expect.objectContaining({ id: 'task', path: 'task.md', required: true }),
        ]);

        // A Task document save is an operation of its Specification: the UI polls its status there.
        const operationId = randomUUID();
        const saved = await app.inject({
          method: 'PUT',
          url: `/api/specs/${specId}/tasks/build/documents/task`,
          payload: {
            operationId,
            content: '# Build it\n\nWith tests.\n',
            expectedRevision: tree.documents[0]!.file!.revision,
          },
        });
        expect(saved.statusCode, saved.body).toBe(200);
        const status = await app.inject(`/api/specs/${specId}/document-operations/${operationId}`);
        expect(status.statusCode, status.body).toBe(200);
        expect(status.json()).toMatchObject({ operationId, specId, documentIds: ['task'] });

        const edited = await app.inject({
          method: 'PATCH',
          url: `/api/specs/${specId}/tasks/build`,
          payload: { expectedRevision: revision, title: 'Build it well' },
        });
        expect(edited.statusCode, edited.body).toBe(200);
        expect(edited.json<{ revision: string }>().revision).not.toBe(revision);

        const stale = await app.inject({
          method: 'PATCH',
          url: `/api/specs/${specId}/tasks/build`,
          payload: { expectedRevision: revision, title: 'Lost update' },
        });
        expect(stale.statusCode, stale.body).toBe(409);
        expect(stale.json()).toMatchObject({
          error: 'WORKFLOW_TASK_REVISION_CONFLICT',
          code: 'WORKFLOW_TASK_REVISION_CONFLICT',
        });
        expect(
          (await app.inject(`/api/specs/${specId}/tasks/build`)).json<SpecificationTaskResponse>()
            .task.title,
        ).toBe('Build it well');
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );
});
