import { Type, type Static } from 'typebox';

import {
  ActionSchema,
  CatalogueIdSchema,
  IdSchema,
  KEBAB_CASE_PATTERN,
  UuidSchema,
  closedUnion,
} from './vocabulary';

/**
 * Commit state of a document write. `uncommitted`: the files are on disk and recorded in the
 * uncommitted-changes ledger, not in Git (`reason`: `auto-commit-off` or `abandoned`). `not-applicable`:
 * Git is disabled (`git-disabled`) or there was nothing to commit (`nothing-to-commit`).
 */
export const COMMIT_STATES = [
  'pending',
  'committed',
  'failed',
  'uncommitted',
  'not-applicable',
] as const;
export const CommitStateSchema = closedUnion(COMMIT_STATES);
export type CommitState = (typeof COMMIT_STATES)[number];

/** Why a `pending` commit is waiting. Documented vocabulary; `CommitInfo.reason` stays an open kebab-case string. */
export const COMMIT_PENDING_REASONS = [
  'settling',
  'index-locked',
  'git-busy',
  'unmerged-paths',
  'waiting-for-earlier-commit',
] as const;
export type CommitPendingReason = (typeof COMMIT_PENDING_REASONS)[number];

/** Why a commit is `failed`. `recoveryRequired` is true for `history-changed` and `uncertain`. */
export const COMMIT_FAILURE_REASONS = [
  'branch-changed',
  'branch-protected',
  'branch-not-allowed',
  'detached',
  'no-commits',
  'path-ignored',
  'index-unreadable',
  'commit-failed',
  'content-changed',
  'retries-exhausted',
  'history-changed',
  'uncertain',
] as const;
export type CommitFailureReason = (typeof COMMIT_FAILURE_REASONS)[number];

export const CommitInfoSchema = Type.Object(
  {
    state: CommitStateSchema,
    /** Known only when committed. */
    sha: Type.Optional(Type.String({ minLength: 1 })),
    /** ISO. */
    queuedAt: Type.Optional(Type.String()),
    settledAt: Type.Optional(Type.String()),
    batchId: Type.Optional(Type.String({ minLength: 1 })),
    /** Operations that share the commit. */
    coalescedWith: Type.Optional(Type.Integer({ minimum: 0 })),
    /** Why `pending` is waiting or why `failed` / `not-applicable`. */
    reason: Type.Optional(Type.String({ pattern: KEBAB_CASE_PATTERN })),
    /** The commit port's own reason when a Git blocker is the cause. */
    blockedBy: Type.Optional(Type.String({ pattern: KEBAB_CASE_PATTERN })),
    /** `pending` only. */
    attempts: Type.Optional(Type.Integer({ minimum: 0 })),
    nextAttemptAt: Type.Optional(Type.String()),
    /** Pending longer than five minutes. */
    overdue: Type.Optional(Type.Boolean()),
    /** `failed` and only the operator (CLI) can resolve it. */
    recoveryRequired: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type CommitInfo = Static<typeof CommitInfoSchema>;

export const WrittenDocumentSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    revision: Type.String({ minLength: 1 }),
    type: Type.Optional(CatalogueIdSchema),
  },
  { additionalProperties: false },
);
export type WrittenDocument = Static<typeof WrittenDocumentSchema>;

/** Batch save: 1..25 documents, unique ids; total bytes are a route and Engine limit. */
export const BATCH_SAVE_MAX_DOCUMENTS = 25;

/** Longest `details.conflicts` list of a refused batch save. */
export const REVISION_CONFLICTS_MAX = 25;

/**
 * Every state change carries `operationId` (UUID, idempotency key): a replay with an equal body
 * returns the stored result with the current commit state. Content size is capped in UTF-8 bytes
 * by the route and the Engine, not by these schemas.
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
    document: WrittenDocumentSchema,
    commit: CommitInfoSchema,
  },
  { additionalProperties: false },
);
export type SaveResult = Static<typeof SaveResultSchema>;

export const BatchSaveInputSchema = Type.Object(
  {
    operationId: UuidSchema,
    documents: Type.Array(
      Type.Object(
        {
          documentId: IdSchema,
          content: Type.String(),
          expectedRevision: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: BATCH_SAVE_MAX_DOCUMENTS },
    ),
  },
  { additionalProperties: false },
);
export type BatchSaveInput = Static<typeof BatchSaveInputSchema>;

/** One commit for the whole batch. */
export const BatchSaveResultSchema = Type.Object(
  {
    operationId: UuidSchema,
    documents: Type.Array(WrittenDocumentSchema),
    commit: CommitInfoSchema,
  },
  { additionalProperties: false },
);
export type BatchSaveResult = Static<typeof BatchSaveResultSchema>;

export const DOCUMENT_OPERATION_ACTIONS = ['rename', 'move', 'delete', 'classify'] as const;
export const DocumentOperationActionSchema = closedUnion(DOCUMENT_OPERATION_ACTIONS);
export const DOCUMENT_OPERATION_TARGET_KINDS = ['document', 'folder'] as const;
export const DocumentOperationTargetKindSchema = closedUnion(DOCUMENT_OPERATION_TARGET_KINDS);

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
    /**
     * Document: its revision. Folder: the FOLDER revision, a sha256 over the sorted
     * `path:revision` of the files under it and their registry entries (commit state excluded; the
     * tree revision also changes with commit state and is not used for a folder).
     */
    expectedRevision: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type DocumentOperationInput = Static<typeof DocumentOperationInputSchema>;

