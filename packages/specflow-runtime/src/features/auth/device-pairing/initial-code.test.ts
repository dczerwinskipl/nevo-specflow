import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createWindowsOwnerRestriction, type RunTool } from './initial-code';

describe('Windows owner-only ACL of the initial code file', () => {
  it('reads the user SID and grants only it, with the system tools by absolute path', async () => {
    const run = vi.fn<RunTool>((file) =>
      Promise.resolve({
        stdout: file.endsWith('whoami.exe') ? '"host\\owner","S-1-5-21-1-2-3-1001"\r\n' : '',
      }),
    );
    await createWindowsOwnerRestriction(
      run,
      'C:\\Windows',
    )('C:\\state\\auth\\initial-pairing-code');

    const system32 = join('C:\\Windows', 'System32');
    expect(run.mock.calls).toEqual([
      [join(system32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { windowsHide: true }],
      [
        join(system32, 'icacls.exe'),
        [
          'C:\\state\\auth\\initial-pairing-code',
          '/inheritance:r',
          '/grant:r',
          '*S-1-5-21-1-2-3-1001:F',
        ],
        { windowsHide: true },
      ],
    ]);
  });

  it('fails closed without a SID', async () => {
    const run = vi.fn<RunTool>(() => Promise.resolve({ stdout: 'unexpected' }));
    await expect(createWindowsOwnerRestriction(run, 'C:\\Windows')('file')).rejects.toThrow('SID');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
