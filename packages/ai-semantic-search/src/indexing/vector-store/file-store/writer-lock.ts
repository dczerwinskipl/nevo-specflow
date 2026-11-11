import { randomUUID } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { lstat, readFile, readdir, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { hostname, uptime } from 'node:os';
import { join } from 'node:path';

import { generationFiles } from './generation-files';
import { errorCode } from './io-errors';

/**
 * Lock files of an index directory: `writer-<epoch>.lock`, created exclusively by the writer that
 * takes epoch `<epoch>`, and `writer-<epoch>.released`, created by that writer when it lets go.
 */
const LOCK_FILE = /^writer-(\d+)\.(lock|released)$/;

/** The protocol steps a test can pause at (`WriterLockCheckpoint`). */
export type WriterLockStep =
  /** The holder of the highest epoch was judged gone or stale; next comes the exclusive create. */
  | 'claim'
  /** A write passed its ownership check; next comes the rename that publishes its manifest. */
  | 'publish';

/** Test seam, awaited at each `WriterLockStep` to drive interleavings deterministically. */
export type WriterLockCheckpoint = (step: WriterLockStep) => Promise<void>;

/**
 * Inputs of the ownership rule. A held lock is refreshed (its mtime touched) every quarter of
 * `staleAfterMs`; the lock of the highest epoch is free once released, and stale when
 *
 * - it was not refreshed for `staleAfterMs` (a holder that died, hung or was suspended, or that died
 *   before writing its owner record), or its refresh time lies more than `staleAfterMs` ahead of
 *   `now` (a skewed clock, which would otherwise keep a dead holder's lock for the skew too), or
 * - its record names this process's `scope` and its pid is not alive there, or is this process's
 *   pid without this process holding its token (a reused pid, for example PID 1 in a restarted
 *   container). A pid from another scope (another host, boot or PID namespace) says nothing, so
 *   only the heartbeat counts for it.
 */
export interface WriterLockDependencies {
  readonly pid: number;
  /** Where `pid` means something: host, boot and PID namespace (`processScope`). */
  readonly scope: string;
  readonly isProcessAlive: (pid: number) => boolean;
  readonly now: () => number;
  readonly staleAfterMs: number;
}

/** Whether a live writer holds the lock of an index directory, by the ownership rule above. */
export type WriterLockState =
  { readonly status: 'held'; readonly pid: number | undefined } | { readonly status: 'free' };

/** The lock as its one writer holds it. */
export interface HeldWriterLock {
  readonly status: 'acquired';
  /** The fencing token: above every epoch before it, in lock and manifest names alike. */
  readonly epoch: number;
  /**
   * Whether this writer still owns the index: its lock file is there and not released, and no
   * higher epoch exists. Filesystem errors are thrown.
   */
  stillHeld(): Promise<boolean>;
  /** Stops the heartbeat and releases the lock while this writer still owns it. */
  release(): Promise<void>;
}

export type WriterLockAttempt =
  HeldWriterLock | { readonly status: 'busy'; readonly message: string };

interface LockRecord {
  readonly pid: number;
  readonly token: string;
  readonly scope: string | undefined;
}

/**
 * Tokens of the locks this process holds, across store instances. The set is per module instance:
 * a process that loads this module twice (for example two bundles) cannot tell the other copy's
 * locks from a reused pid, so it treats them as stale.
 */
const heldTokens = new Set<string>();

/**
 * Takes the writer lock of `directory` without waiting. Ownership is an epoch: the writer that
 * exclusively creates (`wx`) `writer-<epoch>.lock` for an epoch above every epoch on disk owns the
 * index. No file is renamed or removed to take a lock over. The steps:
 *
 * 1. List the directory. While the highest epoch's lock is held, answer `busy`.
 * 2. Otherwise (no lock, released or stale) create the lock of the next epoch, above the highest
 *    lock and manifest epoch. Of writers that judged the same lock stale, one creates it; the others
 *    get "exists" and answer `busy`.
 * 3. List again. A writer whose listing was old can create an epoch below one taken meanwhile: it
 *    removes its own file and answers `busy`. The highest epoch's lock file is only removed by a
 *    writer of a higher epoch, so the highest epoch is never taken twice.
 * 4. Remove the lock files of lower epochs (best effort) and refresh the own lock file every quarter
 *    of `staleAfterMs` while `stillHeld` is true.
 *
 * A former holder whose lock went stale (a suspended machine, for example) can still run:
 * `stillHeld` turns false for it, its writes check it before they publish, and its epoch, part of
 * every manifest name, ranks a late write below the new owner's (`generationFiles`). Filesystem
 * errors other than "exists" or "gone" are thrown.
 */
export async function tryAcquireWriterLock(
  directory: string,
  token: string,
  dependencies: WriterLockDependencies,
  checkpoint?: WriterLockCheckpoint,
): Promise<WriterLockAttempt> {
  const names = await readdir(directory);
  const top = highestLock(names);
  if (top !== undefined && !top.released) {
    const holder = await inspectHolder(lockPath(directory, top.epoch), dependencies);
    if (holder.status === 'held') {
      return { status: 'busy', message: `The index is being written by ${holder.owner}.` };
    }
  }

  const epoch = highestEpoch(names) + 1;
  await checkpoint?.('claim');
  const path = lockPath(directory, epoch);
  const record = JSON.stringify({
    pid: dependencies.pid,
    token,
    scope: dependencies.scope,
  } satisfies LockRecord);
  if (!(await createExclusive(path, record))) {
    return { status: 'busy', message: 'Another writer took the index lock.' };
  }

  const owns = async (): Promise<boolean> => {
    const current = await readdir(directory);

    return (
      current.includes(lockName(epoch, 'lock')) &&
      !current.includes(lockName(epoch, 'released')) &&
      highestEpoch(current) === epoch
    );
  };

  if (!(await owns())) {
    await unlinkIfPresent(path);

    return { status: 'busy', message: 'Another writer took the index lock.' };
  }

  await removeLowerLocks(directory, epoch);
  heldTokens.add(token);

  let beating = false;
  const heartbeat = setInterval(
    () => {
      if (beating) {
        return;
      }

      beating = true;
      // Only the own epoch's file is touched, and only while it still owns the index. A failed
      // touch lets the lock become stale earlier; writes check ownership before they publish.
      owns()
        .then(async (held) => {
          if (held) {
            const touchedAt = new Date(dependencies.now());
            await utimes(path, touchedAt, touchedAt);
          } else {
            clearInterval(heartbeat);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          beating = false;
        });
    },
    Math.max(1, Math.floor(dependencies.staleAfterMs / 4)),
  );
  heartbeat.unref();

  return {
    status: 'acquired',
    epoch,
    stillHeld: owns,
    async release() {
      clearInterval(heartbeat);
      heldTokens.delete(token);
      if (await owns()) {
        await createExclusive(lockPath(directory, epoch, 'released'), token);
      }
    },
  };
}

/**
 * Reads the writer lock of `directory` without taking it: `held` while a live writer holds the
 * highest epoch (`pid` is `undefined` for a writer that has not written its owner record yet),
 * `free` otherwise. A stale lock is left for the next writer to take over. Filesystem errors other
 * than "gone" are thrown.
 */
export async function inspectWriterLock(
  directory: string,
  dependencies: WriterLockDependencies,
): Promise<WriterLockState> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { status: 'free' };
    }

    throw error;
  }

  const top = highestLock(names);
  if (top === undefined || top.released) {
    return { status: 'free' };
  }

  const holder = await inspectHolder(lockPath(directory, top.epoch), dependencies);

  return holder.status === 'held' ? { status: 'held', pid: holder.pid } : { status: 'free' };
}

