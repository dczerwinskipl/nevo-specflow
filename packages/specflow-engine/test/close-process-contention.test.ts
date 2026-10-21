import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  listCloseJournals,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  terminateCheckpointPid,
  spawnVitestWorker,
  type IndependentVitestWorker,
} from './support/process-worker';

const cleanup: string[] = [];
const activeProcesses: IndependentVitestWorker[] = [];
afterEach(async () => {
  // Reap *every* real child before deleting its Git worktrees/marker files.
  await Promise.all(activeProcesses.splice(0).map((worker) => reapVitestWorker(worker)));
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
  readonly process: IndependentVitestWorker;
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
  const worker = spawnVitestWorker(
    'test/fixtures/close-race-worker.test.ts',
    {
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
    120000,
  );
  activeProcesses.push(worker);
  return { ready, start, result, done: worker.done, process: worker, kill: () => worker.kill() };
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
  const worker = spawnVitestWorker(
    'test/fixtures/create-worker.test.ts',
    {
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
    120000,
  );
  activeProcesses.push(worker);
  return {
    ready,
    start,
    result,
    paused,
    release,
    done: worker.done,
    process: worker,
    kill: () => worker.kill(),
  };
}

async function waitFor(path: string, worker?: Worker): Promise<void> {
  await awaitProcessMarker(path, worker?.process, 90000, 40);
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
    await Promise.all(workers.map((worker) => waitFor(worker.ready, worker)));
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
    await Promise.all(workers.map((worker) => reapVitestWorker(worker.process)));
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
      await waitFor(first.ready, first);
      await writeFile(first.start, 'go');
      await waitFor(publishReady, first);
      // The first process has created a real isolated candidate, but primary
      // has not yet moved. A competing distinct Spec cannot acquire target.
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(before);
      second = spawnCloseWorker(fixture.root, {
        kind: 'worktree-close',
        specId: otherSpec.specId,
        operationId: randomUUID(),
      });
      await waitFor(second.ready, second);
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
      await Promise.all(
        [first, ...(second ? [second] : [])].map((worker) => reapVitestWorker(worker.process)),
      );
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
      await waitFor(owner.ready, owner);
      await writeFile(owner.start, 'go');
      await waitFor(publishReady, owner);
      const checkpoint = await readProcessCheckpoint(publishReady, 'candidate-prepared');
      // A distinct contender must still be excluded WHILE the publisher owns
      // the real candidate, not merely after its SIGKILL recovery fence.
      rival = spawnCloseWorker(fixture.root, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: contender.specId,
      });
      await waitFor(rival.ready, rival);
      await writeFile(rival.start, 'go');
      const rejected = await rival.done;
      expect(rejected.code, rejected.log).toBe(0);
      expect(JSON.parse(await readFile(rival.result, 'utf8'))).toEqual({
        result: 'conflict',
      });
      expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);

      // The actual nested Vitest/Engine PID is terminated and supervisor reaped.
      const killed = await terminateCheckpointPid(checkpoint.pid, owner.process, 25000);
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
      await waitFor(afterCrash.ready, afterCrash);
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
      await Promise.all(
        [owner, ...(rival ? [rival] : []), ...(afterCrash ? [afterCrash] : [])].map((worker) =>
          reapVitestWorker(worker.process),
        ),
      );
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
      await waitFor(create.ready, create);
      await writeFile(create.start, 'go');
      await waitFor(create.paused, create);

      close = spawnCloseWorker(fixture.root, {
        kind: 'specification-close',
        specId: existing.specId,
        operationId: randomUUID(),
      });
      await waitFor(close.ready, close);
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
      await Promise.all(
        [create, ...(close ? [close] : [])].map((worker) => reapVitestWorker(worker.process)),
      );
    }
    expect(createOutcome.code, createOutcome.log).toBe(0);
    const registry = await fixture.engine.readRegistry();
    expect(registry.specBindings).toHaveLength(2);
    expect(registry.specBindings.some((item) => item.specId === existing.specId)).toBe(true);
    expect(git(fixture.root, 'rev-parse', 'HEAD')).toBe(primaryHead);
  }, 240000);
});
