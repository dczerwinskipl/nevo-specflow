// `docs search`: ranked documents for a question, hybrid when the configured endpoint and the index
// allow it and lexical with a stated reason otherwise. Embeddings and the index never make a search
// fail; the corpus and the configuration are validated like for every `docs` command.

import {
  SEARCH_REASON,
  type EmbeddingProvider,
  type EmbeddingPurpose,
  reciprocalRankFusion,
  type SearchReason,
  type SearchVectors,
  type UnitHit,
} from '@nevo/ai-semantic-search';
import type { DocsSearchReason, DocsSearchResult } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { DocsCorpus } from '../corpus/corpus';
import { rankByContent } from '../frontmatter/frontmatter-search';
import { asString } from '../frontmatter/contract';
import {
  createEmbeddingProviders,
  type CreateEmbeddingProvider,
} from '../embeddings/embedding-providers';
import {
  createDocsChunkSource,
  type DocsChunk,
  type DocsChunks,
  type DocsChunkSource,
} from '../semantic-index/chunk-source';
import type { IndexCatchUp } from '../semantic-index/catch-up';
import type { DocsIndex } from '../semantic-index/index-store';
import type { IndexWrites } from '../semantic-index/write-admission';
import { readIndexActivity } from '../semantic-index/progress';
import { SEMANTIC_INDEX_COMMAND, searchReason, semanticEndpoint } from '../semantic-index/reasons';
import {
  endpointFailureReason,
  identityChangedForRead,
  refreshForRead,
  type IndexVectors,
} from '../semantic-index/refresh-policy';
import { toHit } from './result';

/**
 * Candidates each ranking contributes per requested document before the two are fused, so a document
 * just below the limit in one ranking and high in the other can still be returned.
 */
export const DOCUMENT_CANDIDATES_PER_RESULT = 3;

/**
 * Vectors for a search, or why there are none. With `writes`, a refused write admission is reported
 * before that reason.
 */
export type DocsSearchVectors =
  { readonly reason: DocsSearchReason; readonly writes?: IndexWrites } | IndexVectors;

/**
 * Everything a project's searches share. Open it once per project and process (a CLI invocation, or
 * a running Runtime) and reuse it: the vector store decodes the vectors file once per generation and
 * the chunk source keeps the parsed corpus and its BM25 engine in memory between searches, rebuilt
 * only when a document's content changes.
 */
export interface DocsSearch {
  readonly chunks: DocsChunkSource;
  readonly vectors: DocsSearchVectors;
}

export interface OpenDocsSearchOptions {
  readonly corpus: DocsCorpus;
  readonly configuration: DocsConfiguration;
  /** Environment the API key variable is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Test seam; production uses the OpenAI-compatible adapter. */
  readonly createProvider?: CreateEmbeddingProvider;
  /**
   * The project's index (`openDocsIndex`), whose writes its admission gates. A process keeps one per
   * index directory, for example a Runtime that also refreshes it. Unused without semantic search,
   * so nothing is written below `.nevo/` then.
   */
  readonly index: DocsIndex;
  /** Catches a large gap up in the background (`IndexVectors.catchUp`). */
  readonly catchUp?: IndexCatchUp;
}

export function openDocsSearch(options: OpenDocsSearchOptions): DocsSearch {
  const { corpus, configuration, index } = options;
  const endpoint = semanticEndpoint(configuration);
  if ('reason' in endpoint) {
    // Nothing is written below `.nevo/` for a project that does not use semantic search.
    return { chunks: createDocsChunkSource({ corpus }), vectors: { reason: endpoint.reason } };
  }

  const created = createEmbeddingProviders(endpoint.embeddings, {
    env: options.env,
    ...(options.createProvider ? { createProvider: options.createProvider } : {}),
  });
  if (!created.ok) {
    return { chunks: index.chunks, vectors: { reason: created.reason, writes: index.writes } };
  }

  return {
    chunks: index.chunks,
    vectors: {
      store: index.store,
      writes: index.writes,
      providers: created.providers,
      ...(options.catchUp ? { catchUp: options.catchUp } : {}),
      ...(index.directory === undefined
        ? {}
        : { activity: () => readIndexActivity(index.directory!) }),
    },
  };
}

