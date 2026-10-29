import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface ProcessDisposition {
  state: 'stopped' | 'unknown';
  reason: 'not-started' | 'group-exited' | 'tree-killed' | 'unverified-tree';
}
function groupGone(pid: number): boolean {
  try {
    process.kill(-pid, 0);

    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function rootExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitFor(predicate: () => boolean, ms: number) {
  const until = performance.now() + ms;
  do {
    if (predicate()) {
      return true;
    }

    await delay(20);
  } while (performance.now() < until);

  return predicate();
}

/** Only OS liveness evidence; no provider outcome and no proof of arbitrary tool effects. */
export async function terminateOwnedProcess(
  child: ChildProcess,
  options: { graceMs?: number; forceMs?: number } = {},
): Promise<ProcessDisposition> {
  const pid = child.pid;
  if (!pid) {
    return { state: 'stopped', reason: 'not-started' };
  }

  const grace = options.graceMs ?? 1000,
    force = options.forceMs ?? 1000;
  if ([grace, force].some((ms) => !Number.isSafeInteger(ms) || ms < 0 || ms > 2000)) {
    throw new Error('Invalid process shutdown budget.');
  }

  if (process.platform === 'win32') {
    // Once the root exits Windows taskkill cannot safely rediscover its tree from a stale PID.
    if (rootExited(child)) {
      return { state: 'unknown', reason: 'unverified-tree' };
    }

    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    if (!systemRoot || !isAbsolute(systemRoot)) {
      return { state: 'unknown', reason: 'unverified-tree' };
    }

    const killed = await new Promise<boolean>((resolve) =>
      execFile(
        join(systemRoot, 'System32', 'taskkill.exe'),
        ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true, timeout: 2000, maxBuffer: 16384, env: { SystemRoot: systemRoot } },
        (error) => resolve(!error),
      ),
    );
    if (killed && (await waitFor(() => rootExited(child), force))) {
      return { state: 'stopped', reason: 'tree-killed' };
    }

    return { state: 'unknown', reason: 'unverified-tree' };
  }

  if (groupGone(pid)) {
    return { state: 'stopped', reason: 'group-exited' };
  }

  try {
    process.kill(-pid, 'SIGINT');
  } catch {
    /* Verification below remains authoritative. */
  }

  if (await waitFor(() => groupGone(pid), grace)) {
    return { state: 'stopped', reason: 'group-exited' };
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* Never target a recycled root PID as fallback. */
  }

  if (await waitFor(() => groupGone(pid), force)) {
    return { state: 'stopped', reason: 'tree-killed' };
  }

  return { state: 'unknown', reason: 'unverified-tree' };
}
