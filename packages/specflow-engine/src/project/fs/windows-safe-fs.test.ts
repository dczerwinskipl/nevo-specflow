import { describe, expect, it } from 'vitest';

import {
  readFileWindowsSafe,
  removeFileWindowsSafe,
  renameWindowsSafe,
  retryTransientFs,
  unlinkWindowsSafe,
} from './windows-safe-fs';

const failing = (code: string, times: number) => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    run: () => {
      calls += 1;
      return calls <= times
        ? Promise.reject(Object.assign(new Error(code), { code }))
        : Promise.resolve();
    },
  };
};
const noSleep = () => Promise.resolve();

describe('windows-safe fs', () => {
  it.each(['EPERM', 'EBUSY', 'EACCES'])('retries %s on win32 until it clears', async (code) => {
    const op = failing(code, 3);
    await renameWindowsSafe('a', 'b', {
      fs: { rename: op.run },
      platform: 'win32',
      sleep: noSleep,
    });
    expect(op.calls).toBe(4);
  });

  it('gives up after the bounded attempts and rethrows the last error', async () => {
    const op = failing('EPERM', 100);
    await expect(
      renameWindowsSafe('a', 'b', {
        fs: { rename: op.run },
        platform: 'win32',
        attempts: 5,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ code: 'EPERM' });
    expect(op.calls).toBe(5);
  });

  it('executes exactly once on POSIX', async () => {
    const op = failing('EPERM', 1);
    await expect(
      renameWindowsSafe('a', 'b', { fs: { rename: op.run }, platform: 'linux', sleep: noSleep }),
    ).rejects.toMatchObject({ code: 'EPERM' });
    expect(op.calls).toBe(1);
  });

  it('does not retry unrelated errors', async () => {
    const op = failing('ENOENT', 1);
    await expect(
      removeFileWindowsSafe('a', { fs: { rm: op.run }, platform: 'win32', sleep: noSleep }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(op.calls).toBe(1);
  });

  it('retries EEXIST/ENOTEMPTY only for directory renames', async () => {
    const dir = failing('ENOTEMPTY', 2);
    await renameWindowsSafe('a', 'b', {
      fs: { rename: dir.run },
      directory: true,
      platform: 'win32',
      sleep: noSleep,
    });
    expect(dir.calls).toBe(3);
    const file = failing('ENOTEMPTY', 1);
    await expect(
      renameWindowsSafe('a', 'b', { fs: { rename: file.run }, platform: 'win32', sleep: noSleep }),
    ).rejects.toMatchObject({ code: 'ENOTEMPTY' });
  });

  it('backs off exponentially with a cap', async () => {
    const delays: number[] = [];
    const op = failing('EBUSY', 6);
    await retryTransientFs(op.run, {
      platform: 'win32',
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(delays).toEqual([10, 20, 40, 80, 100, 100]);
  });

  it('retries unlink and reads', async () => {
    const unlink = failing('EPERM', 2);
    await unlinkWindowsSafe('a', { fs: { unlink: unlink.run }, platform: 'win32', sleep: noSleep });
    expect(unlink.calls).toBe(3);
    let reads = 0;
    const text = await readFileWindowsSafe('a', {
      platform: 'win32',
      sleep: noSleep,
      fs: {
        readFile: () => {
          reads += 1;
          return reads < 3
            ? Promise.reject(Object.assign(new Error('x'), { code: 'EBUSY' }))
            : Promise.resolve('ok');
        },
      },
    });
    expect(text).toBe('ok');
  });
});
