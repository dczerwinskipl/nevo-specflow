// `eval`: the repository's manual retrieval eval of documentation discovery (not a product command,
// not in CI). Runs every question through three variants over this repository's configuration and
// local `.nevo/local/` endpoint and index, without embedding any document (`refresh: false`):
// - `find`: the frontmatter-only lexical ranking of `docs context` (the discovery before `search`);
// - `lexical`: `docs search` without vectors (BM25 over sections fused with the frontmatter ranking);
// - `hybrid`: `docs search` as it answers (BM25 and vectors fused, then with the frontmatter).
// It scores the top 10 of each against the expected document ids, overall and per language.

import {
  asString,
  getContext,
  loadDocsSettings,
  openDocsSearch,
  openFileSystemCorpus,
  openProjectIndex,
  searchDocumentation,
  type DocsCorpusRules,
  type DocsSearch,
} from '@nevo/specflow-docs';
import type { DocsProject } from '@nevo/specflow-docs/cli';

import {
  flaggedBeforeExpected,
  scoreQuestion,
  summarize,
  type EvalLanguage,
  type EvalQuestion,
  type EvalSummary,
  type QuestionScore,
} from '../domain/retrieval-metrics.js';

/** Documents each question asks for: the depth of Recall@10 and MRR. */
export const EVAL_DEPTH = 10;

export const EVAL_VARIANTS = ['find', 'lexical', 'hybrid'] as const;
export type EvalVariant = (typeof EVAL_VARIANTS)[number];

export interface EvalQuestionResult {
  readonly question: string;
  readonly lang: EvalLanguage;
  readonly expected: readonly string[];
  /** The top documents of each variant; `score` only for an answerable question. */
  readonly variants: Readonly<
    Record<EvalVariant, { readonly ids: readonly string[]; readonly score?: QuestionScore }>
  >;
  /** The hybrid variant's mode: `hybrid`, or `lexical (<reason code>)` without usable vectors. */
  readonly hybridMode: string;
  /** Non-authoritative documents in the hybrid top 10 (a check of the default filter: 0). */
  readonly nonAuthoritative: number;
  /**
   * With non-authoritative documents included in the hybrid search, how many rank above the first
   * expected document (above all of them for a question without an answer).
   */
  readonly nonAuthoritativeAboveExpected: number;
  /** Cosine similarity of the best stored chunk to the query; absent without usable vectors. */
  readonly bestSimilarity?: number;
}

export interface EvalReport {
  /** Answerable questions only, per variant: all, English, Polish. */
  readonly summaries: Readonly<
    Record<EvalVariant, Readonly<Record<'all' | EvalLanguage, EvalSummary>>>
  >;
  readonly nonAuthoritativeHits: number;
  readonly nonAuthoritativeAboveExpected: number;
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
  const lexical: DocsSearch = {
    chunks: search.chunks,
    vectors: { reason: { code: 'semantic-disabled', message: 'The eval runs without vectors.' } },
  };

  const { documents } = await search.chunks.load();
  const nonAuthoritative = new Map(
    documents.map((document) => [asString(document.record.id), document.nonAuthoritative]),
  );
  const invalid = questions.flatMap((question) =>
    question.expected.filter((id) => nonAuthoritative.get(id) !== false),
  );
  if (invalid.length > 0) {
    throw new Error(
      `eval: expected ids are not active, authoritative documents: ${invalid.join(', ')}`,
    );
  }

  const searchIds = async (on: DocsSearch, includeNonAuthoritative: boolean, query: string) => {
    const result = await searchDocumentation(on, {
      query,
      limit: EVAL_DEPTH,
      includeNonAuthoritative,
      snippets: false,
      refresh: false,
    });

    return { result, ids: result.results.map((hit) => hit.id) };
  };

  const similarity = bestSimilarityOf(search);

  const results: EvalQuestionResult[] = [];
  for (const question of questions) {
    const query = question.question;
    const answerable = question.expected.length > 0;
    const hybrid = await searchIds(search, false, query);
    const ids: Record<EvalVariant, readonly string[]> = {
      find: getContext(corpus, { query, limit: EVAL_DEPTH }).map((entry) => entry.id),
      lexical: (await searchIds(lexical, false, query)).ids,
      hybrid: hybrid.ids,
    };
    const included = (await searchIds(search, true, query)).ids;
    const best = await similarity(query);
    results.push({
      question: query,
      lang: question.lang,
      expected: question.expected,
      variants: Object.fromEntries(
        EVAL_VARIANTS.map((variant) => [
          variant,
          {
            ids: ids[variant],
            ...(answerable ? { score: scoreQuestion(question, ids[variant]) } : {}),
          },
        ]),
      ) as EvalQuestionResult['variants'],
      hybridMode:
        hybrid.result.mode === 'hybrid' ? 'hybrid' : `lexical (${hybrid.result.reason.code})`,
      nonAuthoritative: hybrid.ids.filter((id) => nonAuthoritative.get(id) === true).length,
      nonAuthoritativeAboveExpected: flaggedBeforeExpected(
        included,
        question.expected,
        (id) => nonAuthoritative.get(id) === true,
      ),
      ...(best === undefined ? {} : { bestSimilarity: best }),
    });
  }

  const scored = (variant: EvalVariant, lang?: EvalLanguage) =>
    summarize(
      results
        .filter((result) => lang === undefined || result.lang === lang)
        .flatMap((result) => result.variants[variant].score ?? []),
    );

  return {
    summaries: Object.fromEntries(
      EVAL_VARIANTS.map((variant) => [
        variant,
        { all: scored(variant), en: scored(variant, 'en'), pl: scored(variant, 'pl') },
      ]),
    ) as EvalReport['summaries'],
    nonAuthoritativeHits: results.reduce((sum, result) => sum + result.nonAuthoritative, 0),
    nonAuthoritativeAboveExpected: results.reduce(
      (sum, result) => sum + result.nonAuthoritativeAboveExpected,
      0,
    ),
    results,
  };
}

/**
 * The cosine similarity of the best stored chunk to a query, straight from the vector store (all
 * documents, no filter, no fusion): a diagnostic of how close the nearest section is, also for a
 * question nothing answers. `undefined` without a usable index.
 */
function bestSimilarityOf(search: DocsSearch): (query: string) => Promise<number | undefined> {
  const { vectors } = search;
  if ('reason' in vectors) {
    return () => Promise.resolve(undefined);
  }

  return async (query) => {
    const manifest = await vectors.store.readManifest();
    const embedded = await vectors.providers.query.embed([query], 'query');
    if (manifest.status !== 'ok' || !embedded.ok) {
      return undefined;
    }

    const outcome = await vectors.store.query({
      identity: manifest.manifest.identity,
      vector: embedded.vectors[0]!,
      limit: 1,
    });

    return outcome.status === 'ok' ? outcome.matches[0]?.score : undefined;
  };
}
