import { describe, expect, it } from 'vitest';

import { cosineSimilarity, nearestNeighbours } from './vector-math';

describe('cosine similarity', () => {
  it('measures direction and rejects different dimensions', () => {
    expect(cosineSimilarity(Float32Array.of(1, 0), Float32Array.of(2, 0))).toBeCloseTo(1);
    expect(cosineSimilarity(Float32Array.of(1, 0), Float32Array.of(0, 1))).toBe(0);
    expect(cosineSimilarity(Float32Array.of(0, 0), Float32Array.of(1, 1))).toBe(0);
    expect(() => cosineSimilarity(Float32Array.of(1), Float32Array.of(1, 2))).toThrow(RangeError);
  });

  it('orders nearest neighbours by score then id and applies the limit', () => {
    const matches = nearestNeighbours(
      Float32Array.of(1, 0),
      [
        { chunkId: 'z', contentHash: 'z', vector: Float32Array.of(1, 0) },
        { chunkId: 'y', contentHash: 'y', vector: Float32Array.of(0, 1) },
        { chunkId: 'x', contentHash: 'x', vector: Float32Array.of(3, 0) },
      ],
      2,
    );

    expect(matches.map((match) => match.chunkId)).toEqual(['x', 'z']);
  });
});
