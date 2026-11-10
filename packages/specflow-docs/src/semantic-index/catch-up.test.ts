import { describe, expect, it } from 'vitest';

import { backgroundExecArgv } from './catch-up';

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
