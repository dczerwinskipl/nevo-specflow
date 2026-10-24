import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { DocumentError } from './errors';
import {
  ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX,
  ARCHIVE_COUNT_TRAVERSAL_FILES_STOP,
  ARCHIVE_FILES_MAX,
  ARCHIVE_FILE_MAX_BYTES,
  FOLDER_DEPTH_MAX,
  LISTED_FILES_MAX,
} from './limits';

/**
 * The two directory walks of the documents reader. Neither follows a symlink, neither takes a lock,
 * neither starts a process, and both stop after the same entries budget
 * ({@link ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX}), so a directory with a huge number of empty folders
 * cannot make a read slow. Directory entries are visited in code-unit order so the results (and the
 * truncation point) are deterministic.
 */

/** At most this many paths are reported for skipped entries; the count is not capped by it. */
export const SKIPPED_PATHS_MAX = 50;

export interface ListedFiles {
  /** Regular, non-hidden files, in walk order. */
  readonly paths: readonly string[];
  /** The walk stopped at the file cap, the entries budget or did not descend below the depth cap. */
  readonly truncated: boolean;
  /** Entries that cannot be addressed or read safely (odd names, an unreadable folder). */
  readonly unaddressable: readonly string[];
}

function errnoCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

function isGone(error: unknown): boolean {
  const code = errnoCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** The Specification directory itself cannot be read (EACCES, EMFILE, vanished): an unavailable source. */
function rootUnreadable(): DocumentError {
  return new DocumentError(
    'SPEC_SOURCE_UNAVAILABLE',
    'The Specification directory is unavailable.',
  );
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Control, format, line and paragraph separator characters (bidi overrides, C1, U+2028, zero width). */
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const BACKSLASH = String.fromCharCode(0x5c);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/**
 * A name the documents layer cannot address or display safely: it contains a control, format or
 * separator character (Cc, Cf, Zl, Zp), a backslash, or U+FFFD (what a non-UTF-8 byte decodes to).
 */
export function isUnaddressable(name: string): boolean {
  return (
    INVISIBLE_OR_CONTROL.test(name) ||
    name.includes(BACKSLASH) ||
    name.includes(REPLACEMENT_CHARACTER)
  );
}

/**
 * List the regular files of a Specification directory for the tree: no symlinks, no special files, no
 * hidden entries (a name starting with `.`), the root manifest excluded by the caller. At most
 * {@link LISTED_FILES_MAX} files, {@link FOLDER_DEPTH_MAX} folder levels and
 * {@link ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX} entries; beyond that the walk is `truncated`.
 */
export async function listSpecificationFiles(specDir: string): Promise<ListedFiles> {
  const paths: string[] = [];
  const unaddressable: string[] = [];
  let truncated = false;
  let entriesSeen = 0;

  async function walk(relativeDir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(relativeDir === '' ? specDir : join(specDir, relativeDir), {
        withFileTypes: true,
      });
    } catch (error) {
      if (relativeDir === '') throw rootUnreadable();
      // A folder that vanished is simply gone; one that cannot be read is reported, never dropped.
      if (!isGone(error)) unaddressable.push(relativeDir);
      return;
    }
    entries.sort((left, right) => compareNames(left.name, right.name));
    for (const entry of entries) {
      if (truncated) return;
      entriesSeen += 1;
      if (entriesSeen > ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith('.')) continue;
      const relative = relativeDir === '' ? entry.name : relativeDir + '/' + entry.name;
      if (entry.isSymbolicLink()) continue; // counted and reported by the archive traversal
      if (!entry.isDirectory() && !entry.isFile()) continue; // special file: same
      if (isUnaddressable(entry.name)) {
        unaddressable.push(relative);
        continue;
      }
      if (entry.isDirectory()) {
        if (depth >= FOLDER_DEPTH_MAX) {
          truncated = true;
          return;
        }
        await walk(relative, depth + 1);
      } else {
        if (paths.length >= LISTED_FILES_MAX) {
          truncated = true;
          return;
        }
        paths.push(relative);
      }
    }
  }

  await walk('', 0);
  return { paths, truncated, unaddressable };
}

export interface ArchiveCount {
  /** Regular files counted, hidden ones included (stops at the traversal bound). */
  readonly files: number;
  /** The traversal stopped at its own bound before finishing. */
  readonly bounded: boolean;
  /** First regular file above the archive per-file limit. */
  readonly oversizedPath?: string;
  /**
   * Symlinks and special entries found (Close archive refuses them). A lower bound once
   * {@link bounded} is true: entries beyond the bound were not visited.
   */
  readonly skippedCount: number;
  readonly skippedPaths: readonly string[];
  /** Close archive would refuse: too many files, a file too large, or the bound was reached. */
  readonly exceeded: boolean;
}

/**
 * Count-only traversal that mirrors Close archive's inventory (architecture "Archive count rule"):
 * hidden entries and the manifest are included, nothing is hashed, symlinks and special entries are
 * reported as skipped. It stops at {@link ARCHIVE_COUNT_TRAVERSAL_FILES_STOP} files or when it would
 * visit more than {@link ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX} entries, and is independent of the
 * listing cap.
 */
export async function countArchiveInventory(specDir: string): Promise<ArchiveCount> {
  let files = 0;
  let entries = 0;
  let bounded = false;
  let oversizedPath: string | undefined;
  let skippedCount = 0;
  const skippedPaths: string[] = [];

  const skip = (relative: string): void => {
    skippedCount += 1;
    if (skippedPaths.length < SKIPPED_PATHS_MAX) skippedPaths.push(relative);
  };

  async function walk(relativeDir: string): Promise<void> {
    let names;
    try {
      names = await readdir(relativeDir === '' ? specDir : join(specDir, relativeDir), {
        withFileTypes: true,
      });
    } catch (error) {
      if (relativeDir === '') throw rootUnreadable();
      // A directory Close archive could not read either: it will refuse, like a special entry.
      if (!isGone(error)) skip(relativeDir);
      return;
    }
    names.sort((left, right) => compareNames(left.name, right.name));
    for (const entry of names) {
      if (bounded) return;
      entries += 1;
      if (entries > ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX) {
        bounded = true;
        return;
      }
      const relative = relativeDir === '' ? entry.name : relativeDir + '/' + entry.name;
      if (entry.isSymbolicLink()) {
        skip(relative);
      } else if (entry.isDirectory()) {
        await walk(relative);
      } else if (entry.isFile()) {
        files += 1;
        if (oversizedPath === undefined) {
          const stat = await lstat(join(specDir, relative), { bigint: true }).catch(
            () => undefined,
          );
          if (stat && stat.size > BigInt(ARCHIVE_FILE_MAX_BYTES)) oversizedPath = relative;
        }
        if (files >= ARCHIVE_COUNT_TRAVERSAL_FILES_STOP) {
          bounded = true;
          return;
        }
      } else {
        skip(relative);
      }
    }
  }

  await walk('');
  return {
    files,
    bounded,
    ...(oversizedPath !== undefined ? { oversizedPath } : {}),
    skippedCount,
    skippedPaths,
    exceeded: files > ARCHIVE_FILES_MAX || oversizedPath !== undefined || bounded,
  };
}
