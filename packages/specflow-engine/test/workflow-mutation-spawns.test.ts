import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';

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

describe('workflow mutation Git process budget (per operation)', () => {
  it('proves the Project Home once per mutation, not once per Specification lookup', async () => {
    // Auto-commit off (the default), a Specification in a managed linked worktree.
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
    const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;
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
});