export interface DocsSearchRequest {
  readonly query: string;
  /** Maximum number of documents. */
  readonly limit: number;
  /** Include documents under the project's proposal prefixes. */
  readonly includeProposals: boolean;
  /** Add each section's query-aware excerpt (`snippet`) to the result. */
  readonly snippets: boolean;
  /**
   * Re-embed changed documents before answering (ADR 0020 read-time refresh), at most
   * `READ_REFRESH_MAX_CHUNKS` (`semantic-index/refresh-policy`); a larger gap answers lexically with
   * `index-building` and has the search's catch-up, if any, update the index in the background.
   */
  readonly refresh: boolean;
  /**
   * The command line that builds the index as the caller's host invokes it, named in
   * `index-building` messages. Default `SEMANTIC_INDEX_COMMAND` (the product command).
   */
  readonly semanticIndexCommand?: string;
}

/**
 * Ranks documents by fusing two rankings with reciprocal rank fusion (`reciprocalRankFusion`, equal
 * weight, rank-based, so the incomparable scores never mix):
 * - the section ranking of the search engine, documents in the order of their best section (BM25
 *   over heading paths and section text, fused with the vector ranking in hybrid mode);
 * - the frontmatter ranking (`rankByContent`: `docs find`'s field weights and English plural
 *   folding over title, id, scope, areas, tags, read_when and summary, ignoring query terms common
 *   to many documents), which finds a document by what it says it is about even when no section
 *   repeats the words.
 * A document with no section among the section ranking's candidates has no sections.
 */
export async function searchDocumentation(
  search: DocsSearch,
  request: DocsSearchRequest,
): Promise<DocsSearchResult> {
  const loaded = await search.chunks.load();
  const vectors = await vectorsFor(
    search.vectors,
    loaded.chunks,
    request.refresh,
    request.semanticIndexCommand ?? SEMANTIC_INDEX_COMMAND,
  );

  return rank(search, request, loaded, vectors);
}

/** A search result plus how many proposals the same search would have added. */
export type DocsSearchWithLeftOut = DocsSearchResult & {
  /**
   * Proposals among the results of the same query run with
   * `includeProposals` and the same `limit`; `0` when the request already includes them.
   * The query is embedded once for both runs.
   */
  readonly proposalsLeftOut: number;
};

/**
 * `searchDocumentation` that also counts the proposals it left out, for a reader
 * that offers to include them. The second ranking reuses the first one's query vector and the
 * loaded corpus; only the ranking runs twice.
 */
export async function searchDocumentationWithLeftOut(
  search: DocsSearch,
  request: DocsSearchRequest,
): Promise<DocsSearchWithLeftOut> {
  const loaded = await search.chunks.load();
  const prepared = await vectorsFor(
    search.vectors,
    loaded.chunks,
    request.refresh,
    request.semanticIndexCommand ?? SEMANTIC_INDEX_COMMAND,
  );
  const vectors = 'reason' in prepared ? prepared : withQueryEmbeddedOnce(prepared);
  const result = await rank(search, request, loaded, vectors);
  if (request.includeProposals) {
    return { ...result, proposalsLeftOut: 0 };
  }

  const including = await rank(
    search,
    { ...request, includeProposals: true, refresh: false },
    loaded,
    vectors,
  );
  const proposals = new Set(
    loaded.documents
      .filter((document) => document.proposal)
      .map((document) => asString(document.record.id)),
  );

  return {
    ...result,
    proposalsLeftOut: including.results.filter((hit) => proposals.has(hit.id)).length,
  };
}

