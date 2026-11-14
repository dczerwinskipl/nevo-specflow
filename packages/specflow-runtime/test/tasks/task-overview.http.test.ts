// Linux integration (real Git, real Engine, project mode): the Overview's Tasks section and the
// Tasks page with its blocking filter, from the Engine's neutral facts and attention. Run through
// tools/dev/linux-test.sh.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  finishStep,
  openWorkflow,
  startSpecificationExecution,
  type OwnerActor,
} from '@nevo/specflow-engine';
import {
  bootstrapProjectHome,
  createSpecificationFromRequestForTesting as createSpecificationFromRequest,
  installDefinitionsForTesting,
} from '@nevo/specflow-engine/testing';
import {
  SpecificationWorkspaceResponseSchema,
  type SpecificationWorkspaceResponse,
} from '@nevo/specflow-contracts/specs/workspace';
import { TaskListResponseSchema, type TaskListResponse } from '@nevo/specflow-contracts/tasks';
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
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-task-overview-')));
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

  return { engine, root };
}

const groupIds = (groups: readonly { id: string; tasks: readonly { id: string }[] }[]) =>
  Object.fromEntries(groups.map((group) => [group.id, group.tasks.map((task) => task.id)]));

describe('the Overview Tasks section and the Tasks page against the real Engine', () => {
  it(
    'groups by the neutral facts, flags an actionable start blocker and resolves the blocking filter',
    async () => {
      const { engine, root } = await project();
      const { specId } = await createSpecificationFromRequest(engine, {
        archetype: { id: 'minimal', version: 1 },
        operationId: randomUUID(),
        title: 'Overview',
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
        const create = async (payload: Record<string, unknown>) => {
          const created = await app.inject({
            method: 'POST',
            url: `/api/specs/${specId}/tasks`,
            payload: { type: 'implementation', ...payload },
          });
          expect(created.statusCode, created.body).toBe(201);
        };

        const approve = async (taskId: string) => {
          const decided = await app.inject({
            method: 'PUT',
            url: `/api/specs/${specId}/tasks/${taskId}/status`,
            payload: { status: 'ready' },
          });
          expect(decided.statusCode, decided.body).toBe(200);
        };

        await mkdir(join(root, 'src'));
        await writeFile(join(root, 'src/old.ts'), 'export {};\n');
        await create({ taskId: 'base', title: 'Base' });
        await create({ taskId: 'after', title: 'After', dependsOn: ['base'] });
        await create({ taskId: 'draft', title: 'Draft' });
        await create({
          taskId: 'context',
          title: 'Context',
          context: [{ kind: 'path', path: 'src/old.ts', required: true }],
        });
        for (const taskId of ['base', 'after', 'context']) {
          await approve(taskId);
        }

        // The required context goes away after approval: the Task cannot start any more.
        await rm(join(root, 'src/old.ts'));

        const workspace = await app.inject(`/api/specs/${specId}/workspace`);
        expect(workspace.statusCode, workspace.body).toBe(200);
        const overview = workspace.json<SpecificationWorkspaceResponse>();
        expect(Value.Check(SpecificationWorkspaceResponseSchema, overview)).toBe(true);
        if (overview.sections.tasks.state !== 'available') {
          throw new Error('The tasks section is unavailable.');
        }

        const tasks = overview.sections.tasks.data;
        expect(groupIds(tasks.groups)).toEqual({
          'needs-approval': ['draft'],
          ready: ['base'],
          'cannot-start': ['context'],
          waiting: ['after'],
        });
        // Only the actionable blocker is attention: not the draft, not the dependency wait.
        expect(tasks.attention).toEqual([
          expect.objectContaining({
            kind: 'task',
            targetId: 'context',
            code: 'context-unresolved',
            actor: 'owner',
            action: 'edit-context',
          }),
        ]);
        expect(tasks.overview.rows).toContainEqual({
          groupId: 'cannot-start',
          name: 'Cannot start',
          count: 1,
          tasks: [{ id: 'context' }],
          more: 0,
        });
        expect(tasks.overview).not.toHaveProperty('stuck');
        expect(tasks).toMatchObject({ completed: 0, total: 4, cancelled: 0, ended: 0, onHold: 0 });

        const page = await app.inject(`/api/specs/${specId}/tasks`);
        expect(page.statusCode, page.body).toBe(200);
        const list = page.json<TaskListResponse>();
        expect(Value.Check(TaskListResponseSchema, list)).toBe(true);
        expect(groupIds(list.groups)).toEqual(groupIds(tasks.groups));
        const after = list.groups.flatMap((group) => group.tasks).find((row) => row.id === 'after');
        expect(after && 'facts' in after ? after.facts : undefined).toMatchObject({
          startable: false,
          dependencyWait: { waitingFor: ['base'], unsatisfiable: [] },
        });

        // The Specification is not waiting for its Tasks: nothing blocks it.
        const blocking = await app.inject(`/api/specs/${specId}/tasks?blocking=specification`);
        expect(blocking.statusCode, blocking.body).toBe(200);
        expect(blocking.json<TaskListResponse>()).toMatchObject({
          groups: [],
          filter: { blocking: 'specification', matched: 0, total: 4 },
        });
        expect(
          (await app.inject(`/api/specs/${specId}/tasks?blocking=everything`)).statusCode,
        ).toBe(400);
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );

  it(
    'names the Tasks that block a waiting Specification, broken ones included, and clears it once they move',
    async () => {
      const { engine, root } = await project();
      const { specId } = await createSpecificationFromRequest(engine, {
        archetype: { id: 'feature', version: 1 },
        operationId: randomUUID(),
        title: 'Stuck',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      // Drive the Specification to its wait step through the Engine's own operations.
      const workflow = await openWorkflow(engine);
      const actor: OwnerActor = {
        class: 'human',
        details: { actorId: 'local:test', trust: 'local' },
      };
      const subject = { kind: 'specification', specId } as const;
      const inputs: Record<string, Record<string, unknown>> = {
        breakdown: {
          tasks: [
            { id: 'api', title: 'API', type: 'implementation' },
            { id: 'screen', title: 'Screen', type: 'implementation', dependsOn: ['api'] },
          ],
        },
        'breakdown-review': { result: 'pass' },
      };
      for (let index = 0; index < 5; index += 1) {
        const started = await startSpecificationExecution(workflow, {
          specId,
          archetype: 'feature',
          actor,
        });
        if (started.kind === 'terminal') {
          throw new Error('The Specification ended early.');
        }

        const { step, attempt } = started.context;
        await finishStep(workflow, {
          subject,
          step: step.id,
          attempt,
          input: inputs[step.id] ?? {},
          actor,
        });
      }

      const app = await createRuntimeApp(
        {
          ...noAuthConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
        },
        { specs: { engine } },
      );
      try {
        const status = async (taskId: string, value: 'ready' | 'on-hold') => {
          const decided = await app.inject({
            method: 'PUT',
            url: `/api/specs/${specId}/tasks/${taskId}/status`,
            payload: { status: value },
          });
          expect(decided.statusCode, decided.body).toBe(200);
        };

        const blocking = async () => {
          const answer = await app.inject(`/api/specs/${specId}/tasks?blocking=specification`);
          expect(answer.statusCode, answer.body).toBe(200);
          const list = answer.json<TaskListResponse>();
          expect(Value.Check(TaskListResponseSchema, list)).toBe(true);

          return list;
        };

        await status('api', 'on-hold');
        const held = await blocking();
        expect(groupIds(held.groups)).toEqual({ 'on-hold': ['api'] });
        expect(held.attention).toEqual([
          expect.objectContaining({
            reason: 'tasks-stuck',
            action: 'review-tasks',
            blocking: [{ taskId: 'api', cause: 'on-hold' }],
          }),
        ]);

        // The Task folder of `screen` vanishes: it is broken, listed and named as blocking too.
        const entries = await readdir(root, { recursive: true });
        const folder = entries.find(
          (entry) => /(^|[\\/])tasks[\\/]screen$/.test(entry) && !entry.startsWith('.nevo'),
        );
        if (!folder) {
          throw new Error('The Task folder of screen was not found.');
        }

        await rm(join(root, folder), { recursive: true });
        const broken = await blocking();
        expect(groupIds(broken.groups)).toEqual({ 'cannot-start': ['screen'], 'on-hold': ['api'] });
        expect(broken.groups[0]!.tasks[0]).toMatchObject({
          broken: { reason: 'missing-folder' },
          blocksSpecification: { cause: 'broken' },
        });

        // Resumed, `api` can start again: nothing blocks the wait, the broken Task stays attention.
        await status('api', 'ready');
        const resumed = await blocking();
        expect(resumed).toMatchObject({ groups: [], filter: { matched: 0 } });
        expect(resumed.attention.map((item) => item.reason)).toEqual(['task-broken']);

        const workspace = await app.inject(`/api/specs/${specId}/workspace`);
        const overview = workspace.json<SpecificationWorkspaceResponse>();
        expect(Value.Check(SpecificationWorkspaceResponseSchema, overview)).toBe(true);
        expect(overview.sections.tasks).toMatchObject({
          state: 'available',
          data: { attention: [{ id: 'task-broken.screen', code: 'task-broken' }] },
        });
        expect(
          overview.sections.tasks.state === 'available' && overview.sections.tasks.data.overview,
        ).not.toHaveProperty('stuck');
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );
});