/** Liveness check by signal 0: `EPERM` means the process exists but belongs to someone else. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return errorCode(error) === 'EPERM';
  }
}

let ownScope: string | undefined;

/**
 * Where this process's pid means something: the host name and the boot, and on Linux the PID
 * namespace (containers sharing an index directory each have their own). Processes with the same
 * scope see the same process table. A scope that cannot be determined is unique to this process, so
 * no other process's pid is trusted then.
 */
export function processScope(): string {
  ownScope ??= computeScope();

  return ownScope;
}

function computeScope(): string {
  try {
    if (process.platform === 'linux') {
      const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();

      return `${hostname()}|${boot}|${readlinkSync('/proc/self/ns/pid')}`;
    }

    // No PID namespaces elsewhere; the boot time to the minute tells restarts apart.
    return `${hostname()}|boot-${String(Math.round((Date.now() - uptime() * 1000) / 60_000))}`;
  } catch {
    return `unknown|${randomUUID()}`;
  }
}

function lockName(epoch: number, state: 'lock' | 'released'): string {
  return `writer-${String(epoch)}.${state}`;
}

function lockPath(directory: string, epoch: number, state: 'lock' | 'released' = 'lock'): string {
  return join(directory, lockName(epoch, state));
}

/** The highest epoch with a lock file, and whether its holder released it. */
function highestLock(
  names: readonly string[],
): { readonly epoch: number; readonly released: boolean } | undefined {
  let top: { epoch: number; released: boolean } | undefined;
  for (const name of names) {
    const match = LOCK_FILE.exec(name);
    if (match) {
      const epoch = Number(match[1]);
      if (top === undefined || epoch > top.epoch) {
        top = { epoch, released: false };
      }

      if (epoch === top.epoch && match[2] === 'released') {
        top.released = true;
      }
    }
  }

  return top;
}

