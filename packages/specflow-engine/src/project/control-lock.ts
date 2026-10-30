import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { verifyCheckoutOnDisk, verifyProjectHomeOnDisk } from './disk-verification';
import { resolveProjectHome, type ResolvedProjectHome } from './home/home';
import { unlinkWindowsSafe, readFileWindowsSafe } from './fs/windows-safe-fs';
import { isReadRequest } from './request-verification-memo';
import { assertProjectHomeLockProof, captureProjectHomeLockProof } from './home/lock-proof';

export const PROJECT_CONTROL_LOCK_RELATIVE_PATH = 'engine/control.lock';

// Subscribers can profile contention without modifying the coordinated operation.
const lockTimingChannel = channel('nevo.specflow.engine.control-lock');

/**
 * Lock files this process holds right now (path -> token). A takeover never clears one of them; it is
 * how the operator command tells a lock this process holds from a leftover of an earlier process that
 * had the same PID (containers restart with PID 1 again).
 */
const heldHere = new Map<string, string>();

/** Whether this process holds the control lock of the Project Home at this moment. */
export function holdsProjectControlLock(context: ResolvedProjectHome): boolean {
  return heldHere.has(projectControlLockPath(context));
}

export type ProjectControlLockErrorCode =
  | 'CONTROL_LOCK_BUSY'
  | 'CONTROL_LOCK_CORRUPT'
  | 'CONTROL_LOCK_OWNERSHIP_LOST'
  | 'CONTROL_LOCK_INVALID_HOME';

export class ProjectControlLockError extends Error {
  readonly code: ProjectControlLockErrorCode;

  constructor(code: ProjectControlLockErrorCode, message: string) {
    super(message);
    this.name = 'ProjectControlLockError';
    this.code = code;
  }
}

interface ControlLockRecord {
  readonly version: 1;
  readonly projectId: string;
  readonly token: string;
  readonly pid: number;
  readonly createdAt: string;
}

export type ProjectControlLockInspection =
  | { readonly status: 'free' }
  | {
      readonly status: 'held';
      readonly pid: number;
      readonly createdAt: string;
      /** A PID is only diagnostic, not a proof that an external writer ended. */
    }
  | { readonly status: 'corrupt'; readonly reason: string };

export interface ProjectControlLockOptions {
  /** Maximum time to wait for another short writer; never steals an orphan lock. */
  readonly waitMs?: number;
  readonly retryMs?: number;
}

export function projectControlLockPath(context: ResolvedProjectHome): string {
  return join(context.project.stateRoot, PROJECT_CONTROL_LOCK_RELATIVE_PATH);
}

/** Read-only diagnostics. No age-, PID- or TTL-based lock stealing is supported. */
export async function inspectProjectControlLock(
  context: ResolvedProjectHome,
): Promise<ProjectControlLockInspection> {
  const path = projectControlLockPath(context);
  let source: string;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { status: 'corrupt', reason: 'Control lock is not a regular file.' };
    }

    source = await readFileWindowsSafe(path);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return { status: 'free' };
    }

    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    return { status: 'corrupt', reason: 'Control lock metadata is incomplete or invalid.' };
  }

  if (!isLockRecord(value) || value.projectId !== context.project.projectId) {
    return { status: 'corrupt', reason: 'Control lock has invalid owner/project identity.' };
  }

  return { status: 'held', pid: value.pid, createdAt: value.createdAt };
}

/**
 * One deterministic, OS-process exclusive lock per verified Project Home.
 * Exclusive file creation admits exactly one process. Files left after process
 * death are never removed by timeout; explicit lock recovery is a later gate.
 *
 * The physical proof pinned before acquisition (see {@link attemptProjectControlLock}) goes stale
 * whenever anything legitimately touches the Git/worktree structure while this call waits or holds
 * the lock, including an unrelated operation's own worktree — `CONTROL_LOCK_INVALID_HOME` is this
 * call's signal to recapture and try again, the same as lock contention itself retries, and within
 * the same overall budget. `action` runs only after the recaptured proof is confirmed current, so a
 * retry here never invokes it twice.
 */
