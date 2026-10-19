import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  listCloseJournals,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

const cleanup: string[] = [];
afterEach(async () => {
  for (const path of cleanup.splice(0).reverse()) {
    await rm(path, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function project() {
  const root = await createGitTestProject(
    'specflow-close-race-Ż ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  cleanup.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'configure target branch',
  );
  const engine = await bootstrapProjectHome(root);
  return { root, engine };
}

async function specification(
  fixture: Awaited<ReturnType<typeof project>>,
  title: string,
  linked: boolean,
) {
  const spec = await createSpecificationForTesting(fixture.engine, {
    operationId: randomUUID(),
    title,
    created: '2026-10-19',
    target: linked
      ? { kind: 'new-worktree' as const, baseRef: 'HEAD' }
      : { kind: 'existing' as const, workspaceId: fixture.engine.workspace.workspaceId },
  });
  if (linked) cleanup.push(dirname(spec.workspaceRoot));
  git(
    spec.workspaceRoot,
    'add',
    '--',
    spec.relativeManifestPath,
    'specs/active/' + spec.slug + '/overview.md',
  );
  git(
    spec.workspaceRoot,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'commit source ' + title,
  );
  return spec;
}

interface Worker {
  readonly ready: string;
  readonly start: string;
  readonly result: string;
  readonly done: Promise<{ code: number | null; log: string }>;
  readonly kill: () => void;
}

function spawnCloseWorker(
  root: string,
  request: {
    readonly kind: 'specification-close' | 'worktree-close';
    readonly specId: string;
    readonly operationId: string;
  },
  publication?: { readonly ready: string; readonly release: string },
): Worker {
  const prefix = join(tmpdir(), 'specflow-close-race-' + randomUUID());
  const ready = prefix + '.ready';
  const start = prefix + '.start';
  const result = prefix + '.result';
  cleanup.push(ready, start, result);
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const vitestEntry = resolve(
    dirname(fileURLToPath(import.meta.resolve('vitest'))),
    '..',
    'vitest.mjs',
  );
  const child = spawn(
    process.execPath,
    [
      vitestEntry,
      'run',
      'test/fixtures/close-race-worker.test.ts',
      '--maxWorkers=1',
      '--testTimeout=120000',
    ],
    {
      cwd: packageRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEVO_CLOSE_RACE_WORKER: '1',
        NEVO_CLOSE_RACE_ROOT: root,
        NEVO_CLOSE_RACE_REQUEST: JSON.stringify(request),
        NEVO_CLOSE_RACE_READY: ready,
        NEVO_CLOSE_RACE_START: start,
        NEVO_CLOSE_RACE_RESULT: result,
        ...(publication
          ? {
              NEVO_CLOSE_RACE_MODE: 'publish-divergent',
              NEVO_CLOSE_RACE_PUBLISH_READY: publication.ready,
              NEVO_CLOSE_RACE_PUBLISH_RELEASE: publication.release,
            }
          : {}),
      },
    },
  );
  let log = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    log += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    log += chunk;
  });
  const done = new Promise<{ code: number | null; log: string }>((resolveDone, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveDone({ code, log }));
  });
  return { ready, start, result, done, kill: () => child.kill() };
}

interface PausedCreateWorker extends Worker {
  readonly paused: string;
  readonly release: string;
}