/** The highest epoch a lock or manifest file names; 0 for none. */
function highestEpoch(names: readonly string[]): number {
  return Math.max(highestLock(names)?.epoch ?? 0, generationFiles(names)[0]?.epoch ?? 0);
}

async function removeLowerLocks(directory: string, epoch: number): Promise<void> {
  const names = await readdir(directory).catch(() => []);
  for (const name of names) {
    const match = LOCK_FILE.exec(name);
    if (match && Number(match[1]) < epoch) {
      // A file that cannot be removed now (held open on Windows) goes with a later owner's.
      await unlink(join(directory, name)).catch(() => undefined);
    }
  }
}

/**
 * Creates `path` only if no file has that name: `false` when the name is taken. On Windows `EPERM`
 * or `EBUSY` means either a file whose deletion is pending (taken) or a directory this process may
 * not write; only a name that still exists counts as taken, otherwise the error is thrown, so a
 * read-only index directory is a write failure and not a writer that never finishes.
 */
async function createExclusive(path: string, content: string): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: 'wx' });

    return true;
  } catch (error) {
    if (errorCode(error) === 'EEXIST' || (isDeletePending(error) && (await nameTaken(path)))) {
      return false;
    }

    throw error;
  }
}

/** Whether a directory entry named `path` exists; one that cannot be inspected counts as taken. */
async function nameTaken(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch (error) {
    return errorCode(error) !== 'ENOENT';
  }
}

/**
 * Windows answers `EPERM` (or `EBUSY`) for a file whose deletion is pending while another program
 * still has it open, for example a virus scanner: the name is taken for a moment, like "exists".
 */
function isDeletePending(error: unknown): boolean {
  const code = errorCode(error);

  return process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY');
}

type Holder =
  | { readonly status: 'held'; readonly owner: string; readonly pid: number | undefined }
  | { readonly status: 'stale' };

async function inspectHolder(path: string, dependencies: WriterLockDependencies): Promise<Holder> {
  let content: string;
  let refreshedAt: number;
  try {
    content = await readFile(path, 'utf8');
    refreshedAt = (await stat(path)).mtimeMs;
  } catch (error) {
    // Removed by the writer of a higher epoch since the listing: the claim below it fails.
    if (errorCode(error) === 'ENOENT') {
      return { status: 'stale' };
    }

    if (isDeletePending(error)) {
      return { status: 'held', owner: 'a writer whose lock file is being removed', pid: undefined };
    }

    throw error;
  }

  if (Math.abs(dependencies.now() - refreshedAt) > dependencies.staleAfterMs) {
    return { status: 'stale' };
  }

  const record = parseRecord(content);
  if (!record) {
    return { status: 'held', owner: 'a writer that is starting', pid: undefined };
  }

  if (record.scope === dependencies.scope) {
    const reusedOwnPid = record.pid === dependencies.pid && !heldTokens.has(record.token);
    if (reusedOwnPid || !dependencies.isProcessAlive(record.pid)) {
      return { status: 'stale' };
    }
  }

  return { status: 'held', owner: `process ${String(record.pid)}`, pid: record.pid };
}

function parseRecord(content: string): LockRecord | undefined {
  try {
    const value = JSON.parse(content) as Partial<LockRecord> | null;

    return typeof value?.pid === 'number' &&
      Number.isInteger(value.pid) &&
      typeof value.token === 'string'
      ? {
          pid: value.pid,
          token: value.token,
          scope: typeof value.scope === 'string' ? value.scope : undefined,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }
}
