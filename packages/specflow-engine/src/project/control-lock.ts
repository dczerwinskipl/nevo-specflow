import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { verifyCheckoutOnDisk, verifyProjectHomeOnDisk } from './disk-verification';
import { resolveProjectHome, type ResolvedProjectHome } from './home/home';
import { unlinkWindowsSafe, readFileWindowsSafe } from './fs/windows-safe-fs';
import {
  forgetOperationVerification,
  isReadRequest,
  provenInOperation,
  rememberProvenInOperation,
} from './request-verification-memo';
import { assertProjectHomeLockProof, captureProjectHomeLockProof } from './home/lock-proof';
import {
  isExecutorIdentity,
  ownExecutorIdentity,
  nodeProcessTable,
  proveExecutorState,
  type ExecutorIdentity,
  type ProcessTable,
} from '../specs/durable/executor-identity';

export const PROJECT_CONTROL_LOCK_RELATIVE_PATH = 'engine/control.lock';

// Subscribers can profile contention without modifying the coordinated operation.
const lockTimingChannel = channel('nevo.specflow.engine.control-lock');
const releaseChannel = channel('nevo.specflow.engine.control-lock-abandoned');

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
  /**
   * Who holds the lock: host, platform, PID and, where the OS supplies it, the process start time.
   * The evidence that the holder is gone (`releaseAbandonedProjectControlLock`). Absent on a lock
   * written before the owner was recorded: then only an absent PID is evidence.
   */
  readonly owner?: ExecutorIdentity;
}

export type ProjectControlLockInspection =
  | { readonly status: 'free' }
  | {
      readonly status: 'held';
      readonly pid: number;
      readonly createdAt: string;
      readonly owner?: ExecutorIdentity;
    }
  | { readonly status: 'corrupt'; readonly reason: string };

export interface ProjectControlLockOptions {
  /**
   * Maximum time to wait for another short writer. A lock whose holder is provably gone is
   * released while waiting (`releaseAbandonedProjectControlLock`); a live or unknown holder never is.
   */
  readonly waitMs?: number;
  readonly retryMs?: number;
}

/** While waiting, how often the holder of a busy lock is checked for positive evidence that it is gone. */
const OWNER_CHECK_MS = 1000;

export function projectControlLockPath(context: ResolvedProjectHome): string {
  return join(context.project.stateRoot, PROJECT_CONTROL_LOCK_RELATIVE_PATH);
}

/** Read-only diagnostics. No age- or TTL-based lock stealing is supported. */
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

  return {
    status: 'held',
    pid: value.pid,
    createdAt: value.createdAt,
    ...(value.owner ? { owner: value.owner } : {}),
  };
}

/**
 * Why a held lock is kept: its holder runs (`holder-alive`, `held-by-this-process`), or nothing
 * proves it gone (`holder-unknown`: another host or platform, a live PID whose start time cannot be
 * compared; `corrupt`: no readable owner at all), or it changed while it was judged. Only an
 * operator clears `holder-unknown` and `corrupt`
 * (`nevo-specflow specs documents recover --confirmed-stopped`).
 */
export type AbandonedLockKeptReason =
  'held-by-this-process' | 'holder-alive' | 'holder-unknown' | 'corrupt' | 'changed';

export type AbandonedLockRelease =
  | { readonly status: 'free' }
  | {
      readonly status: 'released';
      readonly holder: { readonly pid: number; readonly createdAt: string };
    }
  | { readonly status: 'kept'; readonly reason: AbandonedLockKeptReason };

export interface AbandonedLockOptions {
  /** The OS process table (seam). */
  readonly table?: ProcessTable;
  /** This process's identity (seam); defaults to the one it writes into its own locks. */
  readonly own?: ExecutorIdentity;
}

/**
 * Releases the control lock ONLY on positive evidence that its holder is gone (ADR 0027: a lock is
 * released only on positive evidence that its owner is gone). The evidence is the dead proof of the
 * recorded owner (`proveExecutorState`), the same PID-and-start-time evidence as the native stop of
 * an agent's processes:
 *
 * - its PID is not running on this host (`ESRCH`, or no `/proc/<pid>` in the same PID namespace);
 * - a different process now has its PID: another start time (Linux `/proc` start time, Windows
 *   creation time) or another boot;
 * - it names this very process and thread, which does not hold it (a section of this process that
 *   failed after creating the file).
 *
 * A lock written before the owner was recorded has only a PID: an absent PID is the evidence. A
 * live holder is never released, and neither is one that cannot be judged (another host or
 * platform, a live PID without a comparable start time, unreadable metadata): fail closed. The file
 * is read again just before the removal and must be byte-identical to the one judged.
 */
export async function releaseAbandonedProjectControlLock(
  context: ResolvedProjectHome,
  options: AbandonedLockOptions = {},
): Promise<AbandonedLockRelease> {
  const path = projectControlLockPath(context);
  let before: string;
  try {
    before = await readFileWindowsSafe(path);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return { status: 'free' };
    }

    throw error;
  }

  const inspected = await inspectProjectControlLock(context);
  if (inspected.status === 'free') {
    return { status: 'free' };
  }

  if (inspected.status === 'corrupt') {
    return { status: 'kept', reason: 'corrupt' };
  }

  if (heldHere.has(path)) {
    return { status: 'kept', reason: 'held-by-this-process' };
  }

  const table = options.table ?? nodeProcessTable;
  const verdict = await judgeOwner(inspected, options.own ?? (await ownExecutorIdentity()), table);
  if (verdict !== 'gone') {
    return { status: 'kept', reason: verdict };
  }

  // The record must still be the one judged: a holder that released it and another that took it is left alone.
  const after = await readFileWindowsSafe(path).catch(() => undefined);
  if (after !== before || heldHere.has(path)) {
    return { status: 'kept', reason: 'changed' };
  }

  await unlinkWindowsSafe(path);
  if (releaseChannel.hasSubscribers) {
    try {
      releaseChannel.publish({ projectId: context.project.projectId, pid: inspected.pid });
    } catch {
      // Diagnostic subscribers are observers.
    }
  }

  return { status: 'released', holder: { pid: inspected.pid, createdAt: inspected.createdAt } };
}

