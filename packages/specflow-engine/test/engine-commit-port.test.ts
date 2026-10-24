import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapProjectHome, type SpecFlowEngine } from '../src/testing';
import { openVersionControl } from '../src/version-control';
import { createGitCommitPort } from '../src/version-control/commits/git-adapter';
import type { EngineCommitRequest } from '../src/version-control/commits/port';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

const PATHS = ['specs/active/demo/specification.yaml', 'specs/active/demo/overview.md'];

async function project(commits = ''): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'engine-commit-port-',
    'runtime: {}\ngit:\n  enabled: true\n' + commits,
  );
  roots.push(root);
  git(root, 'checkout', '-q', '-b', 'feature/work');
  return { root, engine: await bootstrapProjectHome(root) };
}

async function writeScaffold(root: string): Promise<void> {
  await mkdir(join(root, 'specs/active/demo'), { recursive: true });
  await writeFile(join(root, PATHS[0]!), 'id: demo\n');
  await writeFile(join(root, PATHS[1]!), '# Demo\n');
}

function request(root: string, overrides: Partial<EngineCommitRequest> = {}): EngineCommitRequest {
  return {
    root,
    expectedBranch: 'feature/work',
    paths: PATHS,
    operationId: randomUUID(),
    kind: 'specification-create',
    subject: 'spec(create): demo',
    body: 'Demo title',
    trailers: { 'Nevo-Spec': randomUUID() },
    ...overrides,
  };
}

