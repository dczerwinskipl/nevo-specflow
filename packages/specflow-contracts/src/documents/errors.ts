import { Type, type Static } from 'typebox';

import { REVISION_CONFLICTS_MAX } from './operations';
import { ActionReasonSchema, IdSchema, closedUnion } from './vocabulary';

/**
 * Every code of the "Errors" table of `docs/reference/api/specification-documents.md`.
 * The single source of the code list: the union type and the schema derive from this array.
 */
export const DOCUMENT_ERROR_CODES = [
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_FILE_MISSING',
  'SPEC_SOURCE_UNAVAILABLE',
  'DOCUMENT_REVISION_UNAVAILABLE',
  'DOCUMENT_REVISION_CONFLICT',
  'DOCUMENT_PATH_INVALID',
  'DOCUMENT_PATH_CONFLICT',
  'DOCUMENT_PROTECTED',
  'DOCUMENT_TYPE_INVALID',
  'DOCUMENT_ALREADY_CLASSIFIED',
  'DOCUMENT_NOT_EDITABLE',
  'DOCUMENT_TOO_LARGE',
  'DOCUMENT_OPERATION_INVALID',
  'DOCUMENT_OPERATION_CONFLICT',
  'DOCUMENT_RECOVERY_REQUIRED',
  'SPEC_MANIFEST_DIRTY',
  'SPEC_ARCHIVED',
  'SPEC_BUSY',
  'BRANCH_PROTECTED',
  'COMMIT_BLOCKED',
  'COMMIT_FAILED',
  'GIT_POLICY_INVALID',
  'CREATE_JOURNAL_UNSUPPORTED',
  'CATALOGUE_STALE',
  'ARCHETYPE_UNKNOWN',
  'DEFINITIONS_MISSING',
  'DOCUMENT_COMMITS_PENDING',
  'DOCUMENT_OPERATION_NOT_FOUND',
  'DOCUMENT_OPERATION_STATE_INVALID',
  'DOCUMENT_WRITE_FAILED',
  'DOCUMENT_UNCOMMITTED_LIMIT',
  'MANUAL_COMMIT_UNAVAILABLE',
  'MANUAL_COMMIT_CONFLICT',
  'MANUAL_COMMIT_SUBSET_INVALID',
  'MANUAL_COMMIT_STALE',
  'MANUAL_COMMIT_MESSAGE_INVALID',
  'MANUAL_COMMIT_RECOVERY_REQUIRED',
] as const;

export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

export const DocumentErrorCodeSchema = closedUnion(DOCUMENT_ERROR_CODES);

/** Longest `details.paths` list of an error. */
export const ERROR_DETAIL_PATHS_MAX = 25;

/** One stale document of a batch save (`DOCUMENT_REVISION_CONFLICT`): its current revision. */
export const RevisionConflictSchema = Type.Object(
  { documentId: IdSchema, revision: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type RevisionConflict = Static<typeof RevisionConflictSchema>;

/**
 * Additive and strict. `reason` is only the `ActionReason` vocabulary; `cause` is an open
 * kebab-case string (for example `path-too-long`, `commit-in-progress`, `no-space`).
 */
export const DocumentErrorDetailsSchema = Type.Object(
  {
    reason: Type.Optional(ActionReasonSchema),
    /** The Engine commit port's own reason (`detached`, `index-locked`, ...). */
    blockedBy: Type.Optional(Type.String()),
    /** What caused the refusal or failure, for example `path-too-long` or a recovery cause. */
    cause: Type.Optional(Type.String()),
    /** `SPEC_BUSY`: when a retry is worth trying, in milliseconds. */
    retryAfterMs: Type.Optional(Type.Integer({ minimum: 0 })),
    /** The manual commit that holds the checkout (SPEC_BUSY): the id of `recover` and `status`. */
    operationId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    /** `DOCUMENT_REVISION_CONFLICT` of a batch save: the current revisions (at most 25). */
    conflicts: Type.Optional(
      Type.Array(RevisionConflictSchema, { maxItems: REVISION_CONFLICTS_MAX }),
    ),
    /**
     * `MANUAL_COMMIT_CONFLICT`: the ledger paths someone edited since their post-image;
     * `MANUAL_COMMIT_SUBSET_INVALID`: the closure the subset needs (at most 25 paths, sorted).
     */
    paths: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { maxItems: ERROR_DETAIL_PATHS_MAX }),
    ),
  },
  { additionalProperties: false },
);
export type DocumentErrorDetails = Static<typeof DocumentErrorDetailsSchema>;

/**
 * Error body of every document endpoint: a superset of `CreateSpecErrorSchema` (`error`, `code`)
 * with the optional `details`. `code` stays a plain string in the Create schema in this release.
 */
export const DocumentErrorSchema = Type.Object(
  {
    error: DocumentErrorCodeSchema,
    code: DocumentErrorCodeSchema,
    details: Type.Optional(DocumentErrorDetailsSchema),
  },
  { additionalProperties: false },
);
export type DocumentErrorBody = Static<typeof DocumentErrorSchema>;
