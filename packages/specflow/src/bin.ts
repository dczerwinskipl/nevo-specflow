// Executable boundary for `nevo-specflow`. Construct IO, run the Commander
// program, and map a thrown error to an exit code. No product logic here.

import process from 'node:process';

import { CommanderError } from 'commander';

import { createProgram } from './program.js';

async function main(argv: string[]): Promise<number> {
  const program = createProgram({
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  });

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') return 0;
      return 2;
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv);
