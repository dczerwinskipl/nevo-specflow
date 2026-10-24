import { Type, type Static } from 'typebox';

import { CatalogueIdSchema, IdSchema, UuidSchema } from './vocabulary';

export const CommitRefSchema = Type.Object(
  { sha: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

/**
 * Every state change carries `operationId` (UUID, idempotency key): a replay with an equal body
 * returns the stored result. Content size is capped in UTF-8 bytes by the route and the Engine,
 * not by these schemas.
 */
export const SaveInputSchema = Type.Object(
  {
    operationId: UuidSchema,
    content: Type.String(),
    expectedRevision: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type SaveInput = Static<typeof SaveInputSchema>;

export const SaveResultSchema = Type.Object(
  {
    operationId: UuidSchema,
    revision: Type.String({ minLength: 1 }),
    /** False only when Git is disabled. */
    committed: Type.Boolean(),
    commit: Type.Optional(CommitRefSchema),
  },
  { additionalProperties: false },
);
export type SaveResult = Static<typeof SaveResultSchema>;

export const DOCUMENT_OPERATION_ACTIONS = ['rename', 'move', 'delete', 'classify'] as const;
export const DocumentOperationActionSchema = Type.Union(
  DOCUMENT_OPERATION_ACTIONS.map((action) => Type.Literal(action)),
);
export const DOCUMENT_OPERATION_TARGET_KINDS = ['document', 'folder'] as const;
export const DocumentOperationTargetKindSchema = Type.Union(
  DOCUMENT_OPERATION_TARGET_KINDS.map((kind) => Type.Literal(kind)),
);

/** Which fields apply to which action is validated by the Engine (`DOCUMENT_OPERATION_INVALID`). */
export const DocumentOperationInputSchema = Type.Object(
  {
    operationId: UuidSchema,
    action: DocumentOperationActionSchema,
    kind: DocumentOperationTargetKindSchema,
    /** Document target, by id. */
    documentId: Type.Optional(IdSchema),
    /** Folder target, by path. */
    path: Type.Optional(Type.String()),
    name: Type.Optional(Type.String({ minLength: 1 })),
    targetFolder: Type.Optional(Type.String()),
    /** `classify` only. */
    type: Type.Optional(CatalogueIdSchema),
    /** Document: its revision. Folder: the tree revision. */
    expectedRevision: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type DocumentOperationInput = Static<typeof DocumentOperationInputSchema>;

export const DocumentOperationResultSchema = Type.Object(
  {
    operationId: UuidSchema,
    revision: Type.String({ minLength: 1 }),
    documents: Type.Array(
      Type.Object(
        {
          id: IdSchema,
          path: Type.String({ minLength: 1 }),
          revision: Type.String({ minLength: 1 }),
          type: Type.Optional(CatalogueIdSchema),
        },
        { additionalProperties: false },
      ),
    ),
    removedDocumentIds: Type.Array(IdSchema),
    folders: Type.Array(Type.String()),
    committed: Type.Boolean(),
    commit: Type.Optional(CommitRefSchema),
  },
  { additionalProperties: false },
);
export type DocumentOperationResult = Static<typeof DocumentOperationResultSchema>;

/** Exactly one of `templateId` and `content` per entry. Counts (10 files, 100 folders) are Engine limits. */
export const CreateDocumentEntrySchema = Type.Union([
  Type.Object(
    {
      path: Type.String({ minLength: 1 }),
      type: Type.Optional(CatalogueIdSchema),
      templateId: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      path: Type.String({ minLength: 1 }),
      type: Type.Optional(CatalogueIdSchema),
      content: Type.String(),
    },
    { additionalProperties: false },
  ),
]);

export const CreateDocumentsInputSchema = Type.Object(
  {
    operationId: UuidSchema,
    documents: Type.Array(CreateDocumentEntrySchema),
    folders: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);
export type CreateDocumentsInput = Static<typeof CreateDocumentsInputSchema>;
