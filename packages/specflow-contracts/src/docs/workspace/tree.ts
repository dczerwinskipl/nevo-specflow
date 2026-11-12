// `GET /api/workspaces/:workspaceId/docs`: what the documentation reader lists.

import { Type, type Static } from 'typebox';

import { WorkspaceIdSchema } from '../../identifiers';
import { CorpusRevisionSchema, WorkspaceDocsSkippedSchema } from './shared';

/** An active document (status other than `deprecated` or `superseded`). */
export const WorkspaceDocsTreeDocumentSchema = Type.Object(
  {
    documentId: Type.String({ minLength: 1 }),
    title: Type.String(),
    type: Type.String(),
    status: Type.String(),
    /** Relative to `docs.root`, with `/` separators. */
    path: Type.String({ minLength: 1 }),
    /** The frontmatter `summary`; empty when there is none. */
    summary: Type.String(),
    /** Below one of the non-authoritative path prefixes of `docs.yaml`. */
    nonAuthoritative: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type WorkspaceDocsTreeDocument = Static<typeof WorkspaceDocsTreeDocumentSchema>;

/** A `deprecated` or `superseded` document: listed so a link to it can say so. */
export const WorkspaceDocsInactiveDocumentSchema = Type.Object(
  {
    documentId: Type.String({ minLength: 1 }),
    /** Relative to `docs.root`. */
    path: Type.String({ minLength: 1 }),
    status: Type.String(),
    /** The frontmatter `superseded_by`, when it names one; it may not resolve. */
    supersededBy: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type WorkspaceDocsInactiveDocument = Static<typeof WorkspaceDocsInactiveDocumentSchema>;

export const WorkspaceDocsTreeSchema = Type.Object(
  {
    workspaceId: WorkspaceIdSchema,
    corpusRevision: CorpusRevisionSchema,
    /** The id of `<docs.root>/README.md`, when it is an active, readable document. */
    rootIndexDocumentId: Type.Optional(Type.String({ minLength: 1 })),
    documents: Type.Array(WorkspaceDocsTreeDocumentSchema),
    inactive: Type.Array(WorkspaceDocsInactiveDocumentSchema),
    skipped: WorkspaceDocsSkippedSchema,
  },
  { additionalProperties: false },
);
export type WorkspaceDocsTree = Static<typeof WorkspaceDocsTreeSchema>;
