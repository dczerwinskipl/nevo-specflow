// Linux integration (real Git, real Engine, project mode): the Overview's Tasks section and the
// Tasks page with its blocking filter, from the Engine's neutral facts and attention. Run through
// tools/dev/linux-test.sh.
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
        expect(tasks).toMatchObject({ completed: 0, total: 4, cancelled: 0, onHold: 0 });

        const page = await app.inject(`/api/specs/${specId}/tasks`);
        expect(page.statusCode, page.body).toBe(200);
        const list = page.json<TaskListResponse>();
        expect(Value.Check(TaskListResponseSchema, list)).toBe(true);
        expect(groupIds(list.groups)).toEqual(groupIds(tasks.groups));
        expect(
          list.groups.flatMap((group) => group.tasks).find((row) => row.id === 'after')?.facts,
        ).toMatchObject({
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
});