export async function withProjectControlLock<T>(
  context: ResolvedProjectHome,
  action: () => Promise<T>,
  options: ProjectControlLockOptions = {},
): Promise<T> {
  const waitMs = options.waitMs ?? 5000;
  const retryMs = options.retryMs ?? 25;
  if (
    !Number.isSafeInteger(waitMs) ||
    !Number.isSafeInteger(retryMs) ||
    waitMs < 0 ||
    retryMs < 1
  ) {
    throw new ProjectControlLockError('CONTROL_LOCK_INVALID_HOME', 'Invalid lock wait settings.');
  }

  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      return await attemptProjectControlLock(context, action, deadline, retryMs);
    } catch (error) {
      if (
        !(error instanceof ProjectControlLockError) ||
        error.code !== 'CONTROL_LOCK_INVALID_HOME' ||
        Date.now() >= deadline
      ) {
        throw error;
      }
      // The proof went stale between attempts; loop back to recapture it fresh.
    }
  }
}

async function attemptProjectControlLock<T>(
  context: ResolvedProjectHome,
  action: () => Promise<T>,
  deadline: number,
  retryMs: number,
): Promise<T> {
  await assertCurrentProjectHome(context);
  // The expensive Git-based authority check is outside the lock.
  // Pin the physical evidence to recheck it without spawning Git after acquisition.
  let homeProof: Awaited<ReturnType<typeof captureProjectHomeLockProof>>;
  try {
    homeProof = await captureProjectHomeLockProof(context);
  } catch {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_INVALID_HOME',
      'Project Home physical authority could not be pinned before acquiring control lock.',
    );
  }

  const dir = join(context.project.stateRoot, 'engine');
  await ensureSafeLockDirectory(context, dir);
  const path = projectControlLockPath(context);
  const token = randomUUID();
  const record: ControlLockRecord = {
    version: 1,
    projectId: context.project.projectId,
    token,
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  const measuring = lockTimingChannel.hasSubscribers;
  const startedAt = measuring ? performance.now() : 0;
  let acquiredAt = 0;
  let file;
  while (true) {
    try {
      file = await open(path, 'wx', 0o600);
      if (measuring) {
        acquiredAt = performance.now();
      }

      break;
    } catch (error) {
      // Windows may report EPERM instead of EEXIST while another process
      // holds an exclusively created lock file. Only treat it as contention
      // when lstat proves the lock path is an existing regular file; a missing
      // path or a permission error with no such proof remains a hard failure.
      // A delete-pending lock (just released while a reader or scanner still holds a handle)
      // reports EPERM/EACCES/EBUSY while lstat already says "missing": also contention.
      const busy =
        isNodeError(error, 'EEXIST') ||
        (process.platform === 'win32' &&
          ['EPERM', 'EACCES', 'EBUSY'].some((code) => isNodeError(error, code)) &&
          ((await isExistingRegularLock(path)) || (await isMissingPath(path))));
      if (!busy) {
        throw error;
      }

      if (Date.now() >= deadline) {
        const inspected = await inspectProjectControlLock(context);

        throw new ProjectControlLockError(
          inspected.status === 'corrupt' ? 'CONTROL_LOCK_CORRUPT' : 'CONTROL_LOCK_BUSY',
          inspected.status === 'corrupt'
            ? 'Control lock needs explicit recovery. No automatic lock deletion is safe.'
            : 'Another process owns the project control lock; retry after it settles.',
        );
      }

      await sleep(Math.min(retryMs, Math.max(1, deadline - Date.now())));
    }
  }

  try {
    // If killed between exclusive create and durable metadata publication, a
    // partial lock remains as recovery-required rather than becoming free.
    heldHere.set(path, token);
    await file.writeFile(JSON.stringify(record) + '\n', 'utf8');
    await file.sync();
    await file.close();

    const outcome = await (async () => {
      try {
        await assertProjectHomeLockProof(context, homeProof);
      } catch {
        throw new ProjectControlLockError(
          'CONTROL_LOCK_INVALID_HOME',
          'Project Home or Git worktree identity changed while waiting for control lock.',
        );
      }

      return action();
    })().then(
      (value) => ({ success: true as const, value }),
      (error: unknown) => ({ success: false as const, error }),
    );

    let releaseFailure: unknown;
    try {
      await releaseOwnedLock(path, token);
    } catch (error) {
      releaseFailure = error;
    } finally {
      heldHere.delete(path);
    }

    // Publish only after releasing the file; diagnostics must never break an operation.
    if (measuring) {
      try {
        lockTimingChannel.publish({
          projectId: context.project.projectId,
          waitMs: acquiredAt - startedAt,
          heldMs: performance.now() - acquiredAt,
          released: releaseFailure === undefined,
        });
      } catch {
        // Diagnostic subscribers are untrusted observers, not lock participants.
      }
    }

    if (releaseFailure !== undefined) {
      if (!outcome.success) {
        throw new AggregateError(
          [outcome.error, releaseFailure],
          'Operation failed and its control lock could not be released safely.',
        );
      }

      if (releaseFailure instanceof Error) {
        throw releaseFailure;
      }

      throw new Error('Control lock release failed with a non-Error value.', {
        cause: releaseFailure,
      });
    }

    if (!outcome.success) {
      throw outcome.error;
    }

    return outcome.value;
  } catch (error) {
    // A failed metadata write leaves a visible recovery artifact. Do not
    // silently unlink a possibly-published lock after an uncertain failure.
    heldHere.delete(path);
    await file.close().catch(() => undefined);

    throw error;
  }
}

