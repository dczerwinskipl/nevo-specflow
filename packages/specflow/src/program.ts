// The `nevo-specflow` composition root. `@nevo/specflow` owns the CLI shell:
// root program, global flags, version, output/error/exit conventions, and command
// composition. Capability verticals own their own Commander adapters.

import { createStartCommand } from '@nevo/specflow-runtime/cli';
import { Command } from 'commander';

import { NEVO_SPECFLOW_VERSION } from './version.js';

export interface ProgramIO {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/**
 * Build the `nevo-specflow` program. Pure wiring — argv is parsed by the caller.
 * The bootstrap surface intentionally contains only:
 *   nevo-specflow --help
 *   nevo-specflow --version
 *   nevo-specflow start
 */
export function createProgram(io: ProgramIO): Command {
  const program = new Command('nevo-specflow')
    .description('Nevo SpecFlow — spec-driven development for AI-assisted software engineering')
    .version(NEVO_SPECFLOW_VERSION, '-v, --version', 'print the installed nevo-specflow version')
    .configureOutput({
      writeOut: (s) => io.stdout(s.replace(/\n$/, '')),
      writeErr: (s) => io.stderr(s.replace(/\n$/, '')),
    })
    .showHelpAfterError();

  program.addCommand(createStartCommand({ stdout: io.stdout }));

  program.exitOverride();
  for (const cmd of program.commands) cmd.exitOverride();

  return program;
}
