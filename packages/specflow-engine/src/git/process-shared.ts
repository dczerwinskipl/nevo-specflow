import { spawn } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';

import { resolveGitExecutable } from './executable';
import { GitOutputDecoder } from './output-decoder';

const gitProcessChannel = channel('nevo.specflow.engine.git-process');

// Keep native Git discovery fast on the ordinary path, but respect explicit
// PATH changes (including executable-unavailable admission and recovery tests).
let resolvedPath: string | undefined;
let resolvedExecutable: string | undefined;
function currentGitExecutable(): string {
  const path = process.env.PATH ?? '';
  if (resolvedPath !== path || resolvedExecutable === undefined) {
    resolvedExecutable = resolveGitExecutable(process.platform, path);
    resolvedPath = path;
  }
  return resolvedExecutable;
}

/** Sanitizes Git discovery/config overrides for every Engine process. */
export function spawnLocalGit(cwd: string, args: readonly string[]) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase().startsWith('GIT_')) delete env[name];
  }
  const child = spawn(currentGitExecutable(), [...args], {
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
