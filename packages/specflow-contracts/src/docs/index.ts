// The documentation search contracts (ADR 0020): the search result, one shape for `nevo-specflow
// docs search --json` and `GET /api/docs/search`, and the semantic search status, one shape for
// `nevo-specflow docs semantic status --json` and `GET /api/docs/status`.

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
 *   once a full refresh runs (the background catch-up a search starts for a larger gap,
 *   `nevo-specflow docs semantic index` or the Runtime start refresh);
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
     * Up to three best matching sections, best first, one per heading path. Empty when none of the
     * document's sections is among the section ranking's top candidates (for example a document
     * found by its frontmatter only).
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

/** The configured embedding endpoint; never the API key itself, only the variable that holds it. */
export const DocsStatusEndpointSchema = Type.Object(
  {
    protocol: Type.String(),
    baseUrl: Type.String(),
    model: Type.String(),
    dimensions: Type.Optional(Type.Integer({ minimum: 1 })),
    /** Name of the environment variable the API key is read from. */
    apiKeyEnv: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** One embedding probe of the configured endpoint. */
export const DocsStatusReachabilitySchema = Type.Union([
  Type.Object(
    {
      reachable: Type.Literal(true),
      latencyMs: Type.Number({ minimum: 0 }),
      dimensions: Type.Integer({ minimum: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { reachable: Type.Literal(false), message: Type.String() },
    { additionalProperties: false },
  ),
]);

/**
 * The semantic index against the current documents:
 * - `missing`: not built yet;
 * - `current`: matches the documents;
 * - `stale`: `changed` chunks differ (to embed or delete);
 * - `rebuild`: built with another chunker, protocol, model or dimension; it is rebuilt in full;
 * - `unreadable`: it cannot be read right now.
 */
export const DocsIndexStateSchema = Type.Union([
  Type.Object({ state: Type.Literal('missing') }, { additionalProperties: false }),
  Type.Object(
    { state: Type.Literal('unreadable'), message: Type.String() },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      state: Type.Union([Type.Literal('current'), Type.Literal('stale'), Type.Literal('rebuild')]),
      generation: Type.Integer({ minimum: 0 }),
      /** Chunks with a stored vector. */
      chunks: Type.Integer({ minimum: 0 }),
      model: Type.String(),
      dimensions: Type.Integer({ minimum: 1 }),
      /** Chunks to embed or delete. */
      changed: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
]);
export type DocsIndexState = Static<typeof DocsIndexStateSchema>;

const timestamp = Type.String({ format: 'date-time' });

/**
 * Who is writing the index right now:
 * - `updating`: a live process (`pid`) holds the index writer lock; `progress` is present when that
 *   process is a full refresh (`semantic index`, a background catch-up or the Runtime refresh):
 *   chunks embedded of the refresh's total, since `startedAt`;
 * - `idle`: nobody writes; `last` is the most recent full refresh that embedded: `completed`,
 *   `failed` (with `message`) or `interrupted` (its process ended without finishing; `endedAt` is
 *   its last progress).
 */
export const DocsIndexActivitySchema = Type.Union([
  Type.Object(
    {
      state: Type.Literal('updating'),
      pid: Type.Optional(Type.Integer({ minimum: 1 })),
      progress: Type.Optional(
        Type.Object(
          {
            startedAt: timestamp,
            updatedAt: timestamp,
            embedded: Type.Integer({ minimum: 0 }),
            total: Type.Integer({ minimum: 0 }),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      state: Type.Literal('idle'),
      last: Type.Optional(
        Type.Object(
          {
            outcome: Type.Union([
              Type.Literal('completed'),
              Type.Literal('failed'),
              Type.Literal('interrupted'),
            ]),
            startedAt: timestamp,
            endedAt: timestamp,
            embedded: Type.Integer({ minimum: 0 }),
            total: Type.Integer({ minimum: 0 }),
            /** Index generation after a completed refresh. */
            generation: Type.Optional(Type.Integer({ minimum: 0 })),
            message: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
]);
export type DocsIndexActivity = Static<typeof DocsIndexActivitySchema>;

const statusFields = {
  /** `docs.search.semantic`. */
  enabled: Type.Boolean(),
  /** `null` without `ai.embeddings`. */
  endpoint: Type.Union([DocsStatusEndpointSchema, Type.Null()]),
  /** `null` without an endpoint. */
  reachability: Type.Union([DocsStatusReachabilitySchema, Type.Null()]),
  index: DocsIndexStateSchema,
  activity: DocsIndexActivitySchema,
  /**
   * Semantic search is enabled but cannot work until the configuration, endpoint or index is fixed.
   * An index that only needs building or catching up (`index-building`) is not a failure.
   */
  failed: Type.Boolean(),
};

/**
 * The semantic search status of the project (ADR 0020): one shape for `nevo-specflow docs semantic
 * status --json` and `GET /api/docs/status`. `mode` is the mode a search answers in now (after its
 * bounded read-time refresh); `reason` says why it is lexical, as the search reports it.
 */
export const DocsStatusSchema = Type.Union(
  [
    Type.Object({ mode: Type.Literal('hybrid'), ...statusFields }, { additionalProperties: false }),
    Type.Object(
      { mode: Type.Literal('lexical'), reason: DocsSearchReasonSchema, ...statusFields },
      { additionalProperties: false },
    ),
  ],
  { $id: 'DocsStatus' },
);
export type DocsStatus = Static<typeof DocsStatusSchema>;
