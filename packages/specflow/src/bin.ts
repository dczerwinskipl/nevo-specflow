// Executable boundary for `nevo-specflow`. Construct IO and process lifecycle,
// run the Commander program, and map a thrown error to an exit code.

import process from 'node:process';

import { CommanderError } from 'commander';

import { createProgram } from './program.js';

async function main(argv: string[]): Promise<number> {
  const shutdown = new AbortController();
  const abort = () => shutdown.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  const program = createProgram({
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    signal: shutdown.signal,
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
  } finally {
    process.off('SIGINT', abort);
    process.off('SIGTERM', abort);
  }
}

process.exitCode = await main(process.argv);
