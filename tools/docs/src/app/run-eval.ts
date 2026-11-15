// `eval`: the repository's manual retrieval eval of documentation discovery (not a product command,
// not in CI). Runs every question through these variants over this repository's configuration and
// local `.nevo/local/` endpoint and index, without embedding any document (`refresh: false`):
// - `context`: the frontmatter-only lexical ranking of `docs context` (discovery before `search`);
// - `lexical`: `docs search` without vectors (BM25 over sections fused with the frontmatter ranking);
// - `hybrid@<floor>`: `docs search` as it answers (BM25 and vectors fused, then with the
//   frontmatter), once per relevance floor (`ai.embeddings.minSimilarity`; `none` for no floor).
// It scores the top 10 of each against the expected document ids, overall, per language and per
// question class, and counts false positives: questions without an answer that get a document found
// by meaning only (`wordMatch: false`).

import {
  asString,
  getContext,
  loadDocsSettings,
  openDocsSearch,
  openFileSystemCorpus,
  openProjectIndex,
  searchDocumentation,
  type DocsConfiguration,
  type DocsCorpusRules,
  type DocsSearch,
} from '@nevo/specflow-docs';
import type { DocsProject } from '@nevo/specflow-docs/cli';

import {
  ANSWERABLE_CLASSES,
  EVAL_CLASSES,
  flaggedBeforeExpected,
  scoreQuestion,
  summarize,
  type EvalClass,
  type EvalLanguage,
  type EvalQuestion,
  type EvalSummary,
  type QuestionScore,
} from '../domain/retrieval-metrics.js';

/** Documents each question asks for: the depth of Recall@10 and MRR. */
export const EVAL_DEPTH = 10;

/** A relevance floor of the hybrid variant; `null` runs without one. */
export type EvalFloor = number | null;

export interface EvalOptions {
  /**
   * Floors to run the hybrid variant with, in order. Absent: the configured
   * `ai.embeddings.minSimilarity` (none when it is not set).
   */
  readonly floors?: readonly EvalFloor[];
  /**
   * Replaces `ai.embeddings.queryInstruction` for this run; `null` removes it. Absent: the
   * configured one. The index identity does not include it, so one index serves every instruction.
   */
  readonly queryInstruction?: string | null;
}

export interface EvalVariantResult {
  readonly ids: readonly string[];
  /** Documents found by meaning only (`wordMatch: false`). */
  readonly vectorOnly: number;
  /** Only for an answerable question. */
  readonly score?: QuestionScore;
}

export interface EvalQuestionResult {
  readonly question: string;
  readonly lang?: EvalLanguage;
  readonly class: EvalClass;
  readonly expected: readonly string[];
  /** The top documents of each variant, by variant name (`EvalReport.variants`). */
  readonly variants: Readonly<Record<string, EvalVariantResult>>;
  /** The first hybrid variant's mode: `hybrid`, or `lexical (<reason code>)` without vectors. */
  readonly hybridMode: string;
  /** Proposals in the first hybrid variant's top 10 (a check of the default filter: 0). */
  readonly proposals: number;
  /**
   * With proposals included in the first hybrid variant, how many rank above the first expected
   * document (above all of them for a question without an answer).
   */
  readonly proposalsAboveExpected: number;
  /** Cosine similarity of the best stored chunk to the query; absent without usable vectors. */
  readonly bestSimilarity?: number;
}

/** Questions without an answer of one class, and how many got any or a vector-only document. */
export interface EvalFalsePositives {
  readonly questions: number;
  /** Questions with at least one vector-only document: the false positives. */
  readonly withVectorOnly: number;
  /** Questions with any document at all. */
  readonly withAny: number;
}

/** Summary groups: every answerable question, per language and per answerable class. */
export type EvalGroup = 'all' | EvalLanguage | 'correct' | 'partial' | 'typo';
export const EVAL_GROUPS: readonly EvalGroup[] = ['all', 'en', 'pl', 'correct', 'partial', 'typo'];

export interface EvalVariantSummary {
  readonly name: string;
  /** Hybrid variants only. */
  readonly minSimilarity?: EvalFloor;
  readonly summaries: Readonly<Record<EvalGroup, EvalSummary>>;
  /** Per class without an answer: `negative`, `random`, and `all` of them. */
  readonly falsePositives: Readonly<Record<'all' | 'negative' | 'random', EvalFalsePositives>>;
}

