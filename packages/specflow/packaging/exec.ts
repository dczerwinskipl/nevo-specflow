// Small child-process helpers for package-owned product packaging.
// Commands are executed directly; Windows .cmd launchers are resolved explicitly
// rather than enabling a shell for arguments.

import { execFileSync } from 'node:child_process';

export interface RunOpts {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export class StepFailedError extends Error {
  override readonly name = 'StepFailedError';
}

/** Run a command to completion, returning trimmed stdout. Throws `StepFailedError` on failure. */
export function run(command: string, args: readonly string[], opts: RunOpts = {}): string {
  const executable = windowsLauncher(command);
  try {
    return execFileSync(executable, [...args], {
      cwd: opts.cwd,
      env: opts.env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    }).trim();
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number | null };
    throw new StepFailedError(
      `\`${command} ${args.join(' ')}\` failed (exit ${String(e.status ?? 'null')})\n` +
        `${(e.stderr ?? '').trim() || (e.stdout ?? '').trim()}`,
      { cause: err },
    );
  }
}

function windowsLauncher(command: string): string {
  if (process.platform !== 'win32') return command;
  return command === 'pnpm' || command === 'nevo-specflow' ? `${command}.cmd` : command;
}
