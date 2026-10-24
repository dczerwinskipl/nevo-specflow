import { Type, type Static } from 'typebox';

import {
  ActionSchema,
  CatalogueIdSchema,
  ClassificationSchema,
  ContentKindSchema,
  IdSchema,
} from './vocabulary';

/** Codes of `DocumentTree.issues`; the last two mean Close archive will refuse. */
export const DOCUMENT_ISSUE_CODES = [
  'dangling',
  'unclassified',
  'requirement-unmet',
  'skipped-entry',
  'path-case-collision',
  'archive-limit',
] as const;
export const DocumentIssueCodeSchema = Type.Union(
  DOCUMENT_ISSUE_CODES.map((code) => Type.Literal(code)),
);
export type DocumentIssueCode = Static<typeof DocumentIssueCodeSchema>;

export const DocumentTreeFolderSchema = Type.Object(
  {
    /** The root folder has the path `''`. */
    path: Type.String(),
    actions: Type.Object(
      { rename: ActionSchema, move: ActionSchema, delete: ActionSchema },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const DocumentTreeDocumentSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    classification: ClassificationSchema,
    /** Present if and only if registered. */
    type: Type.Optional(CatalogueIdSchema),
    kind: ContentKindSchema,
    mediaType: Type.String({ minLength: 1 }),
    size: Type.Integer({ minimum: 0 }),
    revision: Type.String({ minLength: 1 }),
    /** True only for `overview`. */
    protected: Type.Boolean(),
    editable: Type.Boolean(),
    satisfiesRequirement: Type.Boolean(),
    actions: Type.Object(
      {
        rename: ActionSchema,
        move: ActionSchema,
        delete: ActionSchema,
        classify: ActionSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const DocumentTreeDanglingSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    type: CatalogueIdSchema,
    /** `delete` removes the registration. */
    actions: Type.Object({ delete: ActionSchema }, { additionalProperties: false }),
  },
  { additionalProperties: false },
);

export const RequirementResultSchema = Type.Object(
  {
    documentType: CatalogueIdSchema,
    minCount: Type.Integer({ minimum: 0 }),
    count: Type.Integer({ minimum: 0 }),
    satisfied: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type RequirementResult = Static<typeof RequirementResultSchema>;

export const DocumentIssueSchema = Type.Object(
  {
    code: DocumentIssueCodeSchema,
    path: Type.Optional(Type.String()),
    documentType: Type.Optional(CatalogueIdSchema),
  },
  { additionalProperties: false },
);
export type DocumentIssue = Static<typeof DocumentIssueSchema>;

export const DocumentTreeSchema = Type.Object(
  {
    revision: Type.String({ minLength: 1 }),
    archetype: Type.Object(
      {
        id: CatalogueIdSchema,
        version: Type.Integer({ minimum: 1 }),
        title: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    folders: Type.Array(DocumentTreeFolderSchema),
    documents: Type.Array(DocumentTreeDocumentSchema),
    dangling: Type.Array(DocumentTreeDanglingSchema),
    completeness: Type.Object(
      { complete: Type.Boolean(), requirements: Type.Array(RequirementResultSchema) },
      { additionalProperties: false },
    ),
    /** Advisory. */
    capabilities: Type.Object(
      {
        createFile: ActionSchema,
        createFolder: ActionSchema,
        import: ActionSchema,
        classify: ActionSchema,
        /** Extensions creatable and editable as text, for example `['md', 'txt']`. */
        formats: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    issues: Type.Array(DocumentIssueSchema),
    truncated: Type.Boolean(),
    skippedEntries: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type DocumentTree = Static<typeof DocumentTreeSchema>;

/** `GET /documents/:documentId`. `content` is present for kind `text` within the JSON read limit only. */
export const DocumentContentSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    /** Derived: first H1 of a markdown text, else the file stem. */
    title: Type.String(),
    classification: ClassificationSchema,
    type: Type.Optional(CatalogueIdSchema),
    kind: ContentKindSchema,
    mediaType: Type.String({ minLength: 1 }),
    size: Type.Integer({ minimum: 0 }),
    revision: Type.String({ minLength: 1 }),
    editable: Type.Boolean(),
    content: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DocumentContent = Static<typeof DocumentContentSchema>;
