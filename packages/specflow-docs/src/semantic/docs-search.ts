// `docs search`: ranked document sections for a question, hybrid when the configured endpoint and the
// index allow it and lexical with a stated reason otherwise. Embeddings and the index never make a
// search fail; the corpus and the configuration are validated like for every `docs` command.

import {
  CHUNKER_VERSION,
  createSearchEngine,
  planRefresh,
  refreshIndex,
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
import { openDocsIndex } from './docs-index';
import {
  embeddingFailureReason,
  refreshReason,
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
}

export function openDocsSearch(options: OpenDocsSearchOptions): DocsSearch {
  const { projectRoot, corpus, configuration } = options;
  const endpoint = semanticEndpoint(configuration);
  if ('reason' in endpoint) {
    // Nothing is written below `.nevo/` for a project that does not use semantic search.
    return { chunks: createDocsChunkSource({ corpus }), vectors: { reason: endpoint.reason } };
  }

  const index = openDocsIndex(projectRoot, corpus);
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
  /** Re-embed changed documents before answering (ADR 0020 read-time refresh). */
  readonly refresh: boolean;
}

export async function searchDocumentation(
  search: DocsSearch,
  request: DocsSearchRequest,
): Promise<DocsSearchResult> {
  const { chunks } = search.chunks.load();
  const vectors = await vectorsFor(search.vectors, chunks, request.refresh);
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
): Promise<SearchVectors> {
  if ('reason' in vectors) {
    return { reason: vectors.reason };
  }

  if (refresh) {
    const notReady = await refreshForRead(vectors, chunks);
    if (notReady !== undefined) {
      return { reason: notReady };
    }
  }

  return { provider: vectors.providers.query, store: vectors.store };
}

/**
 * Read-time refresh. The manifest is checked first, so an up-to-date index costs no endpoint call
 * here. Otherwise a short probe gates the refresh: an unreachable endpoint answers lexically after
 * at most the query timeout instead of the document timeout.
 */
async function refreshForRead(
  vectors: Exclude<DocsSearchVectors, { readonly reason: DocsSearchReason }>,
  chunks: readonly DocsChunk[],
): Promise<DocsSearchReason | undefined> {
  const { store, providers } = vectors;
  const manifest = await store.readManifest();
  if (manifest.status === 'unreadable') {
    return unreadableIndexReason(manifest.message);
  }

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
    if (!plan.reset && plan.embed.length === 0 && plan.delete.length === 0) {
      return undefined;
    }
  }

  const probe = await providers.query.probe();
  if (!probe.ok) {
    return embeddingFailureReason(probe.failure);
  }

  return refreshReason(await refreshIndex({ chunks, provider: providers.documents, store }));
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
      snippet: snippet(chunk.text),
      score,
    })),
  };
}

/** The section text without its heading lines, on one line, cut at a word boundary. */
export function snippet(text: string): string {
  const prose = text
    .split('\n')
    .filter((line) => !/^#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (prose.length <= SNIPPET_MAX_CHARS) {
    return prose;
  }

  const cut = prose.slice(0, SNIPPET_MAX_CHARS);
  const space = cut.lastIndexOf(' ');

  return `${(space > SNIPPET_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