/** The same provider, except that the embedding of one query is requested from it only once. */
function withQueryEmbeddedOnce(
  vectors: Extract<SearchVectors, { provider: unknown }>,
): SearchVectors {
  const embedded = new Map<string, ReturnType<EmbeddingProvider['embed']>>();
  const { provider: inner } = vectors;
  const provider: EmbeddingProvider = {
    protocol: inner.protocol,
    model: inner.model,
    space: inner.space,
    dimensions: inner.dimensions,
    probe: () => inner.probe(),
    embed: (texts: readonly string[], purpose: EmbeddingPurpose) => {
      const key = JSON.stringify([purpose, texts]);
      let result = embedded.get(key);
      if (result === undefined) {
        result = inner.embed(texts, purpose);
        embedded.set(key, result);
      }

      return result;
    },
  };

  return { ...vectors, provider };
}

async function rank(
  search: DocsSearch,
  request: DocsSearchRequest,
  { chunks, documents, searchEngine, skipped }: DocsChunks,
  vectors: SearchVectors,
): Promise<DocsSearchResult> {
  const candidates = request.limit * DOCUMENT_CANDIDATES_PER_RESULT;
  const sections = await searchEngine().search({
    query: request.query,
    limit: candidates,
    vectors,
    filter: (chunk) => request.includeProposals || !(chunk as DocsChunk).metadata.proposal,
  });
  const searched = documents
    .filter((document) => request.includeProposals || !document.proposal)
    .map((document) => document.record);
  const byFrontmatter = rankByContent(searched, request.query, candidates);

  const records = new Map(searched.map((record) => [asString(record.id), record]));
  const sectionsById = new Map<string, UnitHit>(sections.hits.map((hit) => [hit.unitId, hit]));
  const results = reciprocalRankFusion([
    sections.hits.map((hit) => hit.unitId),
    byFrontmatter.map((record) => asString(record.id)),
  ])
    .slice(0, request.limit)
    .map(({ id, score }) =>
      toHit(
        records.get(id)!,
        sectionsById.get(id),
        score,
        request.snippets ? request.query : undefined,
      ),
    );

  return sections.mode === 'hybrid'
    ? { mode: 'hybrid', results, skipped }
    : {
        mode: 'lexical',
        reason: await lexicalReason(search.vectors, sections.reason, chunks.length, request),
        results,
        skipped,
      };
}

/** An identity mismatch the engine found is a rebuild need; any other reason maps as it is. */
async function lexicalReason(
  vectors: DocsSearchVectors,
  engine: SearchReason,
  total: number,
  request: DocsSearchRequest,
): Promise<DocsSearchReason> {
  if (
    engine.code === SEARCH_REASON.queryEmbeddingFailed &&
    engine.failure !== undefined &&
    !('reason' in vectors)
  ) {
    return endpointFailureReason(vectors, engine.failure);
  }

  return engine.code === SEARCH_REASON.indexMismatch && !('reason' in vectors)
    ? identityChangedForRead(
        vectors,
        engine.message,
        total,
        request.refresh,
        request.semanticIndexCommand ?? SEMANTIC_INDEX_COMMAND,
      )
    : searchReason(engine);
}

async function vectorsFor(
  vectors: DocsSearchVectors,
  chunks: readonly DocsChunk[],
  refresh: boolean,
  indexCommand: string,
): Promise<SearchVectors> {
  // While the index must not be written (a refused write admission), the search is lexical, also
  // when the endpoint is unusable: the index is reported first, as `semantic index` does.
  const blocked = await vectors.writes?.blocked();
  if (blocked !== undefined) {
    return { reason: blocked };
  }

  if ('reason' in vectors) {
    return { reason: vectors.reason };
  }

  const notReady = await refreshForRead(vectors, chunks, refresh, indexCommand);
  if (notReady !== undefined) {
    return { reason: notReady };
  }

  return { provider: vectors.providers.query, store: vectors.store };
}
