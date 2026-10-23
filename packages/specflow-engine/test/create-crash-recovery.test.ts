import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecification,
  inspectCreateSpecification,
  inspectProjectControlLock,
  projectControlLockPath,
  workspaceRegistryPath,
  updateWorkspaceRegistry,
  addWorkspace,
  bindSpecToWorkspace,
  provisionLinkedWorkspaceIdentity,
  createSpecificationScaffold,
  type CreateSpecificationInput,
  type SpecFlowEngine,
} from '../src/testing';
import { withProjectControlLock } from '../src/project/control-lock';
import { CREATE_JOURNAL_RELATIVE_DIR } from '../src/specs/create/journal';
import { createGitTestProject, git } from './support/git-project';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  spawnVitestWorker,
  terminateCheckpointPid,
  type IndependentVitestWorker,
} from './support/process-worker';

const roots: string[] = [];
const activeProcesses: IndependentVitestWorker[] = [];
afterEach(async () => {
  // Reap *every* real child before deleting its Git worktrees/marker files.
  await Promise.all(activeProcesses.splice(0).map((worker) => reapVitestWorker(worker)));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function project(gitEnabled = false): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'specflow-crash-Ż space ',
    'runtime: {}\ngit:\n  enabled: ' + String(gitEnabled) + '\n',
  );
  roots.push(root);
  if (gitEnabled) roots.push(root + '-worktrees');
  return { root, engine: await bootstrapProjectHome(root) };
}

