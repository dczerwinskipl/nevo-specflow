import { compareScored, type Scored } from './compare';

/** Reciprocal rank fusion constant (the value from Cormack et al., widely used as the default). */
export const RRF_K = 60;

/**
 * Fuses ranked id lists: each id scores the sum of `1 / (RRF_K + rank)` over the lists it appears in
 * (rank is 1-based). Ordered by fused score then id.
 */
export function reciprocalRankFusion(lists: readonly (readonly string[])[]): Scored[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + index + 1));
    });
  }

  return [...scores].map(([id, score]) => ({ id, score })).sort(compareScored);
}
