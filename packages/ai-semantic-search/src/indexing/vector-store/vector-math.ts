import { compareIds } from '../../compare';
import type { VectorMatch, VectorQuery } from './vector-store';

/** Cosine similarity of two equal-length vectors; 0 when either has zero norm. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new RangeError(`Vector dimensions differ: ${a.length} and ${b.length}.`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index]!;
    const y = b[index]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export interface VectorCandidate {
  readonly chunkId: string;
  readonly contentHash: string;
  readonly vector: Float32Array;
}

/**
 * Brute-force nearest neighbours by cosine similarity, ordered by score then chunk id, among the
 * candidates `accept` admits (all without it) before the `limit` cut. Shared by vector store
 * implementations so every store ranks identically.
 */
export function nearestNeighbours(
  query: Float32Array,
  candidates: Iterable<VectorCandidate>,
  limit: number,
  accept?: VectorQuery['accept'],
): VectorMatch[] {
  const matches: VectorMatch[] = [];
  for (const candidate of candidates) {
    if (accept && !accept(candidate.chunkId, candidate.contentHash)) {
      continue;
    }

    matches.push({
      chunkId: candidate.chunkId,
      contentHash: candidate.contentHash,
      score: cosineSimilarity(query, candidate.vector),
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || compareIds(a.chunkId, b.chunkId))
    .slice(0, limit);
}
