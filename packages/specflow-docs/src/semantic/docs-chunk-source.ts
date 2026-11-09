// The documentation corpus as search chunks. Every search needs every current chunk (BM25 ranks
// all of them and the index refresh diffs against them), so this source keeps the parsed
// frontmatter and chunks of each file and re-reads only what changed: a file whose size and mtime
// are unchanged is not read; a changed stat costs one read and hash, and only a changed hash parses
// and re-chunks the file. A persisted copy (`units.json` in the index directory) carries the work
// across CLI invocations; it is disposable cache like the vectors.

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { CHUNKER_VERSION, chunkMarkdownUnit, type Chunk } from '@nevo/ai-semantic-search';

import { isNonAuthoritative } from '../config/docs-settings';
import { collectCorpusProblems, type DocsCorpus } from '../corpus/corpus';
import {
  asString,
  isInactiveStatus,
  parseFrontmatter,
  type DocRecord,
} from '../frontmatter/contract';
import { DocsCorpusInvalidError } from '../errors';

/** Bump when the cached shape or what it is derived from changes; a mismatch discards the cache. */
export const UNIT_CACHE_SCHEMA_VERSION = 1;

/** What every docs chunk carries for filtering and presentation. */
export interface DocsChunkMetadata {
  readonly [key: string]: string | boolean;
  readonly file: string;
  readonly title: string;
  readonly status: string;
  readonly nonAuthoritative: boolean;
}

export interface DocsChunk extends Chunk {
  readonly metadata: DocsChunkMetadata;
}

/** The validated corpus as chunks: active documents only (inactive ones are never searched). */
export interface DocsChunks {
  readonly chunks: readonly DocsChunk[];
  /** Number of documents that were read and re-chunked by this load (the rest came from cache). */
  readonly reparsed: number;
}

export interface DocsChunkSource {
  /**
   * Bring the cached files up to date with the corpus, validate the corpus like `context` does
   * (throws `DocsCorpusInvalidError`) and return the chunks of its active documents.
   */
  load(): DocsChunks;
}

type CachedChunk = Pick<Chunk, 'id' | 'headingPath' | 'text' | 'embeddingText' | 'contentHash'>;

