import { describe, expect, it } from 'vitest';

import { spawnFailureReason } from './process';

const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

describe('why Git could not be started', () => {
  it('is permanent only when there is no Git to start', () => {
    expect(spawnFailureReason(errno('ENOENT'))).toBe('executable-unavailable');
    expect(spawnFailureReason(errno('EACCES'))).toBe('executable-unavailable');
  });

  it('is a passing condition when the system is out of descriptors, processes or memory', () => {
    for (const code of ['EMFILE', 'ENFILE', 'EAGAIN', 'ENOMEM', 'EPERM']) {
      expect(spawnFailureReason(errno(code))).toBe('spawn-failed');
    }
    expect(spawnFailureReason(new Error('no code'))).toBe('spawn-failed');
  });
});