describe('Engine commit port (real Git)', () => {
  it('commits exactly the scaffold paths and leaves the user work untouched', async () => {
    const { root, engine } = await project();
    await writeFile(join(root, 'a.txt'), 'one\ntwo\n');
    await writeFile(join(root, 'b.txt'), 'b\n');
    git(root, 'add', 'a.txt', 'b.txt');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qm', 'base files');
    await writeFile(join(root, 'a.txt'), 'one\ntwo\nstaged\n');
    git(root, 'add', 'a.txt');
    await writeFile(join(root, 'a.txt'), 'one\ntwo\nstaged\nunstaged\n');
    await writeFile(join(root, 'b.txt'), 'edited\n');
    await writeFile(join(root, 'c.txt'), 'untracked\n');
    await writeScaffold(root);
    const statusBefore = git(root, 'status', '--porcelain=v1', '--untracked-files=all');
    const stagedPatchBefore = git(root, 'diff', '--cached', '--', 'a.txt');
    const unstagedPatchBefore = git(root, 'diff', '--', 'a.txt');
    const parent = git(root, 'rev-parse', 'HEAD');

    const result = await openVersionControl(engine).commits.commit(request(root));

    expect(result.parentHead).toBe(parent);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(result.sha);
    expect(git(root, 'rev-parse', 'HEAD~1')).toBe(parent);
    expect(
      git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.sha).split('\n').sort(),
    ).toEqual([...PATHS].sort());
    // The user's staged hunk is still staged, the unstaged edit and the untracked file untouched.
    expect(git(root, 'diff', '--cached', '--', 'a.txt')).toBe(stagedPatchBefore);
    expect(git(root, 'diff', '--', 'a.txt')).toBe(unstagedPatchBefore);
    const statusAfter = git(root, 'status', '--porcelain=v1', '--untracked-files=all');
    expect(statusAfter).toBe(
      statusBefore
        .split('\n')
        .filter((line) => !line.includes('specs/'))
        .join('\n'),
    );
    const message = git(root, 'log', '-1', '--format=%B');
    expect(message).toContain('spec(create): demo');
    expect(message).toContain('Nevo-Operation: ');
    expect(message).toContain('Nevo-Kind: specification-create');
  }, 240000);

  it('authors with the configured user and commits as the Engine; hooks and signing stay off', async () => {
    const { root, engine } = await project();
    git(root, 'config', 'user.name', 'Ada Lovelace');
    git(root, 'config', 'user.email', 'ada@example.invalid');
    git(root, 'config', 'commit.gpgsign', 'true');
    git(root, 'config', 'gpg.program', 'definitely-not-a-gpg-program');
    for (const hook of ['pre-commit', 'commit-msg']) {
      await writeFile(join(root, '.git/hooks', hook), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    }
    await writeScaffold(root);

    const { sha } = await openVersionControl(engine).commits.commit(request(root));

    expect(git(root, 'log', '-1', '--format=%an <%ae>|%cn <%ce>', sha)).toBe(
      'Ada Lovelace <ada@example.invalid>|Nevo SpecFlow Engine <engine@nevo.invalid>',
    );
    expect(git(root, 'log', '-1', '--format=%G?', sha)).toBe('N');
  }, 240000);

  it('falls back to the Engine identity for the author when none is configured', async () => {
    const { root, engine } = await project();
    const home = await mkdtemp(join(tmpdir(), 'engine-commit-home-'));
    roots.push(home);
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('XDG_CONFIG_HOME', join(home, 'xdg'));
    await writeScaffold(root);

    const { sha } = await openVersionControl(engine).commits.commit(request(root));

    expect(git(root, 'log', '-1', '--format=%an <%ae>|%cn <%ce>', sha)).toBe(
      'Nevo SpecFlow Engine <engine@nevo.invalid>|Nevo SpecFlow Engine <engine@nevo.invalid>',
    );
  }, 240000);

  it.each([
    ['protected', 'commits:\n    protectedBranches: ["feature/**"]\n', 'branch-protected'],
    [
      'not allowed',
      'commits:\n    protectedBranches: []\n    allowedBranches: ["release/**"]\n',
      'branch-not-allowed',
    ],
  ])(
    'refuses a %s branch before touching the checkout',
    async (_name, block, reason) => {
      const { root, engine } = await project('  ' + block);
      await writeScaffold(root);
      const parent = git(root, 'rev-parse', 'HEAD');
      const commits = openVersionControl(engine).commits;

      for (const call of [
        () => commits.preflight(request(root)),
        () => commits.commit(request(root)),
      ]) {
        await expect(call()).rejects.toMatchObject({ code: 'BRANCH_PROTECTED', reason });
      }
      expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
      expect(git(root, 'diff', '--cached', '--name-only')).toBe('');
    },
    240000,
  );

  it('uses the same project policy that a branch switched after reservation hits', async () => {
    const { root, engine } = await project('  commits:\n    protectedBranches: [main, master]\n');
    await writeScaffold(root);
    const commits = openVersionControl(engine).commits;
    await expect(commits.preflight(request(root))).resolves.toBeUndefined();
    git(root, 'checkout', '-q', '-B', 'master');
    await expect(commits.commit(request(root, { expectedBranch: 'master' }))).rejects.toMatchObject(
      { code: 'BRANCH_PROTECTED' },
    );
    await expect(commits.commit(request(root))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
      reason: 'branch-changed',
    });
  }, 240000);

  it.each<[string, (root: string) => Promise<void>, string]>([
    [
      'detached HEAD',
      (root) => {
        git(root, 'checkout', '-q', '--detach');
        return Promise.resolve();
      },
      'detached',
    ],
    [
      'another branch checked out',
      (root) => {
        git(root, 'checkout', '-q', '-b', 'elsewhere');
        return Promise.resolve();
      },
      'branch-changed',
    ],
    [
      'a merge in progress',
      async (root) => {
        await writeFile(join(root, '.git/MERGE_HEAD'), git(root, 'rev-parse', 'HEAD') + '\n');
      },
      'git-busy',
    ],
    [
      'a rebase in progress',
      async (root) => {
        await mkdir(join(root, '.git/rebase-merge'));
      },
      'git-busy',
    ],
    [
      'an ignored scaffold path',
      async (root) => {
        await writeFile(join(root, '.gitignore'), '.nevo/local/\nspecs/\n');
      },
      'path-ignored',
    ],
    [
      'a held index lock',
      async (root) => {
        await writeFile(join(root, '.git/index.lock'), '');
      },
      'index-locked',
    ],
  ])(
    'blocks on %s',
    async (_name, arrange, reason) => {
      const { root, engine } = await project();
      await writeScaffold(root);
      await arrange(root);
      await expect(openVersionControl(engine).commits.commit(request(root))).rejects.toMatchObject({
        code: 'COMMIT_BLOCKED',
        reason,
      });
    },
    240000,
  );

  it('blocks on unmerged index entries', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    await writeFile(join(root, 'x.txt'), 'base\n');
    git(root, 'add', 'x.txt');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qm', 'x');
    git(root, 'checkout', '-q', '-b', 'side');
    await writeFile(join(root, 'x.txt'), 'side\n');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qam', 'side');
    git(root, 'checkout', '-q', 'feature/work');
    await writeFile(join(root, 'x.txt'), 'main\n');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qam', 'main');
    try {
      git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'merge', 'side');
    } catch {
      // The conflict is the point.
    }
    // Only the unresolved index entries remain (no MERGE_HEAD): the unmerged check still blocks.
    await rm(join(root, '.git/MERGE_HEAD'), { force: true });
    await expect(openVersionControl(engine).commits.preflight(request(root))).rejects.toMatchObject(
      {
        code: 'COMMIT_BLOCKED',
        reason: 'unmerged-paths',
      },
    );
  }, 240000);

  it('finds its commit by the operation trailer and detects rewritten history', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    const commits = openVersionControl(engine).commits;
    const input = request(root);
    const result = await commits.commit(input);

    expect(await commits.findByOperation(root, input.operationId, result.parentHead)).toEqual({
      status: 'found',
      sha: result.sha,
      paths: [...PATHS].sort(),
    });
    expect(await commits.findByOperation(root, randomUUID(), result.parentHead)).toEqual({
      status: 'absent',
    });
    git(root, 'reset', '-q', '--hard', result.parentHead);
    git(
      root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@e.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'other',
    );
    expect(await commits.findByOperation(root, input.operationId, result.sha)).toEqual({
      status: 'history-changed',
    });
  }, 240000);

  it('reports COMMIT_FAILED when Git provably changed nothing', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    const parent = git(root, 'rev-parse', 'HEAD');
    await expect(
      openVersionControl(engine).commits.commit(
        request(root, { paths: [...PATHS, 'specs/active/demo/missing.md'] }),
      ),
    ).rejects.toMatchObject({ code: 'COMMIT_FAILED' });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
  }, 240000);

  it('lets two commits with disjoint paths both land in one checkout', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    await mkdir(join(root, 'specs/active/other'), { recursive: true });
    await writeFile(join(root, 'specs/active/other/specification.yaml'), 'id: other\n');
    const commits = openVersionControl(engine).commits;
    const [one, two] = await Promise.all([
      commits.commit(request(root)),
      commits.commit(
        request(root, {
          paths: ['specs/active/other/specification.yaml'],
          subject: 'spec(create): other',
        }),
      ),
    ]);
    expect(one.sha).not.toBe(two.sha);
    expect(git(root, 'rev-list', '--count', 'HEAD')).toBe('3');
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');
  }, 240000);

  it('lands every one of several concurrent disjoint-path commits (ref-update races are retried)', async () => {
    const { root, engine } = await project();
    const commits = openVersionControl(engine).commits;
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const name of names) {
      await mkdir(join(root, 'specs/active/' + name), { recursive: true });
      await writeFile(
        join(root, 'specs/active/' + name + '/specification.yaml'),
        'id: ' + name + '\n',
      );
    }
    const results = await Promise.all(
      names.map((name) =>
        commits.commit(
          request(root, {
            paths: ['specs/active/' + name + '/specification.yaml'],
            subject: 'spec(create): ' + name,
          }),
        ),
      ),
    );
    expect(new Set(results.map((result) => result.sha)).size).toBe(names.length);
    expect(git(root, 'rev-list', '--count', 'HEAD')).toBe(String(names.length + 1));
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');
  }, 240000);

  it('rejects malformed requests without running Git', async () => {
    const { root, engine } = await project();
    const commits = openVersionControl(engine).commits;
    for (const bad of [
      request(root, { paths: [] }),
      request(root, { paths: ['../escape'] }),
      request(root, { paths: ['/abs'] }),
      request(root, { operationId: 'not-a-uuid' }),
      request(root, { trailers: { Evil: 'x' } }),
    ]) {
      await expect(commits.preflight(bad)).rejects.toMatchObject({ code: 'COMMIT_BLOCKED' });
    }
  }, 240000);
});

