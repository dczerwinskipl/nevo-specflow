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

interface Paths {
  cd?: string;
  outputs?: string[];
  inputs?: string[];
}
const of = (paths: Paths) => ({ outputs: [], inputs: [], ...paths });

describe('commandPathsInsideWorkspace', () => {
  const posixRoot = '/work/repo';
  const windowsRoot = 'C:\\work\\repo';
  const posix = (paths: Paths, fs = files()) =>
    commandPathsInsideWorkspace(of(paths), posixRoot, 'linux', fs);
  const windows = (paths: Paths) =>
    commandPathsInsideWorkspace(of(paths), windowsRoot, 'win32', files());

  it.each<Paths>([
    {},
    { cd: '/work/repo' },
    { cd: '/work/repo/specs', inputs: ['../.nevo/local/scratch/d.md'] },
    { cd: '/work/repo', outputs: ['.nevo/local/scratch/out.json'] },
    { outputs: ['/work/repo/.nevo/local/scratch/sub/out.json'] },
    { inputs: ['/work/repo/specs/a.md'] },
  ])('approves %j', async (paths) => {
    expect(await posix(paths)).toBe(true);
  });

  it.each<Paths>([
    // The cd folder outside the worktree, or relative (the judge refuses those; the host does too).
    { cd: '/work' },
    { cd: '/work/repo-other' },
    { cd: 'specs' },
    // Output only into the scratch folder: never .git, its hooks, other .nevo files or elsewhere.
    { cd: '/work/repo', outputs: ['.git'] },
    { cd: '/work/repo', outputs: ['.git/hooks/pre-commit'] },
    { cd: '/work/repo', outputs: ['.nevo/config.yaml'] },
    { cd: '/work/repo', outputs: ['.nevo/local/scratch'] },
    { cd: '/work/repo', outputs: ['out.json'] },
    { outputs: ['/home/me/.bashrc'] },
    // File options and input redirections inside the worktree only.
    { inputs: ['/home/me/.ssh/id_rsa'] },
    { cd: '/work/repo/specs', inputs: ['../../other/x.md'] },
    // The shell's folder is unknown without a leading absolute cd: relative paths are refused.
    { outputs: ['.nevo/local/scratch/out.json'] },
    { inputs: ['.nevo/local/scratch/d.md'] },
  ])('refuses %j', async (paths) => {
    expect(await posix(paths)).toBe(false);
  });

  it('refuses a link inside the worktree that points out of it, also for a file not yet written', async () => {
    const linked = files(
      { '/work/repo/.nevo/local/scratch': '/elsewhere', '/work/repo/out': '/elsewhere' },
      ['/elsewhere/new.json'],
    );
    expect(await posix({ cd: '/work/repo/out' }, linked)).toBe(false);
    expect(await posix({ outputs: ['/work/repo/.nevo/local/scratch/new.json'] }, linked)).toBe(
      false,
    );
    expect(await posix({ inputs: ['/work/repo/out/new.json'] }, linked)).toBe(false);
  });

  it('reads Windows, Git Bash and mixed drive forms, case-insensitively, and refuses other roots', async () => {
    expect(await windows({ cd: '/c/work/repo/specs' })).toBe(true);
    expect(await windows({ cd: 'c:/WORK/Repo', outputs: ['.nevo/local/scratch/out.json'] })).toBe(
      true,
    );
    expect(await windows({ inputs: ['C:\\work\\repo\\.nevo\\local\\scratch\\t.yaml'] })).toBe(true);
    expect(await windows({ cd: '/d/work/repo' })).toBe(false);
    expect(await windows({ inputs: ['C:/Users/me/.ssh/id_rsa'] })).toBe(false);
    expect(await windows({ inputs: ['/c/Users/me/.ssh/id_rsa'] })).toBe(false);
    expect(await windows({ inputs: ['C:\\Users\\me\\.ssh\\id_rsa'] })).toBe(false);
    expect(await windows({ outputs: ['/tmp/out.json'] })).toBe(false);
    expect(await windows({ outputs: ['C:\\work\\repo\\.git\\hooks\\x'] })).toBe(false);
  });

  it('fails closed when the worktree itself cannot be resolved', async () => {
    expect(await posix({ cd: '/work/repo' }, files({}, ['/work']))).toBe(false);
  });
});
