// The `nevo-specflow` composition root. `@nevo/specflow` owns the CLI shell:
// root program, global flags, version, output/error/exit conventions, and command
// composition. Capability verticals own their own Commander adapters.

import {
  createAuthCommand,
  createStartCommand,
  type AuthCommandContext,
  type RuntimeCommandContext,
} from '@nevo/specflow-runtime/cli';
import type { RuntimeSetupUi } from '@nevo/specflow-runtime';
import { Command } from 'commander';

import type { CommitCommandContext } from './commit/command';
import { createCommitCommand } from './commit/command';
import { createDefinitionsCommand } from './definitions/command';
import { printDefinitionsMissingHint } from './definitions/startup-hint';
import type { DocumentsCommandContext } from './documents/command';
import { createProjectInitCommand, type ProjectInitCommandContext } from './init/cli';
import { createProjectInspectCommand } from './project/inspect-command';
import { createSpecsCommand } from './specs/command';
import { startProjectRuntime } from './runtime/start-project-runtime';
import { NEVO_SPECFLOW_VERSION } from './version';

export interface ProgramIO {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly signal?: AbortSignal;
  readonly startRuntime?: RuntimeCommandContext['start'];
  readonly readPasswordFromStdin?: AuthCommandContext['readPasswordFromStdin'];
  /** Reads all of standard input (a document body given with --stdin). */
  readonly readStdin?: () => Promise<string>;
  readonly cwd?: string;
  readonly documentsApi?: DocumentsCommandContext['api'];
  readonly commitApi?: CommitCommandContext['api'];
  readonly initUi?: RuntimeSetupUi;
  readonly initializeProject?: ProjectInitCommandContext['initialize'];
}

export function createProgram(io: ProgramIO): Command {
  const program = new Command('nevo-specflow')
    .description('Nevo SpecFlow — spec-driven development for AI-assisted software engineering')
    .version(NEVO_SPECFLOW_VERSION, '-v, --version', 'print the installed nevo-specflow version')
    .configureOutput({
      writeOut: (s) => io.stdout(s.replace(/\n$/, '')),
      writeErr: (s) => io.stderr(s.replace(/\n$/, '')),
    })
    .showHelpAfterError()
    // `commit` and `commit status` take the same options: each belongs to the command it is written after.
    .enablePositionalOptions();

  program.addCommand(
    createProjectInitCommand({
      cwd: io.cwd ?? '.',
      stdout: io.stdout,
      ...(io.initUi ? { ui: io.initUi } : {}),
      ...(io.initializeProject ? { initialize: io.initializeProject } : {}),
    }),
  );

  program.addCommand(createProjectInspectCommand({ cwd: io.cwd ?? '.', stdout: io.stdout }));
  program.addCommand(
    createSpecsCommand({
      cwd: io.cwd ?? '.',
      stdout: io.stdout,
      stderr: io.stderr,
      ...(io.readStdin ? { readStdin: io.readStdin } : {}),
      ...(io.documentsApi ? { api: io.documentsApi } : {}),
    }),
  );
  program.addCommand(createDefinitionsCommand({ cwd: io.cwd ?? '.', stdout: io.stdout }));
  program.addCommand(
    createCommitCommand({
      cwd: io.cwd ?? '.',
      stdout: io.stdout,
      stderr: io.stderr,
      ...(io.commitApi ? { api: io.commitApi } : {}),
    }),
  );

  program.addCommand(
    createAuthCommand({
      stdout: io.stdout,
      ...(io.readPasswordFromStdin ? { readPasswordFromStdin: io.readPasswordFromStdin } : {}),
    }),
  );

  program.addCommand(
    createStartCommand({
      stdout: io.stdout,
      start:
        io.startRuntime ??
        (async (options) => {
          const handle = await startProjectRuntime(io.cwd ?? '.', {}, options);
          if (!options.demo) {
            await printDefinitionsMissingHint(io.cwd ?? '.', io.stdout);
          }

          return handle;
        }),
      ...(io.signal ? { signal: io.signal } : {}),
    }),
  );

  // Usage errors of nested commands (for example a missing required option of `specs create`) are
  // thrown like the top-level ones instead of ending the process.
  const overrideExit = (command: Command): void => {
    command.exitOverride();
    for (const child of command.commands) {
      overrideExit(child);
    }
  };

  overrideExit(program);

  return program;
}
