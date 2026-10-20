import { spawn } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';

import { GitOutputDecoder } from './output-decoder';

const gitProcessChannel = channel('nevo.specflow.engine.git-process');

/** Sanitizes Git discovery/config overrides for every Engine process. */
export function spawnLocalGit(cwd: string, args: readonly string[]) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase().startsWith('GIT_')) delete env[name];
  }
  // Temporary A/B benchmark only; do not ship this environment override.
  const binary = process.env.NEVO_BENCH_NATIVE_GIT ?? 'git';
  const child = spawn(binary, [...args], {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (gitProcessChannel.hasSubscribers) {
    try {
      gitProcessChannel.publish({ cwd, args: [...args], pid: child.pid });
    } catch {
      // Profiling subscribers must never change Git process execution.
    }
  }
  return child;
}

/** Shared bounded, incremental UTF-8 output handling; cancellation stays with each policy. */
export class BoundedGitOutput {
  private readonly decoder = new GitOutputDecoder();
  private bytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  write(channel: 'stdout' | 'stderr', data: Buffer): boolean {
    this.bytes += data.byteLength;
    if (this.bytes > this.maxBytes) return false;
    this.decoder.write(channel, data);
    return true;
  }

  finish(): { readonly stdout: string; readonly stderr: string } {
    return this.decoder.finish();
  }
}
