import { readFile, readlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { threadId as currentThreadId } from 'node:worker_threads';

import { exactKeys, isCount, isRecord, isShortText } from './guards';

/**
 * Who runs a step. Fields beyond the PID are absent where the platform cannot supply them (no
 * `/proc`): such an executor can never be proven dead, only recovered by an operator assertion.
 */
export interface ExecutorIdentity {
  readonly pid: number;
  readonly hostId: string;
  /** `process.platform` of the executor: a Windows process and a WSL one can share host name and PIDs. */
  readonly platform?: string;
  /**
   * `threadId` of `node:worker_threads` (0 for the main thread; absent counts as 0). Threads of one process
   * share PID, start time and boot id but not module state or the in-process guards, so another thread
   * of the same process is never provably gone: only an operator takes its work over.
   */
  readonly threadId?: number;
  /** Inode of `/proc/self/ns/pid`. */
  readonly pidNamespaceId?: string;
  /** Field 22 of `/proc/<pid>/stat`. */
  readonly processStartTime?: string;
  /** `/proc/sys/kernel/random/boot_id`. */
  readonly bootId?: string;
}

const EXECUTOR_KEYS = [
  'pid',
  'hostId',
  'platform',
  'threadId',
  'pidNamespaceId',
  'processStartTime',
  'bootId',
];

export function isExecutorIdentity(value: unknown): value is ExecutorIdentity {
  return (
    isRecord(value) &&
    exactKeys(value, EXECUTOR_KEYS, [
      'platform',
      'threadId',
      'pidNamespaceId',
      'processStartTime',
      'bootId',
    ]) &&
    typeof value.pid === 'number' &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    isShortText(value.hostId) &&
    (value.platform === undefined || isShortText(value.platform)) &&
    (value.threadId === undefined || isCount(value.threadId, Number.MAX_SAFE_INTEGER)) &&
    (value.pidNamespaceId === undefined || isShortText(value.pidNamespaceId)) &&
    (value.processStartTime === undefined || isShortText(value.processStartTime)) &&
    (value.bootId === undefined || isShortText(value.bootId))
  );
}

/**
 * What the identity of a process needs from the operating system. A seam so that the capture and
 * the dead proof can be tested with an injected process table on any platform.
 */
export interface ProcessTable {
  readonly pid: number;
  /** `process.platform`; defaults to the platform of this process. */
  readonly platform?: string;
  hostId(): string;
  /** `threadId` of `node:worker_threads`; defaults to the thread of this code. */
  readonly threadId?: number;
  /** The text of a procfs file, or `undefined` when it does not exist (or there is no procfs). */
  readText(path: string): Promise<string | undefined>;
  /** The target of a procfs link, or `undefined` when it does not exist (or there is no procfs). */
  readLink(path: string): Promise<string | undefined>;
}

export const nodeProcessTable: ProcessTable = {
  pid: process.pid,
  hostId: () => hostname(),
  readText: async (path) => {
    try {
      return (await readFile(path, 'utf8')).trim();
    } catch {
      return undefined;
    }
  },
  readLink: async (path) => {
    try {
      return await readlink(path);
    } catch {
      return undefined;
    }
  },
};

/**
 * Field 22 of `/proc/<pid>/stat` (start time in clock ticks since boot). The command name is the
 * second field and may hold spaces and parentheses, so the fields are counted after the LAST
 * closing parenthesis.
 */
export function processStartTimeOf(stat: string): string | undefined {
  const end = stat.lastIndexOf(')');
  if (end < 0) {
    return undefined;
  }

  const fields = stat
    .slice(end + 1)
    .trim()
    .split(/\s+/u);
  // `fields[0]` is field 3 (the state), so field 22 is at index 19.
  const value = fields[19];

  return value !== undefined && /^\d+$/u.test(value) ? value : undefined;
}

/**
 * Who is running a step: PID and host always; PID namespace, process start time and boot id where
 * `/proc` supplies them (Linux). Without them the process can never be proven dead by another one.
 */
export async function captureExecutorIdentity(
  table: ProcessTable = nodeProcessTable,
): Promise<ExecutorIdentity> {
  const [namespace, stat, bootId] = await Promise.all([
    table.readLink('/proc/self/ns/pid'),
    table.readText('/proc/self/stat'),
    table.readText('/proc/sys/kernel/random/boot_id'),
  ]);
  const startTime = stat === undefined ? undefined : processStartTimeOf(stat);
  const boot = bootId?.trim();

  return {
    pid: table.pid,
    hostId: table.hostId(),
    platform: table.platform ?? process.platform,
    threadId: table.threadId ?? currentThreadId,
    ...(namespace !== undefined && namespace.length > 0 ? { pidNamespaceId: namespace } : {}),
    ...(startTime !== undefined ? { processStartTime: startTime } : {}),
    ...(boot !== undefined && boot.length > 0 ? { bootId: boot } : {}),
  };
}

/**
 * - `self`: the record names this very process (the same host and PID, and the same start time where known).
 * - `dead`: provably not running (a different boot, or the same host and PID namespace and the PID is
 *   absent or has another start time).
 * - `unknown`: cannot be proven either way. Never taken over without an operator assertion.
 * - `alive`: the PID is running with the recorded start time.
 */
export type ExecutorState = 'self' | 'dead' | 'alive' | 'unknown';

/** The dead proof of the document commits ADR (ADR 0016). A live or unknown PID is never taken over. */
export async function proveExecutorState(
  recorded: ExecutorIdentity,
  own: ExecutorIdentity,
  table: ProcessTable = nodeProcessTable,
): Promise<ExecutorState> {
  if (recorded.hostId !== own.hostId) {
    return 'unknown';
  }

  // A Windows process and a WSL one can share a host name and PID numbers (the same files over /mnt/c):
  // different platforms, or one side with a PID namespace and the other without, prove nothing.
  if (recorded.platform !== own.platform) {
    return 'unknown';
  }

  if ((recorded.pidNamespaceId === undefined) !== (own.pidNamespaceId === undefined)) {
    return 'unknown';
  }

  if (recorded.bootId !== undefined && own.bootId !== undefined && recorded.bootId !== own.bootId) {
    return 'dead';
  }

  const sameNamespace =
    recorded.pidNamespaceId !== undefined &&
    own.pidNamespaceId !== undefined &&
    recorded.pidNamespaceId === own.pidNamespaceId;
  const otherNamespace =
    recorded.pidNamespaceId !== undefined &&
    own.pidNamespaceId !== undefined &&
    recorded.pidNamespaceId !== own.pidNamespaceId;
  if (otherNamespace) {
    return 'unknown';
  }

  if (recorded.pid === own.pid) {
    // The same PID: this very process (a write that stopped inside it), or a later process that reuses
    // the number, which only a different start time tells apart. Without procfs there is none, and the
    // record is taken as this process: a PID is unique on a host, so no other live process has it.
    if (
      recorded.processStartTime !== undefined &&
      own.processStartTime !== undefined &&
      recorded.processStartTime !== own.processStartTime
    ) {
      return sameNamespace ? 'dead' : 'unknown';
    }

    // Another thread of this process shares everything but the memory: nothing proves it stopped.
    if ((recorded.threadId ?? 0) !== (own.threadId ?? 0)) {
      return 'unknown';
    }

    return 'self';
  }

  if (!sameNamespace) {
    return 'unknown';
  }

  const stat = await table.readText(`/proc/${recorded.pid}/stat`);
  if (stat === undefined) {
    return 'dead';
  }

  const startTime = processStartTimeOf(stat);
  if (startTime === undefined || recorded.processStartTime === undefined) {
    return 'unknown';
  }

  return startTime === recorded.processStartTime ? 'alive' : 'dead';
}
