import { spawn } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import type { EventEmitter } from 'node:events';

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
    if (name.toUpperCase().startsWith('GIT_')) {
      delete env[name];
    }
  }

  const child = spawn(currentGitExecutable(), [...args], {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    // Own process group on POSIX so a hung clean-filter grandchild dies with git (see
    // `terminateGitProcessTree`); Windows has no process groups and uses a tree kill instead.
    detached: process.platform !== 'win32',
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
    if (this.bytes > this.maxBytes) {
      return false;
    }

    this.decoder.write(channel, data);

    return true;
  }

  finish(): { readonly stdout: string; readonly stderr: string } {
    return this.decoder.finish();
  }
}

/** What the termination helpers need from a child process (a seam for tests). */
export interface TerminableChild {
  readonly pid?: number | undefined;
  /** Set by Node once the leader exited; absent on test doubles. */
  readonly exitCode?: number | null | undefined;
  readonly signalCode?: NodeJS.Signals | null | undefined;
  kill(signal?: NodeJS.Signals): boolean;
}

function leaderExited(child: TerminableChild): boolean {
  return (
    (child.exitCode !== undefined && child.exitCode !== null) ||
    (child.signalCode !== undefined && child.signalCode !== null)
  );
}

export interface TerminationSeams {
  readonly platform?: NodeJS.Platform;
  /** POSIX: signals a whole process group (default `process.kill(-pid, signal)`). */
  readonly signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
  /** Windows: runs `taskkill /pid <pid> /T /F` (default spawns it, fire and forget). */
  readonly taskkill?: (pid: number) => void;
  /**
   * Signals even though the leader already exited. Only the `exit` handler of a mutation sets it, to
   * sweep a grandchild (a filter) that outlived git: it runs in the same turn as the exit event.
   */
  readonly sweep?: boolean;
}

/**
 * Ends git AND everything it started (clean filters, credential helpers): `child.kill()` alone ends
 * git only, and a surviving grandchild keeps the stdout/stderr pipes open. POSIX children are spawned
 * as their own process group leader, so the whole group is signalled; Windows has no groups, so the
 * tree is killed with `taskkill /T /F` (always forceful; there is no graceful tree signal).
 *
 * Once the leader has exited the call does nothing (unless `seams.sweep`): the process group id is
 * the leader's pid, and after the last member of the group is gone the number can be handed to an
 * unrelated process, which a late `kill(-pid)` would then hit. The remaining window is the few
 * microseconds between Node reaping the leader and the `exit` sweep, and it needs the whole group
 * gone and the pid recycled within it.
 */
export function terminateGitProcessTree(
  child: TerminableChild,
  signal: NodeJS.Signals,
  seams: TerminationSeams = {},
): void {
  const platform = seams.platform ?? process.platform;
  if (leaderExited(child) && seams.sweep !== true) {
    return;
  }

  const pid = child.pid;
  if (pid === undefined) {
    child.kill(signal);

    return;
  }

  if (platform === 'win32') {
    try {
      (seams.taskkill ?? runTaskkill)(pid);
    } catch {
      // Fall through to the plain kill below.
    }

    child.kill(signal);

    return;
  }

  try {
    (seams.signalGroup ?? ((target, sig) => process.kill(-target, sig)))(pid, signal);
  } catch {
    // The group is already gone (ESRCH) or could not be signalled: end git itself.
    child.kill(signal);
  }
}

function runTaskkill(pid: number): void {
  const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  killer.on('error', () => undefined);
  killer.unref();
}

interface EndingChild extends Pick<EventEmitter, 'on'> {
  readonly stdout?: { destroy(): unknown } | null;
  readonly stderr?: { destroy(): unknown } | null;
}

/**
 * Calls `done` once when the process is over. Normally that is `close` (all output read). The
 * outcome never depends on `close` alone: when `exit` fired and the pipes stay open (a grandchild
 * holds them) the output read so far is final after `graceMs` and the streams are destroyed.
 */
export function onGitProcessEnd(
  child: EndingChild,
  graceMs: number,
  done: (code: number | null) => void,
): void {
  let finished = false;
  let timer: NodeJS.Timeout | undefined;
  const finish = (code: number | null): void => {
    if (finished) {
      return;
    }

    finished = true;
    if (timer) {
      clearTimeout(timer);
    }

    done(code);
  };

  child.on('exit', (code: number | null) => {
    if (finished) {
      return;
    }

    timer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      finish(code);
    }, graceMs);
    timer.unref();
  });
  child.on('close', (code: number | null) => finish(code));
}
