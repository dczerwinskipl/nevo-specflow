// `docs search`: ranked document sections for a question, hybrid when the configured endpoint and the
// index allow it and lexical with a stated reason otherwise. Embeddings and the index never make a
// search fail; the corpus and the configuration are validated like for every `docs` command.

import { createSearchEngine, type SearchVectors } from '@nevo/ai-semantic-search';
import type { DocsSearchReason, DocsSearchResult } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { DocsCorpus } from '../corpus/corpus';
import {
  createEmbeddingProviders,
  type CreateEmbeddingProvider,
} from '../embeddings/embedding-providers';
import {
  createDocsChunkSource,
  type DocsChunk,
  type DocsChunkSource,
} from '../semantic-index/chunk-source';
import { openDocsIndex, type DocsIndex } from '../semantic-index/index-store';
import { SEMANTIC_INDEX_COMMAND, searchReason, semanticEndpoint } from '../semantic-index/reasons';
import { refreshForRead, type IndexVectors } from '../semantic-index/refresh-policy';
import { toHit } from './result';

/** Vectors for a search, or why there are none. */
export type DocsSearchVectors = { readonly reason: DocsSearchReason } | IndexVectors;

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
   * `READ_REFRESH_MAX_CHUNKS` (`semantic-index/refresh-policy`); a larger gap answers lexically with `index-building`.
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

  const notReady = await refreshForRead(vectors, chunks, refresh, indexCommand);
  if (notReady !== undefined) {
    return { reason: notReady };
  }

  return { provider: vectors.providers.query, store: vectors.store };
}
