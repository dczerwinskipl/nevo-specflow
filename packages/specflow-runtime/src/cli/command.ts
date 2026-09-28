// The root-level `start` command is the CLI adapter for the SpecFlow Runtime.
// The `@nevo/specflow` shell composes it; Runtime owns the command semantics.

import { Command } from 'commander';

import { startRuntime } from '../index.js';

export interface RuntimeCommandContext {
  readonly stdout: (line: string) => void;
}

export function createStartCommand(ctx: RuntimeCommandContext): Command {
  return new Command('start')
    .description('Start Nevo SpecFlow (Runtime bootstrap only)')
    .action(() => {
      const result = startRuntime();
      ctx.stdout(result.message);
    });
}
