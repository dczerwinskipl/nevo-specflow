import { win32 } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../src/git/executable';

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
    expect(resolveGitExecutable('win32', win32.dirname(wrapper), available(wrapper, modern))).toBe(
      modern,
    );
  });

  it('recognizes Git for Windows bin and older mingw64 installations', () => {
    expect(
      resolveGitExecutable('win32', win32.dirname(binWrapper), available(binWrapper, legacy)),
    ).toBe(legacy);
  });

  it('prefers UCRT64 when both runtimes are installed', () => {
    expect(
      resolveGitExecutable(
        'win32',
        win32.dirname(wrapper),
        available(wrapper, modern, legacy),
      ),
    ).toBe(modern);
  });

  it('respects PATH precedence instead of selecting an unrelated Git installation', () => {
    const custom = 'D:\\PortableGit\\git.exe';
    expect(
      resolveGitExecutable(
        'win32',
        win32.dirname(custom) + ';' + win32.dirname(wrapper),
        available(custom, wrapper, modern),
      ),
    ).toBe('git');
  });

  it('falls back for unknown layouts, missing sibling binaries, and non-Windows', () => {
    const gitPath = win32.dirname(wrapper);
    expect(resolveGitExecutable('win32', gitPath, available(wrapper))).toBe('git');
    expect(resolveGitExecutable('win32', '', available(wrapper, modern))).toBe('git');
    expect(resolveGitExecutable('linux', gitPath, available(wrapper, modern))).toBe('git');
    expect(resolveGitExecutable('darwin', gitPath, available(wrapper, modern))).toBe('git');
  });
});
