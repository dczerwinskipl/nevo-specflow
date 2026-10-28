import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { createGitTestProject } from '../support/git-project';
import {
  awaitProcessMarker,
  reapVitestWorker,
  spawnVitestWorker,
  type IndependentVitestWorker,
} from '../support/process-worker';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  installDefinitionsForTesting,
  reserveCloseOperation,
  discoverSpecifications,
  workspaceRegistryPath,
  type CreateSpecificationInput,
} from '../../src/testing';

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

async function project() {
  const root = await createGitTestProject(
    'specflow-create-process-Ż ',
    'runtime: {}\ngit:\n  enabled: false\n',
  );
  roots.push(root);
  await mkdir(join(root, '.nevo/local/create-workers'), { recursive: true });
  const engine = await bootstrapProjectHome(root);
  // The definitions are installed up front, so every process of the test finds them in place.
  await installDefinitionsForTesting(engine).catch(() => undefined);
  return { root, engine };
}

function input(workspaceId: string, title: string): CreateSpecificationInput {
  return {
    operationId: randomUUID(),
    title,
    created: '2026-10-14',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'existing', workspaceId },
  };
}

interface ProcessWorker {
  readonly process: IndependentVitestWorker;
  readonly ready: string;
  readonly start: string;
  readonly paused: string;
  readonly release: string;
  readonly observed: string;
  readonly result: string;
  readonly done: Promise<{ readonly code: number | null; readonly log: string }>;
}

function spawnCreateWorker(
  root: string,
  request: CreateSpecificationInput,
  options: {
    readonly pauseEffect?: 'reservation' | 'git' | 'manifest-opened' | 'manifest';
    readonly observeReservation?: boolean;
    readonly pauseWaitMs?: number;
    readonly confirmInterruptedGitSettled?: boolean;
  } = {},
): ProcessWorker {
  const token = randomUUID();
  const directory = join(root, '.nevo/local/create-workers');
  const ready = join(directory, 'create-' + token + '.ready');
  const start = join(directory, 'create-' + token + '.go');
  const paused = join(directory, 'create-' + token + '.paused');
  const release = join(directory, 'create-' + token + '.release');
  const observed = join(directory, 'create-' + token + '.observed');
  const result = join(directory, 'create-' + token + '.result');
  const child = spawnVitestWorker(
    'test/fixtures/create-worker.test.ts',
    {
      NEVO_CREATE_WORKER: '1',
      NEVO_CREATE_WORKER_HOME: root,
      NEVO_CREATE_WORKER_READY: ready,
      NEVO_CREATE_WORKER_START: start,
      NEVO_CREATE_WORKER_INPUT: JSON.stringify(request),
      NEVO_CREATE_WORKER_PAUSE_STAGE: options.pauseEffect ?? '',
      NEVO_CREATE_WORKER_PAUSED: paused,
      NEVO_CREATE_WORKER_RELEASE: release,
      NEVO_CREATE_WORKER_PAUSE_WAIT_MS: String(options.pauseWaitMs ?? 30000),
      NEVO_CREATE_WORKER_OBSERVED: options.observeReservation ? observed : '',
      NEVO_CREATE_WORKER_GIT_SETTLED: options.confirmInterruptedGitSettled ? '1' : '0',
      NEVO_CREATE_WORKER_RESULT: result,
    },
    120000,
  );
  activeProcesses.push(child);
  return { ready, start, paused, release, observed, result, done: child.done, process: child };
}

async function waitForFile(path: string, worker?: ProcessWorker): Promise<void> {
  await awaitProcessMarker(path, worker?.process, 30000, 25);
}

async function startTogether(workers: readonly ProcessWorker[]): Promise<void> {
  await Promise.all(workers.map((worker) => waitForFile(worker.ready, worker)));
  await Promise.all(workers.map((worker) => writeFile(worker.start, 'go')));
}

