/** Deterministic, locale-independent id order used as the tie-break of every ranking. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface Scored {
  readonly id: string;
  readonly score: number;
}

/** Score descending, then id ascending. */
export function compareScored(a: Scored, b: Scored): number {
  return b.score - a.score || compareIds(a.id, b.id);
}
