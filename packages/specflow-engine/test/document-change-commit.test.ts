import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onPosix } from './support/platform';

import { resolveGitExecutable } from '../src/git/executable';
import { executeGitMutation } from '../src/git/mutation';
import { bootstrapProjectHome, type SpecFlowEngine } from '../src/testing';
import { createGitCommitPort } from '../src/version-control/commits/git-adapter';
import type { EngineCommitRequest } from '../src/version-control/commits/port';
import { commitStaged, createGitTestProject, git } from './support/git-project';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

/** Runs Git without throwing so a refusal can be asserted. */
function gitResult(root: string, ...args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync(resolveGitExecutable(), args, { cwd: root, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split('/'));
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content);
}

/** A project on `feature/work` with three committed documents under `docs/`. */
async function project(): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'engine-document-commit-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  git(root, 'checkout', '-q', '-b', 'feature/work');
  for (const name of ['a', 'b', 'c']) await write(root, `docs/${name}.md`, `${name}\n`);
  git(root, 'add', 'docs');
  commitStaged(root, 'base documents');
  return { root, engine: await bootstrapProjectHome(root) };
}

function request(
  root: string,
  paths: string[],
  overrides: Partial<EngineCommitRequest> = {},
): EngineCommitRequest {
  return {
    root,
    expectedBranch: 'feature/work',
    paths,
    operationId: randomUUID(),
    kind: 'document-change',
    subject: 'docs: change documents',
    trailers: { 'Nevo-Spec': randomUUID() },
    ...overrides,
  };
}

const changedIn = (root: string, sha: string): string =>
  git(root, 'diff-tree', '--no-commit-id', '--name-status', '--no-renames', '-r', sha);

describe('Git behaviour the document commits rely on (real Git)', () => {
  it('add -N stages the deletion of a deleted tracked path', async () => {
    const { root } = await project();
    await rm(join(root, 'docs/a.md'));
    expect(gitResult(root, 'add', '--intent-to-add', '--', ':(literal)docs/a.md').status).toBe(0);
    expect(git(root, 'diff', '--cached', '--name-status')).toBe('D\tdocs/a.md');
  });

  it('add -N of an absent, never tracked path fails with a pathspec error', async () => {
    const { root } = await project();
    const result = gitResult(root, 'add', '--intent-to-add', '--', ':(literal)docs/never.md');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/pathspec/u);
  });

  it('keeps an intent-to-add entry after its file was removed', async () => {
    const { root } = await project();
    await write(root, 'docs/new.md', 'new\n');
    git(root, 'add', '--intent-to-add', '--', 'docs/new.md');
    await rm(join(root, 'docs/new.md'));
    expect(git(root, 'ls-files', '--stage', '--', 'docs/new.md')).toContain('docs/new.md');
    expect(git(root, 'status', '--porcelain=v1')).toContain('docs/new.md');
  });

  it('commit --only takes a deleted tracked path, a new path after add -N and a rename pair', async () => {
    const { root } = await project();
    const identity = ['-c', 'user.name=T', '-c', 'user.email=t@e.invalid'];
    await rm(join(root, 'docs/a.md'));
    expect(
      gitResult(root, ...identity, 'commit', '-qm', 'delete', '--only', '--', 'docs/a.md').status,
    ).toBe(0);
    expect(changedIn(root, 'HEAD')).toBe('D\tdocs/a.md');

    await write(root, 'docs/new.md', 'new\n');
    git(root, 'add', '--intent-to-add', '--', 'docs/new.md');
    expect(
      gitResult(root, ...identity, 'commit', '-qm', 'add', '--only', '--', 'docs/new.md').status,
    ).toBe(0);
    expect(changedIn(root, 'HEAD')).toBe('A\tdocs/new.md');

    // rename pair: the new path was intent-to-added, the old one is a deleted tracked path
    await rename(join(root, 'docs/b.md'), join(root, 'docs/renamed.md'));
    git(root, 'add', '--intent-to-add', '--', 'docs/renamed.md');
    expect(
      gitResult(
        root,
        ...identity,
        'commit',
        '-qm',
        'rename',
        '--only',
        '--',
        'docs/b.md',
        'docs/renamed.md',
      ).status,
    ).toBe(0);
    expect(changedIn(root, 'HEAD').split('\n').sort()).toEqual([
      'A\tdocs/renamed.md',
      'D\tdocs/b.md',
    ]);
  });

  it('commit --only of a rename pair fails with a pathspec error when the new path was not added', async () => {
    const { root } = await project();
    await rename(join(root, 'docs/b.md'), join(root, 'docs/renamed.md'));
    const result = gitResult(
      root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@e.invalid',
      'commit',
      '-qm',
      'rename',
      '--only',
      '--',
      'docs/b.md',
      'docs/renamed.md',
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/pathspec/u);
  });

  it('check-ignore --no-index answers for a path that does not exist', async () => {
    const { root } = await project();
    await write(root, '.gitignore', 'ignored/\n');
    expect(gitResult(root, 'check-ignore', '--no-index', '--', 'ignored/missing.md').status).toBe(
      0,
    );
    expect(gitResult(root, 'check-ignore', '--no-index', '--', 'docs/missing.md').status).toBe(1);
  });
});

