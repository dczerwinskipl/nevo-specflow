// The documentation corpus as search chunks. Every search needs every current chunk (BM25 ranks
// all of them and the index refresh diffs against them), so this source keeps the parsed
// frontmatter and chunks of each file and re-reads only what changed: a file whose size and mtime
// are unchanged is not read; a changed stat costs one read and hash, and only a changed hash parses
// and re-chunks the file. A persisted copy (`units.json` in the index directory) carries the work
// across CLI invocations (`chunk-cache`); it is disposable cache like the vectors.

import { createHash } from 'node:crypto';

import { chunkMarkdownUnit, type Chunk } from '@nevo/ai-semantic-search';

import { isNonAuthoritative } from '../config/docs-file';
import { collectCorpusProblems, type DocsCorpus } from '../corpus/corpus';
import {
  asString,
  isInactiveStatus,
  parseFrontmatter,
  type DocRecord,
} from '../frontmatter/contract';
import { DocsCorpusInvalidError } from '../errors';
import { readCache, writeCache, type CachedFile } from './chunk-cache';

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

/** An active document's frontmatter (with `file` and an empty `body`), for frontmatter ranking. */
export interface DocsDocument {
  readonly record: DocRecord;
  readonly nonAuthoritative: boolean;
}

/** The validated corpus as chunks: active documents only (inactive ones are never searched). */
export interface DocsChunks {
  readonly chunks: readonly DocsChunk[];
  /** Every active document, also those without chunks (an empty body), in id order. */
  readonly documents: readonly DocsDocument[];
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

      return { ...validatedChunks(corpus, [...next.values()]), reparsed };
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

function validatedChunks(
  corpus: DocsCorpus,
  files: readonly CachedFile[],
): Omit<DocsChunks, 'reparsed'> {
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

  const byFile = new Map(files.map((entry) => [entry.file, entry]));
  const chunks: DocsChunk[] = [];
  const documents: DocsDocument[] = [];
  for (const record of docs) {
    if (isInactiveStatus(record.status)) {
      continue;
    }

    const nonAuthoritative = isNonAuthoritative(corpus.settings, record.file);
    documents.push({ record, nonAuthoritative });
    const metadata: DocsChunkMetadata = {
      file: record.file,
      title: asString(record.title),
      status: asString(record.status),
      nonAuthoritative,
    };
    for (const chunk of byFile.get(record.file)!.chunks) {
      chunks.push({ ...chunk, unitId: asString(record.id), metadata });
    }
  }

  return { chunks, documents };
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
