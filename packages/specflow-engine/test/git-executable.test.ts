import { win32 } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resolveGitExecutable } from '../src/git/executable';
import { executeGit } from '../src/git/process';

function available(...paths: string[]) {
  const known = new Set(paths.map((path) => win32.normalize(path).toLowerCase()));
  return (path: string): boolean => known.has(win32.normalize(path).toLowerCase());
}

describe('Git executable discovery (Windows process performance)', () => {
  const root = 'C:\\Program Files\\Git';
  const wrapper = win32.join(root, 'cmd', 'git.exe');
  const binWrapper = win32.join(root, 'bin', 'git.exe');
  const modern = win32.join(root, 'ucrt64', 'bin', 'git.exe');
  const legacy = win32.join(root, 'mingw64', 'bin', 'git.exe');

  it('bypasses the cmd forwarding executable using the matching UCRT64 Git', () => {
    const directory = win32.dirname(wrapper);
    const exists = available(wrapper, modern);
    expect(resolveGitExecutable('win32', directory, exists)).toBe(modern);
  });

  it('recognizes Git for Windows bin and older mingw64 installations', () => {
    const directory = win32.dirname(binWrapper);
    const exists = available(binWrapper, legacy);
    expect(resolveGitExecutable('win32', directory, exists)).toBe(legacy);
  });

  it('prefers UCRT64 when both runtimes are installed', () => {
    const directory = win32.dirname(wrapper);
    const exists = available(wrapper, modern, legacy);
    expect(resolveGitExecutable('win32', directory, exists)).toBe(modern);
  });

  it('respects PATH precedence instead of selecting an unrelated Git installation', () => {
    const custom = 'D:\\PortableGit\\git.exe';
    const path = win32.dirname(custom) + ';' + win32.dirname(wrapper);
    const exists = available(custom, wrapper, modern);
    expect(resolveGitExecutable('win32', path, exists)).toBe('git');
  });

  it('falls back for unknown layouts, missing sibling binaries, and non-Windows', () => {
    const directory = win32.dirname(wrapper);
    const exists = available(wrapper, modern);
    expect(resolveGitExecutable('win32', directory, available(wrapper))).toBe('git');
    expect(resolveGitExecutable('win32', '', exists)).toBe('git');
    expect(resolveGitExecutable('linux', directory, exists)).toBe('git');
    expect(resolveGitExecutable('darwin', directory, exists)).toBe('git');
  });

  it('honors PATH removal and restoration even after native Git was already discovered', async () => {
    const cwd = process.cwd();
    expect((await executeGit(cwd, ['--version'])).exitCode).toBe(0);
    vi.stubEnv('PATH', win32.join('X:', 'missing-git-from-path'));
    try {
      await expect(executeGit(cwd, ['--version'])).rejects.toMatchObject({
        code: 'GIT_UNAVAILABLE',
      });
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await executeGit(cwd, ['--version'])).exitCode).toBe(0);
  });
});