async function isMissingPath(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return false;
  } catch (error) {
    return isNodeError(error, 'ENOENT');
  }
}

async function isExistingRegularLock(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ProjectControlLockError(
        'CONTROL_LOCK_CORRUPT',
        'Control lock is not a regular file. Explicit recovery is required.',
      );
    }

    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return false;
    }

    throw error;
  }
}

async function releaseOwnedLock(path: string, token: string): Promise<void> {
  // Do not unlink a path replaced by another actor. Cooperative same-OS
  // account processes do not modify one another's lock files.
  let existing: unknown;
  try {
    existing = JSON.parse(await readFileWindowsSafe(path)) as unknown;
  } catch {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_OWNERSHIP_LOST',
      'Control lock is unreadable; refusing to release an unknown owner.',
    );
  }

  if (!isLockRecord(existing) || existing.token !== token) {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_OWNERSHIP_LOST',
      'Control lock ownership changed; refusing to release another writer.',
    );
  }

  await unlinkWindowsSafe(path);
}

async function ensureSafeLockDirectory(context: ResolvedProjectHome, dir: string): Promise<void> {
  const state = await lstat(context.project.stateRoot);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_INVALID_HOME',
      'Project state root must be a physical directory.',
    );
  }

  if ((await realpath(context.project.stateRoot)) !== context.project.stateRoot) {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_INVALID_HOME',
      'Project state root changed or is redirected.',
    );
  }

  try {
    await mkdir(dir, { mode: 0o700 });
  } catch (error) {
    if (!isNodeError(error, 'EEXIST')) {
      throw error;
    }
  }

  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(dir)) !== dir) {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_INVALID_HOME',
      'Project control directory must not be a symlink or redirected path.',
    );
  }
}

async function assertCurrentProjectHome(context: ResolvedProjectHome): Promise<void> {
  try {
    if (isReadRequest()) {
      // Git-free mutation: on-disk evidence only (see request-verification-memo).
      await verifyProjectHomeOnDisk(context);
      await verifyCheckoutOnDisk(context, context.workspace.root);

      return;
    }

    const current = await resolveProjectHome({
      cwd: context.workspace.root,
      projectRoot: context.project.homeRoot,
    });
    if (
      current.project.projectId !== context.project.projectId ||
      current.project.gitCommonDir !== context.project.gitCommonDir ||
      current.project.stateRoot !== context.project.stateRoot
    ) {
      throw new ProjectControlLockError(
        'CONTROL_LOCK_INVALID_HOME',
        'Project Home identity changed; refuse to coordinate under the old state root.',
      );
    }
  } catch (error) {
    if (error instanceof ProjectControlLockError) {
      throw error;
    }

    throw new ProjectControlLockError(
      'CONTROL_LOCK_INVALID_HOME',
      'Project Home cannot be revalidated before a coordinated mutation.',
    );
  }
}

function isLockRecord(value: unknown): value is ControlLockRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    obj.version === 1 &&
    typeof obj.projectId === 'string' &&
    typeof obj.token === 'string' &&
    /^[0-9a-f-]{36}$/iu.test(obj.token) &&
    Number.isSafeInteger(obj.pid) &&
    (obj.pid as number) > 0 &&
    typeof obj.createdAt === 'string' &&
    !Number.isNaN(Date.parse(obj.createdAt))
  );
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
