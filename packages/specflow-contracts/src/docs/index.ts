// The documentation search result contract (ADR 0020): one shape for `nevo-specflow docs search
// --json` and `GET /api/docs/search`.

import { Type, type Static } from 'typebox';

/**
 * Why a search answered lexically (ADR 0020, "Semantic search is optional"):
 * - `semantic-disabled`: `docs.search.semantic` is absent or `false`;
 * - `no-endpoint`: no `ai.embeddings` endpoint is configured;
 * - `endpoint-unreachable`: the endpoint failed, timed out or answered unusable vectors;
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

/** One matching section of a document. */
export const DocsSearchChunkSchema = Type.Object(
  {
    /** Heading path of the section, outermost first (`H1 > H2 > H3`). */
    headingPath: Type.Array(Type.String()),
    snippet: Type.String(),
    score: Type.Number(),
  },
  { additionalProperties: false },
);
export type DocsSearchChunk = Static<typeof DocsSearchChunkSchema>;

/** One document, with its best matching sections first. */
export const DocsSearchHitSchema = Type.Object(
  {
    /** Stable document id; read the document with `docs get <id>`. */
    id: Type.String(),
    title: Type.String(),
    /** Path relative to the project root, with `/` separators. */
    file: Type.String(),
    /** Score of the best chunk; BM25 in lexical mode, reciprocal rank fusion in hybrid mode. */
    score: Type.Number(),
    chunks: Type.Array(DocsSearchChunkSchema, { minItems: 1 }),
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
