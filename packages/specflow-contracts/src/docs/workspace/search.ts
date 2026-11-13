// `GET /api/workspaces/:workspaceId/docs/search`: the search result of `nevo-specflow docs search
// --json` in the workspace envelope, with paths relative to `docs.root`.

import { Type, type Static } from 'typebox';

import { WorkspaceIdSchema } from '../../identifiers';
import { DocsSearchHitSchema, DocsSearchReasonSchema } from '../search-result';
import { CorpusRevisionSchema, WorkspaceDocsSkippedSchema } from './shared';

/** A search hit; its `file` is relative to `docs.root` (the CLI's is relative to the checkout). */
export const WorkspaceDocsSearchHitSchema = Type.Object(
  { ...DocsSearchHitSchema.properties, file: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type WorkspaceDocsSearchHit = Static<typeof WorkspaceDocsSearchHitSchema>;

/** The Runtime's background refresh of this workspace's index, once it embeds. */
export const WorkspaceDocsIndexProgressSchema = Type.Object(
  {
    embedded: Type.Integer({ minimum: 0 }),
    total: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type WorkspaceDocsIndexProgress = Static<typeof WorkspaceDocsIndexProgressSchema>;

const envelope = {
  workspaceId: WorkspaceIdSchema,
  corpusRevision: CorpusRevisionSchema,
  results: Type.Array(WorkspaceDocsSearchHitSchema),
  /**
   * Proposals the same query would have returned with
   * `includeProposals=true` and the same `limit`; `0` when they were included.
   */
  proposalsLeftOut: Type.Integer({ minimum: 0 }),
  indexProgress: Type.Optional(WorkspaceDocsIndexProgressSchema),
  skipped: WorkspaceDocsSkippedSchema,
};

/**
 * Ranked documents, best first, with the mode that produced them and, when lexical, why. Search
 * `line`s count in the file (frontmatter included), unlike an article's section lines.
 */
export const WorkspaceDocsSearchSchema = Type.Union([
  Type.Object({ mode: Type.Literal('hybrid'), ...envelope }, { additionalProperties: false }),
  Type.Object(
    { mode: Type.Literal('lexical'), reason: DocsSearchReasonSchema, ...envelope },
    { additionalProperties: false },
  ),
]);
export type WorkspaceDocsSearch = Static<typeof WorkspaceDocsSearchSchema>;
