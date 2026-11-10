// `docs search`: ranked document sections for a question, hybrid when the configured endpoint and the
// index allow it and lexical with a stated reason otherwise. Embeddings and the index never make a
// search fail; the corpus and the configuration are validated like for every `docs` command.

import {
  CHUNKER_VERSION,
  createSearchEngine,
  planRefresh,
  refreshIndex,
  type Chunk,
  type SearchVectors,
  type UnitHit,
  type VectorStore,
} from '@nevo/ai-semantic-search';
import type {
  DocsSearchHit,
  DocsSearchReason,
  DocsSearchResult,
} from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { DocsCorpus } from '../corpus/corpus';
import { createDocsChunkSource, type DocsChunk, type DocsChunkSource } from './docs-chunk-source';
import { openDocsIndex, type DocsIndex } from './docs-index';
import {
  embeddingFailureReason,
  overLimitReason,
  refreshReason,
  refreshSkippedReason,
  SEMANTIC_INDEX_COMMAND,
  searchReason,
  semanticEndpoint,
  unreadableIndexReason,
} from './effective-mode';
import {
  createEmbeddingProviders,
  type CreateEmbeddingProvider,
  type EmbeddingProviders,
} from './embedding-providers';

/** Matching sections shown per document. */
export const CHUNKS_PER_RESULT = 3;

/**
 * Most chunks a search embeds before answering (the read-time refresh). It is one request at the
 * default batch size, about 10 s on a local CPU model and far less on a hosted API, and covers a
 * typical edit of a few sections. A larger gap (a first build: about 20 minutes on CPU for this
 * repository) is left to `semantic index` or the Runtime start refresh.
 */
export const READ_REFRESH_MAX_CHUNKS = 16;
const SNIPPET_MAX_CHARS = 280;

/** Vectors for a search, or why there are none. */
export type DocsSearchVectors =
  | { readonly reason: DocsSearchReason }
  | { readonly store: VectorStore; readonly providers: EmbeddingProviders };

/**
 * Everything a project's searches share. Open it once per project and process (a CLI invocation, or
 * a running Runtime) and reuse it: the vector store decodes the vectors file once per generation and
 * the chunk source keeps the parsed corpus in memory between searches.
 */
export interface DocsSearch {
  readonly chunks: DocsChunkSource;
  readonly vectors: DocsSearchVectors;
}

export interface OpenDocsSearchOptions {
  /** Absolute project root; the index lives in `DOCS_INDEX_DIRECTORY` below it. */
  readonly projectRoot: string;
  readonly corpus: DocsCorpus;
  readonly configuration: DocsConfiguration;
  /** Environment the API key variable is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Test seam; production uses the OpenAI-compatible adapter. */
  readonly createProvider?: CreateEmbeddingProvider;
  /**
   * The project's index when the process already holds one (for example a Runtime that also
   * refreshes it on start), so the process keeps one vector store per index directory. Omitted:
   * `openDocsIndex` opens it.
   */
  readonly index?: DocsIndex;
}

export function openDocsSearch(options: OpenDocsSearchOptions): DocsSearch {
  const { projectRoot, corpus, configuration } = options;
  const endpoint = semanticEndpoint(configuration);
  if ('reason' in endpoint) {
    // Nothing is written below `.nevo/` for a project that does not use semantic search.
    return { chunks: createDocsChunkSource({ corpus }), vectors: { reason: endpoint.reason } };
  }

  const index = options.index ?? openDocsIndex(projectRoot, corpus);
  const created = createEmbeddingProviders(endpoint.embeddings, {
    env: options.env,
    ...(options.createProvider ? { createProvider: options.createProvider } : {}),
  });
  if (!created.ok) {
    return { chunks: index.chunks, vectors: { reason: created.reason } };
  }

  return {
    chunks: index.chunks,
    vectors: { store: index.store, providers: created.providers },
  };
}

export interface DocsSearchRequest {
  readonly query: string;
  /** Maximum number of documents. */
  readonly limit: number;
  /** Include documents under the project's non-authoritative prefixes. */
  readonly includeNonAuthoritative: boolean;
  /**
   * Re-embed changed documents before answering (ADR 0020 read-time refresh), at most
   * `READ_REFRESH_MAX_CHUNKS`; a larger gap answers lexically with `index-building`.
   */
  readonly refresh: boolean;
  /**
   * The command line that builds the index as the caller's host invokes it, named in
   * `index-building` messages. Default `SEMANTIC_INDEX_COMMAND` (the product command).
   */
  readonly semanticIndexCommand?: string;
}

export async function searchDocumentation(
  search: DocsSearch,
  request: DocsSearchRequest,
): Promise<DocsSearchResult> {
  const { chunks } = search.chunks.load();
  const vectors = await vectorsFor(
    search.vectors,
    chunks,
    request.refresh,
    request.semanticIndexCommand ?? SEMANTIC_INDEX_COMMAND,
  );
  const result = await createSearchEngine(chunks).search({
    query: request.query,
    limit: request.limit,
    vectors,
    filter: (chunk) =>
      request.includeNonAuthoritative || !(chunk as DocsChunk).metadata.nonAuthoritative,
  });

  const results = result.hits.map(toHit);

  return result.mode === 'hybrid'
    ? { mode: 'hybrid', results }
    : { mode: 'lexical', reason: searchReason(result.reason), results };
}

