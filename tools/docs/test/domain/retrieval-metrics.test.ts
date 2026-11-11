import { describe, expect, it } from 'vitest';

import {
  flaggedBeforeExpected,
  scoreQuestion,
  summarize,
} from '../../src/domain/retrieval-metrics.js';

describe('retrieval metrics', () => {
  it('scores recall at 5 and 10 and the reciprocal rank, averaged over questions', () => {
    const ids = ['x1', 'x2', 'a', 'x4', 'x5', 'b'];
    const hit = scoreQuestion({ question: 'q', lang: 'en', expected: ['a', 'b'] }, ids);
    expect(hit).toEqual({ recallAt5: 0.5, recallAt10: 1, reciprocalRank: 1 / 3 });

    const miss = scoreQuestion({ question: 'q', lang: 'pl', expected: ['c'] }, ids);
    expect(miss.reciprocalRank).toBe(0);
    expect(summarize([hit, miss])).toEqual({
      questions: 2,
      recallAt5: 0.25,
      recallAt10: 0.5,
      mrr: 1 / 6,
    });
  });

  it('counts flagged documents ranked above the first expected one', () => {
    const idea = (id: string) => id.startsWith('idea');
    expect(flaggedBeforeExpected(['idea1', 'a', 'idea2'], ['a'], idea)).toBe(1);
    expect(flaggedBeforeExpected(['idea1', 'b', 'idea2'], ['a'], idea)).toBe(2);
  });
});
