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
import { createDocsCommand, type BackgroundIndexLaunch } from '@nevo/specflow-docs/cli';
import { Command } from 'commander';

import { agentRouteOf, type AgentBrokerTransport } from './agent-broker/client';
import { catchUpLaunchFor, guardAgentCommand } from './agent-broker/routing';
import type { CommitCommandContext } from './commit/command';
import { createCommitCommand } from './commit/command';
import { createDefinitionsCommand } from './definitions/command';
import { printDefinitionsMissingHint } from './definitions/startup-hint';
import type { DocumentsCommandContext } from './documents/command';
import { createProjectInitCommand, type ProjectInitCommandContext } from './init/cli';
import { createProjectInspectCommand } from './project/inspect-command';
import { resolveDocsProject } from './project/docs-project';
import { createSpecsCommand } from './specs/command';
import { createTasksCommand } from './tasks/command';
import { createWorkflowCommand } from './workflow/command';
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
  /** The OS user behind the owner actor of `tasks` and `workflow`; the installed user by default. */
  readonly osUser?: string;
  readonly documentsApi?: DocumentsCommandContext['api'];
  /** The process environment; `process.env` by default. A capability in it means an agent Turn (D11). */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** The broker connection of an agent Turn; the Runtime's endpoint from the environment by default. */
  readonly agentBroker?: AgentBrokerTransport;
  readonly commitApi?: CommitCommandContext['api'];
  readonly initUi?: RuntimeSetupUi;
  readonly initializeProject?: ProjectInitCommandContext['initialize'];
  /** How this executable runs `docs semantic index`, for the background catch-up of `docs search`. */
  readonly docsBackgroundIndex?: BackgroundIndexLaunch;
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

  // Inside an agent Turn (a capability in the environment) every command is placed before it runs:
  // a read stays local, a document write goes to the Runtime's broker, anything else is refused.
  const agentRoute = agentRouteOf(io.environment ?? process.env, io.agentBroker);
  program.hook('preAction', (_program, action) => {
    guardAgentCommand(agentRoute, action, { stdout: io.stdout, stderr: io.stderr });
  });

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
      ...(agentRoute.kind === 'broker' ? { broker: agentRoute.transport } : {}),
      ...(io.osUser ? { osUser: io.osUser } : {}),
    }),
  );
  program.addCommand(
    createTasksCommand({
      cwd: io.cwd ?? '.',
      stdout: io.stdout,
      stderr: io.stderr,
      ...(io.readStdin ? { readStdin: io.readStdin } : {}),
      ...(io.osUser ? { osUser: io.osUser } : {}),
      ...(agentRoute.kind === 'broker' ? { broker: agentRoute.transport } : {}),
    }),
  );
  program.addCommand(
    createWorkflowCommand({
      cwd: io.cwd ?? '.',
      stdout: io.stdout,
      stderr: io.stderr,
      ...(io.osUser ? { osUser: io.osUser } : {}),
      ...(agentRoute.kind === 'broker' ? { broker: agentRoute.transport } : {}),
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

  const catchUp = catchUpLaunchFor(agentRoute, io.docsBackgroundIndex);

  // An ordinary command: it never starts Runtime or loads UI assets (ADR 0020).
  program.addCommand(
    createDocsCommand({
      resolveProject: () => resolveDocsProject(io.cwd ?? '.'),
      stdout: io.stdout,
      stderr: io.stderr,
      checkWriteCommand: 'nevo-specflow docs check --write',
      // Inside an agent Turn `docs search` reads the existing index only: no catch-up marker, no
      // detached process.
      ...(catchUp ? { backgroundIndex: catchUp } : {}),
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
