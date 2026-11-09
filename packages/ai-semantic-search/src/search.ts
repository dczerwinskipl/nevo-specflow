import { createBm25Index } from './bm25';
import { compareIds } from './compare';
import { CHUNKER_VERSION } from './markdown-chunker';
import type { Chunk, EmbeddingProvider, IndexIdentity, UnitMetadata, VectorStore } from './ports';
import { reciprocalRankFusion } from './rrf';

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
  /** The provider failed to embed the query. */
  queryEmbeddingFailed: 'query-embedding-failed',
} as const;

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
 * chunk's heading path and text. With vectors, the query embedding is ranked against the store and
 * both lists are fused by reciprocal rank fusion; vector matches with a non-positive similarity, and
 * stored vectors whose chunk no longer exists or whose content hash differs from the current chunk,
 * are ignored. Without usable vectors the same call
 * returns BM25 results with `mode: 'lexical'` and a reason; it never fails because of embeddings.
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

  const manifest = await vectors.store.readManifest();
  if (!manifest) {
    return {
      reason: { code: SEARCH_REASON.indexMissing, message: 'No vector index has been built yet.' },
    };
  }

  const mismatch = identityMismatch(manifest.identity, vectors.provider);
  if (mismatch) {
    return { reason: { code: SEARCH_REASON.indexMismatch, message: mismatch } };
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

  const queryVector = embedded.vectors[0]!;
  if (queryVector.length !== manifest.identity.dimensions) {
    return {
      reason: {
        code: SEARCH_REASON.indexMismatch,
        message: `The query embedding has ${queryVector.length} dimensions; the index has ${manifest.identity.dimensions}.`,
      },
    };
  }

  const matches = await vectors.store.query(queryVector, manifest.chunks.size);
  const ids = matches
    .filter((match) => {
      const chunk = byId.get(match.chunkId);

      return (
        match.score > 0 &&
        chunk !== undefined &&
        manifest.chunks.get(match.chunkId) === chunk.contentHash
      );
    })
    .map((match) => match.chunkId);

  return { ids };
}

function identityMismatch(stored: IndexIdentity, provider: EmbeddingProvider): string | undefined {
  const expected: Partial<IndexIdentity> = {
    chunkerVersion: CHUNKER_VERSION,
    protocol: provider.protocol,
    model: provider.model,
    ...(provider.dimensions === undefined ? {} : { dimensions: provider.dimensions }),
  };

  for (const [field, value] of Object.entries(expected)) {
    const actual = stored[field as keyof IndexIdentity];
    if (actual !== value) {
      return `The index was built with ${field} ${String(actual)}; the current value is ${String(value)}.`;
    }
  }

  return undefined;
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
