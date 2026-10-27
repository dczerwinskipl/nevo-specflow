import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import { isNavigationSegment } from './document-paths';
import { errnoCode, isAbsent } from './errno';
import { DocumentError } from './errors';

/**
 * Race-aware access to one file of a Specification directory (`docs/architecture/runtime/specification-documents.md`:
 * symlinks and special files). Nothing here follows a symlink on purpose, and every check is repeated after
 * the file is open:
 *
 * 1. `lstat` every ancestor (a real directory) and the file itself (a regular file, not a symlink);
 * 2. `realpath` of the file equals the expected path inside the Specification directory;
 * 3. open with `O_NOFOLLOW` (where the platform has it) and `O_NONBLOCK`, so a symlink swapped in
 *    after step 1 fails to open and a FIFO swapped in cannot block;
 * 4. `fstat` the descriptor: a regular file with the same identity (device and inode) as step 1;
 * 5. repeat steps 1 and 2 and compare the identity once more.
 *
 * Windows has no `O_NOFOLLOW`: there steps 1, 2, 4 and 5 are the only guard (best effort; a swap
 * between step 5 and the first read cannot be excluded by the platform).
 *
 * A file with more than one hard link is readable: it is a regular file in the directory.
 */

/** The filesystem operations the verification uses, replaceable in tests (fault injection). */
export interface VerifiedFs {
  lstat(path: string): Promise<BigIntStats>;
  realpath(path: string): Promise<string>;
  open(path: string, flags: number): Promise<FileHandle>;
}

export const nodeVerifiedFs: VerifiedFs = {
  lstat: (path) => lstat(path, { bigint: true }),
  realpath: (path) => realpath(path),
  open: (path, flags) => open(path, flags),
};

/** Read-only open flags: never follow a final symlink, never block on a FIFO (where supported). */
export const READ_OPEN_FLAGS: number =
  constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

export type EntryState =
  | { readonly state: 'file'; readonly stat: BigIntStats }
  | { readonly state: 'absent' }
  /** The final component exists but is a symlink, a directory or a special file. */
  | { readonly state: 'not-regular' }
  /** An ancestor of the file is a symlink (the path leaves the Specification directory). */
  | { readonly state: 'redirected' };

function unavailable(message: string): DocumentError {
  return new DocumentError('SPEC_SOURCE_UNAVAILABLE', message);
}

/**
 * A filesystem failure the layer cannot act on (EACCES, EMFILE, EIO, ...) is an unavailable source,
 * not an internal error; anything that is not an errno failure is a defect and passes through.
 */
function unreadable(error: unknown): never {
  if (errnoCode(error)?.startsWith('E')) {
    throw unavailable('The Specification files cannot be read.');
  }
  throw error;
}

/** The relative path must stay inside the Specification directory by construction. */
export function assertContainedRelativePath(relativePath: string): readonly string[] {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.includes('\0')
  ) {
    throw unavailable('A document path leaves the Specification directory.');
  }
  const segments = relativePath.split('/');
  if (segments.some(isNavigationSegment)) {
    throw unavailable('A document path leaves the Specification directory.');
  }
  return segments;
}

/** True when two physical paths are the same entry (case-insensitive on Windows). */
export function samePhysicalPath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Classify one entry by `lstat` only; follows nothing. */
export async function inspectEntry(
  fs: VerifiedFs,
  specDir: string,
  relativePath: string,
): Promise<EntryState> {
  const segments = assertContainedRelativePath(relativePath);
  let current = specDir;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let stat: BigIntStats;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (isAbsent(error)) return { state: 'absent' };
      return unreadable(error);
    }
    if (index < segments.length - 1) {
      if (stat.isSymbolicLink()) return { state: 'redirected' };
      if (!stat.isDirectory()) return { state: 'absent' };
    } else {
      return stat.isFile() && !stat.isSymbolicLink()
        ? { state: 'file', stat }
        : { state: 'not-regular' };
    }
  }
  return { state: 'absent' };
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  // Some Windows filesystems report inode 0: the identity then rests on the device alone (best effort).
  if (left.ino === 0n && right.ino === 0n) return left.dev === right.dev;
  return left.dev === right.dev && left.ino === right.ino;
}

export type OpenOutcome =
  | { readonly state: 'opened'; readonly handle: FileHandle; readonly stat: BigIntStats }
  | { readonly state: 'absent' | 'not-regular' };