export interface EvalReport {
  readonly model?: string;
  readonly queryInstruction?: string;
  readonly variants: readonly EvalVariantSummary[];
  readonly proposalHits: number;
  readonly proposalsAboveExpected: number;
  readonly results: readonly EvalQuestionResult[];
}

export function hybridVariantName(floor: EvalFloor): string {
  return `hybrid@${floor === null ? 'none' : String(floor)}`;
}

export async function runEval(
  project: DocsProject,
  rules: DocsCorpusRules,
  questions: readonly EvalQuestion[],
  env: Readonly<Record<string, string | undefined>>,
  options: EvalOptions = {},
): Promise<EvalReport> {
  const configuration = withQueryInstruction(loadDocsSettings(project), options.queryInstruction);
  const floors = options.floors ?? [configuration.embeddings?.minSimilarity ?? null];
  const corpus = openFileSystemCorpus(project.root, configuration.docs, rules);
  const index = await openProjectIndex(project.root, corpus, configuration);
  const search = withQueryEmbeddedOnce(openDocsSearch({ corpus, configuration, env, index }));
  const lexical: DocsSearch = {
    chunks: search.chunks,
    vectors: { reason: { code: 'semantic-disabled', message: 'The eval runs without vectors.' } },
  };
  const hybrids = floors.map((floor) => ({
    name: hybridVariantName(floor),
    floor,
    search: withFloor(search, floor),
  }));
  const variantNames = ['context', 'lexical', ...hybrids.map((hybrid) => hybrid.name)];

  const { documents } = await search.chunks.load();
  const isProposal = new Map(
    documents.map((document) => [asString(document.record.id), document.proposal]),
  );
  const invalid = questions.flatMap((question) =>
    question.expected.filter((id) => isProposal.get(id) !== false),
  );
  if (invalid.length > 0) {
    throw new Error(
      `eval: expected ids are not active documents outside the proposals: ${invalid.join(', ')}`,
    );
  }

  const searchIds = async (on: DocsSearch, includeProposals: boolean, query: string) => {
    const result = await searchDocumentation(on, {
      query,
      limit: EVAL_DEPTH,
      includeProposals,
      snippets: false,
      refresh: false,
    });

    return {
      result,
      ids: result.results.map((hit) => hit.id),
      vectorOnly: result.results.filter((hit) => !hit.wordMatch).length,
    };
  };

  const similarity = bestSimilarityOf(search);

  const results: EvalQuestionResult[] = [];
  for (const question of questions) {
    const query = question.question;
    const answerable = question.expected.length > 0;
    const variant = (ids: readonly string[], vectorOnly: number): EvalVariantResult => ({
      ids,
      vectorOnly,
      ...(answerable ? { score: scoreQuestion(question, ids) } : {}),
    });
    const variants: Record<string, EvalVariantResult> = {
      context: variant(
        getContext(corpus, { query, limit: EVAL_DEPTH }).documents.map((entry) => entry.id),
        0,
      ),
      lexical: variant((await searchIds(lexical, false, query)).ids, 0),
    };
    let first: Awaited<ReturnType<typeof searchIds>> | undefined;
    for (const hybrid of hybrids) {
      const answer = await searchIds(hybrid.search, false, query);
      first ??= answer;
      variants[hybrid.name] = variant(answer.ids, answer.vectorOnly);
    }

    const included = hybrids[0] ? (await searchIds(hybrids[0].search, true, query)).ids : [];
    const best = await similarity(query);
    results.push({
      question: query,
      ...(question.lang === undefined ? {} : { lang: question.lang }),
      class: question.class,
      expected: question.expected,
      variants,
      hybridMode:
        first === undefined
          ? '-'
          : first.result.mode === 'hybrid'
            ? 'hybrid'
            : `lexical (${first.result.reason.code})`,
      proposals: (first?.ids ?? []).filter((id) => isProposal.get(id) === true).length,
      proposalsAboveExpected: flaggedBeforeExpected(
        included,
        question.expected,
        (id) => isProposal.get(id) === true,
      ),
      ...(best === undefined ? {} : { bestSimilarity: best }),
    });
  }

  const inGroup = (result: EvalQuestionResult, group: EvalGroup) =>
    group === 'all' || result.lang === group || result.class === group;
  const falsePositives = (name: string, classes: readonly EvalClass[]): EvalFalsePositives => {
    const asked = results.filter((result) => classes.includes(result.class));

    return {
      questions: asked.length,
      withVectorOnly: asked.filter((result) => result.variants[name]!.vectorOnly > 0).length,
      withAny: asked.filter((result) => result.variants[name]!.ids.length > 0).length,
    };
  };

  const unanswerable = EVAL_CLASSES.filter((kind) => !ANSWERABLE_CLASSES.includes(kind));
  const summary = (name: string, minSimilarity?: EvalFloor): EvalVariantSummary => ({
    name,
    ...(minSimilarity === undefined ? {} : { minSimilarity }),
    summaries: Object.fromEntries(
      EVAL_GROUPS.map((group) => [
        group,
        summarize(
          results
            .filter((result) => inGroup(result, group))
            .flatMap((result) => result.variants[name]!.score ?? []),
        ),
      ]),
    ) as EvalVariantSummary['summaries'],
    falsePositives: {
      all: falsePositives(name, unanswerable),
      negative: falsePositives(name, ['negative']),
      random: falsePositives(name, ['random']),
    },
  });
  const query = 'reason' in search.vectors ? undefined : search.vectors.providers.query;

  return {
    ...(query === undefined ? {} : { model: query.model }),
    ...(configuration.embeddings?.queryInstruction === undefined
      ? {}
      : { queryInstruction: configuration.embeddings.queryInstruction }),
    variants: [
      ...variantNames.slice(0, 2).map((name) => summary(name)),
      ...hybrids.map((hybrid) => summary(hybrid.name, hybrid.floor)),
    ],
    proposalHits: results.reduce((sum, result) => sum + result.proposals, 0),
    proposalsAboveExpected: results.reduce((sum, result) => sum + result.proposalsAboveExpected, 0),
    results,
  };
}

