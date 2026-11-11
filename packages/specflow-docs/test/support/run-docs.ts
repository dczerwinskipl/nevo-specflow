// Runs `createDocsCommand` in-process the way a host does, and reports what a process would show:
// stdout lines, stderr lines (including the message the host prints for an operation failure) and
// the exit code (Commander usage errors 2, help 0, other failures 1).

import { join } from 'node:path';

import { CommanderError } from 'commander';

import { createDocsCommand, type DocsCommandContext } from '../../src/cli';

export interface DocsRun {
  readonly exitCode: number;
  readonly stdout: string[];
  readonly stderr: string[];
}

export function projectAt(root: string): DocsCommandContext['resolveProject'] {
  return () =>
    Promise.resolve({
      root,
      projectConfigPath: join(root, '.nevo', 'config.yaml'),
      localConfigPath: join(root, '.nevo', 'local', 'config.yaml'),
    });
}

export async function runDocs(
  root: string,
  args: readonly string[],
  checkWriteCommand = 'nevo-specflow docs check --write',
  extra: Partial<
    Pick<
      DocsCommandContext,
      | 'env'
      | 'createEmbeddingProvider'
      | 'getCommand'
      | 'semanticIndexCommand'
      | 'semanticStatusCommand'
      | 'backgroundIndex'
      | 'spawnDetached'
      | 'now'
    >
  > = {},
): Promise<DocsRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const command = createDocsCommand({
    resolveProject: projectAt(root),
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    checkWriteCommand,
    ...extra,
  });
  const overrideExit = (c: typeof command): void => {
    c.exitOverride();
    c.commands.forEach(overrideExit);
  };

  overrideExit(command);

  try {
    await command.parseAsync(['node', 'docs', ...args]);

    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    if (err instanceof CommanderError) {
      return { exitCode: err.code === 'commander.helpDisplayed' ? 0 : 2, stdout, stderr };
    }

    stderr.push(err instanceof Error ? err.message : String(err));

    return { exitCode: 1, stdout, stderr };
  }
}