describe('Engine commit port: document-change (real Git)', () => {
  it('commits a mix of changed, new, deleted and renamed documents exactly', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');
    await rm(join(root, 'docs/b.md'));
    await write(root, 'docs/new.md', 'new\n');
    await write(root, 'docs/c-renamed.md', 'c\n');
    await rm(join(root, 'docs/c.md'));
    const batch = ['docs/a.md', 'docs/b.md', 'docs/new.md', 'docs/c.md', 'docs/c-renamed.md'];
    const parent = git(root, 'rev-parse', 'HEAD');

    const { effective, dropped } = await commits.effectivePaths(root, batch);
    expect(effective).toEqual(batch);
    expect(dropped).toEqual([]);
    const operationId = randomUUID();
    const second = randomUUID();
    const result = await commits.commit(
      request(root, effective, {
        operationId,
        trailers: { 'Nevo-Coalesced': second, 'Nevo-Documents': 'a,b,new' },
      }),
    );

    expect(result.parentHead).toBe(parent);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(result.sha);
    expect(changedIn(root, result.sha).split('\n').sort()).toEqual([
      'A\tdocs/c-renamed.md',
      'A\tdocs/new.md',
      'D\tdocs/b.md',
      'D\tdocs/c.md',
      'M\tdocs/a.md',
    ]);
    const message = git(root, 'log', '-1', '--format=%B', result.sha);
    expect(message).toContain('Nevo-Kind: document-change');
    expect(message).toContain('Nevo-Documents: a,b,new');
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');
    // found by its own id and by a coalesced id
    for (const id of [operationId, second]) {
      await expect(commits.findByOperation(root, id, parent)).resolves.toMatchObject({
        status: 'found',
        sha: result.sha,
      });
    }
  });

  it('drops paths equal to HEAD and refuses a request that still names one', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');
    // touched but byte-identical to HEAD
    await write(root, 'docs/b.md', 'b\n');

    const { effective, dropped } = await commits.effectivePaths(root, ['docs/a.md', 'docs/b.md']);
    expect(effective).toEqual(['docs/a.md']);
    expect(dropped).toEqual(['docs/b.md']);

    const parent = git(root, 'rev-parse', 'HEAD');
    await expect(commits.commit(request(root, ['docs/a.md', 'docs/b.md']))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
      reason: 'effective-set-changed',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);

    const result = await commits.commit(request(root, effective, { droppedPaths: dropped }));
    expect(changedIn(root, result.sha)).toBe('M\tdocs/a.md');
  });

  it('runs no Git mutation when no path differs from HEAD', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a\n');
    const parent = git(root, 'rev-parse', 'HEAD');
    const indexBefore = await readFile(join(root, '.git/index'));
    const indexTimeBefore = (await stat(join(root, '.git/index'))).mtimeMs;

    // absent in the working tree and in HEAD counts as equal as well
    const result = await commits.effectivePaths(root, ['docs/a.md', 'docs/never.md']);

    expect(result.effective).toEqual([]);
    expect(result.dropped).toEqual(['docs/a.md', 'docs/never.md']);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect((await readFile(join(root, '.git/index'))).equals(indexBefore)).toBe(true);
    expect((await stat(join(root, '.git/index'))).mtimeMs).toBe(indexTimeBefore);
  });

  it('compares with the same attributes a hand git add applies', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, '.gitattributes', '*.md text eol=lf\n');
    git(root, 'add', '.gitattributes');
    commitStaged(root, 'attributes');
    // CRLF on disk is stored as LF, which HEAD already holds: nothing to commit
    await write(root, 'docs/a.md', 'a\r\n');
    await write(root, 'docs/b.md', 'b changed\r\n');

    const { effective, dropped } = await commits.effectivePaths(root, ['docs/a.md', 'docs/b.md']);

    expect(dropped).toEqual(['docs/a.md']);
    expect(effective).toEqual(['docs/b.md']);
  });

  it('removes a stale intent-to-add entry of a path created and deleted in one batch', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    // an earlier attempt added the file as intent-to-add, then the file was deleted again
    await write(root, 'docs/ghost.md', 'ghost\n');
    git(root, 'add', '--intent-to-add', '--', 'docs/ghost.md');
    await rm(join(root, 'docs/ghost.md'));
    await write(root, 'docs/a.md', 'a changed\n');

    const { effective, dropped } = await commits.effectivePaths(root, [
      'docs/a.md',
      'docs/ghost.md',
    ]);
    expect(dropped).toEqual(['docs/ghost.md']);
    await commits.commit(request(root, effective, { droppedPaths: dropped }));

    expect(git(root, 'ls-files', '--stage', '--', 'docs/ghost.md')).toBe('');
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');
  });

  it('keeps the work of the user: other staged hunks, and a pre-staged path inside the batch', async () => {
    const { root, engine } = await project();
    await write(root, 'docs/c.md', 'c\nstaged\n');
    git(root, 'add', 'docs/c.md');
    await write(root, 'docs/c.md', 'c\nstaged\nunstaged\n');
    await write(root, 'docs/mine.md', 'my own staged content\n');
    git(root, 'add', 'docs/mine.md');
    await write(root, 'docs/a.md', 'a changed\n');
    await write(root, 'docs/engine.md', 'engine content\n');
    const stagedBefore = git(root, 'diff', '--cached', '--', 'docs/c.md', 'docs/mine.md');
    const unstagedBefore = git(root, 'diff', '--', 'docs/c.md');
    const parent = git(root, 'rev-parse', 'HEAD');
    const lock = join(root, '.git/refs/heads/feature/work.lock');
    const commits = createGitCommitPort(engine, { afterRecheck: () => writeFile(lock, '') });

    // the commit fails (the branch ref is locked): the Engine takes back only what it added
    await expect(
      commits.commit(request(root, ['docs/a.md', 'docs/engine.md', 'docs/mine.md'])),
    ).rejects.toMatchObject({ code: 'COMMIT_FAILED' });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect(git(root, 'ls-files', '--stage', '--', 'docs/engine.md')).toBe('');
    expect(git(root, 'diff', '--cached', '--', 'docs/c.md', 'docs/mine.md')).toBe(stagedBefore);
    expect(git(root, 'diff', '--', 'docs/c.md')).toBe(unstagedBefore);
    expect(git(root, 'ls-files', '--stage', '--', 'docs/mine.md')).toContain('docs/mine.md');

    // and the same batch commits once the lock is gone, leaving the unrelated staged hunk alone
    await rm(lock);
    const retry = createGitCommitPort(engine);
    const result = await retry.commit(
      request(root, ['docs/a.md', 'docs/engine.md', 'docs/mine.md']),
    );
    expect(changedIn(root, result.sha).split('\n').sort()).toEqual([
      'A\tdocs/engine.md',
      'A\tdocs/mine.md',
      'M\tdocs/a.md',
    ]);
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('docs/c.md');
  }, 120000);

  it('verifies each path against its recorded pre and post state, deletions included', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    const before = await commits.pathFacts(root, ['docs/a.md', 'docs/b.md', 'docs/new.md']);
    await write(root, 'docs/a.md', 'a changed\n');
    await rm(join(root, 'docs/b.md'));
    await write(root, 'docs/new.md', 'new\n');
    const after = await commits.pathFacts(root, ['docs/a.md', 'docs/b.md', 'docs/new.md']);
    const expectations = [
      { path: 'docs/a.md', pre: before[0]!.head, post: after[0]!.working },
      { path: 'docs/b.md', pre: before[1]!.head, post: null },
      { path: 'docs/new.md', pre: null, post: after[2]!.working },
    ];

    const pending = await commits.inspectDocumentPaths(root, expectations);
    expect(pending.map((entry) => entry.state)).toEqual(['at-post', 'at-post', 'at-post']);

    const result = await commits.commit(
      request(
        root,
        expectations.map((e) => e.path),
      ),
    );
    const done = await commits.inspectDocumentPaths(root, expectations, result.sha);
    expect(done.map((entry) => entry.state)).toEqual(['committed', 'committed', 'committed']);
    // the commit before ours still holds the pre state
    const earlier = await commits.inspectDocumentPaths(root, expectations, result.parentHead);
    expect(earlier.map((entry) => entry.state)).toEqual(['at-post', 'at-post', 'at-post']);

    await write(root, 'docs/a.md', 'someone else\n');
    const foreign = await commits.inspectDocumentPaths(root, [
      { path: 'docs/a.md', pre: before[0]!.head, post: 'f'.repeat(40) },
    ]);
    expect(foreign[0]!.state).toBe('foreign');
  }, 120000);
});

