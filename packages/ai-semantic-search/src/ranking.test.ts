import { describe, expect, it } from 'vitest';

import { createBm25Index } from './bm25';
import { RRF_K, reciprocalRankFusion } from './rrf';
import { tokenize } from './tokenize';
import { cosineSimilarity, nearestNeighbours } from './vector-math';

describe('tokenize', () => {
  it('lower-cases, strips diacritics and splits on non-alphanumerics', () => {
    expect(tokenize('Zażółć GĘŚLĄ-jaźń v2.1')).toEqual(['zazołc', 'gesla', 'jazn', 'v2', '1']);
  });
});

describe('BM25', () => {
  const index = createBm25Index([
    { id: 'b', text: 'lock file on windows' },
    { id: 'a', text: 'lock file on windows' },
    { id: 'c', text: 'windows windows windows rename' },
    { id: 'd', text: 'unrelated text' },
  ]);

  it('ranks matching documents, rarer terms weigh more, ties break by id', () => {
    const ranking = index.search('lock windows');

    expect(ranking.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(ranking[0]!.score).toBe(ranking[1]!.score);
  });

  it('returns nothing for empty or unknown queries', () => {
    expect(index.search('  ')).toEqual([]);
    expect(index.search('missing')).toEqual([]);
  });
});

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

describe('reciprocal rank fusion', () => {
  it('sums reciprocal ranks over both lists', () => {
    const fused = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['c', 'b', 'd'],
    ]);

    expect(fused.map((entry) => entry.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 3), 12);
    expect(fused[1]!.score).toBeCloseTo(2 / (RRF_K + 2), 12);
  });

  it('breaks equal fused scores by id', () => {
    const fused = reciprocalRankFusion([
      ['y', 'x'],
      ['x', 'y'],
    ]);

    expect(fused.map((entry) => entry.id)).toEqual(['x', 'y']);
    expect(fused[0]!.score).toBe(fused[1]!.score);
  });
});
