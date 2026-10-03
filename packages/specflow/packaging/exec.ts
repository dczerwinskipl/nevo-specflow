// Small child-process helper for package-owned product packaging.
// cross-spawn resolves Windows command shims/PATHEXT without shell:true, so
// arguments stay structured rather than being concatenated into a shell command.

import crossSpawn from 'cross-spawn';

export interface RunOpts {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
  readonly timeout?: number;
}

export class StepFailedError extends Error {
  override readonly name = 'StepFailedError';
}

/** Run a command to completion, returning trimmed stdout. Throws `StepFailedError` on failure. */
export function run(command: string, args: readonly string[], opts: RunOpts = {}): string {
  const result = crossSpawn.sync(command, [...args], {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    input: opts.input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    const detail = (result.stderr ?? '').trim() || (result.stdout ?? '').trim();
    throw new StepFailedError(
      `\`${command} ${args.join(' ')}\` failed (exit ${String(result.status ?? 'null')})\n${detail}`,
      result.error ? { cause: result.error } : undefined,
    );
  }

  return (result.stdout ?? '').trim();
}
