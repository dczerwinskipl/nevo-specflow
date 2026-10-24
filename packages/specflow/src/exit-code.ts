import { CommanderError } from 'commander';

/**
 * Process exit code of a Commander usage outcome: help and version are successes (0); every other
 * Commander error, including the usage errors of nested commands and a bare command group, is a usage
 * error (2). Operation failures are not Commander errors and exit 1 (see the executable boundary).
 */
export function commanderExitCode(error: CommanderError): number {
  if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return 0;
  return 2;
}
