import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { backgroundExecArgv, spawnDetachedProcess } from './detached-process';

const directory = mkdtempSync(join(tmpdir(), 'specflow-docs-detached-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('spawnDetachedProcess', () => {
  it('resolves once the process has started', async () => {
    const logFile = join(directory, 'started.log');
    await spawnDetachedProcess({
      command: process.execPath,
      args: ['-e', ''],
      cwd: directory,
      logFile,
    });
    expect(readFileSync(logFile, 'utf8')).toBe('');
  });

  it('rejects on the asynchronous start error and logs it', async () => {
    const logFile = join(directory, 'missing.log');
    const command = join(directory, 'no-such-executable');
    await expect(
      spawnDetachedProcess({ command, args: [], cwd: directory, logFile }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(readFileSync(logFile, 'utf8')).toMatch(
      /^\d{4}-\d\d-\d\dT.* could not start .*no-such-executable: .*ENOENT.*\n$/,
    );
  });
});

describe('backgroundExecArgv', () => {
  it('keeps loader flags and drops debugger and profiler flags with their values', () => {
    expect(
      backgroundExecArgv([
        '--import=tsx',
        '--inspect',
        '--inspect-brk=9230',
        '--inspect-port',
        '9229',
        '--cpu-prof',
        '--cpu-prof-dir',
        'profiles',
        '--heap-prof-name=heap.prof',
        '--prof',
        '--loader',
        './loader.mjs',
        '--enable-source-maps',
      ]),
    ).toEqual(['--import=tsx', '--loader', './loader.mjs', '--enable-source-maps']);
  });
});
