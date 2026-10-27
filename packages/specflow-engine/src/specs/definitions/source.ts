import type { BigIntStats } from 'node:fs';
import { lstat, opendir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { readBoundedBytes } from '../bounded-read';
import { mapBounded } from '../../concurrency';
import { DocumentError } from '../document-rules/errors';
import { errnoCode, isAbsent } from '../document-rules/errno';
import {
  inspectEntry,
  nodeVerifiedFs,
  openVerifiedFile,
  samePhysicalPath,
} from '../document-rules/verified-file';

/**
 * Read-only access to a definitions tree (`.nevo/definitions` of a Project Home, or the seed folder of
 * the product). The loader, the stat signature and the install planner only use this seam, so the
 * rules run unchanged over the real filesystem and over the in-memory implementation of the unit tests.
 * All paths are relative to the tree root, use `/` and never leave it; `''` is the root itself.
 * Nothing here takes a lock or starts a process.
 */

/** The definitions folder inside a Project Home, relative to the home. */
export const DEFINITIONS_RELATIVE_PATH = '.nevo/definitions';

export type SourceEntryType = 'file' | 'directory' | 'symlink' | 'other';

export interface SourceEntry {
  readonly name: string;
  readonly type: SourceEntryType;
  readonly size: number;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly ino: bigint;
}

export type ListOutcome =
  | { readonly state: 'ok'; readonly entries: readonly SourceEntry[] }
  | { readonly state: 'absent' }
  /** The directory is a symlink, a special file, or its physical path differs from the expected one. */
  | { readonly state: 'unsafe' }
  /** More entries than the caller allows: the directory is not listed. */
  | { readonly state: 'overflow' }
  | { readonly state: 'unreadable' };

export type ReadOutcome =
  | { readonly state: 'ok'; readonly bytes: Buffer }
  | { readonly state: 'absent' }
  /** A symlink in the path, a path that leaves the tree, or a file that changed while it was opened. */
  | { readonly state: 'unsafe' }
  | { readonly state: 'not-regular' }
  | { readonly state: 'too-large' }
  | { readonly state: 'unreadable' };

export type StatOutcome =
  | { readonly state: 'ok'; readonly entry: SourceEntry }
  | { readonly state: 'absent' }
  | { readonly state: 'unsafe' }
  | { readonly state: 'not-regular' }
  | { readonly state: 'unreadable' };

export interface DefinitionSource {
  /** Entries of one directory, each classified by `lstat` (nothing is followed). Order is unspecified. */
  list(directory: string, maxEntries: number): Promise<ListOutcome>;
  /** At most `maxBytes` of one regular file; a longer file is `too-large` and never read whole. */
  read(path: string, maxBytes: number): Promise<ReadOutcome>;
  /** `lstat` of one entry (a regular file): the cheap single-file lookup. */
  stat(path: string): Promise<StatOutcome>;
}

/** Segments of a relative `/` path; empty for the root. */
export function pathSegments(path: string): string[] {
  return path === '' ? [] : path.split('/');
}

function toEntry(name: string, stat: BigIntStats): SourceEntry {
  const type: SourceEntryType = stat.isSymbolicLink()
    ? 'symlink'
    : stat.isDirectory()
      ? 'directory'
      : stat.isFile()
        ? 'file'
        : 'other';
  return {
    name,
    type,
    size: Number(stat.size),
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
    ino: stat.ino,
  };
}

const LIST_CONCURRENCY = 16;

/**
 * The real filesystem. `root` MUST already be the canonical physical path of the tree (for a Project
 * Home: `<home>/.nevo/definitions`, the home being the Engine-verified canonical root); a root that is a
 * symlink, or whose physical path differs, is `unsafe`.
 */
export function createFilesystemDefinitionSource(root: string): DefinitionSource {
  /** `lstat` + `realpath` equality of one directory below the root (no symlink anywhere on the way). */
  async function checkDirectory(path: string): Promise<'ok' | 'absent' | 'unsafe' | 'unreadable'> {
    const full = join(root, ...pathSegments(path));
    try {
      const stat = await lstat(full, { bigint: true });
      if (!stat.isDirectory() || stat.isSymbolicLink()) return 'unsafe';
      return samePhysicalPath(await realpath(full), full) ? 'ok' : 'unsafe';
    } catch (error) {
      if (isAbsent(error)) return 'absent';
      if (errnoCode(error)?.startsWith('E')) return 'unreadable';
      throw error;
    }
  }

  return {
    async list(directory, maxEntries) {
      const checked = await checkDirectory(directory);
      if (checked !== 'ok') return { state: checked };
      const full = join(root, ...pathSegments(directory));
      const names: string[] = [];
      try {
        const handle = await opendir(full);
        try {
          for await (const entry of handle) {
            names.push(entry.name);
            if (names.length > maxEntries) return { state: 'overflow' };
          }
        } finally {
          await handle.close().catch(() => undefined);
        }
        const found = await mapBounded(names, LIST_CONCURRENCY, async (name) => {
          try {
            return toEntry(name, await lstat(join(full, name), { bigint: true }));
          } catch (error) {
            if (isAbsent(error)) return undefined; // removed while listing
            throw error;
          }
        });
        return {
          state: 'ok',
          entries: found.filter((entry): entry is SourceEntry => entry !== undefined),
        };
      } catch (error) {
        if (isAbsent(error)) return { state: 'absent' };
        if (errnoCode(error)?.startsWith('E')) return { state: 'unreadable' };
        throw error;
      }
    },

    async read(path, maxBytes) {
      try {
        const rootState = await checkDirectory('');
        if (rootState !== 'ok') return { state: rootState === 'absent' ? 'absent' : 'unsafe' };
        const opened = await openVerifiedFile(nodeVerifiedFs, root, path);
        if (opened.state !== 'opened') return { state: opened.state };
        try {
          if (opened.stat.size > BigInt(maxBytes)) return { state: 'too-large' };
          const bytes = await readBoundedBytes(opened.handle, maxBytes);
          return bytes.length > maxBytes ? { state: 'too-large' } : { state: 'ok', bytes };
        } finally {
          await opened.handle.close().catch(() => undefined);
        }
      } catch (error) {
        if (error instanceof DocumentError) return { state: 'unsafe' };
        if (errnoCode(error)?.startsWith('E')) return { state: 'unreadable' };
        throw error;
      }
    },

    async stat(path) {
      try {
        const state = await inspectEntry(nodeVerifiedFs, root, path);
        if (state.state === 'file') {
          const name = pathSegments(path).at(-1) ?? '';
          return { state: 'ok', entry: toEntry(name, state.stat) };
        }
        return { state: state.state === 'redirected' ? 'unsafe' : state.state };
      } catch (error) {
        if (error instanceof DocumentError) return { state: 'unsafe' };
        if (errnoCode(error)?.startsWith('E')) return { state: 'unreadable' };
        throw error;
      }
    },
  };
}
