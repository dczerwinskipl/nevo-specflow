import { describe, expect, it } from 'vitest';

import { scoreQuestion, summarize } from '../../src/domain/retrieval-metrics.js';

describe('retrieval metrics', () => {
  it('scores recall at 5 and 10, the reciprocal rank and sums non-authoritative hits', () => {
    const ids = ['x1', 'x2', 'a', 'x4', 'x5', 'b'];
    const score = scoreQuestion(
      { question: 'q', expected: ['a', 'b'] },
      { ids, nonAuthoritative: 1 },
    );
    expect(score).toEqual({ recallAt5: 0.5, recallAt10: 1, reciprocalRank: 1 / 3 });

    const miss = scoreQuestion({ question: 'q', expected: ['c'] }, { ids, nonAuthoritative: 0 });
    expect(miss.reciprocalRank).toBe(0);
    expect(
      summarize(
        [score, miss],
        [
          { ids, nonAuthoritative: 1 },
          { ids, nonAuthoritative: 0 },
        ],
      ),
    ).toEqual({
      questions: 2,
      recallAt5: 0.25,
      recallAt10: 0.5,
      mrr: 1 / 6,
      nonAuthoritativeHits: 1,
    });
  });
});
