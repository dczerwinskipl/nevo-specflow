// The documentation corpus as search chunks. Every search needs every current chunk (BM25 ranks all
// of them and the index refresh diffs against them), so this source keeps the parsed frontmatter
// and chunks of each file and re-parses only what changed. Every load reads and hashes every file
// (about 300 files and 3 MB here: about 20 ms for a warm load on Windows), so any content change is
// seen, also one that keeps the size and modification time; only a changed hash parses and
// re-chunks the file. A file that disappears between listing and reading (a checkout during a
// search) is skipped like one the listing did not see. While no hash changes, the validated corpus
// and its BM25 engine are reused. A persisted copy (`units.json` in the index directory) carries
// the parsing across CLI invocations (`chunk-cache`); it is disposable cache like the vectors. All
// file access is asynchronous: a running Runtime loads on every search.

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

/** A chunk of a document; its `startLine` is the line in the file, frontmatter included. */
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
   * run one at a time: a call while one runs waits for it and then starts the next one, which every
   * further call made before it starts shares (at most one load in progress and one pending), so
   * each answer reflects the files as they were after the call.
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
  let running: Promise<DocsChunks> | undefined;
  let pending: Promise<DocsChunks> | undefined;

  const refresh = async (): Promise<DocsChunks> => {
    cached ??= cacheFile === undefined ? new Map() : await readCache(cacheFile);
    const previous = cached;
    let reparsed = 0;
    const files = await corpus.repo.listMarkdownFiles();
    const read = await mapConcurrently(files, READ_CONCURRENCY, async (file) => {
      const content = await readUnlessGone(corpus, file);
      if (content === undefined) {
        return undefined;
      }

      const contentHash = sha256(content);
      const entry = previous.get(file);
      if (entry?.contentHash === contentHash) {
        return entry;
      }

      reparsed += 1;

      return parseFile(file, content, contentHash);
    });
    const entries = read.filter((entry) => entry !== undefined);
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

  const start = (): Promise<DocsChunks> => {
    const run = refresh();
    running = run;
    const settled = () => {
      if (running === run) {
        running = undefined;
      }
    };

    run.then(settled, settled);

    return run;
  };

  return {
    load() {
      if (pending !== undefined) {
        return pending;
      }

      if (running === undefined) {
        return start();
      }

      const next = running
        .then(
          () => undefined,
          () => undefined,
        )
        .then(() => {
          pending = undefined;

          return start();
        });
      pending = next;

      return next;
    },
  };
}

/** The file's content, or `undefined` when it no longer exists. */
async function readUnlessGone(corpus: DocsCorpus, file: string): Promise<string | undefined> {
  try {
    return await corpus.repo.readMarkdownFileAsync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
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

  const { frontmatter, body, bodyLine } = parsed;
  const chunks = chunkMarkdownUnit({
    id: asString(frontmatter.id),
    contentHash,
    text: body,
    header: contextualHeader(frontmatter),
    metadata: {},
  }).map(
    ({ id, headingPath, sectionId, startLine, text, embeddingText, contentHash: chunkHash }) => ({
      id,
      headingPath,
      sectionId,
      startLine: bodyLine + startLine - 1,
      text,
      embeddingText,
      contentHash: chunkHash,
    }),
  );

  return { file, contentHash, frontmatter, chunks };
}

/**
 * Title, id, summary, scope, areas, tags and read_when (the frontmatter that says what a document
 * is about and when to read it): embedded with every chunk so small sections keep their document.
 * Empty fields are left out.
 */
export function contextualHeader(frontmatter: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === 'string' ? oneLine(value) : '');
  const list = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => oneLine(asString(item))).filter(Boolean) : [];
  const lines = [`Title: ${asString(frontmatter.title)}`, `ID: ${asString(frontmatter.id)}`];
  const add = (label: string, value: string) => {
    if (value !== '') {
      lines.push(`${label}: ${value}`);
    }
  };

  add('Summary', text(frontmatter.summary));
  add('Scope', text(frontmatter.scope));
  add('Areas', list(frontmatter.areas).join(', '));
  add('Tags', list(frontmatter.tags).join(', '));
  add('Read when', list(frontmatter.read_when).join('; '));

  return lines.join('\n');
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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
