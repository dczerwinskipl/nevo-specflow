// The root-level `start` command is the CLI adapter for the SpecFlow Runtime.
// The `@nevo/specflow` shell composes it; Runtime owns the command semantics.

import { Command } from 'commander';

import type { RuntimeHandle } from '../runtime';

export interface RuntimeStartCommandOptions {
  readonly demo: boolean;
  /** `--pair`: issue a new initial pairing code although devices are paired. */
  readonly pair: boolean;
  /**
   * The interactive console the initial pairing code is printed on (stdin and stdout are TTYs);
   * absent on a headless Runtime, which writes it to an owner-only file instead.
   */
  readonly console?: (line: string) => void;
}

export interface RuntimeCommandContext {
  readonly stdout: (line: string) => void;
  readonly signal?: AbortSignal;
  /** Whether stdin and stdout are both TTYs (default: the process's). */
  readonly interactiveConsole?: boolean;
  readonly start: (options: RuntimeStartCommandOptions) => Promise<RuntimeHandle>;
}

export function createStartCommand(ctx: RuntimeCommandContext): Command {
  return new Command('start')
    .description('Start the Nevo SpecFlow local server')
    .option('--demo', 'Use explicit demonstration data instead of project sources')
    .option('--pair', 'Issue a new initial pairing code to pair a device (D21)')
    .action(async (options: { demo?: boolean; pair?: boolean }) => {
      const interactive =
        ctx.interactiveConsole ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
      const handle = await ctx.start({
        demo: options.demo === true,
        pair: options.pair === true,
        ...(interactive ? { console: ctx.stdout } : {}),
      });
      ctx.stdout(`Nevo SpecFlow available at ${handle.address}`);

      if (!ctx.signal) {
        return;
      }

      if (!ctx.signal.aborted) {
        await aborted(ctx.signal);
      }

      await handle.close();
    });
}

function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) =>
    signal.addEventListener('abort', () => resolve(), { once: true }),
  );
}

export { createAuthCommand, type AuthCommandContext } from '../features/auth';
