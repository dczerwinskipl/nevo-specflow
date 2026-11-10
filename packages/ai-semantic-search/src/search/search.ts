import type { Chunk, UnitMetadata } from '../chunking/chunk';
import { CHUNKER_VERSION } from '../chunking/markdown-chunker';
import type { EmbeddingProvider } from '../embeddings/embedding-provider';
import type { IndexIdentity, VectorStore } from '../indexing/vector-store/vector-store';
import { createBm25Index } from '../ranking/bm25';
import { compareIds } from '../compare';
import { reciprocalRankFusion } from '../ranking/rrf';

/**
 * Why a search ran lexical-only. Consumers pass their own codes (for example "not configured");
 * the engine detects the `SEARCH_REASON` codes itself.
 */
export interface SearchReason {
  readonly code: string;
  readonly message: string;
}

export const SEARCH_REASON = {
  /** The store holds no index yet. */
  indexMissing: 'index-missing',
  /** The stored index was built with another chunker version, protocol, model or dimension. */
  indexMismatch: 'index-mismatch',
  /** The store could not be read (for example a locked or damaged index). */
  indexUnreadable: 'index-unreadable',
  /** The provider failed to embed the query. */
  queryEmbeddingFailed: 'query-embedding-failed',
} as const;

/** Vector candidates fused per requested unit; bounds the vector list before fusion. */
export const VECTOR_CANDIDATES_PER_RESULT = 10;

/** Either vectors to search, or the consumer's reason why there are none. */
export type SearchVectors =
  | { readonly provider: EmbeddingProvider; readonly store: VectorStore }
  | { readonly reason: SearchReason };

export interface SearchRequest {
  readonly query: string;
  /** Maximum number of units returned. */
  readonly limit: number;
  readonly vectors: SearchVectors;
  /** Consumer filter, applied after ranking and fusion and before grouping. */
  readonly filter?: (chunk: Chunk) => boolean;
}

export interface ChunkHit {
  readonly chunk: Chunk;
  /** BM25 score in lexical mode, reciprocal-rank-fusion score in hybrid mode. */
  readonly score: number;
}

export interface UnitHit {
  readonly unitId: string;
  readonly metadata: UnitMetadata;
  /** The score of the unit's best chunk. */
  readonly score: number;
  /** Matching chunks of the unit, best first. */
  readonly chunks: readonly ChunkHit[];
}

export type SearchResult =
  | { readonly mode: 'hybrid'; readonly hits: readonly UnitHit[] }
  | { readonly mode: 'lexical'; readonly reason: SearchReason; readonly hits: readonly UnitHit[] };

export interface SearchEngine {
  search(request: SearchRequest): Promise<SearchResult>;
}

/**
 * Builds a search engine over the current chunks of a corpus. Lexical ranking is BM25 over each
 * chunk's heading path and text. With vectors, the query embedding is ranked against one snapshot of
 * the store (at most `limit * VECTOR_CANDIDATES_PER_RESULT` matches) and both lists are fused by
 * reciprocal rank fusion; vector matches with a non-positive similarity, and stored vectors whose
 * chunk no longer exists or whose content hash differs from the current chunk, are ignored. Without
 * usable vectors the same call returns BM25 results with `mode: 'lexical'` and a reason; it never
 * fails because embeddings or the index are unavailable.
 */