async function vectorsFor(
  vectors: DocsSearchVectors,
  chunks: readonly DocsChunk[],
  refresh: boolean,
  indexCommand: string,
): Promise<SearchVectors> {
  if ('reason' in vectors) {
    return { reason: vectors.reason };
  }

  const notReady = await prepareIndex(vectors, chunks, refresh, indexCommand);
  if (notReady !== undefined) {
    return { reason: notReady };
  }

  return { provider: vectors.providers.query, store: vectors.store };
}

/**
 * Hybrid ranking needs a vector for every current chunk (ADR 0020: an index that is not complete
 * for the current data answers lexically with `index-building`). The manifest is checked first, so
 * a complete index costs no endpoint call here. Otherwise a small gap is embedded before answering,
 * after a short probe (an unreachable endpoint answers lexically after at most the query timeout);
 * a gap above `READ_REFRESH_MAX_CHUNKS`, or any gap with `refresh` off, is not embedded.
 */
async function prepareIndex(
  vectors: Exclude<DocsSearchVectors, { readonly reason: DocsSearchReason }>,
  chunks: readonly DocsChunk[],
  refresh: boolean,
  indexCommand: string,
): Promise<DocsSearchReason | undefined> {
  const { store, providers } = vectors;
  const manifest = await store.readManifest();
  if (manifest.status === 'unreadable') {
    return unreadableIndexReason(manifest.message);
  }

  let missing = chunks.length;
  if (manifest.status === 'ok') {
    const plan = planRefresh(
      chunks,
      {
        chunkerVersion: CHUNKER_VERSION,
        protocol: providers.documents.protocol,
        model: providers.documents.model,
        dimensions: providers.documents.dimensions ?? manifest.manifest.identity.dimensions,
      },
      manifest.manifest,
    );
    missing = plan.reset ? chunks.length : plan.embed.length;
  }

  // Vectors of deleted chunks are never ranked (the engine matches chunk ids and hashes), so an
  // index with only extra vectors is complete; the next full refresh drops them.
  if (missing === 0) {
    return undefined;
  }

  if (!refresh) {
    return refreshSkippedReason(missing, chunks.length, indexCommand);
  }

  if (missing > READ_REFRESH_MAX_CHUNKS) {
    return overLimitReason(missing, READ_REFRESH_MAX_CHUNKS, indexCommand);
  }

  const probe = await providers.query.probe();
  if (!probe.ok) {
    return embeddingFailureReason(probe.failure);
  }

  // The bound holds under the lock too: a re-probe that observes another dimension, or a manifest
  // gone since the read above, turns this into a full rebuild, which the search must not run.
  const outcome = await refreshIndex({
    chunks,
    provider: providers.documents,
    store,
    maxEmbed: READ_REFRESH_MAX_CHUNKS,
  });

  return outcome.status === 'over-limit'
    ? overLimitReason(outcome.pending, READ_REFRESH_MAX_CHUNKS, indexCommand)
    : refreshReason(outcome);
}

function toHit(hit: UnitHit): DocsSearchHit {
  const best = hit.chunks[0]!.chunk as DocsChunk;

  return {
    id: hit.unitId,
    title: best.metadata.title,
    file: best.metadata.file,
    score: hit.score,
    chunks: hit.chunks.slice(0, CHUNKS_PER_RESULT).map(({ chunk, score }) => ({
      headingPath: [...chunk.headingPath],
      snippet: snippet(chunk.text, isContinuationPart(chunk)),
      score,
    })),
  };
}

/**
 * A second or later part of an oversize section (ADR 0021 chunking): it starts inside the section,
 * usually inside a word. The first part of a section with a heading starts with its heading line;
 * text before the first heading has the empty heading path and part ids `<unit>#/<n>`.
 */
function isContinuationPart(chunk: Chunk): boolean {
  return chunk.headingPath.length > 0
    ? !/^ {0,3}#{1,6}(?:\s|$)/u.test(chunk.text)
    : /#\/(?:[2-9]|[1-9]\d+)$/u.test(chunk.id);
}

/**
 * The section text without its heading lines, on one line, cut at a word boundary. A continuation
 * part drops its first, usually partial, word and starts with an ellipsis.
 */
export function snippet(text: string, continuation = false): string {
  let prose = text
    .split('\n')
    .filter((line) => !/^#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (continuation) {
    const rest = prose.replace(/^\S*\s+/u, '');
    prose = rest === prose ? prose : `…${rest}`;
  }

  if (prose.length <= SNIPPET_MAX_CHARS) {
    return prose;
  }

  const cut = prose.slice(0, SNIPPET_MAX_CHARS);
  const space = cut.lastIndexOf(' ');

  return `${(space > SNIPPET_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
