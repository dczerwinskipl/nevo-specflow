import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitCommandResult } from '../../git/process';
import { nonBlobState, type DocumentPathFacts } from './document-change';

const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
/** A read names at most this many paths: a batch holds 200, and argv is capped (about 32K on Windows). */
export const READ_CHUNK_PATHS = 100;
/** ... and at most this many characters of path arguments. */
export const READ_CHUNK_CHARS = 12_000;

/** Runs one read-only Git command in a checkout (`executeGit` in production, a fake in unit tests). */
export type GitReader = (root: string, args: readonly string[]) => Promise<GitCommandResult>;

/** What a working-tree entry is: nothing, a regular file (or symlink) Git can hash, or anything else. */
export type WorkingEntry = 'absent' | 'file' | 'other';

export interface PathFactsDeps {
  readonly run: GitReader;
  /** Whether the working-tree entry exists (`lstat` in production). Used when `entry` is not given. */
  readonly exists?: (absolutePath: string) => Promise<boolean>;
  /** What the working-tree entry is (`lstat` in production). */
  readonly entry?: (absolutePath: string) => Promise<WorkingEntry>;
  /** Hashing must see the exact bytes: no `core.autocrlf` conversion, `.gitattributes` still apply. */
  readonly exactBytes: readonly string[];
}

/** The error raised when a Git read gives an answer the reader cannot interpret. */
export class PathFactsError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('Unable to read the state of document paths.');
    this.name = 'PathFactsError';
    this.reason = reason;
  }
}

/** Splits `paths` so that no chunk exceeds the path count or character bound of one Git process. */
export function chunkPaths(
  paths: readonly string[],
  maxCount = READ_CHUNK_PATHS,
  maxChars = READ_CHUNK_CHARS,
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const path of paths) {
    if (current.length > 0 && (current.length >= maxCount || chars + path.length + 1 > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(path);
    chars += path.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Reads, for each path, the attribute-aware blob id of the working-tree file (`git hash-object --
 * <path>`, the same filters a hand `git add` applies; `null` when the file is absent, which is
 * decided without hash-object because it fails with exit 128 on a deleted path) and the blob id the
 * commit `at` holds (one `git ls-tree -z <at> -- <paths>` per chunk: a blob entry gives the id, no entry
 * means the path is absent there, and a directory or submodule entry is not a blob).
 *
 * A directory where a document is expected (on disk or in the commit) is reported as a `non-blob:`
 * state, never as an absent path and never as a blob id, so it cannot be mistaken for either. Every
 * read names at most `READ_CHUNK_PATHS` paths.
 */
export async function readPathFacts(
  deps: PathFactsDeps,
  root: string,
  paths: readonly string[],
  at = 'HEAD',
): Promise<DocumentPathFacts[]> {
  const entry = deps.entry ?? defaultEntry(deps.exists);
  const kinds = new Map<string, WorkingEntry>();
  for (const path of paths) kinds.set(path, await entry(join(root, ...path.split('/'))));

  const working = new Map<string, string>();
  const existing = paths.filter((path) => kinds.get(path) === 'file');
  for (const chunk of chunkPaths(existing)) {
    const hashed = await deps.run(root, [...deps.exactBytes, 'hash-object', '--', ...chunk]);
    const lines = hashed.stdout.split('\n').filter(Boolean);
    if (hashed.exitCode !== 0 || lines.length !== chunk.length) {
      throw new PathFactsError('hash-object');
    }
    chunk.forEach((path, index) => {
      const id = lines[index]!.trim();
      if (!OBJECT_ID.test(id)) throw new PathFactsError('hash-object');
      working.set(path, id);
    });
  }

  // One `ls-tree` per chunk answers for every path at once: a blob entry gives its id, a tree or a
  // submodule entry is not a blob, and no entry means the path is absent. (`rev-parse <rev>:<path>`
  // cannot be peeled to a blob: everything after the colon is the path.)
  const head = new Map<string, string | null>(paths.map((path) => [path, null]));
  for (const chunk of chunkPaths(paths)) {
    const listed = await deps.run(root, [
      'ls-tree',
      '-z',
      at,
      '--',
      ...chunk.map((path) => ':(literal)' + path),
    ]);
    if (listed.exitCode !== 0) {
      // An unborn branch has no tree: every path is absent there.
      const commit = await deps.run(root, ['rev-parse', '--verify', '--quiet', at + '^{commit}']);
      if (commit.exitCode === 1) break;
      throw new PathFactsError('ls-tree');
    }
    for (const record of listed.stdout.split('\0').filter(Boolean)) {
      const tab = record.indexOf('\t');
      const [, type, id] = record.slice(0, tab).split(' ');
      const name = record.slice(tab + 1);
      if (!head.has(name)) continue;
      if (type === 'blob' && id !== undefined && OBJECT_ID.test(id)) head.set(name, id);
      else head.set(name, nonBlobState('tree'));
    }
  }

  return paths.map((path) => ({
    path,
    working: kinds.get(path) === 'other' ? nonBlobState('directory') : (working.get(path) ?? null),
    head: head.get(path) ?? null,
  }));
}

function defaultEntry(
  exists: ((absolutePath: string) => Promise<boolean>) | undefined,
): (absolutePath: string) => Promise<WorkingEntry> {
  if (exists) return async (path) => ((await exists(path)) ? 'file' : 'absent');
  return async (absolutePath) => {
    try {
      const stats = await lstat(absolutePath);
      return stats.isFile() || stats.isSymbolicLink() ? 'file' : 'other';
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return 'absent';
      }
      throw error;
    }
  };
}
