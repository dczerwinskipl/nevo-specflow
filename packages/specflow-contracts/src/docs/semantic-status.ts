// The semantic search status (ADR 0020): the output of `nevo-specflow docs semantic status --json`.
// The Runtime has no status endpoint (ADR 0022); its search answer carries the index progress.

import { Type, type Static } from 'typebox';

import { DocsSearchReasonSchema } from './search-result';

/** The configured embedding endpoint; never the API key itself, only the variable that holds it. */
export const DocsStatusEndpointSchema = Type.Object(
  {
    protocol: Type.String(),
    baseUrl: Type.String(),
    model: Type.String(),
    /** The declared `ai.embeddings.spaceId`; absent when the endpoint fingerprint is the space. */
    spaceId: Type.Optional(Type.String()),
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
 * - `rebuild`: built with another chunker, protocol, model, embedding space or dimension; it is
 *   rebuilt in full;
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
 * The semantic search status of the checkout (ADR 0020), as `nevo-specflow docs semantic status
 * --json` reports it. `mode` is the mode a search answers in now (after its
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
