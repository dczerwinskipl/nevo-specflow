// The persisted chunk cache (`units.json` in the index directory): the parsed frontmatter and chunks
// of every corpus file, keyed by file and validated on read. It is disposable: a missing, unreadable
// or incompatible file is an empty cache, and a failed write loses only the cache.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { CHUNKER_VERSION, type Chunk } from '@nevo/ai-semantic-search';

/** Bump when the cached shape or what it is derived from changes; a mismatch discards the cache. */
export const UNIT_CACHE_SCHEMA_VERSION = 1;

export type CachedChunk = Pick<
  Chunk,
  'id' | 'headingPath' | 'sectionId' | 'startLine' | 'text' | 'embeddingText' | 'contentHash'
>;

export interface CachedFile {
  readonly file: string;
  /** SHA-256 of the file content. */
  readonly contentHash: string;
  /** `null`: the file has no frontmatter block. */
  readonly frontmatter: Record<string, unknown> | null;
  readonly chunks: readonly CachedChunk[];
}

interface PersistedCache {
  readonly schemaVersion: number;
  readonly chunkerVersion: number;
  readonly files: readonly CachedFile[];
}

/** A missing, unreadable or incompatible cache is an empty one: it only costs re-reading files. */
export async function readCache(cacheFile: string): Promise<Map<string, CachedFile>> {
  let persisted: unknown;
  try {
    persisted = JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch {
    return new Map();
  }

  return isPersistedCache(persisted)
    ? new Map(persisted.files.map((entry): [string, CachedFile] => [entry.file, entry]))
    : new Map<string, CachedFile>();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCachedChunk(value: unknown): value is CachedChunk {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    Array.isArray(value.headingPath) &&
    value.headingPath.every((part) => typeof part === 'string') &&
    typeof value.sectionId === 'string' &&
    Number.isInteger(value.startLine) &&
    typeof value.text === 'string' &&
    typeof value.embeddingText === 'string' &&
    typeof value.contentHash === 'string'
  );
}

function isCachedFile(value: unknown): value is CachedFile {
  return (
    isObject(value) &&
    typeof value.file === 'string' &&
    typeof value.contentHash === 'string' &&
    (value.frontmatter === null || isObject(value.frontmatter)) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isCachedChunk)
  );
}

/** The cache file is read at a process boundary: anything but the exact shape is an empty cache. */
function isPersistedCache(value: unknown): value is PersistedCache {
  return (
    isObject(value) &&
    value.schemaVersion === UNIT_CACHE_SCHEMA_VERSION &&
    value.chunkerVersion === CHUNKER_VERSION &&
    Array.isArray(value.files) &&
    value.files.every(isCachedFile)
  );
}

/**
 * Write through a temporary file and a rename, so a reader never sees a partial file. Failing to
 * write (for example a concurrent reader holding the file on Windows) loses only the cache.
 */
export async function writeCache(
  cacheFile: string,
  files: ReadonlyMap<string, CachedFile>,
): Promise<void> {
  const persisted: PersistedCache = {
    schemaVersion: UNIT_CACHE_SCHEMA_VERSION,
    chunkerVersion: CHUNKER_VERSION,
    files: [...files.values()],
  };
  const temporary = `${cacheFile}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(temporary, JSON.stringify(persisted));
    await rename(temporary, cacheFile);
  } catch {
    // An abandoned temporary file in the disposable cache directory is harmless.
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
