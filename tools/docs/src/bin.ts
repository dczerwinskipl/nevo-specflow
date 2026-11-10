#!/usr/bin/env node
// Executable boundary — resolve this repository as the project, run the program, map a thrown
// error to an exit code the way the product shell does. No documentation logic here.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { DocsUsageError } from '@nevo/specflow-docs';
import { CommanderError } from 'commander';

import { createProgram } from './cli/program.js';

/** Nearest ancestor of `start` holding `pnpm-workspace.yaml`: this repository (or worktree) root. */
function findRepoRoot(start: string): string {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }

    if (dirname(dir) === dir) {
      throw new Error(`no pnpm-workspace.yaml above ${start}`);
    }
  }
}

async function main(argv: string[]): Promise<number> {
  const entry = fileURLToPath(import.meta.url);
  const root = findRepoRoot(dirname(entry));
  const program = createProgram({
    resolveProject: () =>
      Promise.resolve({
        root,
        projectConfigPath: join(root, '.nevo', 'config.yaml'),
        localConfigPath: join(root, '.nevo', 'local', 'config.yaml'),
      }),
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    // A search's background catch-up runs this launcher directly (no build step, no pnpm).
    backgroundIndex: {
      command: process.execPath,
      args: [...process.execArgv, entry, 'semantic', 'index'],
    },
  });

  try {
    await program.parseAsync(argv);

    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.code === 'commander.helpDisplayed' || err.code === 'commander.version' ? 0 : 2;
    }

    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);

    return err instanceof DocsUsageError ? 2 : 1;
  }
}

process.exitCode = await main(process.argv);