function spawnPausedCreateWorker(root: string, workspaceId: string): PausedCreateWorker {
  const prefix = join(tmpdir(), 'specflow-create-close-race-' + randomUUID());
  const ready = prefix + '.ready';
  const start = prefix + '.start';
  const result = prefix + '.result';
  const paused = prefix + '.paused';
  const release = prefix + '.release';
  cleanup.push(ready, start, result, paused, release);
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const vitestEntry = resolve(
    dirname(fileURLToPath(import.meta.resolve('vitest'))),
    '..',
    'vitest.mjs',
  );
  const child = spawn(
    process.execPath,
    [
      vitestEntry,
      'run',
      'test/fixtures/create-worker.test.ts',
      '--maxWorkers=1',
      '--testTimeout=120000',
    ],
    {
      cwd: packageRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEVO_CREATE_WORKER: '1',
        NEVO_CREATE_WORKER_HOME: root,
        NEVO_CREATE_WORKER_READY: ready,
        NEVO_CREATE_WORKER_START: start,
        NEVO_CREATE_WORKER_INPUT: JSON.stringify({
          operationId: randomUUID(),
          title: 'Concurrent OS Create',
          created: '2026-10-19',
          target: { kind: 'existing', workspaceId },
        }),
        NEVO_CREATE_WORKER_PAUSE_STAGE: 'reservation',
        NEVO_CREATE_WORKER_PAUSED: paused,
        NEVO_CREATE_WORKER_RELEASE: release,
        NEVO_CREATE_WORKER_PAUSE_WAIT_MS: '120000',
        NEVO_CREATE_WORKER_RESULT: result,
      },
    },
  );
  let log = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    log += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    log += chunk;
  });
  const done = new Promise<{ code: number | null; log: string }>((resolveDone, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveDone({ code, log }));
  });
  return { ready, start, result, paused, release, done, kill: () => child.kill() };
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 90000;
  while (true) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() >= deadline) throw new Error('Close race checkpoint missing: ' + path);
      await sleep(40);
    }
  }
}

async function race(
  fixture: Awaited<ReturnType<typeof project>>,
  firstSpecId: string,
  secondSpecId: string,
) {
  const requests = [firstSpecId, secondSpecId].map((specId) => ({
    kind: 'specification-close' as const,
    specId,
    operationId: randomUUID(),
  }));
  const workers = requests.map((request) => spawnCloseWorker(fixture.root, request));
  try {
    await Promise.all(workers.map((worker) => waitFor(worker.ready)));
    await Promise.all(workers.map((worker) => writeFile(worker.start, 'go')));
    const outcomes = await Promise.all(workers.map((worker) => worker.done));
    for (const outcome of outcomes) expect(outcome.code, outcome.log).toBe(0);
    const results = await Promise.all(
      workers.map(async (worker) => {
        const parsed: unknown = JSON.parse(await readFile(worker.result, 'utf8'));
        if (typeof parsed !== 'object' || parsed === null || !('result' in parsed)) {
          throw new Error('Malformed Close worker response.');
        }
        if (parsed.result === 'conflict') {
          return { result: 'conflict' as const, operationId: undefined };
        }
        if (
          parsed.result === 'reserved' &&
          'operationId' in parsed &&
          typeof parsed.operationId === 'string'
        ) {
          return { result: 'reserved' as const, operationId: parsed.operationId };
        }
        throw new Error('Malformed Close worker outcome.');
      }),
    );
    expect(results.map((result) => result.result).sort()).toEqual(['conflict', 'reserved']);
    const journals = await listCloseJournals(fixture.engine.context);
    expect(journals).toHaveLength(1);
    expect(journals[0]?.stage).toBe('reserved');
    expect(journals[0]?.plan.operationId).toBe(
      results.find((result) => result.result === 'reserved')?.operationId,
    );
  } finally {
    for (const worker of workers) worker.kill();
    await Promise.allSettled(workers.map((worker) => worker.done));
  }
}