/**
 * Open the regular file `relativePath` of the Specification directory `specDir` (already verified as
 * a canonical physical directory by the caller) with the verification above. Returns `absent` or
 * `not-regular` when the file is not there as a regular file; anything that points outside the
 * directory, or changes during the checks, is `SPEC_SOURCE_UNAVAILABLE`. The caller closes the handle.
 */
export async function openVerifiedFile(
  fs: VerifiedFs,
  specDir: string,
  relativePath: string,
): Promise<OpenOutcome> {
  const segments = assertContainedRelativePath(relativePath);
  const full = join(specDir, ...segments);

  const before = await inspectEntry(fs, specDir, relativePath);
  if (before.state === 'redirected') {
    throw unavailable('A document path leaves the Specification directory.');
  }
  if (before.state !== 'file') return { state: before.state };
  await assertPhysicalPath(fs, full, specDir, segments);

  let handle: FileHandle;
  try {
    handle = await fs.open(full, READ_OPEN_FLAGS);
  } catch (error) {
    if (isAbsent(error)) return { state: 'absent' };
    // ELOOP: the final component became a symlink after the check (O_NOFOLLOW). ENXIO/EISDIR and
    // friends: it became something that is not a regular file.
    if (
      errnoCode(error) === 'ELOOP' ||
      errnoCode(error) === 'ENXIO' ||
      errnoCode(error) === 'EISDIR'
    ) {
      throw unavailable('A document changed while it was being opened.');
    }
    return unreadable(error);
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameIdentity(before.stat, opened)) {
      throw unavailable('A document changed while it was being opened.');
    }
    const after = await inspectEntry(fs, specDir, relativePath);
    if (after.state !== 'file' || !sameIdentity(opened, after.stat)) {
      throw unavailable('A document changed while it was being opened.');
    }
    await assertPhysicalPath(fs, full, specDir, segments);
    return { state: 'opened', handle, stat: opened };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

/** An opened, verified regular file. */
export interface OpenFile {
  readonly handle: FileHandle;
  readonly stat: BigIntStats;
}

export type WithOpenFileResult<T> =
  { readonly state: 'opened'; readonly value: T } | { readonly state: 'absent' | 'not-regular' };

/**
 * Open the file like {@link openVerifiedFile}, run `use` on it and close the handle exactly once,
 * whether `use` returns or throws. `use` may call `adopt()` to take over the handle (it is then not
 * closed here and the caller closes it, as the raw stream does).
 */
export async function withOpenFile<T>(
  fs: VerifiedFs,
  specDir: string,
  relativePath: string,
  use: (file: OpenFile, adopt: () => void) => Promise<T>,
): Promise<WithOpenFileResult<T>> {
  const opened = await openVerifiedFile(fs, specDir, relativePath);
  if (opened.state !== 'opened') return { state: opened.state };
  let adopted = false;
  try {
    const value = await use({ handle: opened.handle, stat: opened.stat }, () => {
      adopted = true;
    });
    return { state: 'opened', value };
  } finally {
    if (!adopted) await opened.handle.close().catch(() => undefined);
  }
}

async function assertPhysicalPath(
  fs: VerifiedFs,
  full: string,
  specDir: string,
  segments: readonly string[],
): Promise<void> {
  let real: string;
  try {
    real = await fs.realpath(full);
  } catch (error) {
    if (isAbsent(error)) throw unavailable('A document changed while it was being opened.');
    return unreadable(error);
  }
  if (!samePhysicalPath(real, join(specDir, ...segments))) {
    throw unavailable('A document path leaves the Specification directory.');
  }
}

/**
 * Verify that `specDir` is a real directory whose physical path equals the expected one (no symlink in
 * any ancestor). The expected path is the canonical one built from the Engine-verified workspace root.
 */
export async function assertCanonicalDirectory(fs: VerifiedFs, directory: string): Promise<void> {
  let stat: BigIntStats;
  let real: string;
  try {
    stat = await fs.lstat(directory);
    real = await fs.realpath(directory);
  } catch (error) {
    if (isAbsent(error)) throw unavailable('The Specification directory is unavailable.');
    return unreadable(error);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePhysicalPath(real, directory)) {
    throw unavailable('The Specification directory is unavailable.');
  }
}

/** Read up to `length` bytes at `position` (fewer only at the end of the file). */
export async function readAt(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, position + filled);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return buffer.subarray(0, filled);
}
