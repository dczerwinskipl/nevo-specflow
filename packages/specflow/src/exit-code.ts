import { CommanderError } from 'commander';

/**
 * Process exit code of a Commander usage outcome: help and version are successes (0); every other
 * Commander error, including the usage errors of nested commands and a bare command group, is a usage
 * error (2). Operation failures are not Commander errors and exit 1 (see the executable boundary).
 */
export function commanderExitCode(error: CommanderError): number {
  if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
    return 0;
  }

  return 2;
}

/**
 * A failure the command has already reported (a refusal printed with its code and hint). The
 * executable boundary exits with `exitCode` and prints nothing more.
 */
export class ReportedFailure extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'ReportedFailure';
    this.exitCode = exitCode;
  }
}
