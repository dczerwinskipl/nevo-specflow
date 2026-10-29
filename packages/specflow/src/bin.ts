// Executable boundary for `nevo-specflow`. Construct IO and process lifecycle,
// run the Commander program, and map a thrown error to an exit code.

import process from 'node:process';

import { CommanderError } from 'commander';

import { ClackProjectSetupUi, ProjectSetupCancelledError } from './init/clack-setup-ui';
import { ReportedFailure, commanderExitCode } from './exit-code';
import { readBoundedUtf8 } from './documents/content-input';
import { createProgram } from './program';

async function main(argv: string[]): Promise<number> {
  const shutdown = new AbortController();
  const abort = () => shutdown.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  const program = createProgram({
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    readPasswordFromStdin: readStdin,
    readStdin,
    signal: shutdown.signal,
    cwd: process.cwd(),
    initUi: new ClackProjectSetupUi(),
  });

  try {
    await program.parseAsync(argv);

    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return commanderExitCode(err);
    }

    if (err instanceof ProjectSetupCancelledError) {
      return 0;
    }

    if (err instanceof ReportedFailure) {
      return err.exitCode;
    }

    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);

    return 1;
  } finally {
    process.off('SIGINT', abort);
    process.off('SIGTERM', abort);
  }
}

function readStdin(): Promise<string> {
  return readBoundedUtf8(process.stdin, 'Standard input');
}

process.exitCode = await main(process.argv);
