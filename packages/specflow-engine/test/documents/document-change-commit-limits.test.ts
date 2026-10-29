import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onPosix } from '../support/platform';

import { GitCapabilityError } from '../../src/git/errors';
import { executeGitMutation } from '../../src/git/mutation';
import { executeGit } from '../../src/git/process';
import { bootstrapProjectHome, type SpecFlowEngine } from '../../src/testing';
import { createGitCommitPort } from '../../src/version-control/commits/git-adapter';
import type { EngineCommitRequest } from '../../src/version-control/commits/port';
import { commitStaged, createGitTestProject, git } from '../support/git-project';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split('/'));
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content);
}

async function project(): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'engine-document-limits-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  git(root, 'checkout', '-q', '-b', 'feature/work');
  for (const name of ['a', 'b']) await write(root, `docs/${name}.md`, `${name}\n`);
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

/** Every Git process the Engine starts while `run` executes (the spawn probe). */
async function spawnedArguments<T>(
  run: () => Promise<T>,
): Promise<{ result: T; spawns: string[][] }> {
  const spawns: string[][] = [];
  const listener = (message: unknown): void => {
    spawns.push([...(message as { args: readonly string[] }).args]);
  };
  subscribe('nevo.specflow.engine.git-process', listener);
  try {
    return { result: await run(), spawns };
  } finally {
    unsubscribe('nevo.specflow.engine.git-process', listener);
  }
}

// 1500 files of long names: slow on Windows runners, and the command-line cap matters most there;
// the Linux run proves the behaviour and the spawn probe proves the bound.
describe.skipIf(!onPosix)('a large document batch (real Git)', () => {
  it('commits more than 1500 long paths without any process line growing with the batch', async () => {
    const { root, engine } = await project();
    const paths = Array.from(
      { length: 1600 },
      (_, index) => `docs/${'segment-'.repeat(18)}${String(index).padStart(4, '0')}.md`,
    );
    expect(paths[0]!.length).toBeGreaterThanOrEqual(150);
    for (const path of paths) await write(root, path, `${path}\n`);
    await write(root, 'docs/a.md', 'a changed\n');
    const batch = ['docs/a.md', ...paths];
    const commits = createGitCommitPort(engine);

    const { result, spawns } = await spawnedArguments(async () => {
      const { effective } = await commits.effectivePaths(root, batch);
      return commits.commit(request(root, effective));
    });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(result.sha);
    expect(
      git(root, 'diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', result.sha)
        .split('\n')
        .sort(),
    ).toEqual([...batch].sort());
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');

    const longest = Math.max(...spawns.map((args) => args.join(' ').length));
    expect(spawns.length).toBeGreaterThan(20);
    expect(longest).toBeLessThan(16_000);
    // the mutations carry their paths in a file
    const mutations = spawns.filter((args) =>
      ['add', 'commit'].some((verb) => args.includes(verb)),
    );
    expect(mutations.length).toBeGreaterThanOrEqual(2);
    for (const args of mutations) expect(args.join(' ')).toContain('--pathspec-from-file=');
  }, 240_000);
});

describe('a directory where a document is expected, and the reverse (real Git)', () => {
  it('reads a directory in HEAD under a file on disk as a state that is not a blob', async () => {
    const { root, engine } = await project();
    await write(root, 'docs/sub/x.md', 'x\n');
    git(root, 'add', 'docs');
    commitStaged(root, 'a directory');
    await rm(join(root, 'docs/sub'), { recursive: true });
    await write(root, 'docs/sub', 'now a file\n');
    const parent = git(root, 'rev-parse', 'HEAD');
    const commits = createGitCommitPort(engine);

    const [fact] = await commits.pathFacts(root, ['docs/sub']);
    expect(fact!.head).toMatch(/^non-blob:/u);
    const [inspection] = await commits.inspectDocumentPaths(root, [
      { path: 'docs/sub', pre: null, post: 'a'.repeat(40) },
    ]);
    expect(inspection!.state).toBe('foreign');
    await expect(commits.commit(request(root, ['docs/sub']))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
      reason: 'path-kind-conflict',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect(git(root, 'ls-files', '--stage', '--', 'docs/sub')).toContain('docs/sub/x.md');
  });

  it('reads a file in HEAD under a directory on disk as a state that is not a blob', async () => {
    const { root, engine } = await project();
    await rm(join(root, 'docs/b.md'));
    await write(root, 'docs/b.md/inner.md', 'inner\n');
    const commits = createGitCommitPort(engine);

    const [fact] = await commits.pathFacts(root, ['docs/b.md']);
    expect(fact!.working).toMatch(/^non-blob:/u);
    await expect(commits.commit(request(root, ['docs/b.md']))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
      reason: 'path-kind-conflict',
    });
  });
});