describe('Engine commit port: branch race and trailer poisoning (real Git)', () => {
  it('re-checks the branch right before git commit and refuses when it changed', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    const parent = git(root, 'rev-parse', 'HEAD');
    const commits = createGitCommitPort(engine, {
      afterPreflight: () => {
        git(root, 'checkout', '-q', '-b', 'elsewhere');
        return Promise.resolve();
      },
    });
    await expect(commits.commit(request(root))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
      reason: 'branch-changed',
    });
    expect(git(root, 'rev-list', '--count', parent + '..elsewhere')).toBe('0');
    expect(git(root, 'rev-list', '--count', parent + '..feature/work')).toBe('0');
  }, 240000);

  it('refuses a protected branch switched to in the same window', async () => {
    const { root, engine } = await project('  commits:\n    protectedBranches: [release]\n');
    await writeScaffold(root);
    const parent = git(root, 'rev-parse', 'HEAD');
    const commits = createGitCommitPort(engine, {
      afterPreflight: () => {
        git(root, 'checkout', '-q', '-b', 'release');
        return Promise.resolve();
      },
    });
    await expect(
      commits.commit(request(root, { expectedBranch: 'feature/work' })),
    ).rejects.toMatchObject({ code: 'COMMIT_BLOCKED', reason: 'branch-changed' });
    expect(git(root, 'rev-list', '--count', parent + '..release')).toBe('0');
  }, 240000);

  it('reports a commit that landed on another branch as uncertain (recovery), never as done', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    const commits = createGitCommitPort(engine, {
      afterRecheck: () => {
        git(root, 'checkout', '-q', '-b', 'elsewhere');
        return Promise.resolve();
      },
    });
    await expect(commits.commit(request(root))).rejects.toMatchObject({
      code: 'GIT_OPERATION_UNCERTAIN',
      reason: 'commit-on-unexpected-branch',
    });
  }, 240000);

  it('leaves no intent-to-add residue after a commit that provably did not happen, and a retry commits', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    const parent = git(root, 'rev-parse', 'HEAD');
    const lock = join(root, '.git/refs/heads/feature/work.lock');
    const commits = createGitCommitPort(engine, {
      afterRecheck: () => writeFile(lock, ''),
    });
    await expect(commits.commit(request(root))).rejects.toMatchObject({ code: 'COMMIT_FAILED' });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect(git(root, 'ls-files', '--', ...PATHS)).toBe('');
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toContain('?? ');

    await rm(lock);
    const retried = await openVersionControl(engine).commits.commit(request(root));
    expect(git(root, 'rev-parse', 'HEAD')).toBe(retried.sha);
  }, 240000);

  it('finds an operation only through the real trailer block of an Engine-committed commit', async () => {
    const { root, engine } = await project();
    const commits = openVersionControl(engine).commits;
    const operationId = randomUUID();
    const since = git(root, 'rev-parse', 'HEAD');
    // A user commit that carries a REAL trailer block naming the operation (not the Engine).
    await writeFile(join(root, 'user.txt'), 'x\n');
    git(root, 'add', 'user.txt');
    git(
      root,
      '-c',
      'user.name=User',
      '-c',
      'user.email=user@example.invalid',
      'commit',
      '-qm',
      'user change\n\nNevo-Operation: ' + operationId,
    );
    expect(await commits.findByOperation(root, operationId, since)).toEqual({ status: 'absent' });

    // An Engine-identity commit that only QUOTES the line outside the trailer block.
    await writeFile(join(root, 'quote.txt'), 'x\n');
    git(root, 'add', 'quote.txt');
    git(
      root,
      '-c',
      'user.name=Nevo SpecFlow Engine',
      '-c',
      'user.email=engine@nevo.invalid',
      'commit',
      '-qm',
      'Nevo-Operation: ' + operationId,
      '-m',
      'free text paragraph',
      '-m',
      'Signed-off-by: Someone <s@example.invalid>',
    );
    expect(await commits.findByOperation(root, operationId, since)).toEqual({ status: 'absent' });
  }, 240000);

  it('neutralises a title that looks like a trailer', async () => {
    const { root, engine } = await project();
    await writeScaffold(root);
    const operationId = randomUUID();
    const since = git(root, 'rev-parse', 'HEAD');
    const { sha } = await openVersionControl(engine).commits.commit(
      request(root, {
        operationId,
        subject: 'Nevo-Operation: ' + randomUUID(),
        body: 'Nevo-Kind: other',
      }),
    );
    const message = git(root, 'log', '-1', '--format=%B', sha);
    expect(message).toMatch(/^> Nevo-Operation: /u);
    expect(message).toContain('> Nevo-Kind: other');
    // The commit is still found by its own (real) trailer.
    expect(
      await openVersionControl(engine).commits.findByOperation(root, operationId, since),
    ).toMatchObject({ status: 'found', sha });
  }, 240000);
});