async function judgeOwner(
  held: Extract<ProjectControlLockInspection, { status: 'held' }>,
  own: ExecutorIdentity,
  table: ProcessTable,
): Promise<'gone' | 'holder-alive' | 'holder-unknown'> {
  if (!held.owner) {
    // Written before the owner was recorded: only an absent PID (never this process's own) is evidence.
    if (held.pid === own.pid) {
      return 'holder-unknown';
    }

    const probed = table.probe?.(held.pid) ?? 'unknown';

    return probed === 'dead' ? 'gone' : probed === 'alive' ? 'holder-alive' : 'holder-unknown';
  }

  switch (await proveExecutorState(held.owner, own, table)) {
    case 'dead':
      return 'gone';
    case 'self':
      // This very process and thread, which does not hold it (checked by the caller).
      return 'gone';
    case 'alive':
      return 'holder-alive';
    default:
      return 'holder-unknown';
  }
}

/**
 * One deterministic, OS-process exclusive lock per verified Project Home.
 * Exclusive file creation admits exactly one process. Files left after process
 * death are never removed by timeout: only on positive evidence that the holder is gone
 * (`releaseAbandonedProjectControlLock`, also while waiting here), or by an operator.
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
  // The expensive Git-based authority check is outside the lock.
  // Pin the physical evidence to recheck it without spawning Git after acquisition.
  const homeProof = await proveProjectHome(context);

  const dir = join(context.project.stateRoot, 'engine');
  await ensureSafeLockDirectory(context, dir);
  const path = projectControlLockPath(context);
  const token = randomUUID();
  const owner = await ownExecutorIdentity();
  const record: ControlLockRecord = {
    version: 1,
    projectId: context.project.projectId,
    token,
    pid: owner.pid,
    createdAt: new Date().toISOString(),
    owner,
  };
  const measuring = lockTimingChannel.hasSubscribers;
  const startedAt = measuring ? performance.now() : 0;
  let acquiredAt = 0;
  let file;
  let ownerCheckedAt: number | undefined;
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

      // A holder that is provably gone (a crashed Runtime or CLI) is released and the lock is tried
      // again at once; a live or unknown holder is waited for, never stolen.
      if (ownerCheckedAt === undefined || Date.now() - ownerCheckedAt >= OWNER_CHECK_MS) {
        ownerCheckedAt = Date.now();
        const released = await releaseAbandonedProjectControlLock(context).catch(() => undefined);
        if (released?.status === 'released' || released?.status === 'free') {
          continue;
        }
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

      try {
        return await action();
      } finally {
        // Exit clear: a checkout verified in this section is not trusted after it: the next lookup
        // of the same workflow mutation (its post action, outside any lock) verifies it again. The
        // entry clear in `proveProjectHome` cannot cover this: the post action runs outside any
        // section, so no admission follows before its lookups.
        forgetOperationVerification({ keepHome: true });
      }
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

type HomeProof = Awaited<ReturnType<typeof captureProjectHomeLockProof>>;

const PROVEN_HOME = 'control-lock-home-proof';

/**
 * The Git-based authority check of an admission and the physical evidence pinned after it. A later
 * admission of the same workflow mutation (`runVerifiedMutation`: the finish's own lock section,
 * then each stage of its manual commit) skips the Git check only when the physical evidence it pins
 * now is exactly the evidence the operation last proved with Git; anything that differs (a stale
 * proof, the retry of `withProjectControlLock`) is proved with Git afresh.
 */
async function proveProjectHome(context: ResolvedProjectHome): Promise<HomeProof> {
  const proven = provenInOperation<HomeProof>(PROVEN_HOME);
  if (proven !== undefined) {
    const current = await pinProjectHome(context);
    if (isDeepStrictEqual(current, proven)) {
      // Same home evidence: its Git answers hold, but every checkout is verified again (a checkout's
      // identity marker or ignore rules can change without changing this evidence).
      forgetOperationVerification({ keepHome: true });

      return current;
    }

    // The evidence moved: nothing this operation verified is trusted any more.
    forgetOperationVerification({ keepHome: false });
  } else {
    // The first admission: nothing verified before the lock is trusted inside it (the home is
    // asked of Git afresh below). Entry clear: the exit clear of a previous section cannot cover
    // this, because lookups between sections (the first plan, a post action) verify outside a lock.
    forgetOperationVerification({ keepHome: true });
  }

  await assertCurrentProjectHome(context);
  const proof = await pinProjectHome(context);
  rememberProvenInOperation(PROVEN_HOME, proof);

  return proof;
}

async function pinProjectHome(context: ResolvedProjectHome): Promise<HomeProof> {
  try {
    return await captureProjectHomeLockProof(context);
  } catch {
    throw new ProjectControlLockError(
      'CONTROL_LOCK_INVALID_HOME',
      'Project Home physical authority could not be pinned before acquiring control lock.',
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
      // Asked of Git afresh; the operation's later membership checks reuse these answers.
      refresh: true,
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
    !Number.isNaN(Date.parse(obj.createdAt)) &&
    (obj.owner === undefined || (isExecutorIdentity(obj.owner) && obj.owner.pid === obj.pid))
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
