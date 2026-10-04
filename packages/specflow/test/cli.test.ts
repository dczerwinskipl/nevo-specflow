import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { createProgram } from '../src/program';
import { NEVO_SPECFLOW_VERSION } from '../src/version';

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    readPasswordFromStdin: () => Promise.resolve('correct horse battery staple\n'),
    startRuntime: () =>
      Promise.resolve({
        address: 'http://127.0.0.1:4318',
        close: () => Promise.resolve(),
      }),
  });
  const run = (args: string[]) => program.parseAsync(['node', 'nevo-specflow', ...args]);
  return { run, out, err };
}

describe('createProgram — nevo-specflow router', () => {
  it('--help lists the CLI name and start command', async () => {
    const { run, out } = harness();
    await expect(run(['--help'])).rejects.toMatchObject({ code: 'commander.helpDisplayed' });
    const text = out.join('\n');
    expect(text).toContain('nevo-specflow');
    expect(text).toContain('init');
    expect(text).toContain('start');
    expect(text).toContain('auth');
  });

  it('init exposes the project bootstrap command', async () => {
    const { run } = harness();
    await expect(run(['init', '--help'])).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
    });
  });

  it('--version prints the injected version constant', async () => {
    const { run, out } = harness();
    await expect(run(['--version'])).rejects.toMatchObject({ code: 'commander.version' });
    expect(out.join('\n')).toContain(NEVO_SPECFLOW_VERSION);
  });

  it('auth hash-password is composed from the Runtime auth feature', async () => {
    const { run, out } = harness();
    await run(['auth', 'hash-password', '--password-stdin']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^\$scrypt\$16384\$8\$5\$/u);
  });

  it('start routes into the Runtime capability and reports the product address', async () => {
    const { run, out } = harness();
    await run(['start']);
    expect(out).toEqual(['Nevo SpecFlow available at http://127.0.0.1:4318']);
  });

  it('an unknown command is a usage error', async () => {
    const { run } = harness();
    await expect(run(['not-a-command'])).rejects.toBeInstanceOf(CommanderError);
  });

  it('no command shows help rather than doing nothing', async () => {
    const { run } = harness();
    await expect(run([])).rejects.toBeInstanceOf(CommanderError);
  });
});
