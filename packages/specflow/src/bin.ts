// Executable boundary for `nevo-specflow`. Construct IO and process lifecycle,
// run the Commander program, and map a thrown error to an exit code.

import process from 'node:process';

import { CommanderError } from 'commander';

import { TerminalProjectInitPrompter } from './init/terminal-prompter.js';
import { createProgram } from './program.js';

async function main(argv: string[]): Promise<number> {
  const shutdown = new AbortController();
  const abort = () => shutdown.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  const initPrompter = new TerminalProjectInitPrompter(process.stdin, process.stdout);
  const program = createProgram({
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    readPasswordFromStdin: readStdin,
    signal: shutdown.signal,
    cwd: process.cwd(),
    initPrompter,
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
    initPrompter.close();
    process.off('SIGINT', abort);
    process.off('SIGTERM', abort);
  }
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
  }
  return input;
}

process.exitCode = await main(process.argv);
