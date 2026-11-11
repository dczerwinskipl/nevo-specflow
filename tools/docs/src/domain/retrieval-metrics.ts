// Retrieval metrics of the repository's documentation search eval (`pnpm docs:eval`), pure.

export type EvalLanguage = 'en' | 'pl';

/** One eval question with the documents a good answer must return. */
export interface EvalQuestion {
  readonly question: string;
  readonly lang: EvalLanguage;
  /**
   * Stable ids of the expected documents (1..3). Empty for a question the documentation does not
   * answer: it is not scored, only its diagnostics are reported.
   */
  readonly expected: readonly string[];
}

export interface QuestionScore {
  readonly recallAt5: number;
  readonly recallAt10: number;
  /** 1 / rank of the first expected document in the top 10; 0 when none is there. */
  readonly reciprocalRank: number;
}

export interface EvalSummary {
  readonly questions: number;
  readonly recallAt5: number;
  readonly recallAt10: number;
  readonly mrr: number;
}

/** Recall@k: the share of the expected documents among the first `k` ids. */
function recallAt(expected: readonly string[], ids: readonly string[], k: number): number {
  const top = new Set(ids.slice(0, k));

  return expected.filter((id) => top.has(id)).length / expected.length;
}

/** Scores the ranked `ids` of an answerable question (`expected` not empty). */
export function scoreQuestion(question: EvalQuestion, ids: readonly string[]): QuestionScore {
  const expected = new Set(question.expected);
  const first = ids.slice(0, 10).findIndex((id) => expected.has(id));

  return {
    recallAt5: recallAt(question.expected, ids, 5),
    recallAt10: recallAt(question.expected, ids, 10),
    reciprocalRank: first === -1 ? 0 : 1 / (first + 1),
  };
}

/** Means over the scores (macro average). */
export function summarize(scores: readonly QuestionScore[]): EvalSummary {
  const mean = (pick: (score: QuestionScore) => number) =>
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + pick(score), 0) / scores.length;

  return {
    questions: scores.length,
    recallAt5: mean((score) => score.recallAt5),
    recallAt10: mean((score) => score.recallAt10),
    mrr: mean((score) => score.reciprocalRank),
  };
}

/** How many of the `ids` before the first expected one (all of them without one) are `flagged`. */
export function flaggedBeforeExpected(
  ids: readonly string[],
  expected: readonly string[],
  flagged: (id: string) => boolean,
): number {
  const first = ids.findIndex((id) => expected.includes(id));

  return ids.slice(0, first === -1 ? ids.length : first).filter(flagged).length;
}
