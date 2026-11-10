// Retrieval metrics of the repository's documentation search eval (`pnpm docs:eval`), pure.

/** One eval question with the documents a good answer must return. */
export interface EvalQuestion {
  readonly question: string;
  /** Stable ids of the expected documents (1..3). */
  readonly expected: readonly string[];
}

/** What one search returned for a question. */
export interface EvalAnswer {
  /** Document ids in rank order (at most the eval's depth). */
  readonly ids: readonly string[];
  /**
   * How many of the returned documents are non-authoritative. The default search excludes them, so
   * this checks the filter only.
   */
  readonly nonAuthoritative: number;
  /**
   * With non-authoritative documents included in the search: how many of them rank above the first
   * expected document (in the whole top list when no expected document is in it).
   */
  readonly nonAuthoritativeAboveExpected: number;
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
  /** Non-authoritative documents over all default top-10 lists (a check of the filter: 0). */
  readonly nonAuthoritativeHits: number;
  /** Over all questions, `EvalAnswer.nonAuthoritativeAboveExpected`. */
  readonly nonAuthoritativeAboveExpected: number;
}

/** Recall@k: the share of the expected documents among the first `k` ids. */
function recallAt(expected: readonly string[], ids: readonly string[], k: number): number {
  const top = new Set(ids.slice(0, k));

  return expected.filter((id) => top.has(id)).length / expected.length;
}

export function scoreQuestion(question: EvalQuestion, answer: EvalAnswer): QuestionScore {
  const expected = new Set(question.expected);
  const first = answer.ids.slice(0, 10).findIndex((id) => expected.has(id));

  return {
    recallAt5: recallAt(question.expected, answer.ids, 5),
    recallAt10: recallAt(question.expected, answer.ids, 10),
    reciprocalRank: first === -1 ? 0 : 1 / (first + 1),
  };
}

/** Means over the questions (macro average), plus the non-authoritative totals. */
export function summarize(
  scores: readonly QuestionScore[],
  answers: readonly EvalAnswer[],
): EvalSummary {
  const mean = (pick: (score: QuestionScore) => number) =>
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + pick(score), 0) / scores.length;

  return {
    questions: scores.length,
    recallAt5: mean((score) => score.recallAt5),
    recallAt10: mean((score) => score.recallAt10),
    mrr: mean((score) => score.reciprocalRank),
    nonAuthoritativeHits: answers.reduce((sum, answer) => sum + answer.nonAuthoritative, 0),
    nonAuthoritativeAboveExpected: answers.reduce(
      (sum, answer) => sum + answer.nonAuthoritativeAboveExpected,
      0,
    ),
  };
}
