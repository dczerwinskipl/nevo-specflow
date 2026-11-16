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
  editTask,
  finishStep,
  installProjectDefinitions,
  openWorkflow,
  startSpecificationExecution,
} from '../src/testing';
import { parseTaskIndex, parseTaskManifest } from '../src/tasks/resource/codec';
import { validateTaskResources } from '../src/tasks/resource/validate';
import { commitStaged, createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;

/** The Task resource issues of the Specification as HEAD holds it (another clone, a reset). */
function issuesAtHead(root: string, directory: string) {
  const listed = (path: string) =>
    git(root, 'ls-tree', '--name-only', 'HEAD', `${path}/`)
      .split('\n')
      .filter(Boolean)
      .map((entry) => entry.slice(path.length + 1));
  const folders = listed(`${directory}/tasks`).filter((name) => name !== 'index.yaml');
  const index =
    folders.length === 0 && !listed(`${directory}/tasks`).includes('index.yaml')
      ? []
      : parseTaskIndex(git(root, 'show', `HEAD:${directory}/tasks/index.yaml`)).tasks.map(
          (entry) => entry.id,
        );
  const manifests = new Map(
    index
      .filter((taskId) => listed(`${directory}/tasks/${taskId}`).includes('task.yaml'))
      .map((taskId) => [
        taskId,
        parseTaskManifest(git(root, 'show', `HEAD:${directory}/tasks/${taskId}/task.yaml`), taskId),
      ]),
  );
  const runs = listed(`${directory}/.execution/tasks`).map((name) => ({
    taskId: name.replace(/\.yaml$/u, ''),
    state: 'ready' as const,
    attempts: 1,
  }));

  return { index, issues: validateTaskResources({ index, manifests, folders, runs }) };
}

it('holds the hand-edited Task and every Task the held index would register, and keeps HEAD consistent', async () => {
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
  const dirty = () =>
    // Modified, deleted and untracked files (`status --porcelain` would lose a leading space to trim).
    [
      ...new Set(
        git(root, 'ls-files', '--modified', '--deleted', '--others', '--exclude-standard').split(
          '\n',
        ),
      ),
    ]
      .filter(Boolean)
      .sort();
  const create = async (taskId: string) =>
    createTask(await openWorkflow(engine), {
      specId: spec.specId,
      taskId,
      title: 'Task ' + taskId,
      type: 'implementation',
      actor: owner,
    });

  // A Task HEAD already registers.
  const base = await create('base');
  git(root, 'add', '--', directory);
  commitStaged(root, 'commit authored specification and its first Task');

  const started = await startSpecificationExecution(await openWorkflow(engine), {
    specId: spec.specId,
    archetype: 'feature',
    actor: owner,
  });
  if (started.kind === 'terminal') {
    throw new Error('The Specification run did not start.');
  }

  await create('docs');
  // The body of one Task is written directly, not through the Engine; another Task comes after it,
  // and the registered Task is edited.
  const edited = `${directory}/tasks/docs/task.md`;
  await appendFile(join(root, edited), '\nWritten by the agent.\n');
  await create('api');
  await editTask(await openWorkflow(engine), {
    specId: spec.specId,
    taskId: 'base',
    expectedRevision: base.revision,
    title: 'Task base, edited',
    actor: owner,
  });

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

  // The edited Task is held with the index that would register it; while the index waits, the new
  // Task waits too (HEAD would have its folder without an index entry). The edit of the Task HEAD
  // registers is committed.
  const index = `${directory}/tasks/index.yaml`;
  expect(post.held).toEqual({
    edited: [edited],
    paths: [
      edited,
      `${directory}/tasks/docs/task.yaml`,
      `${directory}/tasks/api/task.md`,
      `${directory}/tasks/api/task.yaml`,
      index,
    ].sort(),
  });
  expect(post.commit?.paths).toContain(`${directory}/tasks/base/task.yaml`);
  // Exactly what the commit left out stays uncommitted: no path is both committed and held.
  expect(dirty()).toEqual([...post.held!.paths].sort());
  expect(issuesAtHead(root, directory)).toEqual({ index: ['base'], issues: [] });

  // A person commits the edited Task with Git: the next finish commits the rest, the index and the
  // new Task included, and holds nothing.
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
  expect(issuesAtHead(root, directory)).toEqual({ index: ['base', 'docs', 'api'], issues: [] });
}, 600_000);
