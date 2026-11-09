import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Name of the single-writer lock file inside an index directory. */
export const WRITER_LOCK_FILE = 'writer.lock';

/**
 * How the lock decides that a holder is gone. A lock whose owner process is not alive is stale. A
 * lock without a readable owner record (its writer died between creating and filling the file) is
 * stale once it is older than `unparsableStaleAfterMs`.
 */
export interface WriterLockDependencies {
  readonly pid: number;
  readonly isProcessAlive: (pid: number) => boolean;
  readonly now: () => number;
  readonly unparsableStaleAfterMs: number;
}

export type WriterLockAttempt =
  | { readonly status: 'acquired'; readonly release: () => Promise<void> }
  | { readonly status: 'busy'; readonly message: string };

interface LockRecord {
  readonly pid: number;
  readonly token: string;
}

/**
 * Takes the writer lock of `directory` without waiting. The lock is a file created exclusively
 * (`wx`); a stale lock is removed and the exclusive create is tried once more, so of two writers
 * reclaiming the same stale lock at most one gets it. Release removes the file only while it still
 * carries this holder's token. Filesystem errors other than "exists" or "gone" are thrown.
 */
export async function tryAcquireWriterLock(
  directory: string,
  token: string,
  dependencies: WriterLockDependencies,
): Promise<WriterLockAttempt> {
  const path = join(directory, WRITER_LOCK_FILE);
  const record = JSON.stringify({ pid: dependencies.pid, token } satisfies LockRecord);
  const acquired: WriterLockAttempt = {
    status: 'acquired',
    release: () => releaseLock(path, token),
  };

  if (await createExclusive(path, record)) {
    return acquired;
  }

  const holder = await inspectHolder(path, dependencies);
  if (holder.status === 'held') {
    return { status: 'busy', message: `The index is being written by ${holder.owner}.` };
  }

  if (holder.status === 'stale') {
    await unlinkIfPresent(path);
  }

  return (await createExclusive(path, record))
    ? acquired
    : { status: 'busy', message: 'Another writer took the index lock.' };
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

export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | undefined)?.code;

  return typeof code === 'string' ? code : undefined;
}

async function createExclusive(path: string, content: string): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: 'wx' });

    return true;
  } catch (error) {
    if (errorCode(error) === 'EEXIST') {
      return false;
    }

    throw error;
  }
}

type Holder =
  | { readonly status: 'held'; readonly owner: string }
  | { readonly status: 'stale' }
  | { readonly status: 'gone' };

async function inspectHolder(path: string, dependencies: WriterLockDependencies): Promise<Holder> {
  const content = await readIfPresent(path);
  if (content === undefined) {
    return { status: 'gone' };
  }

  const record = parseRecord(content);
  if (record) {
    return dependencies.isProcessAlive(record.pid)
      ? { status: 'held', owner: `process ${record.pid}` }
      : { status: 'stale' };
  }

  let modifiedAt: number;
  try {
    modifiedAt = (await stat(path)).mtimeMs;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { status: 'gone' };
    }

    throw error;
  }

  return dependencies.now() - modifiedAt > dependencies.unparsableStaleAfterMs
    ? { status: 'stale' }
    : { status: 'held', owner: 'a writer that is starting' };
}

async function releaseLock(path: string, token: string): Promise<void> {
  const content = await readIfPresent(path);
  if (content !== undefined && parseRecord(content)?.token === token) {
    await unlinkIfPresent(path);
  }
}

function parseRecord(content: string): LockRecord | undefined {
  try {
    const value = JSON.parse(content) as Partial<LockRecord> | null;

    return typeof value?.pid === 'number' &&
      Number.isInteger(value.pid) &&
      typeof value.token === 'string'
      ? { pid: value.pid, token: value.token }
      : undefined;
  } catch {
    return undefined;
  }
}

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return undefined;
    }

    throw error;
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
