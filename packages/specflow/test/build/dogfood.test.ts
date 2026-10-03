import { describe, expect, it } from 'vitest';

import { dogfoodInstall } from '../../build/dogfood.ts';
import type { run } from '../../build/exec.ts';
import type { packProduct } from '../../build/pack.ts';

describe('dogfoodInstall', () => {
  it('smokes long-running Runtime through start --help instead of starting the server', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];

    const fakePack: typeof packProduct = () =>
      Promise.resolve({
        name: '@nevo/specflow',
        version: '1.2.3',
        tarball: '/tmp/nevo-specflow-1.2.3.tgz',
      });

    const fakeRun: typeof run = (command, args) => {
      calls.push({ command, args });
      if (command === 'pnpm' && args[0] === 'bin') return '/global/bin';
      if (command === 'nevo-specflow' && args[0] === '--version') return '1.2.3';
      if (command === 'nevo-specflow' && args[0] === '--help') {
        return 'Usage: nevo-specflow [options] [command]\nCommands: start auth';
      }
      if (command === 'nevo-specflow' && args[0] === 'start' && args[1] === '--help') {
        return 'Start the Nevo SpecFlow Runtime server';
      }
      return '';
    };

    const result = await dogfoodInstall({
      pack: fakePack,
      runCommand: fakeRun,
    });

    expect(result.checks).toEqual([
      'nevo-specflow --version -> 1.2.3',
      'nevo-specflow --help -> ok',
      'nevo-specflow start --help -> ok',
    ]);
    expect(calls).toContainEqual({
      command: 'nevo-specflow',
      args: ['start', '--help'],
    });
    expect(calls).not.toContainEqual({
      command: 'nevo-specflow',
      args: ['start'],
    });
  });
});
