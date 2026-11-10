// `eval`: the repository's manual retrieval eval of `docs search` (not a product command, not in
// CI). Runs every question through the same search `pnpm docs:search` answers with (this
// repository's configuration, local `.nevo/local/` endpoint and index), without embedding anything
// (`refresh: false`), and scores the top 10 against the expected document ids.

import {
  asString,
  loadDocsSettings,
  openDocsSearch,
  openFileSystemCorpus,
  openProjectIndex,
  searchDocumentation,
  type DocsCorpusRules,
} from '@nevo/specflow-docs';
import type { DocsProject } from '@nevo/specflow-docs/cli';

import {
  scoreQuestion,
  summarize,
  type EvalAnswer,
  type EvalQuestion,
  type EvalSummary,
  type QuestionScore,
} from '../domain/retrieval-metrics.js';

/** Documents each question asks for: the depth of Recall@10 and MRR. */
export const EVAL_DEPTH = 10;

export interface EvalQuestionResult extends QuestionScore {
  readonly question: string;
  readonly expected: readonly string[];
  /** `hybrid`, or `lexical (<reason code>)`. */
  readonly mode: string;
  readonly ids: readonly string[];
  readonly nonAuthoritative: number;
}

export interface EvalReport {
  readonly summary: EvalSummary;
  readonly results: readonly EvalQuestionResult[];
}

export async function runEval(
  project: DocsProject,
  rules: DocsCorpusRules,
  questions: readonly EvalQuestion[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<EvalReport> {
  const configuration = loadDocsSettings(project);
  const corpus = openFileSystemCorpus(project.root, configuration.docs, rules);
  const index = await openProjectIndex(project.root, corpus, configuration);
  const search = openDocsSearch({ corpus, configuration, env, index });

  const { documents } = await search.chunks.load();
  const nonAuthoritative = new Map(
    documents.map((document) => [asString(document.record.id), document.nonAuthoritative]),
  );
  const unknown = questions.flatMap((question) =>
    question.expected.filter((id) => !nonAuthoritative.has(id)),
  );
  if (unknown.length > 0) {
    throw new Error(`eval: expected ids are not active documents: ${unknown.join(', ')}`);
  }

  const results: EvalQuestionResult[] = [];
  for (const question of questions) {
    const result = await searchDocumentation(search, {
      query: question.question,
      limit: EVAL_DEPTH,
      includeNonAuthoritative: false,
      snippets: false,
      refresh: false,
    });
    const ids = result.results.map((hit) => hit.id);
    const answer: EvalAnswer = {
      ids,
      nonAuthoritative: ids.filter((id) => nonAuthoritative.get(id) === true).length,
    };
    results.push({
      question: question.question,
      expected: question.expected,
      mode: result.mode === 'hybrid' ? 'hybrid' : `lexical (${result.reason.code})`,
      ...answer,
      ...scoreQuestion(question, answer),
    });
  }

  return { summary: summarize(results, results), results };
}