describe('E2.T17 LC17/LC39 independent OS-process Close contention', () => {
  it('LC17: two different primary Specs cannot concurrently reserve the same index', async () => {
    const fixture = await project();
    const first = await specification(fixture, 'First primary', false);
    const second = await specification(fixture, 'Second primary', false);
    const before = git(fixture.root, 'rev-parse', 'HEAD');
    await race(fixture, first.specId, second.specId);
    expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(fixture.root, 'status', '--porcelain')).toBe('');
  }, 240000);

  it('LC39: two linked Specs cannot reserve one target branch or primary index', async () => {
    const fixture = await project();
    const first = await specification(fixture, 'First linked', true);
    const second = await specification(fixture, 'Second linked', true);
    const before = git(fixture.root, 'rev-parse', 'HEAD');
    await race(fixture, first.specId, second.specId);
    expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(fixture.root, 'status', '--porcelain')).toBe('');
    expect(git(first.workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(git(second.workspaceRoot, 'status', '--porcelain')).toBe('');
  }, 240000);

  it('LC39: concurrent OS Close cannot overlap a real divergent Git publication', async () => {
    const fixture = await project();
    const firstSpec = await specification(fixture, 'First linked publish', true);
    const otherSpec = await specification(fixture, 'Second linked contender', true);
    await writeFile(join(fixture.root, 'primary-independent.txt'), 'primary change\n');
    git(fixture.root, 'add', '--', 'primary-independent.txt');
    git(
      fixture.root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'diverge primary independently',
    );
    const before = git(fixture.root, 'rev-parse', 'HEAD');
    const publishReady = join(tmpdir(), 'close-publish-ready-' + randomUUID());
    const publishRelease = join(tmpdir(), 'close-publish-release-' + randomUUID());
    cleanup.push(publishReady, publishRelease);
    const first = spawnCloseWorker(
      fixture.root,
      {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: firstSpec.specId,
      },
      { ready: publishReady, release: publishRelease },
    );
    let second: Worker | undefined;
    try {
      await waitFor(first.ready);
      await writeFile(first.start, 'go');
      await waitFor(publishReady);
      // The first process has created a real isolated candidate, but primary
      // has not yet moved. A competing distinct Spec cannot acquire target.
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(before);
      second = spawnCloseWorker(fixture.root, {
        kind: 'worktree-close',
        specId: otherSpec.specId,
        operationId: randomUUID(),
      });
      await waitFor(second.ready);
      await writeFile(second.start, 'go');
      const rejected = await second.done;
      expect(rejected.code, rejected.log).toBe(0);
      expect(JSON.parse(await readFile(second.result, 'utf8'))).toEqual({
        result: 'conflict',
      });
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(before);
      await writeFile(publishRelease, 'go');
      const published = await first.done;
      expect(published.code, published.log).toBe(0);
      const evidence = JSON.parse(await readFile(first.result, 'utf8')) as {
        result: string;
        commit: string;
      };
      expect(evidence.result).toBe('published');
      const publishedHead = git(fixture.root, 'rev-parse', 'HEAD');
      expect(publishedHead).toBe(evidence.commit);
      expect(publishedHead).not.toBe(before);
      expect(git(fixture.root, 'rev-list', '--parents', '-n', '1', 'HEAD')).toContain(before);
      expect(git(fixture.root, 'write-tree')).toBe(git(fixture.root, 'rev-parse', 'HEAD^{tree}'));
      expect(git(fixture.root, 'status', '--porcelain')).toBe('');
      const registry = await fixture.engine.readRegistry();
      expect(registry.specBindings.find((x) => x.specId === firstSpec.specId)?.workspaceId).toBe(
        registry.primaryWorkspaceId,
      );
      expect(registry.specBindings.find((x) => x.specId === otherSpec.specId)?.workspaceId).toBe(
        otherSpec.workspaceId,
      );
      expect(registry.workspaces.some((x) => x.workspaceId === firstSpec.workspaceId)).toBe(false);
      expect(registry.workspaces.some((x) => x.workspaceId === otherSpec.workspaceId)).toBe(true);
      expect(git(otherSpec.workspaceRoot, 'status', '--porcelain')).toBe('');
      const journals = await listCloseJournals(fixture.engine.context);
      expect(journals).toHaveLength(1);
      expect(journals[0]?.stage).toBe('completed');
    } finally {
      await writeFile(publishRelease, 'cleanup');
      first.kill();
      second?.kill();
      await Promise.allSettled([first.done, ...(second ? [second.done] : [])]);
    }
  }, 240000);

  it('LC39: SIGKILL the publication owner while another OS Close is excluded', async () => {
    const fixture = await project();
    const firstSpec = await specification(fixture, 'Kill linked publisher', true);
    const contender = await specification(fixture, 'Retained linked contender', true);
    await writeFile(join(fixture.root, 'primary-diverges.txt'), 'independent target\n');
    git(fixture.root, 'add', '--', 'primary-diverges.txt');
    git(
      fixture.root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'independent primary candidate',
    );
    const primaryHead = git(fixture.root, 'rev-parse', 'HEAD');
    const publishReady = join(tmpdir(), 'close-publish-kill-ready-' + randomUUID());
    const publishRelease = join(tmpdir(), 'close-publish-kill-release-' + randomUUID());
    cleanup.push(publishReady, publishRelease);
    const owner = spawnCloseWorker(
      fixture.root,
      { kind: 'worktree-close', operationId: randomUUID(), specId: firstSpec.specId },
      { ready: publishReady, release: publishRelease },
    );
    let rival: Worker | undefined;
    let afterCrash: Worker | undefined;
    try {
      await waitFor(owner.ready);
      await writeFile(owner.start, 'go');
      await waitFor(publishReady);
      const checkpoint = JSON.parse(await readFile(publishReady, 'utf8')) as {
        readonly pid: number;
        readonly stage: string;
      };
      expect(checkpoint.stage).toBe('candidate-prepared');
      expect(checkpoint.pid).toBeGreaterThan(0);
      rival = spawnCloseWorker(fixture.root, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: contender.specId,
      });
      await waitFor(rival.ready);
      await writeFile(rival.start, 'go');
      const rejected = await rival.done;
      expect(rejected.code, rejected.log).toBe(0);
      expect(JSON.parse(await readFile(rival.result, 'utf8'))).toEqual({
        result: 'conflict',
      });
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);

      // Kill the actual nested Vitest/Engine process, not its CLI wrapper.
      process.kill(checkpoint.pid, 'SIGKILL');
      const killed = await Promise.race([
        owner.done,
        sleep(25000).then(() => {
          owner.kill();
          throw new Error('Killed divergent publisher did not terminate.');
        }),
      ]);
      expect(killed.code, killed.log).not.toBe(0);
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);
      expect(git(fixture.root, 'status', '--porcelain')).toBe('');
      const journals = await listCloseJournals(fixture.engine.context);
      expect(journals).toHaveLength(1);
      expect(journals[0]?.stage).toBe('integration-scratch-candidate');

      afterCrash = spawnCloseWorker(fixture.root, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: contender.specId,
      });
      await waitFor(afterCrash.ready);
      await writeFile(afterCrash.start, 'go');
      const refused = await afterCrash.done;
      expect(refused.code, refused.log).toBe(0);
      expect(JSON.parse(await readFile(afterCrash.result, 'utf8'))).toEqual({
        result: 'conflict',
      });
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);
      expect(git(contender.workspaceRoot, 'status', '--porcelain')).toBe('');
      expect((await listCloseJournals(fixture.engine.context))[0]?.stage).toBe(
        'integration-scratch-candidate',
      );
    } finally {
      // Releasing the file cannot resurrect a SIGKILLed child.
      await writeFile(publishRelease, 'cleanup');
      owner.kill();
      rival?.kill();
      afterCrash?.kill();
      await Promise.allSettled([
        owner.done,
        ...(rival ? [rival.done] : []),
        ...(afterCrash ? [afterCrash.done] : []),
      ]);
    }
  }, 240000);

  it('LC17: a paused Create OS process blocks a separate Close process before Git mutation', async () => {
    const fixture = await project();
    const existing = await specification(fixture, 'Existing primary spec', false);
    const primaryHead = git(fixture.root, 'rev-parse', 'HEAD');
    const create = spawnPausedCreateWorker(fixture.root, fixture.engine.workspace.workspaceId);
    let close: Worker | undefined;
    let createOutcome: { code: number | null; log: string } | undefined;
    try {
      await waitFor(create.ready);
      await writeFile(create.start, 'go');
      await waitFor(create.paused);

      close = spawnCloseWorker(fixture.root, {
        kind: 'specification-close',
        specId: existing.specId,
        operationId: randomUUID(),
      });
      await waitFor(close.ready);
      await writeFile(close.start, 'go');
      const closeOutcome = await close.done;
      expect(closeOutcome.code, closeOutcome.log).toBe(0);
      expect(JSON.parse(await readFile(close.result, 'utf8'))).toEqual({
        result: 'conflict',
      });
      expect(await listCloseJournals(fixture.engine.context)).toHaveLength(0);
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);
      expect(git(fixture.root, 'status', '--porcelain')).toBe('');
    } finally {
      await writeFile(create.release, 'continue');
      createOutcome = await create.done;
      close?.kill();
      create.kill();
      if (close) await Promise.allSettled([close.done]);
    }
    expect(createOutcome.code, createOutcome.log).toBe(0);
    const registry = await fixture.engine.readRegistry();
    expect(registry.specBindings).toHaveLength(2);
    expect(registry.specBindings.some((item) => item.specId === existing.specId)).toBe(true);
    expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);
  }, 240000);
});
