import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  createTask,
  finishStep,
  installProjectDefinitions,
  openWorkflow,
  startSpecificationExecution,
} from '../src/testing';
import type { WorkflowPostActions } from '../src/workflow/operations/post-actions';
import { commitStaged, createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

async function countGit<T>(work: () => Promise<T>): Promise<{ result: T; spawns: string[][] }> {
  const spawns: string[][] = [];
  const listener = (message: unknown): void => {
    spawns.push([...(message as { args: readonly string[] }).args]);
  };

  subscribe('nevo.specflow.engine.git-process', listener);
  try {
    return { result: await work(), spawns };
  } finally {
    unsubscribe('nevo.specflow.engine.git-process', listener);
  }
}

const worktreeLists = (spawns: string[][]) =>
  spawns.filter((args) => args[0] === 'worktree' && args[1] === 'list').length;

const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;

/** Auto-commit off (the default), a Specification in a managed linked worktree. */
async function linkedSpecification() {
  const root = await createGitTestProject(
    'specflow-mutation-spawns-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  await installProjectDefinitions(engine);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Budget',
    created: '2026-11-15',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  roots.push(dirname(spec.workspaceRoot));
  git(spec.workspaceRoot, 'add', '--', 'specs/active/' + spec.slug);
  commitStaged(spec.workspaceRoot, 'commit authored specification');

  return { engine, spec };
}

describe('workflow mutation Git process budget (per operation)', () => {
  it('proves the Project Home once per mutation, not once per Specification lookup', async () => {
    const { engine, spec } = await linkedSpecification();
    const workflow = await openWorkflow(engine);

    const start = await countGit(() =>
      startSpecificationExecution(workflow, {
        specId: spec.specId,
        archetype: 'feature',
        actor: owner,
      }),
    );
    if (start.result.kind === 'terminal') {
      throw new Error('The Specification run did not start.');
    }

    const { step, attempt } = start.result.context;

    const task = await countGit(() =>
      createTask(workflow, {
        specId: spec.specId,
        taskId: 'docs',
        title: 'Document it',
        type: 'implementation',
        actor: owner,
      }),
    );
    const finish = await countGit(() =>
      finishStep(workflow, {
        subject: { kind: 'specification', specId: spec.specId },
        step: step.id,
        attempt,
        input: {},
        actor: owner,
      }),
    );

    // Before: every Specification lookup resolved the Project Home again (start 82, create 182,
    // finish 180 spawns). Now one resolution per operation: the lock admission's.
    expect(worktreeLists(start.spawns)).toBe(1);
    expect(worktreeLists(task.spawns)).toBe(1);
    // The finish and its post action (each stage of the manual commit takes the lock) are one operation.
    expect(worktreeLists(finish.spawns)).toBe(1);
    expect(finish.result.postActions).toMatchObject([
      { action: 'commit-execution-state', status: 'completed' },
    ]);
    expect(start.spawns.length).toBeLessThanOrEqual(10);
    expect(task.spawns.length).toBeLessThanOrEqual(10);
    // The manual commit of the execution state is ~30 of these (preflight, commit, evidence).
    expect(finish.spawns.length).toBeLessThanOrEqual(42);
  }, 240_000);

  // A checkout that changes between the finish's lock section and its commit's lock sections is
  // verified again, whether or not the Project Home evidence the lock pins moved with it.
  it.each([
    ['its identity marker loses its ignore rule (the home evidence stays the same)', false],
    [
      'its identity marker loses its ignore rule and its .git file is replaced (the home evidence moves)',
      true,
    ],
  ])(
    'refuses the finish commit into a checkout when %s',
    async (_, replaceGitFile) => {
      const { engine, spec } = await linkedSpecification();
      const opened = await openWorkflow(engine);
      const started = await startSpecificationExecution(opened, {
        specId: spec.specId,
        archetype: 'feature',
        actor: owner,
      });
      if (started.kind === 'terminal') {
        throw new Error('The Specification run did not start.');
      }

      const head = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
      // Between the finish's own lock section and its post action (the manual commit).
      const workflow = {
        ...opened,
        postActions: {
          async afterStepFinished(event: Parameters<WorkflowPostActions['afterStepFinished']>[0]) {
            // The checkout's own ignore rules no longer protect its identity marker: only the
            // checkout verification sees it (the commit's own checks look at what it commits).
            await writeFile(join(spec.workspaceRoot, '.gitignore'), '');
            if (replaceGitFile) {
              const dotGit = join(spec.workspaceRoot, '.git');
              const content = await readFile(dotGit);
              await rm(dotGit);
              await writeFile(dotGit, content);
            }

            return opened.postActions!.afterStepFinished(event);
          },
        },
      };

      const finished = await finishStep(workflow, {
        subject: { kind: 'specification', specId: spec.specId },
        step: started.context.step.id,
        attempt: started.context.attempt,
        input: {},
        actor: owner,
      });

      expect(finished.postActions).toMatchObject([
        {
          action: 'commit-execution-state',
          status: 'failed',
          code: 'REGISTRY_WORKSPACE_MISMATCH',
        },
      ]);
      const [post] = finished.postActions ?? [];
      expect(post?.status === 'failed' ? post.message : '').toMatch(/ignore rules/u);
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(head);
    },
    240_000,
  );
});