describe('E2.T04 — cross-process durable create reservation and registry CAS', () => {
  it('L01: one winner for conflicting same-slug operations across OS processes', async () => {
    const { engine, root } = await project();
    const workers = [
      spawnCreateWorker(root, input(engine.workspace.workspaceId, 'Same slug')),
      spawnCreateWorker(root, input(engine.workspace.workspaceId, 'Same slug')),
    ];
    await startTogether(workers);
    const outcomes = await Promise.all(workers.map((worker) => worker.done));
    expect(outcomes.map((item) => item.code === 0).sort(), JSON.stringify(outcomes)).toEqual([
      false,
      true,
    ]);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    expect(await discoverSpecifications(engine)).toHaveLength(1);
  }, 150000);

  it('VC05: same operationId across two process clocks has one durable date and binding', async () => {
    const { engine, root } = await project();
    const operationId = randomUUID();
    const one = {
      ...input(engine.workspace.workspaceId, 'Concurrent midnight'),
      operationId,
      created: '2026-10-14',
      archetype: { id: 'minimal', version: 1 },
    };
    const two = { ...one, created: '2026-10-15' };
    const workers = [spawnCreateWorker(root, one), spawnCreateWorker(root, two)];
    await startTogether(workers);
    const outcomes = await Promise.all(workers.map((worker) => worker.done));
    expect(
      outcomes.map((x) => x.code),
      JSON.stringify(outcomes),
    ).toEqual([0, 0]);
    const { readCreateJournal } = await import('../../src/specs/create/journal');
    const journal = await readCreateJournal(engine.context, operationId);
    expect(journal?.version).toBe(2);
    expect(['2026-10-14', '2026-10-15']).toContain(journal?.created);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    expect(await discoverSpecifications(engine)).toHaveLength(1);
  }, 180000);

  for (const scenario of [
    { pausedAt: 'git', gitSettled: false },
    { pausedAt: 'manifest', gitSettled: false },
    { pausedAt: 'manifest', gitSettled: true },
  ] as const) {
    const { pausedAt, gitSettled } = scenario;
    it(
      'VC05: second process joins live ' +
        pausedAt +
        (gitSettled ? ' with Git-only confirmation' : '') +
        ' without repeating effects',
      async () => {
        const { engine, root } = await project();
        await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
        roots.push(join(dirname(root), basename(root) + '-worktrees'));
        const operationId = randomUUID();
        const original = {
          operationId,
          title: 'Concurrent ' + pausedAt + (gitSettled ? ' Git confirmed' : '') + ' join',
          created: '2026-10-14',
          archetype: { id: 'minimal', version: 1 },
          target: { kind: 'new-worktree' as const, baseRef: 'HEAD' },
        };
        const writer = spawnCreateWorker(root, original, { pauseEffect: pausedAt });
        await startTogether([writer]);
        await waitForFile(writer.paused, writer);
        const { readCreateJournal } = await import('../../src/specs/create/journal');
        const journal = await readCreateJournal(engine.context, operationId);
        expect(journal?.version).toBe(2);
        expect(journal?.stage).toBe(pausedAt === 'git' ? 'git-initiated' : 'manifest-writing');

        const follower = spawnCreateWorker(
          root,
          { ...original, created: '2026-10-15' },
          { observeReservation: true, confirmInterruptedGitSettled: gitSettled },
        );
        await startTogether([follower]);
        // This signal is emitted AFTER reserve() has seen the existing journal.
        await waitForFile(follower.observed);
        const before = await readCreateJournal(engine.context, operationId);
        expect(before?.stage).toBe(journal?.stage);
        const resultWhilePaused = await Promise.race([
          follower.done.then(() => 'finished'),
          sleep(400).then(() => 'still-following'),
        ]);
        expect(resultWhilePaused).toBe('still-following');
        expect((await engine.readRegistry()).specBindings).toHaveLength(0);
        expect(
          execFileSync('git', ['worktree', 'list', '--porcelain'], {
            cwd: root,
            encoding: 'utf8',
          }).match(/worktree /gu),
        ).toHaveLength(2);
        expect((await readCreateJournal(engine.context, operationId))?.stage).toBe(journal?.stage);

        await writeFile(writer.release, 'continue');
        const outcomes = await Promise.all([writer.done, follower.done]);
        expect(
          outcomes.map((x) => x.code),
          JSON.stringify(outcomes),
        ).toEqual([0, 0]);
        const [writerResult, followerResult] = await Promise.all([
          readFile(writer.result, 'utf8'),
          readFile(follower.result, 'utf8'),
        ]);
        expect(JSON.parse(followerResult)).toEqual(JSON.parse(writerResult));
        expect((await readCreateJournal(engine.context, operationId))?.stage).toBe('completed');
        expect((await engine.readRegistry()).specBindings).toHaveLength(1);
        expect(await discoverSpecifications(engine)).toHaveLength(1);
        expect(
          execFileSync('git', ['worktree', 'list', '--porcelain'], {
            cwd: root,
            encoding: 'utf8',
          }).match(/worktree /gu),
        ).toHaveLength(2);
      },
      150000,
    );
  }

  it('T10: live Create process prevents Close on the same primary checkout', async () => {
    const { engine, root } = await project();
    const branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: false\n  integrationTargetBranch: ' + branch + '\n',
    );
    // Git is disabled in this project, so the installed definitions are only written; the owner commits
    // them with the configuration change, which keeps the checkout clean for Close.
    execFileSync('git', ['add', '.nevo/config.yaml', '.nevo/definitions'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=SpecFlow Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-qm',
        'configure integration target',
      ],
      { cwd: root },
    );

    const closable = await createSpecificationForTesting(
      engine,
      input(engine.workspace.workspaceId, 'Already committed Specification'),
    );
    execFileSync(
      'git',
      [
        'add',
        '--',
        closable.relativeManifestPath,
        'specs/active/' + closable.slug + '/overview.md',
      ],
      { cwd: root },
    );
    execFileSync(
      'git',
      [
        '-c',
        'user.name=SpecFlow Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-qm',
        'prepare closable Spec',
      ],
      { cwd: root },
    );

    const writer = spawnCreateWorker(
      root,
      input(engine.workspace.workspaceId, 'Concurrent writer'),
      {
        pauseEffect: 'reservation',
      },
    );
    await startTogether([writer]);
    await waitForFile(writer.paused, writer);
    try {
      await expect(
        reserveCloseOperation(engine, {
          kind: 'specification-close',
          operationId: randomUUID(),
          specId: closable.specId,
        }),
      ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    } finally {
      await writeFile(writer.release, 'continue');
    }
    const outcome = await writer.done;
    expect(outcome.code, outcome.log).toBe(0);
    expect((await engine.readRegistry()).specBindings).toHaveLength(2);
  }, 150000);

  it('T10: another Create admits only a journal-owned partially open manifest', async () => {
    const { engine, root } = await project();
    const original = input(engine.workspace.workspaceId, 'Unfinished manifest publisher');
    const writer = spawnCreateWorker(root, original, {
      pauseEffect: 'manifest-opened',
      pauseWaitMs: 90000,
    });
    let independent: ProcessWorker | undefined;
    try {
      await startTogether([writer]);
      await waitForFile(writer.paused, writer);

      const { readCreateJournal } = await import('../../src/specs/create/journal');
      const journal = await readCreateJournal(engine.context, original.operationId);
      expect(journal?.stage).toBe('manifest-writing');
      const manifest = join(root, journal!.files[0]!.relativePath);
      // The manifest becomes visible only complete (staged file, fsync, rename): while the write is
      // in progress there is no partial file at its path.
      await expect(readFile(manifest, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const unowned = join(root, 'specs/active/unowned-corrupt');
      await mkdir(unowned);
      await writeFile(join(unowned, 'specification.yaml'), 'not_a_specification: true\\n');
      try {
        await expect(
          createSpecificationForTesting(
            engine,
            input(engine.workspace.workspaceId, 'Must reject unrelated corruption'),
          ),
        ).rejects.toMatchObject({ code: 'SPEC_SOURCE_INVALID' });
      } finally {
        await rm(unowned, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
      }

      independent = spawnCreateWorker(
        root,
        input(engine.workspace.workspaceId, 'Independent admission during manifest write'),
        { observeReservation: true },
      );
      await startTogether([independent]);
      // Reservation is emitted AFTER the independent process has passed
      // journal-aware discovery, but BEFORE it needs to finish its Create.
      await waitForFile(independent.observed, independent);
      // The manifest becomes visible only complete (staged file, fsync, rename): while the write is
      // in progress there is no partial file at its path.
      await expect(readFile(manifest, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await engine.readRegistry()).specBindings).toHaveLength(0);
    } finally {
      await writeFile(writer.release, 'continue');
      // Both spawned children are observed even when a checkpoint assertion
      // fails, preventing a retained process from affecting later tests.
      await Promise.allSettled([writer.done, ...(independent ? [independent.done] : [])]);
    }

    const outcomes = await Promise.all([writer.done, independent.done]);
    expect(
      outcomes.map((outcome) => outcome.code),
      JSON.stringify(outcomes),
    ).toEqual([0, 0]);
    expect((await engine.readRegistry()).specBindings).toHaveLength(2);
    expect(await discoverSpecifications(engine)).toHaveLength(2);
  }, 180000);

  it('L02: disjoint OS-process creates both persist without a lost registry update', async () => {
    const { engine, root } = await project();
    const workers = [
      spawnCreateWorker(root, input(engine.workspace.workspaceId, 'First process')),
      spawnCreateWorker(root, input(engine.workspace.workspaceId, 'Second process')),
    ];
    await startTogether(workers);
    const outcomes = await Promise.all(workers.map((worker) => worker.done));
    expect(
      outcomes.map((item) => item.code),
      JSON.stringify(outcomes),
    ).toEqual([0, 0]);
    const registry = await engine.readRegistry();
    expect(registry.specBindings).toHaveLength(2);
    expect(new Set(registry.specBindings.map((item) => item.specId)).size).toBe(2);
    expect(await discoverSpecifications(engine)).toHaveLength(2);
    expect(workspaceRegistryPath(engine.context)).toContain('workspaces.json');
  }, 150000);
});
