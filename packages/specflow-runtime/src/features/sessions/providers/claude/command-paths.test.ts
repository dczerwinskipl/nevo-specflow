import { describe, expect, it } from 'vitest';

import { commandPathsInsideWorkspace } from './command-paths';

/** A file system where `links` maps a real-path prefix to its target and `missing` does not exist. */
function files(links: Record<string, string> = {}, missing: string[] = []) {
  return {
    realpath(path: string) {
      if (missing.some((entry) => path.toLowerCase().startsWith(entry.toLowerCase()))) {
        return Promise.reject(new Error('ENOENT'));
      }

      for (const [from, to] of Object.entries(links)) {
        if (path.toLowerCase().startsWith(from.toLowerCase())) {
          return Promise.resolve(to + path.slice(from.length));
        }
      }

      return Promise.resolve(path);
    },
  };
}

describe('commandPathsInsideWorkspace', () => {
  const posixRoot = '/work/repo';
  const windowsRoot = 'C:\\work\\repo';

  it.each([
    { cd: 'specs/a', redirections: [] },
    { cd: '/work/repo/specs', redirections: ['out.json'] },
    { redirections: ['.nevo/local/scratch/out.json'] },
    { cd: 'specs', redirections: ['../out.json'] },
    { cd: '.', redirections: [] },
  ])('keeps %j inside the POSIX worktree', async (paths) => {
    expect(await commandPathsInsideWorkspace(paths, posixRoot, 'linux', files())).toBe(true);
  });

  it.each([
    { cd: '..', redirections: [] },
    { cd: '/work/other', redirections: [] },
    { cd: '/work/repo-other', redirections: [] },
    { redirections: ['/tmp/out.json'] },
    { cd: 'specs', redirections: ['../../out.json'] },
  ])('refuses %j outside the POSIX worktree', async (paths) => {
    expect(await commandPathsInsideWorkspace(paths, posixRoot, 'linux', files())).toBe(false);
  });

  it('refuses a link inside the worktree that points out of it, also for a file not yet written', async () => {
    const linked = files({ '/work/repo/out': '/elsewhere' }, ['/elsewhere/new.json']);
    expect(
      await commandPathsInsideWorkspace(
        { cd: 'out', redirections: [] },
        posixRoot,
        'linux',
        linked,
      ),
    ).toBe(false);
    expect(
      await commandPathsInsideWorkspace(
        { redirections: ['out/new.json'] },
        posixRoot,
        'linux',
        linked,
      ),
    ).toBe(false);
  });

  it('reads Git Bash drive paths on Windows, case-insensitively, and refuses other root paths', async () => {
    const judge = (paths: { cd?: string; redirections: string[] }) =>
      commandPathsInsideWorkspace(paths, windowsRoot, 'win32', files());
    expect(await judge({ cd: '/c/work/repo/specs', redirections: [] })).toBe(true);
    expect(await judge({ cd: 'c:/WORK/Repo', redirections: ['out.json'] })).toBe(true);
    expect(await judge({ cd: 'C:\\work\\repo\\specs', redirections: [] })).toBe(true);
    expect(await judge({ cd: '/d/work/repo', redirections: [] })).toBe(false);
    expect(await judge({ redirections: ['/tmp/out.json'] })).toBe(false);
    expect(await judge({ redirections: ['\\out.json'] })).toBe(false);
  });

  it('fails closed when the worktree itself cannot be resolved', async () => {
    expect(
      await commandPathsInsideWorkspace(
        { cd: 'specs', redirections: [] },
        posixRoot,
        'linux',
        files({}, ['/work']),
      ),
    ).toBe(false);
  });
});
