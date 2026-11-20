// Linux integration (real Git, real Engine, project mode): the Task commands and the Engine-backed
// Task reads through the composed Runtime. Run through tools/dev/linux-test.sh.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  addWorkspace,
  bootstrapProjectHome,
  createSpecificationFromRequestForTesting as createSpecificationFromRequest,
  installDefinitionsForTesting,
  provisionLinkedWorkspaceIdentity,
  updateWorkspaceRegistry,
} from '@nevo/specflow-engine/testing';
import type { SpecFlowEngine } from '@nevo/specflow-engine';
import {
  SpecificationTaskResponseSchema,
  TaskDocumentTreeSchema,
  type SpecificationTaskResponse,
  type TaskDocumentTree,
} from '@nevo/specflow-contracts/tasks';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { createOwnerRuntimeApp } from '../support/owner-credential';
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

async function writeDocument(root: string, id: string): Promise<void> {
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(
    join(root, 'docs', `${id}.md`),
    `---\nid: ${id}\ntype: hub\ntitle: ${id}\nstatus: current\n---\n\n# ${id}\n`,
  );
}

/** A registered linked worktree of the Project Home, on its own branch. */
async function linkedWorktree(engine: SpecFlowEngine): Promise<{ root: string; id: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-task-linked-')));
  roots.push(root);
  await rm(root, { recursive: true });
  git(engine.context.project.homeRoot, 'worktree', 'add', '-q', '-b', 'test/linked', root, 'HEAD');
  const registration = await provisionLinkedWorkspaceIdentity(
    engine.context,
    root,
    randomUUID(),
    true,
  );
  await updateWorkspaceRegistry(engine.context, (registry) => addWorkspace(registry, registration));

  return { root, id: registration.workspaceId };
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
      const app = await createOwnerRuntimeApp(
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
          origin: { kind: 'manual', actorId: 'user:demo-user' },
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

  it(
    'keeps the Tasks of an abandoned Specification: removing one answers 409',
    async () => {
      const engine = await project();
      const { specId } = await createSpecificationFromRequest(engine, {
        archetype: { id: 'minimal', version: 1 },
        operationId: randomUUID(),
        title: 'Abandoned work',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      const app = await createOwnerRuntimeApp(
        {
          ...noAuthConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'admin', scope: {} }] },
        },
        { specs: { engine } },
      );
      try {
        const created = await app.inject({
          method: 'POST',
          url: `/api/specs/${specId}/tasks`,
          payload: { taskId: 'draft', title: 'A draft', type: 'implementation' },
        });
        expect(created.statusCode, created.body).toBe(201);

        const abandoned = await app.inject({
          method: 'POST',
          url: `/api/specs/${specId}/workflow/abandon`,
          payload: { reason: 'Superseded.' },
        });
        expect(abandoned.statusCode, abandoned.body).toBe(200);
        const { revision } = (await app.inject(`/api/specs/${specId}/tasks/draft`)).json<{
          resource: { revision: string };
        }>().resource;

        const removed = await app.inject({
          method: 'DELETE',
          url: `/api/specs/${specId}/tasks/draft?expectedRevision=${encodeURIComponent(revision)}`,
        });
        expect(removed.statusCode, removed.body).toBe(409);
        expect(removed.json()).toMatchObject({ code: 'WORKFLOW_SPECIFICATION_ENDED' });
        expect((await app.inject(`/api/specs/${specId}/tasks/draft`)).statusCode).toBe(200);
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );

  it(
    "resolves a project-document context entry in the Specification's own worktree",
    async () => {
      const engine = await project();
      const linked = await linkedWorktree(engine);
      await writeDocument(engine.context.project.homeRoot, 'home.only');
      await writeDocument(linked.root, 'worktree.only');
      const { specId } = await createSpecificationFromRequest(engine, {
        archetype: { id: 'minimal', version: 1 },
        operationId: randomUUID(),
        title: 'Linked work',
        target: { kind: 'existing', workspaceId: linked.id },
      });
      const app = await createOwnerRuntimeApp(
        {
          ...noAuthConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
        },
        { specs: { engine }, docs: { startRefresh: false } },
      );
      const create = (taskId: string, id: string) =>
        app.inject({
          method: 'POST',
          url: `/api/specs/${specId}/tasks`,
          payload: {
            taskId,
            title: taskId,
            type: 'implementation',
            context: [{ kind: 'project-document', id, required: true }],
          },
        });
      try {
        const resolved = await create('in-worktree', 'worktree.only');
        expect(resolved.statusCode, resolved.body).toBe(201);

        // A document only in the Project Home is not the Specification's documentation.
        const refused = await create('in-home', 'home.only');
        expect(refused.statusCode, refused.body).toBe(422);
        expect(refused.json()).toMatchObject({ code: 'WORKFLOW_TASK_CONTEXT_UNRESOLVED' });
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );
});
