import { describe, expect, it } from 'vitest';

import { scoreQuestion, summarize } from '../../src/domain/retrieval-metrics.js';

describe('retrieval metrics', () => {
  it('scores recall at 5 and 10, the reciprocal rank and sums non-authoritative hits', () => {
    const ids = ['x1', 'x2', 'a', 'x4', 'x5', 'b'];
    const hit = { ids, nonAuthoritative: 1, nonAuthoritativeAboveExpected: 2 };
    const none = { ids, nonAuthoritative: 0, nonAuthoritativeAboveExpected: 0 };
    const score = scoreQuestion({ question: 'q', expected: ['a', 'b'] }, hit);
    expect(score).toEqual({ recallAt5: 0.5, recallAt10: 1, reciprocalRank: 1 / 3 });

    const miss = scoreQuestion({ question: 'q', expected: ['c'] }, none);
    expect(miss.reciprocalRank).toBe(0);
    expect(summarize([score, miss], [hit, none])).toEqual({
      questions: 2,
      recallAt5: 0.25,
      recallAt10: 0.5,
      mrr: 1 / 6,
      nonAuthoritativeHits: 1,
      nonAuthoritativeAboveExpected: 2,
    });
  });
});
