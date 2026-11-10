// Deterministic frontmatter ranking shared by `find` / `context` (discovery) and
// the frontmatter leg of `search`. Term-coverage first, then a small field-weight tie-breaker, then
// id order. Reads only structured frontmatter.

import { tokenize as tokenizeText } from '@nevo/ai-semantic-search';

import { asString, type DocRecord } from './contract';

/**
 * English plural folding of one token: `policies` → `policy`, `classes` → `class`, `boxes` → `box`,
 * `tasks` → `task` (not `status`, `analysis`, `class`). A separate step after tokenization, applied
 * to ASCII tokens only, so words of other languages are never cut.
 */
export function foldEnglishPlural(token: string): string {
  if (!/^[a-z0-9]+$/.test(token)) {
    return token;
  }

  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('sses')) {
    return token.slice(0, -2);
  }

  if (/(shes|ches|xes|zes)$/.test(token)) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && !/(ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }

  return token;
}

/**
 * The distinct terms of a text: the search engine's tokenizer (`tokenize` of
 * `@nevo/ai-semantic-search`: NFKD, diacritics removed, lower-cased, Unicode letter/digit runs), so
 * the frontmatter ranking and BM25 normalize alike, then `foldEnglishPlural`.
 */
export function tokenize(text: string): string[] {
  return [...new Set(tokenizeText(text).map(foldEnglishPlural))];
}

type FieldWeights = readonly (readonly [field: string, weight: number])[];

const FIELD_WEIGHTS: FieldWeights = [
  ['id', 50],
  ['title', 40],
  ['scope', 35],
  ['areas', 35],
  ['tags', 35],
  ['read_when', 30],
  ['summary', 20],
  ['file', 10],
  ['related', 5],
];

/** What a document says it is about: every weighted field except its path and its links. */
const CONTENT_FIELD_WEIGHTS: FieldWeights = FIELD_WEIGHTS.filter(
  ([field]) => field !== 'file' && field !== 'related',
);

function fieldText(doc: DocRecord, field: string): string {
  const v = doc[field];
  if (Array.isArray(v)) {
    return v.map((x) => asString(x)).join(' ');
  }

  return asString(v);
}

export interface ScoredDoc extends DocRecord {
  readonly score: number;
  readonly matchedTerms: string[];
  readonly matchedFields: string[];
}

export interface ScoreResult {
  readonly score: number;
  readonly matchedTerms: string[];
  readonly matchedFields: string[];
}

export function scoreDoc(doc: DocRecord, query: string): ScoreResult {
  return scoreTokens(doc, tokenize(query), FIELD_WEIGHTS);
}

function scoreTokens(
  doc: DocRecord,
  queryTokens: readonly string[],
  weights: FieldWeights,
): ScoreResult {
  if (queryTokens.length === 0) {
    return { score: 0, matchedTerms: [], matchedFields: [] };
  }

  const matchedTerms = new Set<string>();
  const matchedFields = new Set<string>();
  let fieldScore = 0;

  for (const [field, weight] of weights) {
    const fieldTokens = new Set(tokenize(fieldText(doc, field)));
    let hit = false;
    for (const token of queryTokens) {
      if (fieldTokens.has(token)) {
        matchedTerms.add(token);
        fieldScore += weight;
        hit = true;
      }
    }

    if (hit) {
      matchedFields.add(field);
    }
  }

  if (matchedTerms.size === 0) {
    return { score: 0, matchedTerms: [], matchedFields: [] };
  }

  const coverage = matchedTerms.size / queryTokens.length;
  const allTermsBonus = matchedTerms.size === queryTokens.length ? 500 : 0;
  const score = matchedTerms.size * 1000 + allTermsBonus + fieldScore + Math.round(coverage * 100);

  return {
    score,
    matchedTerms: queryTokens.filter((t) => matchedTerms.has(t)),
    matchedFields: [...matchedFields],
  };
}

export interface SearchOptions {
  readonly query?: string;
  readonly type?: string;
  readonly status?: string;
  readonly scope?: string;
  readonly area?: string;
  readonly tag?: string;
  /** drop these statuses (e.g. deprecated/superseded) */
  readonly excludeStatuses?: readonly string[];
  readonly limit?: number;
}

function includesString(value: unknown, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }

  return Array.isArray(value) && value.includes(expected);
}

/** Filter + rank a corpus. Multi-term queries are OR: any matched term keeps the document. */
export function searchDocs(
  docs: readonly DocRecord[],
  { query, type, status, scope, area, tag, excludeStatuses, limit }: SearchOptions = {},
): (DocRecord | ScoredDoc)[] {
  const excluded = new Set(excludeStatuses ?? []);
  const filtered = docs.filter(
    (d) =>
      (!type || d.type === type) &&
      (!status || d.status === status) &&
      (!scope || d.scope === scope) &&
      includesString(d.areas, area) &&
      includesString(d.tags, tag) &&
      !excluded.has(asString(d.status)),
  );

  let results: (DocRecord | ScoredDoc)[];
  if (query?.trim()) {
    results = filtered
      .map((doc) => ({ doc, ...scoreDoc(doc, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || String(a.doc.id).localeCompare(String(b.doc.id)))
      .map((r): ScoredDoc => ({
        ...r.doc,
        score: r.score,
        matchedTerms: r.matchedTerms,
        matchedFields: r.matchedFields,
      }));
  } else {
    results = [...filtered].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  return typeof limit === 'number' && limit > 0 ? results.slice(0, limit) : results;
}

/**
 * A query term in more than this fraction of the documents' content fields is too common to tell
 * documents apart and is ignored by `rankByContent`. The rule is language-neutral (no stop-word
 * list): on this repository's corpus (about 220 documents) a quarter drops the function words that
 * most summaries and `read_when` entries share ("and", "the", "or", "a", "of", "to", "is") and keeps
 * domain terms such as "task" or "session" (about a fifth of the documents each). A term only one
 * document has is never common, so a small corpus keeps its terms.
 */
export const COMMON_TERM_DOCUMENT_FRACTION = 0.25;

/**
 * The frontmatter ranking of `search`: `find`'s scoring over the content fields only (not `file` or
 * `related`), ignoring common query terms (`COMMON_TERM_DOCUMENT_FRACTION`). A document needs at
 * least one remaining term; a question of common words only ranks nothing.
 */
export function rankByContent(
  docs: readonly DocRecord[],
  query: string,
  limit: number,
): ScoredDoc[] {
  const queryTokens = tokenize(query);
  const documentFrequency = new Map(queryTokens.map((token) => [token, 0]));
  for (const doc of docs) {
    const tokens = new Set(
      CONTENT_FIELD_WEIGHTS.flatMap(([field]) => tokenize(fieldText(doc, field))),
    );
    for (const token of queryTokens) {
      if (tokens.has(token)) {
        documentFrequency.set(token, documentFrequency.get(token)! + 1);
      }
    }
  }

  const common = Math.max(1, docs.length * COMMON_TERM_DOCUMENT_FRACTION);
  const terms = queryTokens.filter((token) => documentFrequency.get(token)! <= common);

  return docs
    .map((doc) => ({ doc, ...scoreTokens(doc, terms, CONTENT_FIELD_WEIGHTS) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || String(a.doc.id).localeCompare(String(b.doc.id)))
    .slice(0, limit)
    .map((r): ScoredDoc => ({
      ...r.doc,
      score: r.score,
      matchedTerms: r.matchedTerms,
      matchedFields: r.matchedFields,
    }));
}
