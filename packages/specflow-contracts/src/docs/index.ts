// The documentation search result contract (ADR 0020): one shape for `nevo-specflow docs search
// --json` and `GET /api/docs/search`.

import { Type, type Static } from 'typebox';

export { DocsCapabilities } from './capabilities';

/**
 * Why a search answered lexically (ADR 0020, "Semantic search is optional"):
 * - `semantic-disabled`: `docs.search.semantic` is absent or `false`;
 * - `no-endpoint`: no `ai.embeddings` endpoint is configured;
 * - `endpoint-unreachable`: the endpoint failed, timed out or answered unusable vectors, or the
 *   variable named by `ai.embeddings.apiKeyEnv` is not set;
 * - `index-building`: the index is not yet complete for the current documents (another process is
 *   updating it; it is not built yet, was built with another model or more sections lack vectors
 *   than a search embeds; or the search skipped the refresh with `--no-refresh`); it becomes current
 *   once a full refresh runs (`nevo-specflow docs semantic index` or the Runtime start refresh);
 * - `index-unavailable`: the index cannot be read or written; it will not become current by waiting.
 */
export const DocsSearchReasonCodeSchema = Type.Union([
  Type.Literal('semantic-disabled'),
  Type.Literal('no-endpoint'),
  Type.Literal('endpoint-unreachable'),
  Type.Literal('index-building'),
  Type.Literal('index-unavailable'),
]);
export type DocsSearchReasonCode = Static<typeof DocsSearchReasonCodeSchema>;

export const DOCS_SEARCH_REASON_CODES: readonly DocsSearchReasonCode[] = [
  'semantic-disabled',
  'no-endpoint',
  'endpoint-unreachable',
  'index-building',
  'index-unavailable',
];

export const DocsSearchReasonSchema = Type.Object(
  {
    code: DocsSearchReasonCodeSchema,
    /** Human-readable cause, for example the endpoint error. */
    message: Type.String(),
  },
  { additionalProperties: false },
);
export type DocsSearchReason = Static<typeof DocsSearchReasonSchema>;

/** One of the best matching sections of a document. */
export const DocsSearchSectionSchema = Type.Object(
  {
    /** Heading path of the section, outermost first (`H1 > H2 > H3`); empty before the first heading. */
    headingPath: Type.Array(Type.String()),
    /**
     * Rank score of the section among all sections: BM25 in lexical mode, reciprocal rank fusion of
     * the BM25 and vector rankings in hybrid mode.
     */
    score: Type.Number(),
    /** The section text on one line, cut at about 280 characters; only when snippets are requested. */
    snippet: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DocsSearchSection = Static<typeof DocsSearchSectionSchema>;

const strings = Type.Array(Type.String(), { minItems: 1 });

/**
 * One document, described by its frontmatter so a reader can decide whether to open it. Optional
 * fields are present only when the document's frontmatter has a non-empty value.
 */
export const DocsSearchHitSchema = Type.Object(
  {
    /** Stable document id; read the document with `docs get <id>`. */
    id: Type.String(),
    title: Type.String(),
    type: Type.String(),
    status: Type.String(),
    scope: Type.Optional(Type.String()),
    areas: Type.Optional(strings),
    tags: Type.Optional(strings),
    summary: Type.Optional(Type.String()),
    /** The frontmatter `read_when`: situations in which the document should be read. */
    readWhen: Type.Optional(strings),
    /** Path relative to the project root, with `/` separators. */
    file: Type.String(),
    /**
     * Document rank score: reciprocal rank fusion of the section ranking (BM25, fused with the vector
     * ranking in hybrid mode) and the frontmatter ranking. Only the order is meaningful.
     */
    score: Type.Number(),
    /**
     * Up to three best matching sections, best first. Empty when only the frontmatter matched.
     */
    sections: Type.Array(DocsSearchSectionSchema, { maxItems: 3 }),
  },
  { additionalProperties: false },
);
export type DocsSearchHit = Static<typeof DocsSearchHitSchema>;

const hits = Type.Array(DocsSearchHitSchema);

/** Ranked documents, best first, with the mode that produced them and, when lexical, why. */
export const DocsSearchResultSchema = Type.Union(
  [
    Type.Object({ mode: Type.Literal('hybrid'), results: hits }, { additionalProperties: false }),
    Type.Object(
      { mode: Type.Literal('lexical'), reason: DocsSearchReasonSchema, results: hits },
      { additionalProperties: false },
    ),
  ],
  { $id: 'DocsSearchResult' },
);
export type DocsSearchResult = Static<typeof DocsSearchResultSchema>;