interface CachedFile {
  readonly file: string;
  readonly mtimeMs: number;
  readonly size: number;
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

export interface DocsChunkSourceOptions {
  readonly corpus: DocsCorpus;
  /** Where the cache persists across processes; `undefined` keeps it in memory only. */
  readonly cacheFile?: string;
}

export function createDocsChunkSource({
  corpus,
  cacheFile,
}: DocsChunkSourceOptions): DocsChunkSource {
  let cached: Map<string, CachedFile> | undefined;

  return {
    load() {
      cached ??= cacheFile === undefined ? new Map() : readCache(cacheFile);
      const next = new Map<string, CachedFile>();
      let reparsed = 0;
      for (const stat of corpus.repo.listMarkdownFiles()) {
        const previous = cached.get(stat.file);
        if (previous?.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
          next.set(stat.file, previous);
          continue;
        }

        const content = corpus.repo.readMarkdownFile(stat.file);
        const contentHash = sha256(content);
        if (previous?.contentHash === contentHash) {
          next.set(stat.file, { ...previous, mtimeMs: stat.mtimeMs, size: stat.size });
          continue;
        }

        reparsed += 1;
        next.set(stat.file, parseFile(stat.file, content, contentHash, stat));
      }

      const changed = !sameFiles(cached, next);
      cached = next;
      if (changed && cacheFile !== undefined) {
        writeCache(cacheFile, next);
      }

      return { chunks: validatedChunks(corpus, [...next.values()]), reparsed };
    },
  };
}

function parseFile(
  file: string,
  content: string,
  contentHash: string,
  stat: { readonly mtimeMs: number; readonly size: number },
): CachedFile {
  const parsed = parseFrontmatter(content, file);
  if (parsed === null) {
    return {
      file,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      contentHash,
      frontmatter: null,
      chunks: [],
    };
  }

  const { frontmatter, body } = parsed;
  const chunks = chunkMarkdownUnit({
    id: asString(frontmatter.id),
    contentHash,
    text: body,
    header: contextualHeader(frontmatter),
    metadata: {},
  }).map(({ id, headingPath, text, embeddingText, contentHash: chunkHash }) => ({
    id,
    headingPath,
    text,
    embeddingText,
    contentHash: chunkHash,
  }));

  return { file, mtimeMs: stat.mtimeMs, size: stat.size, contentHash, frontmatter, chunks };
}

/** Title, id, summary and tags: embedded with every chunk so small sections keep their document. */
export function contextualHeader(frontmatter: Record<string, unknown>): string {
  const lines = [`Title: ${asString(frontmatter.title)}`, `ID: ${asString(frontmatter.id)}`];
  if (typeof frontmatter.summary === 'string' && frontmatter.summary.trim() !== '') {
    lines.push(`Summary: ${frontmatter.summary.replace(/\s+/g, ' ').trim()}`);
  }

  if (Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0) {
    lines.push(`Tags: ${frontmatter.tags.map((tag) => asString(tag)).join(', ')}`);
  }

  return lines.join('\n');
}

function validatedChunks(corpus: DocsCorpus, files: readonly CachedFile[]): DocsChunk[] {
  const docs: DocRecord[] = [];
  const missingFrontmatter: string[] = [];
  for (const entry of files) {
    if (entry.frontmatter === null) {
      missingFrontmatter.push(entry.file);
    } else {
      // Validation reads frontmatter only; the body is not kept.
      docs.push({ ...entry.frontmatter, file: entry.file, body: '' });
    }
  }

  docs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  missingFrontmatter.sort();
  const problems = collectCorpusProblems(
    { docs, missingFrontmatter },
    corpus.settings,
    corpus.validate,
  );
  if (problems.length > 0) {
    throw new DocsCorpusInvalidError(problems);
  }

  const chunks: DocsChunk[] = [];
  for (const entry of files) {
    if (entry.frontmatter === null || isInactiveStatus(entry.frontmatter.status)) {
      continue;
    }

    const metadata: DocsChunkMetadata = {
      file: entry.file,
      title: asString(entry.frontmatter.title),
      status: asString(entry.frontmatter.status),
      nonAuthoritative: isNonAuthoritative(corpus.settings, entry.file),
    };
    for (const chunk of entry.chunks) {
      chunks.push({ ...chunk, unitId: asString(entry.frontmatter.id), metadata });
    }
  }

  return chunks;
}

function sameFiles(
  a: ReadonlyMap<string, CachedFile>,
  b: ReadonlyMap<string, CachedFile>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }

  for (const [file, entry] of b) {
    if (a.get(file) !== entry) {
      return false;
    }
  }

  return true;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** A missing, unreadable or incompatible cache is an empty one: it only costs re-reading files. */
function readCache(cacheFile: string): Map<string, CachedFile> {
  let persisted: unknown;
  try {
    persisted = JSON.parse(readFileSync(cacheFile, 'utf8'));
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
    typeof value.text === 'string' &&
    typeof value.embeddingText === 'string' &&
    typeof value.contentHash === 'string'
  );
}

function isCachedFile(value: unknown): value is CachedFile {
  return (
    isObject(value) &&
    typeof value.file === 'string' &&
    typeof value.mtimeMs === 'number' &&
    typeof value.size === 'number' &&
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
function writeCache(cacheFile: string, files: ReadonlyMap<string, CachedFile>): void {
  const persisted: PersistedCache = {
    schemaVersion: UNIT_CACHE_SCHEMA_VERSION,
    chunkerVersion: CHUNKER_VERSION,
    files: [...files.values()],
  };
  const temporary = `${cacheFile}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(temporary, JSON.stringify(persisted));
    renameSync(temporary, cacheFile);
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // An abandoned temporary file in the disposable cache directory is harmless.
    }
  }
}