export const DocumentOperationResultSchema = Type.Object(
  {
    operationId: UuidSchema,
    /** Tree revision after the write. */
    revision: Type.String({ minLength: 1 }),
    documents: Type.Array(WrittenDocumentSchema),
    removedDocumentIds: Type.Array(IdSchema),
    folders: Type.Array(Type.String()),
    commit: CommitInfoSchema,
  },
  { additionalProperties: false },
);
export type DocumentOperationResult = Static<typeof DocumentOperationResultSchema>;

export const DOCUMENT_OPERATION_STATUS_ACTIONS = [
  'save',
  'save-all',
  'create',
  'folder',
  'rename',
  'move',
  'delete',
  'classify',
  'manual-commit',
] as const;
export const DocumentOperationStatusActionSchema = closedUnion(DOCUMENT_OPERATION_STATUS_ACTIONS);
export type DocumentOperationStatusAction = (typeof DOCUMENT_OPERATION_STATUS_ACTIONS)[number];

/** Longest member list of a commit batch (the batch cap). */
export const DOCUMENT_BATCH_MEMBERS_MAX = 50;

/** The life of a document operation as the status reports it. `failed`: refused after reservation, nothing was written. */
export const DOCUMENT_OPERATION_STAGES = [
  'reserved',
  'files-writing',
  'queued',
  'committing',
  'completed',
  'failed',
  'commit-failed',
  'recovery-required',
] as const;
export const DocumentOperationStageSchema = closedUnion(DOCUMENT_OPERATION_STAGES);
export type DocumentOperationStage = (typeof DOCUMENT_OPERATION_STAGES)[number];

/** Liveness of the executor that holds the operation: a hint judged without a lock, never a proof of work. */
export const DOCUMENT_EXECUTOR_STATES = ['alive', 'dead', 'unknown'] as const;
export const DocumentExecutorHintSchema = Type.Object(
  { state: closedUnion(DOCUMENT_EXECUTOR_STATES) },
  { additionalProperties: false },
);
export type DocumentExecutorHint = Static<typeof DocumentExecutorHintSchema>;

/** `retry` and `abandon` resolve a failed commit without `recoveryRequired`; `recover` is the operator's (CLI) for the rest. */
export const DocumentOperationAvailableActionsSchema = Type.Object(
  { retry: ActionSchema, abandon: ActionSchema, recover: ActionSchema },
  { additionalProperties: false },
);
export type DocumentOperationAvailableActions = Static<
  typeof DocumentOperationAvailableActionsSchema
>;

/** `GET .../document-operations/:operationId`; also the result of `retry` and `abandon`. */
export const DocumentOperationStatusSchema = Type.Object(
  {
    operationId: UuidSchema,
    specId: IdSchema,
    action: DocumentOperationStatusActionSchema,
    documentIds: Type.Array(IdSchema),
    /** ISO. */
    createdAt: Type.String(),
    commit: CommitInfoSchema,
    /** Where the operation is in its life (`DOCUMENT_OPERATION_STAGES`). */
    stage: Type.Optional(DocumentOperationStageSchema),
    /** ISO; the last change of the operation. */
    updatedAt: Type.Optional(Type.String()),
    /**
     * The operations that share the commit batch (the operation itself included), in the order they
     * were made. At most 50. Absent while the operation is not part of a batch.
     */
    batchMembers: Type.Optional(Type.Array(UuidSchema, { maxItems: DOCUMENT_BATCH_MEMBERS_MAX })),
    /** Whether the process that was writing or committing is known to run (`unknown`: it cannot be told). */
    executor: Type.Optional(DocumentExecutorHintSchema),
    /** What a person can do now. Each action is available only where the operation is in a state that allows it. */
    actions: Type.Optional(DocumentOperationAvailableActionsSchema),
  },
  { additionalProperties: false },
);
export type DocumentOperationStatus = Static<typeof DocumentOperationStatusSchema>;

/** `POST .../folders`. */
export const FolderInputSchema = Type.Object(
  { operationId: UuidSchema, path: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type FolderInput = Static<typeof FolderInputSchema>;

export const FLUSH_MAX_WAIT_MS = 30_000;
export const FLUSH_DEFAULT_WAIT_MS = 10_000;

/** `POST .../document-commits/flush`. `waitMs` is 0..30000, default 10000. */
export const FlushInputSchema = Type.Object(
  { waitMs: Type.Optional(Type.Integer({ minimum: 0, maximum: FLUSH_MAX_WAIT_MS })) },
  { additionalProperties: false },
);
export type FlushInput = Static<typeof FlushInputSchema>;

/** Counts of this Specification's batches touched. */
export const FlushResultSchema = Type.Object(
  {
    settled: Type.Boolean(),
    pending: Type.Integer({ minimum: 0 }),
    failed: Type.Integer({ minimum: 0 }),
    committed: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type FlushResult = Static<typeof FlushResultSchema>;

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
    /**
     * Required by the Engine when any entry uses `templateId` (precondition, `CATALOGUE_STALE`);
     * absent for a content-only request. The conditional requirement is not a per-field rule.
     */
    catalogueRevision: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type CreateDocumentsInput = Static<typeof CreateDocumentsInputSchema>;
