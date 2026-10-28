import { createHash } from 'node:crypto';
import { chmod, link, mkdir, open, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { syncDirectoryWhenSupported } from '../../../project/fs/atomic-json';
import { renameWindowsSafe } from '../../../project/fs/windows-safe-fs';
import { sha256Hex } from '../../../hash';
import { errnoCode, isAbsent } from '../../document-rules/errno';
import { DocumentError } from '../../document-rules/errors';
import {
  assertContainedRelativePath,
  nodeVerifiedFs,
  readAt,
  samePhysicalPath,
  withOpenFile,
  type VerifiedFs,
} from '../../document-rules/verified-file';
import { documentChangeError } from '../changes/errors';
import type { FileState, PlannedPath } from '../changes/plan/model';
import { RAW_CONTENT_MAX_BYTES } from '../limits';
import { DOCUMENT_TEMP_NAME_LENGTH } from './path-bound';

const HASH_CHUNK_BYTES = 256 * 1024;

/**
 * The filesystem effects of a document write, as a seam. The production implementation is the Node
 * one; tests wrap it to inject a failure at any effect. Reads of the targets go through the verified
 * primitives of the document rules (no symlink is followed, special files are refused).
 */
export interface DocumentFileOps {
  readonly verified: VerifiedFs;
  /** Creates ONE directory; an existing one is an `EEXIST` error. */
  mkdir(path: string): Promise<void>;
  /** Creates `path` exclusively, writes all bytes and flushes them to the device. */
  writeStaged(path: string, bytes: Uint8Array): Promise<void>;
  /** Atomically replaces `to` (Windows-safe). */
  rename(from: string, to: string): Promise<void>;
  /** Removes a file; absent is fine. */
  remove(path: string): Promise<void>;
  /** Flushes a directory where the platform supports it. */
  syncDirectory(path: string): Promise<void>;
  /** A second name for the same file (a hard link). */
  link(existing: string, created: string): Promise<void>;
  /** Sets the permission bits of a file (a no-op where the platform has none). */
  chmod(path: string, mode: number): Promise<void>;
  /** The names in a directory; an absent directory has none. */
  list(path: string): Promise<string[]>;
}

export const nodeDocumentFileOps: DocumentFileOps = {
  verified: nodeVerifiedFs,
  mkdir: async (path) => {
    await mkdir(path);
  },
  writeStaged: async (path, bytes) => {
    const handle = await open(path, 'wx', 0o644);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename: (from, to) => renameWindowsSafe(from, to),
  remove: async (path) => {
    await rm(path, { force: true, maxRetries: 3, retryDelay: 50 });
  },
  syncDirectory: (path) => syncDirectoryWhenSupported(path),
  link: (existing, created) => link(existing, created),
  chmod: async (path, mode) => {
    // Windows keeps one read-only bit and no execute bit: there is no mode to carry over.
    if (process.platform !== 'win32') await chmod(path, mode);
  },
  list: async (path) => {
    try {
      return await readdir(path);
    } catch (error) {
      if (isAbsent(error)) return [];
      throw error;
    }
  },
};

/** A path that exists but is not a regular file (a directory, a link, a special file). */
export const NOT_REGULAR = 'not-regular';
export type ObservedState = FileState | typeof NOT_REGULAR;

/**
 * The content hash and size of a file of the Specification directory, `null` when it is absent,
 * {@link NOT_REGULAR} when something else is there. The file is streamed through the verified open.
 */
export async function observePath(
  ops: DocumentFileOps,
  specDir: string,
  relativePath: string,
): Promise<ObservedState> {
  const outcome = await withOpenFile(ops.verified, specDir, relativePath, async (open) => {
    const hash = createHash('sha256');
    let position = 0;
    for (;;) {
      const chunk = await readAt(open.handle, position, HASH_CHUNK_BYTES);
      if (chunk.length === 0) break;
      hash.update(chunk);
      position += chunk.length;
    }
    return { sha256: hash.digest('hex'), bytes: position };
  });
  if (outcome.state !== 'opened') return outcome.state === 'absent' ? null : NOT_REGULAR;
  return outcome.value;
}

/**
 * The whole file as bytes; used for the bytes a move carries from its origin. A file over the raw
 * content limit is refused (`DOCUMENT_TOO_LARGE`) before any of it is allocated.
 */
export async function readFileBytes(
  ops: DocumentFileOps,
  specDir: string,
  relativePath: string,
): Promise<Buffer | undefined> {
  const tooLarge = () => documentChangeError('too-large', 'The document to move is too large.');
  const outcome = await withOpenFile(ops.verified, specDir, relativePath, async (open) => {
    if (open.stat.size > BigInt(RAW_CONTENT_MAX_BYTES)) throw tooLarge();
    const parts: Buffer[] = [];
    let position = 0;
    for (;;) {
      const chunk = await readAt(open.handle, position, HASH_CHUNK_BYTES);
      if (chunk.length === 0) break;
      parts.push(chunk);
      position += chunk.length;
      if (position > RAW_CONTENT_MAX_BYTES) throw tooLarge();
    }
    return Buffer.concat(parts);
  });
  return outcome.state === 'opened' ? outcome.value : undefined;
}

export function sameFileState(left: ObservedState, right: FileState): boolean {
  if (left === NOT_REGULAR) return false;
  if (left === null || right === null) return left === right;
  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

/** Where a path is relative to what the plan expects. */
export type PathDisposition = 'at-pre' | 'at-post' | 'foreign';

export function dispositionOf(
  current: ObservedState,
  planned: Pick<PlannedPath, 'pre' | 'post'>,
): PathDisposition {
  // `post` first: a replay of a path that is already in place must not look like a foreign edit.
  if (sameFileState(current, planned.post)) return 'at-post';
  if (sameFileState(current, planned.pre)) return 'at-pre';
  return 'foreign';
}

/** A path of the plan relative to the Specification directory. */
export function relativeToDirectory(directory: string, path: string): string {
  return path.slice(directory.length + 1);
}

/** Six hexadecimal characters that identify an operation inside the names of its stage files. */
function operationTag(operationId: string): string {
  return sha256Hex(operationId).slice(0, 6);
}

/** Names of the backup links (`.nb`), where the index of the path starts in one, and what a kept foreign backup is renamed to. */
export const BACKUP_PREFIX = '.nb';
export const BACKUP_INDEX_START = 9;
export const FOREIGN_BACKUP_PREFIX = '.nf';

/** The shape of every stage name: `.nv` (stage) or `.nb` (backup), operation tag, path index, executor tag. */
const STAGE_NAME = /^\.n[vb]([0-9a-f]{6})[0-9a-f]{2}[0-9a-f]{5}$/u;

/**
 * The short name of the stage file (or, with `'backup'`, of the backup link) of the path at `index`
 * of an operation, written by the executor whose short `executorTag` (five hexadecimal characters) is
 * given: 16 characters, at most {@link DOCUMENT_TEMP_NAME_LENGTH}. Two executors of one operation never
 * share a name, so one cannot replace the half-written file of the other; and every name of an
 * operation carries its tag, so what a dead executor left behind is found by pattern.
 */
export function stagedFileName(
  operationId: string,
  index: number,
  executorTag: string,
  role: 'stage' | 'backup' = 'stage',
): string {
  const name =
    (role === 'stage' ? '.nv' : '.nb') +
    operationTag(operationId) +
    index.toString(16).padStart(2, '0') +
    executorTag;
  if (name.length > DOCUMENT_TEMP_NAME_LENGTH || !STAGE_NAME.test(name)) {
    throw new Error('Staged name out of shape.');
  }
  return name;
}

/** Whether a directory entry is a stage or backup file of this operation, by any executor. */
export function isStageFileOf(operationId: string, name: string): boolean {
  return STAGE_NAME.exec(name)?.[1] === operationTag(operationId);
}

/** Removes the stage and backup files of an operation (any executor) from one directory. */
export async function removeStageFiles(
  ops: DocumentFileOps,
  directory: string,
  operationId: string,
): Promise<void> {
  for (const name of await ops.list(directory)) {
    if (isStageFileOf(operationId, name)) await ops.remove(join(directory, name));
  }
}

function unavailable(): DocumentError {
  return new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'A document path leaves the Specification.');
}

/**
 * Makes the parent directories of a target exist as real directories: each missing one is created,
 * each existing one must be a directory and no link, and the final parent must be its physical path.
 */
export async function ensureParentDirectories(
  ops: DocumentFileOps,
  specDir: string,
  relativePath: string,
): Promise<void> {
  const segments = assertContainedRelativePath(relativePath).slice(0, -1);
  let current = specDir;
  for (const segment of segments) {
    current = join(current, segment);
    let stat = await ops.verified.lstat(current).catch((error: unknown) => {
      if (isAbsent(error)) return undefined;
      throw error;
    });
    if (stat === undefined) {
      await ops.mkdir(current).catch((error: unknown) => {
        if (errnoCode(error) !== 'EEXIST') throw error;
      });
      stat = await ops.verified.lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
  }
  if (segments.length > 0) {
    const real = await ops.verified.realpath(current);
    if (!samePhysicalPath(real, current)) throw unavailable();
  }
}

/**
 * Stands for the death of the process at one point of a write: a test throws it from an observer to
 * cut the writer there. The writer lets it pass untouched (a dead process cleans up nothing and
 * records nothing), so what is left on disk is what a real crash leaves. Production never throws it.
 */
export class WriterInterrupted extends Error {
  readonly point: string;

  constructor(point: string) {
    super('The writer was interrupted at ' + point + '.');
    this.name = 'WriterInterrupted';
    this.point = point;
  }
}

/** The effects the writer reports to its observer, in the order they happen. */
export type PathEffectKind = 'staged' | 'before-replace' | 'replaced' | 'removed';

export interface PathEffectEvent {
  readonly kind: PathEffectKind;
  /** The index of the path in the plan. */
  readonly index: number;
  readonly path: string;
}

export interface ApplyPathContext {
  readonly ops: DocumentFileOps;
  readonly specDir: string;
  readonly directory: string;
  readonly operationId: string;
  /** Five hexadecimal characters that tell this executor's stage files from another's. */
  readonly executorTag: string;
  readonly index: number;
  /** The path (relative to the Specification) of the file a moved path takes its permission bits from. */
  readonly modeFrom?: string;
  /** Awaited at each step; a test uses it to cut the process at that point. */
  readonly observe?: (event: PathEffectEvent) => Promise<void>;
}

export type PathOutcome =
  | { readonly kind: 'applied' }
  /** The path was already in its post state. */
  | { readonly kind: 'already' }
  /** The path is neither at pre nor at post: it was edited by someone else. The foreign bytes are kept. */
  | { readonly kind: 'foreign' };

/** Why a hard link may be unavailable (no support, another device, no permission): the plain path is used. */
const LINK_UNAVAILABLE = new Set([
  'EPERM',
  'EACCES',
  'ENOTSUP',
  'EOPNOTSUPP',
  'ENOSYS',
  'EXDEV',
  'EMLINK',
  'EINVAL',
]);

/** Gives the target a second name; `false` where the filesystem cannot. */
async function tryBackupLink(
  ops: DocumentFileOps,
  target: string,
  backup: string,
): Promise<boolean> {
  await ops.remove(backup);
  try {
    await ops.link(target, backup);
    return true;
  } catch (error) {
    if (LINK_UNAVAILABLE.has(errnoCode(error) ?? '')) return false;
    throw error;
  }
}

/**
 * Brings one path of a plan from `pre` to `post` and reports what it found. The target is hashed
 * before the stage file is made and AGAIN immediately before the replacement, so an edit in between
 * is `foreign` and the stage file is withdrawn. A path already at `post` is `already` (a roll-forward
 * never writes twice). The bytes come from `content` (payload or moved-from origin) and must hash to
 * `post`.
 *
 * The window between that second hash and the system call is closed as far as a file system allows: a
 * hard link to the target is made first, and after the replacement the LINK is hashed. An in-place
 * write that landed in the window is in the link (same file); the link is then moved back over the
 * target, so the foreign bytes are kept, and the path is `foreign`. A foreign atomic replacement that
 * lands in the gap between the link and the replacement is not seen (best effort, not a guarantee), and
 * where links are unavailable (no support, another device, no permission) only the two hashes protect.
 */
export async function applyPlannedPath(
  context: ApplyPathContext,
  planned: PlannedPath,
  content: () => Promise<Uint8Array>,
): Promise<PathOutcome> {
  const { ops, specDir, directory } = context;
  const relative = relativeToDirectory(directory, planned.path);
  const full = join(specDir, ...relative.split('/'));
  const parent = dirname(full);
  const event = (kind: PathEffectKind): Promise<void> =>
    context.observe?.({ kind, index: context.index, path: planned.path }) ?? Promise.resolve();
  const nameOf = (role: 'stage' | 'backup'): string =>
    stagedFileName(context.operationId, context.index, context.executorTag, role);
  const backupRelative = [...relative.split('/').slice(0, -1), nameOf('backup')].join('/');

  const first = dispositionOf(await observePath(ops, specDir, relative), planned);
  if (first === 'at-post') return { kind: 'already' };
  if (first === 'foreign') return { kind: 'foreign' };

  /** After the change: the backup must still hold `pre`; otherwise the foreign bytes go back. */
  const verifyBackup = async (backup: string): Promise<boolean> => {
    const held = await observePath(ops, specDir, backupRelative);
    if (sameFileState(held, planned.pre)) {
      await ops.remove(backup);
      return true;
    }
    await ops.rename(backup, full);
    await ops.syncDirectory(parent);
    return false;
  };

  if (planned.post === null) {
    await event('before-replace');
    const again = dispositionOf(await observePath(ops, specDir, relative), planned);
    if (again === 'foreign') return { kind: 'foreign' };
    const backup = join(parent, nameOf('backup'));
    const linked = await tryBackupLink(ops, full, backup);
    try {
      await ops.remove(full);
    } catch (error) {
      if (linked && !(error instanceof WriterInterrupted)) {
        await ops.remove(backup).catch(() => undefined);
      }
      throw error;
    }
    if (linked && !(await verifyBackup(backup))) return { kind: 'foreign' };
    await ops.syncDirectory(parent);
    await event('removed');
    return { kind: 'applied' };
  }

  const bytes = await content();
  if (bytes.length !== planned.post.bytes || sha256Hex(bytes) !== planned.post.sha256) {
    throw new DocumentError(
      'DOCUMENT_RECOVERY_REQUIRED',
      'The content of a document is not the one the plan names.',
      { cause: 'payload-unprovable' },
    );
  }
  await ensureParentDirectories(ops, specDir, relative);
  const staged = join(parent, nameOf('stage'));
  const backup = join(parent, nameOf('backup'));
  let linked = false;
  await ops.remove(staged);
  try {
    await ops.writeStaged(staged, bytes);
    if (planned.pre !== null) {
      // The replacement keeps the mode of the file it replaces (the executable bit of a script).
      const existing = await ops.verified.lstat(full).catch(() => undefined);
      if (existing !== undefined) await ops.chmod(staged, Number(existing.mode & 0o7777n));
    } else if (context.modeFrom !== undefined) {
      // A moved or renamed file is new at its path but keeps the mode of the file it came from.
      const origin = await ops.verified
        .lstat(join(specDir, ...context.modeFrom.split('/')))
        .catch(() => undefined);
      if (origin?.isFile()) await ops.chmod(staged, Number(origin.mode & 0o7777n));
    }
    await event('staged');
    const again = dispositionOf(await observePath(ops, specDir, relative), planned);
    if (again === 'foreign') {
      await ops.remove(staged);
      return { kind: 'foreign' };
    }
    await event('before-replace');
    if (planned.pre !== null) linked = await tryBackupLink(ops, full, backup);
    await ops.rename(staged, full);
  } catch (error) {
    if (!(error instanceof WriterInterrupted)) {
      await ops.remove(staged).catch(() => undefined);
      if (linked) await ops.remove(backup).catch(() => undefined);
    }
    throw error;
  }
  if (linked && !(await verifyBackup(backup))) return { kind: 'foreign' };
  await ops.syncDirectory(parent);
  await event('replaced');
  return { kind: 'applied' };
}