// A clean filter that sleeps is the hung-Git scenario. The process-group kill is POSIX; Windows
// uses a tree kill that is covered by the injected-seam unit tests only.
describe.skipIf(!onPosix)('hung clean filter (real Git, POSIX)', () => {
  async function filterProject(): Promise<{
    root: string;
    engine: SpecFlowEngine;
    flag: string;
    pidFile: string;
    hang: () => Promise<void>;
  }> {
    const { root, engine } = await project();
    const flag = join(root, '.git', 'hang-flag');
    const pidFile = join(root, '.git', 'filter.pid');
    const script = join(root, '.git', 'slow-clean.sh');
    // Sleeps only while the flag file exists, so reads that run the filter stay fast.
    await writeFile(
      script,
      `if [ -e "${flag}" ]; then sleep 600 & echo "$$ $!" > "${pidFile}"; wait; fi\ncat\n`,
    );
    git(root, 'config', 'filter.slow.clean', `sh "${script}"`);
    await write(root, '.gitattributes', '*.slow filter=slow\n');
    git(root, 'add', '.gitattributes');
    commitStaged(root, 'filter attributes');
    return { root, engine, flag, pidFile, hang: () => writeFile(flag, '') };
  }

  /** Alive and not a zombie (a container without an init process never reaps its orphans). */
  const alive = (pid: number): boolean => {
    const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
    return state.status === 0 && state.stdout.trim() !== '' && !state.stdout.trim().startsWith('Z');
  };
  const pidsOf = async (file: string): Promise<number[]> =>
    (await readFile(file, 'utf8')).trim().split(' ').map(Number);

  it('kills the whole process tree of a mutation at its deadline', async () => {
    const { root, flag, pidFile, hang } = await filterProject();
    await write(root, 'docs/x.slow', 'content\n');
    await hang();

    await expect(
      executeGitMutation(root, ['add', '--', 'docs/x.slow'], { timeoutMs: 500 }),
    ).rejects.toMatchObject({ code: 'GIT_OPERATION_UNCERTAIN', reason: 'terminated' });

    expect(existsSync(flag)).toBe(true);
    for (const pid of await pidsOf(pidFile)) expect(alive(pid)).toBe(false);
    expect(existsSync(join(root, '.git/index.lock'))).toBe(false);
  }, 60000);

  it('turns a hung commit into a retryable failure when the evidence is decisive', async () => {
    const { root, engine, pidFile, hang } = await filterProject();
    await write(root, 'docs/x.slow', 'content\n');
    await write(root, 'docs/a.md', 'a changed\n');
    const parent = git(root, 'rev-parse', 'HEAD');
    const commits = createGitCommitPort(engine, { afterRecheck: hang });

    // A slow runner may use up the budget before the commit starts: both reasons are retryable and
    // leave nothing behind.
    const error = await commits
      .commit(request(root, ['docs/a.md', 'docs/x.slow'], { deadlineMs: 5000 }))
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toMatchObject({ code: 'COMMIT_BLOCKED' });
    expect(['commit-timed-out', 'deadline-exceeded']).toContain(
      (error as { reason?: string }).reason,
    );

    if (existsSync(pidFile))
      for (const pid of await pidsOf(pidFile)) expect(alive(pid)).toBe(false);
    expect(existsSync(join(root, '.git/index.lock'))).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect(git(root, 'ls-files', '--stage', '--', 'docs/x.slow')).toBe('');

    // nothing is wedged: the same batch commits once the filter behaves
    await rm(join(root, '.git', 'hang-flag'));
    const result = await createGitCommitPort(engine).commit(
      request(root, ['docs/a.md', 'docs/x.slow']),
    );
    expect(changedIn(root, result.sha).split('\n').sort()).toEqual([
      'A\tdocs/x.slow',
      'M\tdocs/a.md',
    ]);
  }, 90000);
});
