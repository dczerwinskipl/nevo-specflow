// The root-level `start` command is the CLI adapter for the SpecFlow Runtime.
// The `@nevo/specflow` shell composes it; Runtime owns the command semantics.

import { Command } from 'commander';

import type { RuntimeHandle } from '../runtime';

export interface RuntimeCommandContext {
  readonly stdout: (line: string) => void;
  readonly signal?: AbortSignal;
  readonly start: () => Promise<RuntimeHandle>;
}

export function createStartCommand(ctx: RuntimeCommandContext): Command {
  return new Command('start')
    .description('Start the Nevo SpecFlow local server')
    .action(async () => {
      const handle = await ctx.start();
      ctx.stdout(`Nevo SpecFlow available at ${handle.address}`);

      if (!ctx.signal) return;
      if (!ctx.signal.aborted) await aborted(ctx.signal);
      await handle.close();
    });
}

function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) =>
    signal.addEventListener('abort', () => resolve(), { once: true }),
  );
}

export { createAuthCommand, type AuthCommandContext } from '../auth/cli';
