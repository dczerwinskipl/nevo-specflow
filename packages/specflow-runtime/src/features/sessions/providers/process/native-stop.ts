import { readFileSync } from 'node:fs';
import type { NativeProcessIdentity } from './process-identity';
import { windowsJobState, windowsProcessCreation, windowsRootState } from './windows-process';

/**
 * `stopped`: positive evidence that no process of the recorded identity remains. `running`: the
 * identity is still alive. `unknown`: the OS cannot tell; never treated as stopped.
 */
export type NativeStopEvidence = 'stopped' | 'running' | 'unknown';

/** The OS queries the evidence uses; each answers once, without spawning a tool. */
export interface ProcessInspection {
  /** The Runtime runs on Windows: an identity of the other platform family is never evidence. */
  readonly windows: boolean;
  posixGroup(groupId: number): 'present' | 'absent' | 'unknown';
  linuxBootId(): string | undefined;
  linuxStart(pid: number): string | undefined;
  windowsCreation(pid: number): string | undefined;
  windowsRoot(pid: number, createdAt: string): 'present' | 'gone' | 'unknown';
  windowsJob(name: string): 'active' | 'empty' | 'gone' | 'unknown';
}

function readProc(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export const systemProcessInspection: ProcessInspection = {
  windows: process.platform === 'win32',
  posixGroup(groupId) {
    try {
      process.kill(-groupId, 0);

      return 'present';
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'absent' : 'unknown';
    }
  },
  linuxBootId() {
    const id = readProc('/proc/sys/kernel/random/boot_id')?.trim();

    return id === '' ? undefined : id;
  },
  linuxStart(pid) {
    const stat = readProc(`/proc/${pid}/stat`);
    if (!stat) {
      return undefined;
    }

    // Fields after "pid (comm) ": state is field 3, starttime field 22.
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];

    return start && /^[0-9]+$/.test(start) ? start : undefined;
  },
  windowsCreation: windowsProcessCreation,
  windowsRoot: windowsRootState,
  windowsJob: windowsJobState,
};

/**
 * The identity of a just-started owned process: its process group (POSIX, the provider leads it)
 * or the Job Object bootstrap root and the job's name (Windows). Undefined when the creation time a
 * Windows identity needs cannot be read.
 */
export function captureProcessIdentity(
  pid: number,
  windowsJob: string | undefined,
  inspect: ProcessInspection = systemProcessInspection,
): NativeProcessIdentity | undefined {
  if (windowsJob !== undefined) {
    const createdAt = inspect.windowsCreation(pid);

    return createdAt ? { platform: 'windows', pid, createdAt, job: windowsJob } : undefined;
  }

  const bootId = inspect.linuxBootId();
  const leaderStart = inspect.linuxStart(pid);

  return {
    platform: 'posix',
    groupId: pid,
    ...(bootId ? { bootId } : {}),
    ...(leaderStart ? { leaderStart } : {}),
  };
}

/**
 * Whether the recorded processes stopped (architecture.ai.provider-process-ownership,
 * "Native-stop evidence").
 *
 * POSIX: another boot, or no process left in the group (`ESRCH`), is stopped. A live group whose
 * leader PID now belongs to a process started at another time is stopped too: Linux never reuses a
 * PID that is still a process-group id, so the recorded group is gone. Without a recorded start
 * time (outside Linux) a live group cannot be told apart from a reused id and stays unknown.
 *
 * Windows: the root process with that PID and creation time is gone and the named Job Object is
 * gone or has no active process. Either still alive is running.
 */
export function nativeStopEvidence(
  identity: NativeProcessIdentity,
  inspect: ProcessInspection = systemProcessInspection,
): NativeStopEvidence {
  try {
    if (identity.platform === 'windows') {
      if (!inspect.windows) {
        return 'unknown';
      }

      const root = inspect.windowsRoot(identity.pid, identity.createdAt);
      const job = inspect.windowsJob(identity.job);
      if (root === 'present' || job === 'active') {
        return 'running';
      }

      return root === 'gone' && (job === 'gone' || job === 'empty') ? 'stopped' : 'unknown';
    }

    if (inspect.windows) {
      return 'unknown';
    }

    const boot = inspect.linuxBootId();
    if (identity.bootId && boot && boot !== identity.bootId) {
      return 'stopped';
    }

    const group = inspect.posixGroup(identity.groupId);
    if (group !== 'present') {
      return group === 'absent' ? 'stopped' : 'unknown';
    }

    if (!identity.leaderStart) {
      return 'unknown';
    }

    const start = inspect.linuxStart(identity.groupId);

    return start !== undefined && start !== identity.leaderStart ? 'stopped' : 'running';
  } catch {
    return 'unknown';
  }
}