function withQueryInstruction(
  configuration: DocsConfiguration,
  instruction: string | null | undefined,
): DocsConfiguration {
  if (instruction === undefined || configuration.embeddings === undefined) {
    return configuration;
  }

  const { queryInstruction: _replaced, ...embeddings } = configuration.embeddings;

  return {
    ...configuration,
    embeddings:
      instruction === null ? embeddings : { ...embeddings, queryInstruction: instruction },
  };
}

/** The search with `floor` as its relevance floor instead of the configured one. */
function withFloor(search: DocsSearch, floor: EvalFloor): DocsSearch {
  if ('reason' in search.vectors) {
    return search;
  }

  const { minSimilarity: _configured, ...vectors } = search.vectors;

  return {
    ...search,
    vectors: floor === null ? vectors : { ...vectors, minSimilarity: floor },
  };
}

type QueryProvider = Extract<DocsSearch['vectors'], { providers: unknown }>['providers']['query'];

/** The search with each query embedded once for every variant and the similarity diagnostic. */
function withQueryEmbeddedOnce(search: DocsSearch): DocsSearch {
  if ('reason' in search.vectors) {
    return search;
  }

  const inner = search.vectors.providers.query;
  const embedded = new Map<string, ReturnType<QueryProvider['embed']>>();
  const query: QueryProvider = {
    protocol: inner.protocol,
    model: inner.model,
    space: inner.space,
    dimensions: inner.dimensions,
    probe: () => inner.probe(),
    embed: (texts, purpose) => {
      const key = JSON.stringify([purpose, texts]);
      let result = embedded.get(key);
      if (result === undefined) {
        result = inner.embed(texts, purpose);
        embedded.set(key, result);
      }

      return result;
    },
  };

  return {
    ...search,
    vectors: { ...search.vectors, providers: { ...search.vectors.providers, query } },
  };
}

/**
 * The cosine similarity of the best stored chunk to a query, straight from the vector store (all
 * documents, no filter, no fusion, no floor): a diagnostic of how close the nearest section is,
 * also for a question nothing answers. `undefined` without a usable index.
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
