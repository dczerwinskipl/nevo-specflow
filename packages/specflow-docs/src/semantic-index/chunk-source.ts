// The documentation corpus as search chunks. Every search needs every current chunk (BM25 ranks
// all of them and the index refresh diffs against them), so this source keeps the parsed
// frontmatter and chunks of each file and re-parses only what changed. Every load reads and hashes
// every file (about 300 files and 3 MB here: a few milliseconds), so any content change is seen,
// also one that keeps the size and modification time; only a changed hash parses and re-chunks the
// file. While no hash changes, the validated corpus and its BM25 engine are reused. A persisted copy
// (`units.json` in the index directory) carries the parsing across CLI invocations (`chunk-cache`);
// it is disposable cache like the vectors. All file access is asynchronous: a running Runtime loads
// on every search.

import { createHash } from 'node:crypto';

import {
  chunkMarkdownUnit,
  createSearchEngine,
  type Chunk,
  type SearchEngine,
} from '@nevo/ai-semantic-search';

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
  /** Number of documents that were re-chunked by this load (the rest came from cache). */
  readonly reparsed: number;
  /** The search engine over `chunks`, built on first use and shared until the corpus changes. */
  readonly searchEngine: () => SearchEngine;
}

export interface DocsChunkSource {
  /**
   * Bring the cached files up to date with the corpus, validate the corpus like `context` does
   * (rejects with `DocsCorpusInvalidError`) and return the chunks of its active documents. Loads
   * run one at a time, in call order.
   */
  load(): Promise<DocsChunks>;
}

export interface DocsChunkSourceOptions {
  readonly corpus: DocsCorpus;
  /** Where the cache persists across processes; `undefined` keeps it in memory only. */
  readonly cacheFile?: string;
}

/** Files read at the same time by a load. */
const READ_CONCURRENCY = 16;

type CorpusVersion =
  | { readonly ok: true; readonly value: Omit<DocsChunks, 'reparsed'> }
  | { readonly ok: false; readonly error: unknown };

export function createDocsChunkSource({
  corpus,
  cacheFile,
}: DocsChunkSourceOptions): DocsChunkSource {
  let cached: Map<string, CachedFile> | undefined;
  // The validated corpus of `cached`, or why it is invalid; recomputed only when a file changed.
  let version: CorpusVersion | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const refresh = async (): Promise<DocsChunks> => {
    cached ??= cacheFile === undefined ? new Map() : await readCache(cacheFile);
    const previous = cached;
    let reparsed = 0;
    const files = await corpus.repo.listMarkdownFiles();
    const entries = await mapConcurrently(files, READ_CONCURRENCY, async (file) => {
      const content = await corpus.repo.readMarkdownFileAsync(file);
      const contentHash = sha256(content);
      const entry = previous.get(file);
      if (entry?.contentHash === contentHash) {
        return entry;
      }

      reparsed += 1;

      return parseFile(file, content, contentHash);
    });
    const next = new Map(entries.map((entry): [string, CachedFile] => [entry.file, entry]));

    const changed = !sameFiles(previous, next);
    if (changed || version === undefined) {
      cached = next;
      version = validate(corpus, [...next.values()]);
    }

    if (changed && cacheFile !== undefined) {
      await writeCache(cacheFile, next);
    }

    if (!version.ok) {
      throw version.error;
    }

    return { ...version.value, reparsed };
  };

  return {
    load() {
      const run = queue.then(refresh);
      queue = run.catch(() => undefined);

      return run;
    },
  };
}

function validate(corpus: DocsCorpus, files: readonly CachedFile[]): CorpusVersion {
  let value: Omit<DocsChunks, 'reparsed' | 'searchEngine'>;
  try {
    value = validatedChunks(corpus, files);
  } catch (error) {
    return { ok: false, error };
  }

  let engine: SearchEngine | undefined;

  return {
    ok: true,
    value: { ...value, searchEngine: () => (engine ??= createSearchEngine(value.chunks)) },
  };
}

/** `items.map(map)` with at most `limit` calls pending at a time, results in input order. */
async function mapConcurrently<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await map(items[index]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
}

function parseFile(file: string, content: string, contentHash: string): CachedFile {
  const parsed = parseFrontmatter(content, file);
  if (parsed === null) {
    return { file, contentHash, frontmatter: null, chunks: [] };
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

  return { file, contentHash, frontmatter, chunks };
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
): Omit<DocsChunks, 'reparsed' | 'searchEngine'> {
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
