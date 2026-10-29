import { describe, expect, it } from 'vitest';

import {
  hardLinksAvailable,
  isLinux,
  isPosix,
  isWindows,
  onLinux,
  onPosix,
  onWindows,
  probeInScratchDirectory,
  probeRealGit,
  realGitAvailable,
  symlinksAvailable,
} from './platform';

describe('platform gating helper', () => {
  it.each([
    ['linux', true, true, false],
    ['darwin', false, true, false],
    ['win32', false, false, true],
    ['freebsd', false, true, false],
  ] as const)('classifies %s', (platform, linux, posix, windows) => {
    expect(isLinux(platform)).toBe(linux);
    expect(isPosix(platform)).toBe(posix);
    expect(isWindows(platform)).toBe(windows);
  });

  it('exports constants that agree with the running platform', () => {
    expect(onLinux).toBe(process.platform === 'linux');
    expect(onPosix).toBe(process.platform !== 'win32');
    expect(onWindows).toBe(!onPosix);
    expect(onLinux && !onPosix).toBe(false);
  });

  it('reports a capability only when the attempt succeeded, and cleans its scratch directory', () => {
    let seen = '';
    expect(
      probeInScratchDirectory((directory) => {
        seen = directory;
      }),
    ).toBe(true);
    expect(
      probeInScratchDirectory(() => {
        throw new Error('EPERM');
      }),
    ).toBe(false);
    expect(seen).not.toBe('');
  });

  it('reports real Git as missing when the executable cannot start or fails', () => {
    expect(probeRealGit(() => ({ status: 0 }))).toBe(true);
    expect(probeRealGit(() => ({ status: 1 }))).toBe(false);
    expect(probeRealGit(() => ({ status: null }))).toBe(false);
    expect(
      probeRealGit(() => {
        throw new Error('ENOENT');
      }),
    ).toBe(false);
  });

  it('exposes boolean capability flags', () => {
    for (const flag of [hardLinksAvailable, symlinksAvailable, realGitAvailable]) {
      expect(typeof flag).toBe('boolean');
    }
  });
});
