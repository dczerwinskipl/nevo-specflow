import { describe, expect, it } from 'vitest';

import { createBm25Index } from './bm25';
import { RRF_K, reciprocalRankFusion } from './rrf';
import { tokenize } from './tokenize';

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
