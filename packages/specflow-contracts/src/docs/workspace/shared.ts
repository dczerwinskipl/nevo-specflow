// Parts every workspace documentation response shares (ADR 0022 §§1, 4).

import { Type, type Static } from 'typebox';

/**
 * The workspace's opaque corpus revision: a digest of the effective documentation settings and of
 * the included paths and their content hashes. It is not a Git revision and not an index
 * generation, and there are no preconditions on it: a client compares the revisions of the tree,
 * an article and a search to tell whether they describe the same documentation.
 */
export const CorpusRevisionSchema = Type.String({ minLength: 1 });

/**
 * A document left out of the workspace's documentation: its own frontmatter is invalid, or its id
 * is duplicated (every file with that id is left out). Paths, also inside `error`, are relative to
 * `docs.root`.
 */
export const WorkspaceDocsSkippedDocumentSchema = Type.Object(
  {
    path: Type.String({ minLength: 1 }),
    error: Type.String(),
  },
  { additionalProperties: false },
);
export type WorkspaceDocsSkippedDocument = Static<typeof WorkspaceDocsSkippedDocumentSchema>;

export const WorkspaceDocsSkippedSchema = Type.Array(WorkspaceDocsSkippedDocumentSchema);

/**
 * Why the documentation of a workspace cannot be answered (the refusals of one document are the
 * article's own, `./article`):
 * - `DOCS_WORKSPACE_NOT_FOUND` (`404`): the workspace is not registered;
 * - `DOCS_WORKSPACE_UNAVAILABLE` (`409`): it is registered, but its checkout cannot be read now
 *   (missing, moved, being closed, or the Runtime is closing);
 * - `DOCS_NOT_CONFIGURED` (`503`): the checkout's `docs.root` is not a directory;
 * - `DOCS_UNAVAILABLE` (`503`): the checkout's documentation settings or `docs.yaml` are invalid or
 *   a link, reading it failed, or the Runtime serves no project documentation (demo data, no
 *   Engine).
 */
export const WorkspaceDocsErrorCodeSchema = Type.Union([
  Type.Literal('DOCS_WORKSPACE_NOT_FOUND'),
  Type.Literal('DOCS_WORKSPACE_UNAVAILABLE'),
  Type.Literal('DOCS_NOT_CONFIGURED'),
  Type.Literal('DOCS_UNAVAILABLE'),
]);
export type WorkspaceDocsErrorCode = Static<typeof WorkspaceDocsErrorCodeSchema>;

/** `error` is for people and never names a path or a cause; `code` is the value to branch on. */
export const WorkspaceDocsErrorSchema = Type.Object(
  {
    error: Type.String(),
    code: WorkspaceDocsErrorCodeSchema,
    /**
     * With `DOCS_NOT_CONFIGURED` only: the configured `docs.root` (relative to the checkout), where
     * the documents would be read from.
     */
    docsRoot: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false, $id: 'WorkspaceDocsError' },
);
export type WorkspaceDocsError = Static<typeof WorkspaceDocsErrorSchema>;
