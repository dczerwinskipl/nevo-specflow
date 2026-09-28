import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { RUNTIME_BOOTSTRAP_MARKER } from '@nevo/specflow-runtime';

import { createProgram } from '../src/program.js';
import { NEVO_SPECFLOW_VERSION } from '../src/version.js';

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
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
    expect(text).toContain('start');
  });

  it('--version prints the injected version constant', async () => {
    const { run, out } = harness();
    await expect(run(['--version'])).rejects.toMatchObject({ code: 'commander.version' });
    expect(out.join('\n')).toContain(NEVO_SPECFLOW_VERSION);
  });

  it('start routes into the Runtime capability and prints its marker', async () => {
    const { run, out } = harness();
    await run(['start']);
    expect(out).toEqual([RUNTIME_BOOTSTRAP_MARKER]);
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
