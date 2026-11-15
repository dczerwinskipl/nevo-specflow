// `GET /api/workspaces/:workspaceId/docs/documents/:documentId`: one article and the refusals that
// are specific to a document.

import { Type, type Static } from 'typebox';

import { WorkspaceIdSchema } from '../../identifiers';
import {
  CorpusRevisionSchema,
  WorkspaceDocsSkippedDocumentSchema,
  WorkspaceDocsSkippedSchema,
} from './shared';

/**
 * A document the article relates to (`related` in its frontmatter), in that order:
 * - `active`: readable, with its title;
 * - `inactive`: deprecated or superseded, with its title;
 * - `skipped`: left out (invalid frontmatter or a duplicated id);
 * - `missing`: no document has the id.
 */
export const WorkspaceDocsRelatedDocumentSchema = Type.Object(
  {
    documentId: Type.String({ minLength: 1 }),
    /** Present for an `active` or `inactive` document. */
    title: Type.Optional(Type.String()),
    state: Type.Union([
      Type.Literal('active'),
      Type.Literal('inactive'),
      Type.Literal('skipped'),
      Type.Literal('missing'),
    ]),
  },
  { additionalProperties: false },
);
export type WorkspaceDocsRelatedDocument = Static<typeof WorkspaceDocsRelatedDocumentSchema>;

/** A heading of the body, in document order; `_top` is the text before the first heading. */
export const WorkspaceDocsArticleSectionSchema = Type.Object(
  {
    /** The id search reports for the section (`sections[].sectionId` of a search hit). */
    sectionId: Type.String({ minLength: 1 }),
    headingPath: Type.Array(Type.String()),
    /** 1-based line of the heading in `body`; a search hit's `line` counts in the file instead. */
    line: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type WorkspaceDocsArticleSection = Static<typeof WorkspaceDocsArticleSectionSchema>;

const strings = Type.Array(Type.String());

export const WorkspaceDocsArticleSchema = Type.Object(
  {
    workspaceId: WorkspaceIdSchema,
    corpusRevision: CorpusRevisionSchema,
    /** The frontmatter, read from the same file read as `body`. */
    document: Type.Object(
      {
        documentId: Type.String({ minLength: 1 }),
        title: Type.String(),
        type: Type.String(),
        status: Type.String(),
        /** Relative to `docs.root`. */
        path: Type.String({ minLength: 1 }),
        /** Empty when there is none. */
        summary: Type.String(),
        proposal: Type.Boolean(),
        scope: Type.Optional(Type.String()),
        areas: strings,
        tags: strings,
        related: Type.Array(WorkspaceDocsRelatedDocumentSchema),
      },
      { additionalProperties: false },
    ),
    /** The Markdown after the frontmatter. */
    body: Type.String(),
    sections: Type.Array(WorkspaceDocsArticleSectionSchema),
    /** The documents left out of the workspace's documentation (as in the tree). */
    skipped: WorkspaceDocsSkippedSchema,
  },
  { additionalProperties: false },
);
export type WorkspaceDocsArticle = Static<typeof WorkspaceDocsArticleSchema>;

/** The corpus a document refusal was decided in, so a client can compare it with its tree's. */
const refusalCorpus = { workspaceId: WorkspaceIdSchema, corpusRevision: CorpusRevisionSchema };

/** `410`: the document is deprecated or superseded; it has no body to read. */
export const DocsDocumentInactiveErrorSchema = Type.Object(
  {
    error: Type.String(),
    ...refusalCorpus,
    code: Type.Literal('DOCS_DOCUMENT_INACTIVE'),
    status: Type.String(),
    /** The successor, when `superseded_by` names a document with a title. */
    supersededBy: Type.Optional(
      Type.Object(
        { documentId: Type.String({ minLength: 1 }), title: Type.String() },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type DocsDocumentInactiveError = Static<typeof DocsDocumentInactiveErrorSchema>;

/**
 * `404`: the id belongs to a document left out of the documentation; `skipped` lists every file
 * that declares it, with the reason (paths relative to `docs.root`, also inside `error`).
 */
export const DocsDocumentSkippedErrorSchema = Type.Object(
  {
    error: Type.String(),
    ...refusalCorpus,
    code: Type.Literal('DOCS_DOCUMENT_SKIPPED'),
    skipped: Type.Array(WorkspaceDocsSkippedDocumentSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type DocsDocumentSkippedError = Static<typeof DocsDocumentSkippedErrorSchema>;

/**
 * `404`: no document of the workspace has the id, or its file changed or vanished while it was read
 * (then the revision differs from an older tree's).
 */
export const DocsDocumentNotFoundErrorSchema = Type.Object(
  {
    error: Type.String(),
    ...refusalCorpus,
    code: Type.Literal('DOCS_DOCUMENT_NOT_FOUND'),
  },
  { additionalProperties: false },
);
export type DocsDocumentNotFoundError = Static<typeof DocsDocumentNotFoundErrorSchema>;