describe('an add that gets killed (real Git)', () => {
  it('takes back the entries it may have made, because ownership is recorded before the add', async () => {
    const { root, engine } = await project();
    await write(root, 'docs/fresh-1.md', 'one\n');
    await write(root, 'docs/fresh-2.md', 'two\n');
    const parent = git(root, 'rev-parse', 'HEAD');
    const commits = createGitCommitPort(engine, {
      // The add runs to the end, then reports that it had to be killed.
      mutate: async (cwd, args, options) => {
        const result = await executeGitMutation(cwd, args, options);
        if (args.includes('add')) {
          throw new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'killed', 'terminated');
        }
        return result;
      },
    });

    await expect(
      commits.commit(request(root, ['docs/fresh-1.md', 'docs/fresh-2.md'])),
    ).rejects.toMatchObject({ code: 'COMMIT_BLOCKED', reason: 'commit-timed-out' });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect(git(root, 'ls-files', '--stage', '--', 'docs/fresh-1.md', 'docs/fresh-2.md')).toBe('');
    expect(existsSync(join(root, '.git/index.lock'))).toBe(false);

    // the retry works
    const retry = await createGitCommitPort(engine).commit(
      request(root, ['docs/fresh-1.md', 'docs/fresh-2.md']),
    );
    expect(retry.parentHead).toBe(parent);
  });
});

describe('the budget of one attempt (real Git)', () => {
  it('does not start a Git step with less than the minimum budget left', async () => {
    const { root, engine } = await project();
    await write(root, 'docs/a.md', 'a changed\n');
    const parent = git(root, 'rev-parse', 'HEAD');
    const { spawns } = await spawnedArguments(async () => {
      await expect(
        createGitCommitPort(engine).commit(request(root, ['docs/a.md'], { deadlineMs: 400 })),
      ).rejects.toMatchObject({ code: 'COMMIT_BLOCKED', reason: 'deadline-exceeded' });
    });
    expect(spawns).toEqual([]);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
  });

  it('gives reads the remaining budget and refuses the mutation when the reads used it up', async () => {
    const { root, engine } = await project();
    await write(root, 'docs/a.md', 'a changed\n');
    await write(root, 'docs/new.md', 'new\n');
    const parent = git(root, 'rev-parse', 'HEAD');
    const timeouts: (number | undefined)[] = [];
    const commits = createGitCommitPort(engine, {
      read: async (cwd, args, options) => {
        timeouts.push(options?.timeoutMs);
        // Slow reads: together they use up the budget before the first mutation.
        await new Promise((resolve) => setTimeout(resolve, 450));
        return executeGit(cwd, args, options);
      },
    });

    await expect(
      commits.commit(request(root, ['docs/a.md', 'docs/new.md'], { deadlineMs: 4000 })),
    ).rejects.toMatchObject({ code: 'COMMIT_BLOCKED' });

    expect(timeouts.length).toBeGreaterThan(0);
    expect(timeouts.every((timeout) => timeout !== undefined && timeout <= 4000)).toBe(true);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect(git(root, 'ls-files', '--stage', '--', 'docs/new.md')).toBe('');
  }, 60_000);
});

describe.skipIf(!onPosix)('a read-only Git process that has to end (real Git)', () => {
  it('is asked to end with SIGTERM before it is killed', async () => {
    const { root } = await project();
    const pidFile = join(root, '.git', 'read.pid');
    const trapFile = join(root, '.git', 'read.trap');
    // The alias traps SIGTERM (records it) and keeps running: only the escalation can end it.
    const script = join(root, '.git', 'slow-read.sh');
    await writeFile(
      script,
      `echo $$ > "${pidFile}"\ntrap 'echo term > "${trapFile}"' TERM\nwhile true; do sleep 0.1; done\n`,
    );
    await expect(
      executeGit(root, ['-c', `alias.hang=!sh "${script}"`, 'hang'], { timeoutMs: 400 }),
    ).rejects.toMatchObject({ code: 'GIT_UNAVAILABLE' });

    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    const deadline = Date.now() + 8000;
    let alive = true;
    while (alive && Date.now() < deadline) {
      const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
      alive =
        state.status === 0 && state.stdout.trim() !== '' && !state.stdout.trim().startsWith('Z');
      if (alive) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alive).toBe(false);
    expect(existsSync(trapFile)).toBe(true);
  }, 30_000);
});