export function createSearchEngine(chunks: readonly Chunk[]): SearchEngine {
  const byId = new Map<string, Chunk>();
  for (const chunk of chunks) {
    if (byId.has(chunk.id)) {
      throw new Error(`Duplicate chunk id: ${chunk.id}`);
    }

    byId.set(chunk.id, chunk);
  }

  const lexical = createBm25Index(
    chunks.map((chunk) => ({
      id: chunk.id,
      text: `${chunk.headingPath.join(' ')}\n${chunk.text}`,
    })),
  );

  return {
    async search(request) {
      if (!Number.isInteger(request.limit) || request.limit < 1) {
        throw new RangeError(`Search limit must be a positive integer, got ${request.limit}.`);
      }

      const lexicalRanking = lexical.search(request.query);
      const vectorRanking = await rankByVectors(request, byId);
      if ('reason' in vectorRanking) {
        return {
          mode: 'lexical',
          reason: vectorRanking.reason,
          hits: group(lexicalRanking, byId, request),
        };
      }

      const fused = reciprocalRankFusion([
        lexicalRanking.map((entry) => entry.id),
        vectorRanking.ids,
      ]);

      return { mode: 'hybrid', hits: group(fused, byId, request) };
    },
  };
}

async function rankByVectors(
  request: SearchRequest,
  byId: ReadonlyMap<string, Chunk>,
): Promise<{ readonly ids: readonly string[] } | { readonly reason: SearchReason }> {
  const { vectors } = request;
  if ('reason' in vectors) {
    return { reason: vectors.reason };
  }

  const embedded = await vectors.provider.embed([request.query], 'query');
  if (!embedded.ok) {
    return {
      reason: {
        code: SEARCH_REASON.queryEmbeddingFailed,
        message: `Query embedding failed (${embedded.failure.code}): ${embedded.failure.message}`,
      },
    };
  }

  const vector = embedded.vectors[0]!;
  const identity: IndexIdentity = {
    chunkerVersion: CHUNKER_VERSION,
    protocol: vectors.provider.protocol,
    model: vectors.provider.model,
    dimensions: vector.length,
  };
  const outcome = await vectors.store.query({
    identity,
    vector,
    limit: request.limit * VECTOR_CANDIDATES_PER_RESULT,
  });

  switch (outcome.status) {
    case 'missing':
      return {
        reason: {
          code: SEARCH_REASON.indexMissing,
          message: 'No vector index has been built yet.',
        },
      };
    case 'unreadable':
      return {
        reason: {
          code: SEARCH_REASON.indexUnreadable,
          message: `The vector index cannot be read: ${outcome.message}`,
        },
      };
    case 'mismatch':
      return {
        reason: {
          code: SEARCH_REASON.indexMismatch,
          message: describeMismatch(outcome.stored, identity),
        },
      };
    case 'ok':
      return {
        ids: outcome.matches
          .filter(
            (match) =>
              match.score > 0 && byId.get(match.chunkId)?.contentHash === match.contentHash,
          )
          .map((match) => match.chunkId),
      };
  }
}

function describeMismatch(stored: IndexIdentity, expected: IndexIdentity): string {
  for (const field of ['chunkerVersion', 'protocol', 'model', 'dimensions'] as const) {
    if (stored[field] !== expected[field]) {
      return `The index was built with ${field} ${String(stored[field])}; the current value is ${String(expected[field])}.`;
    }
  }

  return 'The index identity differs from the current one.';
}

function group(
  ranking: readonly { readonly id: string; readonly score: number }[],
  byId: ReadonlyMap<string, Chunk>,
  request: SearchRequest,
): UnitHit[] {
  const units = new Map<string, { metadata: UnitMetadata; chunks: ChunkHit[] }>();
  for (const { id, score } of ranking) {
    const chunk = byId.get(id)!;
    if (request.filter && !request.filter(chunk)) {
      continue;
    }

    const unit = units.get(chunk.unitId);
    if (unit) {
      unit.chunks.push({ chunk, score });
    } else {
      units.set(chunk.unitId, { metadata: chunk.metadata, chunks: [{ chunk, score }] });
    }
  }

  // The ranking is already ordered by score then chunk id, so each unit's first chunk is its best.
  return [...units]
    .map(([unitId, unit]) => ({
      unitId,
      metadata: unit.metadata,
      score: unit.chunks[0]!.score,
      chunks: unit.chunks,
    }))
    .sort((a, b) => b.score - a.score || compareIds(a.unitId, b.unitId))
    .slice(0, request.limit);
}
