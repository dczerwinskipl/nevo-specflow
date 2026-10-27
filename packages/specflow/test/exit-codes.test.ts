import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { commanderExitCode } from '../src/exit-code';
import { createProgram } from '../src/program';

async function exitCodeOf(args: string[]): Promise<number> {
  const program = createProgram({
    stdout: () => undefined,
    stderr: () => undefined,
    startRuntime: () =>
      Promise.resolve({ address: 'http://127.0.0.1:1', close: () => Promise.resolve() }),
  });
  try {
    await program.parseAsync(['node', 'nevo-specflow', ...args]);
  } catch (error) {
    if (error instanceof CommanderError) return commanderExitCode(error);
    throw error;
  }
  throw new Error('Expected a Commander outcome for: ' + args.join(' '));
}

describe('usage exit codes', () => {
  it.each([
    [['not-a-command'], 2],
    [[], 2],
    [['specs'], 2],
    [['specs', 'nope'], 2],
    [['specs', 'create'], 2],
    [['specs', 'create', '--title', 'x'], 2],
    [['specs', 'worktree'], 2],
    [['specs', 'worktree', 'close'], 2],
    [['specs', 'workspace', 'close'], 2],
    [['specs', 'documents'], 2],
    [['specs', 'documents', 'add'], 2],
    [['specs', 'documents', 'recover', '--bogus'], 2],
    [['auth', 'nope'], 2],
  ] as const)('%j exits %i', async (args, code) => {
    expect(await exitCodeOf([...args])).toBe(code);
  });

  it.each([
    [['--help']],
    [['--version']],
    [['specs', '--help']],
    [['specs', 'create', '--help']],
    [['specs', 'worktree', 'close', '--help']],
    [['specs', 'workspace', '--help']],
    [['specs', 'documents', '--help']],
    [['specs', 'documents', 'recover', '--help']],
  ] as const)('%j exits 0', async (args) => {
    expect(await exitCodeOf([...args])).toBe(0);
  });
});
