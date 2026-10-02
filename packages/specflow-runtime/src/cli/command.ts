// The root-level `start` command is the CLI adapter for the SpecFlow Runtime.
// The `@nevo/specflow` shell composes it; Runtime owns the command semantics.

import { Command } from 'commander';

import { startRuntime, type RuntimeHandle, type RuntimeStartOptions } from '../runtime.js';

export interface RuntimeCommandContext {
  readonly stdout: (line: string) => void;
  readonly signal?: AbortSignal;
  readonly start?: (options?: RuntimeStartOptions) => Promise<RuntimeHandle>;
}

export function createStartCommand(ctx: RuntimeCommandContext): Command {
  return new Command('start')
    .description('Start the Nevo SpecFlow Runtime server')
    .action(async () => {
      const handle = await (ctx.start ?? startRuntime)();
      ctx.stdout(`Nevo SpecFlow Runtime listening at ${handle.address}`);

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

export { createAuthCommand, type AuthCommandContext } from '../auth/cli.js';