function request(engine: SpecFlowEngine, title: string, linked = false): CreateSpecificationInput {
  return {
    operationId: randomUUID(),
    title,
    created: '2026-10-14',
    target: linked
      ? { kind: 'new-worktree', baseRef: 'HEAD' }
      : { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  };
}

type Mode = 'crash' | 'resume' | 'atomic-write';
interface Worker {
  readonly signal: string;
  readonly process: IndependentVitestWorker;
  readonly done: Promise<{ readonly code: number | null; readonly output: string }>;
  kill(): boolean;
}

function worker(
  root: string,
  input: CreateSpecificationInput,
  mode: Mode,
  options: { stage?: string; expectError?: string; gitSettled?: boolean } = {},
): Worker {
  const signal = join(root, 'worker-' + randomUUID() + '.checkpoint');
  const child = spawnVitestWorker(
    'test/fixtures/crash-create-worker.test.ts',
    {
      NEVO_CREATE_CRASH_WORKER: '1',
      NEVO_CREATE_CRASH_HOME: root,
      NEVO_CREATE_CRASH_INPUT: JSON.stringify(input),
      NEVO_CREATE_CRASH_MODE: mode,
      NEVO_CREATE_CRASH_STAGE: options.stage ?? '',
      NEVO_CREATE_CRASH_SIGNAL: signal,
      NEVO_CREATE_CRASH_GIT_SETTLED: options.gitSettled ? '1' : '0',
      NEVO_CREATE_CRASH_EXPECT_ERROR: options.expectError ?? '',
    },
    60000,
  );
  activeProcesses.push(child);
  return {
    signal,
    process: child,
    done: child.done.then((outcome) => ({ code: outcome.code, output: outcome.log })),
    kill: () => child.kill('SIGKILL'),
  };
}

async function killAtCheckpoint(
  root: string,
  input: CreateSpecificationInput,
  stage: string,
  mode: Mode = 'crash',
): Promise<string> {
  const child = worker(root, input, mode, { stage });
  try {
    await awaitProcessMarker(child.signal, child.process, 45000, 30);
    const checkpoint = await readProcessCheckpoint(
      child.signal,
      mode === 'atomic-write' ? 'staged' : stage,
    );
    // A real OS signal targets the nested mutation PID, not merely its runner.
    const outcome = await terminateCheckpointPid(checkpoint.pid, child.process);
    expect(outcome.code, outcome.log).not.toBe(0);
    return checkpoint.stage;
  } finally {
    await reapVitestWorker(child.process);
  }
}

async function replay(
  root: string,
  input: CreateSpecificationInput,
  options: { expectError?: string; gitSettled?: boolean } = {},
): Promise<string> {
  const child = worker(root, input, 'resume', options);
  const outcome = await child.done;
  expect(outcome.code, outcome.output).toBe(0);
  return readFile(child.signal, 'utf8');
}

describe('E2.T04 — actual process termination and fresh-process recovery', () => {
  it('R01: SIGKILL after durable reservation resumes the original spec without duplicates', async () => {
    const { root, engine } = await project();
    const input = request(engine, 'Reservation killed');
    expect(await killAtCheckpoint(root, input, 'reservation')).toBe('reservation');
    const before = (await inspectCreateSpecification(engine, input.operationId))!;
    expect(before.stage).toBe('reserved');
    expect((await engine.readRegistry()).specBindings).toHaveLength(0);
    // A real SIGKILL does not release the resource claim or authorize a new
    // Close to take over: only explicit recovery can finish this journal.
    await withProjectControlLock(engine.context, async () => {
      const { assertResourcesAvailable } = await import('../src/specs/lifecycle/resources');
      await expect(
        assertResourcesAvailable(engine.context, [
          'checkout:' + engine.workspace.workspaceId,
          'spec:' + randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    });
    const result = JSON.parse(await replay(root, input)) as { specId: string; operationId: string };
    expect(result.specId).toBe(before.specId);
    expect(result.operationId).toBe(input.operationId);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    expect((await inspectCreateSpecification(engine, input.operationId))?.stage).toBe('completed');
  }, 120000);

  it('R02: SIGKILL after git worktree add fences automatic replay until externally settled', async () => {
    const { root, engine } = await project(true);
    const input = request(engine, 'Git process killed', true);
    expect(await killAtCheckpoint(root, input, 'git')).toBe('git');
    const recorded = (await inspectCreateSpecification(engine, input.operationId))!;
    expect(recorded.stage).toBe('git-initiated');
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
    expect(await replay(root, input, { expectError: 'CREATE_RECOVERY_REQUIRED' })).toBe(
      'expected:CREATE_RECOVERY_REQUIRED',
    );
    const output = JSON.parse(await replay(root, input, { gitSettled: true })) as {
      specId: string;
    };
    expect(output.specId).toBe(recorded.specId);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
  }, 150000);

  it('R03: SIGKILL after manifest write resumes and links the exact original manifest', async () => {
    const { root, engine } = await project();
    const input = request(engine, 'Manifest killed');
    expect(await killAtCheckpoint(root, input, 'manifest')).toBe('manifest');
    const saved = (await inspectCreateSpecification(engine, input.operationId))!;
    expect(saved.stage).toBe('manifest-writing');
    const manifest = join(root, saved.files[0]!.relativePath);
    const contents = await readFile(manifest, 'utf8');
    const output = JSON.parse(await replay(root, input)) as { specId: string };
    expect(output.specId).toBe(saved.specId);
    expect(await readFile(manifest, 'utf8')).toBe(contents);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
  }, 120000);

  it('R04: SIGKILL after registry commit repeats response, not the registry mutation', async () => {
    const { root, engine } = await project();
    const input = request(engine, 'Registry killed');
    expect(await killAtCheckpoint(root, input, 'registry')).toBe('registry');
    const saved = (await inspectCreateSpecification(engine, input.operationId))!;
    expect(saved.stage).toBe('registry-writing');
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    const output = JSON.parse(await replay(root, input)) as { specId: string };
    expect(output.specId).toBe(saved.specId);
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
  }, 120000);

  it('R05: external changes after SIGKILL produce conflict without overwrite or cleanup', async () => {
    const { root, engine } = await project();
    const input = request(engine, 'Externally modified');
    await killAtCheckpoint(root, input, 'manifest');
    const saved = (await inspectCreateSpecification(engine, input.operationId))!;
    const path = join(root, saved.files[0]!.relativePath);
    await writeFile(path, 'external: edited\n');
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    expect(await replay(root, input, { expectError: 'CREATE_RECOVERY_REQUIRED' })).toBe(
      'expected:CREATE_RECOVERY_REQUIRED',
    );
    expect(await readFile(path, 'utf8')).toBe('external: edited\n');
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
  }, 120000);

  it('SIGKILL during atomic journal publication retains orphan lock and staged temp; the temp never wedges Create', async () => {
    const { root, engine } = await project();
    const input = request(engine, 'Crash inside atomic rename');
    expect(await killAtCheckpoint(root, input, 'atomic', 'atomic-write')).toBe('staged');
    expect((await inspectProjectControlLock(engine.context)).status).toBe('held');
    const dir = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
    const temps = (await readdir(dir)).filter((name) => name.endsWith('.tmp'));
    expect(temps).toHaveLength(1);
    // A dead PID does not authorize automatic lock stealing.
    await expect(
      withProjectControlLock(engine.context, () => Promise.resolve(), { waitMs: 0 }),
    ).rejects.toMatchObject({ code: 'CONTROL_LOCK_BUSY' });
    // Explicit operator recovery in this test ONLY: process is known dead, so
    // inspect/preserve the staged journal, release its verified orphan lock,
    // then move the abandoned .tmp out of the authoritative journal directory.
    await rm(projectControlLockPath(engine.context));
    // The staged temp is never a journal: it neither wedges Create nor is deleted while young.
    const output = JSON.parse(await replay(root, input)) as { specId: string };
    expect(output.specId).toMatch(/^[0-9a-f-]{36}$/u);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual(temps);
  }, 120000);

  it('unavailable unrelated bound Spec blocks create intentionally until global slug ownership is provable', async () => {
    const { root, engine } = await project();
    const linkedRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-missing-source-')));
    roots.push(linkedRoot);
    git(root, 'worktree', 'add', '-q', '-b', 'spec/unavailable', linkedRoot);
    const workspaceId = randomUUID();
    const linked = await provisionLinkedWorkspaceIdentity(
      engine.context,
      linkedRoot,
      workspaceId,
      false,
    );
    const existingId = randomUUID();
    const scaffold = createSpecificationScaffold({
      specId: existingId,
      title: 'Missing source',
      created: '2026-10-14',
    });
    for (const file of scaffold.files) {
      const absolute = join(linkedRoot, file.relativePath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, file.content);
    }
    await updateWorkspaceRegistry(engine.context, (registry) =>
      bindSpecToWorkspace(addWorkspace(registry, linked), existingId, linked.workspaceId),
    );
    await rm(linkedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    const input = request(engine, 'Completely different title');
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    await expect(createSpecification(engine, input)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
    expect(await inspectCreateSpecification(engine, input.operationId)).toBeUndefined();
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
  }, 120000);
});
