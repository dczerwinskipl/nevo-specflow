import { readFile, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Name of the single-writer lock file inside an index directory. */
export const WRITER_LOCK_FILE = 'writer.lock';

/**
 * Inputs of the stale-lock rule. A held lock is refreshed (its mtime touched) every quarter of
 * `staleAfterMs`; a lock is stale when
 *
 * - its owner process is not alive, or
 * - its owner pid is this process but this process does not hold its token (a reused pid, for
 *   example PID 1 in a restarted container), or
 * - it was not refreshed for `staleAfterMs` (any other reused pid, a holder whose heartbeat stopped,
 *   or a lock whose writer died before writing its owner record).
 */
export interface WriterLockDependencies {
  readonly pid: number;
  readonly isProcessAlive: (pid: number) => boolean;
  readonly now: () => number;
  readonly staleAfterMs: number;
}

export type WriterLockAttempt =
  | { readonly status: 'acquired'; readonly release: () => Promise<void> }
  | { readonly status: 'busy'; readonly message: string };

interface LockRecord {
  readonly pid: number;
  readonly token: string;
}

/** Tokens of the locks this process holds, across store instances. */
const heldTokens = new Set<string>();

/**
 * Takes the writer lock of `directory` without waiting. The lock is a file created exclusively
 * (`wx`); a stale lock is removed and the exclusive create is tried once more. Two writers that
 * reclaim the same stale lock at the same moment can both succeed; the store's writes stay complete
 * pairs and its cleanup removes only provably superseded or abandoned files, so the worst outcome is
 * a lost update that the next refresh redoes. `release` stops the heartbeat and removes the file
 * while it still carries this holder's token. Filesystem errors other than "exists" or "gone" are
 * thrown.
 */
export async function tryAcquireWriterLock(
  directory: string,
  token: string,
  dependencies: WriterLockDependencies,
): Promise<WriterLockAttempt> {
  const path = join(directory, WRITER_LOCK_FILE);
  const record = JSON.stringify({ pid: dependencies.pid, token } satisfies LockRecord);

  if (!(await createExclusive(path, record))) {
    const holder = await inspectHolder(path, dependencies);
    if (holder.status === 'held') {
      return { status: 'busy', message: `The index is being written by ${holder.owner}.` };
    }

    if (holder.status === 'stale') {
      await unlinkIfPresent(path);
    }

    if (!(await createExclusive(path, record))) {
      return { status: 'busy', message: 'Another writer took the index lock.' };
    }
  }

  heldTokens.add(token);
  const heartbeat = setInterval(
    () => {
      const touchedAt = new Date(dependencies.now());
      // A failed touch only lets the lock become stale earlier; the store stays consistent then.
      utimes(path, touchedAt, touchedAt).catch(() => undefined);
    },
    Math.max(1, Math.floor(dependencies.staleAfterMs / 4)),
  );
  heartbeat.unref();

  return {
    status: 'acquired',
    async release() {
      clearInterval(heartbeat);
      heldTokens.delete(token);
      const content = await readIfPresent(path);
      if (content !== undefined && parseRecord(content)?.token === token) {
        await unlinkIfPresent(path);
      }
    },
  };
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
  let content: string | undefined;
  let refreshedAt: number;
  try {
    content = await readIfPresent(path);
    refreshedAt = (await stat(path)).mtimeMs;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { status: 'gone' };
    }

    throw error;
  }

  if (content === undefined) {
    return { status: 'gone' };
  }

  if (dependencies.now() - refreshedAt > dependencies.staleAfterMs) {
    return { status: 'stale' };
  }

  const record = parseRecord(content);
  if (!record) {
    return { status: 'held', owner: 'a writer that is starting' };
  }

  const reusedOwnPid = record.pid === dependencies.pid && !heldTokens.has(record.token);

  return reusedOwnPid || !dependencies.isProcessAlive(record.pid)
    ? { status: 'stale' }
    : { status: 'held', owner: `process ${record.pid}` };
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
