import { channel } from 'node:diagnostics_channel';
import { lstat } from 'node:fs/promises';

import {
  holdsProjectControlLock,
  inspectProjectControlLock,
  projectControlLockPath,
} from './control-lock';
import { readFileWindowsSafe, unlinkWindowsSafe } from './fs/windows-safe-fs';
import type { ResolvedProjectHome } from './home/home';

const takeoverChannel = channel('nevo.specflow.engine.control-lock-takeover');

/** A lock file whose metadata cannot be read is only cleared once it is this old (a live writer finishes in ms). */
export const CONTROL_LOCK_CORRUPT_MIN_AGE_MS = 60_000;

/** A lock written this close to the start of this process may be the work of this process. */
const SELF_START_MARGIN_MS = 2000;

export type ProcessProbe = 'alive' | 'dead' | 'unknown';

export interface ControlLockTakeoverOptions {
  /**
   * The operator's assertion that whatever held the lock has stopped and no other Project Home
   * writer runs on another host. Required; without it nothing is touched. Never set by a transport.
   */
  readonly confirmExecutorStopped: boolean;
  /** Wall clock in epoch milliseconds (seam). */
  readonly nowMs?: () => number;
  /** Epoch milliseconds at which this process started (seam). */
  readonly processStartedAtMs?: number;
  /** The PID of this process (seam). */
  readonly pid?: number;
  /** Whether a PID runs on this host (seam); defaults to `process.kill(pid, 0)`. */
  readonly probe?: (pid: number) => ProcessProbe;
  /** Modification time of the lock file, for a lock without readable metadata (seam). */
  readonly modifiedAtMs?: (path: string) => Promise<number>;
}

export type ControlLockTakeoverRefusal =
  /** `confirmExecutorStopped` was not given. */
  | 'assertion-missing'
  /** This process holds the lock right now. */
  | 'held-by-this-process'
  /** The recorded PID is this process (or a thread of it) and the lock is not older than the process. */
  | 'holder-is-this-process'
  /** The recorded PID runs on this host. */
  | 'holder-alive'
  /** Whether the recorded PID runs could not be told. */
  | 'holder-unknown'
  /** The metadata is unreadable and the file is too recent to be a leftover. */
  | 'corrupt-too-recent'
  /** The lock path is not a regular file: nothing is removed. */
  | 'not-a-regular-file'
  /** The lock changed between the inspection and the removal (a holder released it, another took it). */
  | 'changed';

export type ControlLockTakeoverResult =
  | { readonly status: 'free' }
  | {
      readonly status: 'cleared';
      readonly holder: { readonly pid: number; readonly createdAt: string } | 'unreadable';
    }
  | { readonly status: 'refused'; readonly reason: ControlLockTakeoverRefusal };

const nodeProbe = (pid: number): ProcessProbe => {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return 'dead';
    // EPERM: the process exists and belongs to someone else.
    if (code === 'EPERM') return 'alive';
    return 'unknown';
  }
};

async function fileModifiedAtMs(path: string): Promise<number> {
  return (await lstat(path)).mtimeMs;
}

/**
 * Clears a Project Home control lock that a crashed process left behind: the operator's answer to
 * "the queue stays busy after a Runtime crash" on platforms where the Engine cannot prove a holder
 * dead by itself (Windows, macOS, containers). The lock is otherwise never stolen: no age, PID or
 * timeout removes it. This function removes it only when ALL of these hold:
 *
 * 1. the operator asserted `confirmExecutorStopped`;
 * 2. the lock is a regular file (a directory or a link is never touched);
 * 3. the holder is provably not running on this host:
 *    - the recorded PID is absent from this host's process table (`kill(pid, 0)` says ESRCH), or
 *    - the recorded PID is the PID of this process and the lock was written before this process
 *      started (a leftover of an earlier process that had the same PID: a restarted container) and this
 *      process does not hold it now; or
 *    - the metadata is unreadable (a writer killed between creating the file and writing it) and the
 *      file is at least a minute old;
 * 4. nothing changed between the inspection and the removal (the file is read again and compared
 *    whole; a lock that was released and taken again is left alone).
 *
 * A live PID is never overridden, not even on the assertion; neither is a lock this process holds. A
 * recycled PID that now belongs to an unrelated process therefore needs a person to remove the file
 * by hand. The record carries no host: the assertion is also the operator's statement that the Project
 * Home is not shared with another machine. A residual race remains between the second read and the
 * removal; it needs two operators clearing one lock at the same moment.
 */
export async function takeOverProjectControlLock(
  context: ResolvedProjectHome,
  options: ControlLockTakeoverOptions,
): Promise<ControlLockTakeoverResult> {
  if (options.confirmExecutorStopped !== true) return refuse('assertion-missing');
  const path = projectControlLockPath(context);
  const inspected = await inspectProjectControlLock(context);
  if (inspected.status === 'free') return { status: 'free' };
  if (holdsProjectControlLock(context)) return refuse('held-by-this-process');

  if (inspected.status === 'corrupt') {
    if (!(await isRegularFile(path))) return refuse('not-a-regular-file');
    const age =
      (options.nowMs ?? Date.now)() - (await (options.modifiedAtMs ?? fileModifiedAtMs)(path));
    if (age < CONTROL_LOCK_CORRUPT_MIN_AGE_MS) return refuse('corrupt-too-recent');
    return remove(context, path, 'unreadable');
  }

  const own = options.pid ?? process.pid;
  if (inspected.pid === own) {
    const startedAt =
      options.processStartedAtMs ?? (options.nowMs ?? Date.now)() - process.uptime() * 1000;
    const writtenAt = Date.parse(inspected.createdAt);
    if (!(writtenAt < startedAt - SELF_START_MARGIN_MS)) return refuse('holder-is-this-process');
  } else {
    const state = (options.probe ?? nodeProbe)(inspected.pid);
    if (state === 'alive') return refuse('holder-alive');
    if (state === 'unknown') return refuse('holder-unknown');
  }
  return remove(context, path, { pid: inspected.pid, createdAt: inspected.createdAt });
}

function refuse(reason: ControlLockTakeoverRefusal): ControlLockTakeoverResult {
  return { status: 'refused', reason };
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function remove(
  context: ResolvedProjectHome,
  path: string,
  holder: { readonly pid: number; readonly createdAt: string } | 'unreadable',
): Promise<ControlLockTakeoverResult> {
  // Re-read just before the removal: the record must still be the one that was judged.
  const before = await readFileWindowsSafe(path).catch(() => undefined);
  const again = await inspectProjectControlLock(context);
  const same =
    holder === 'unreadable'
      ? again.status === 'corrupt'
      : again.status === 'held' && again.pid === holder.pid && again.createdAt === holder.createdAt;
  if (!same || before === undefined || !(await isRegularFile(path))) return refuse('changed');
  const after = await readFileWindowsSafe(path).catch(() => undefined);
  if (after !== before) return refuse('changed');
  await unlinkWindowsSafe(path);
  if (takeoverChannel.hasSubscribers) {
    try {
      takeoverChannel.publish({ projectId: context.project.projectId, holder });
    } catch {
      // Diagnostic subscribers are observers.
    }
  }
  return { status: 'cleared', holder };
}
