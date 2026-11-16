// Integration (real project, real Git, auto-commit off): the "Next" commit of the workflow state once
// Tasks exist and one Task document was edited directly (as an agent writes `task.md`). B4: that
// edit refused every later finish commit with MANUAL_COMMIT_CONFLICT.
import { randomUUID } from 'node:crypto';
import { appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

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
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;

it('commits the workflow state of a finish and holds only what was edited by hand, with what travels with it', async () => {
  const root = await createGitTestProject(
    'specflow-finish-commit-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  await installProjectDefinitions(engine);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Finish commit',
    created: '2026-11-16',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  const directory = 'specs/active/' + spec.slug;
  git(root, 'add', '--', directory);
  commitStaged(root, 'commit authored specification');
  const dirty = () =>
    git(root, 'status', '--porcelain', '--untracked-files=all')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))
      .sort();

  const started = await startSpecificationExecution(await openWorkflow(engine), {
    specId: spec.specId,
    archetype: 'feature',
    actor: owner,
  });
  if (started.kind === 'terminal') {
    throw new Error('The Specification run did not start.');
  }

  for (const taskId of ['api', 'docs']) {
    await createTask(await openWorkflow(engine), {
      specId: spec.specId,
      taskId,
      title: 'Task ' + taskId,
      type: 'implementation',
      actor: owner,
    });
  }

  // The body of one Task is written directly, not through the Engine.
  const edited = `${directory}/tasks/docs/task.md`;
  await appendFile(join(root, edited), '\nWritten by the agent.\n');

  const finish = async (step: string, attempt: number) =>
    finishStep(await openWorkflow(engine), {
      subject: { kind: 'specification', specId: spec.specId },
      step,
      attempt,
      input: {},
      actor: owner,
    });
  const first = await finish(started.context.step.id, started.context.attempt);
  const [post] = first.postActions ?? [];
  // The finish is recorded and reported; its commit is reported on its own: not a conflict.
  expect(first.transition).toBeDefined();
  expect(post).toMatchObject({ action: 'commit-execution-state', status: 'completed' });
  if (post?.status !== 'completed') {
    throw new Error('The commit of the workflow state did not complete.');
  }

  expect(post.held?.edited).toEqual([edited]);
  expect(post.held?.paths).toContain(edited);
  // Exactly what the commit left out stays uncommitted: no path is both committed and held.
  expect(dirty()).toEqual([...(post.held?.paths ?? [])].sort());
  expect(post.commit?.paths.filter((path) => post.held?.paths.includes(path)) ?? []).toEqual([]);

  // A person commits the edited Task with Git: the next finish commits the rest, nothing is held.
  git(root, 'add', '--', `${directory}/tasks/docs`);
  commitStaged(root, 'write the docs task');
  const next = await startSpecificationExecution(await openWorkflow(engine), {
    specId: spec.specId,
    archetype: 'feature',
    actor: owner,
  });
  if (next.kind === 'terminal') {
    throw new Error('The next step did not start.');
  }

  const second = await finish(next.context.step.id, next.context.attempt);
  const [again] = second.postActions ?? [];
  expect(again).toMatchObject({ action: 'commit-execution-state', status: 'completed' });
  expect(again?.status === 'completed' ? again.held : 'failed').toBeUndefined();
  expect(dirty()).toEqual([]);
}, 600_000);
