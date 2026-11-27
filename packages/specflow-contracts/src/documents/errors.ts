import { Type, type Static } from 'typebox';

import { SpecIdSchema } from '../identifiers';
import { REVISION_CONFLICTS_MAX } from './operations';
import { CommitPolicyModeSchema } from './tree';
import { CommitPolicySourceSchema, UncommittedReasonSchema } from './uncommitted';
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

/** Most owners `UncommittedHoldDetails.owners` names. */
export const UNCOMMITTED_HOLD_OWNERS_MAX = 64;
/** Failed agent attempt commits one refusal names. */
export const UNCOMMITTED_ATTEMPTS_MAX = 8;
/** Most paths one owner names (`count` is its total). */
export const UNCOMMITTED_HOLD_PATHS_MAX = 8;

/** Checkout-relative paths of one owner: its workflow state first, at most 8 of its `count`. */
const OwnerPathsSchema = Type.Array(Type.String({ minLength: 1, maxLength: 4096 }), {
  maxItems: UNCOMMITTED_HOLD_PATHS_MAX,
});

/**
 * A finished agent attempt whose commit failed (D15, D16): its paths stay uncommitted until the
 * owner retries the attempt commit (`POST .../workflow/attempt-commit/retry`, `nevo-specflow workflow
 * retry-commit`). `paths` are at most 8 of the `count` paths of it the refusal holds (the attempt's
 * documents, Tasks, workflow state and declared files); they are not listed again under another
 * kind. `code` is why the commit failed.
 */
export const UncommittedAttemptSchema = Type.Object(
  {
    attemptId: Type.String({ minLength: 36, maxLength: 36 }),
    specId: SpecIdSchema,
    taskId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    step: Type.String({ minLength: 1, maxLength: 200 }),
    attempt: Type.Integer({ minimum: 1 }),
    stepTitle: Type.String({ minLength: 1, maxLength: 1000 }),
    code: Type.String({ minLength: 1, maxLength: 100 }),
    count: Type.Integer({ minimum: 1 }),
    paths: OwnerPathsSchema,
  },
  { additionalProperties: false },
);
export type UncommittedAttempt = Static<typeof UncommittedAttemptSchema>;

/**
 * `DOCUMENT_COMMITS_PENDING` with `cause: commit-uncommitted` (a Close, an integration): what the
 * uncommitted-changes ledger of the checkout holds, so a refusal names the real cause.
 * - `reasons`: why the Engine left the paths uncommitted: `auto-commit-off` (automatic commits are
 *   off, see `policy`) and/or `abandoned` (a failed commit was abandoned).
 * - `policy`: the documents commit policy now (`manual`, from `source` `default` when no setting
 *   names it: off is the default). Absent when the configuration cannot be read.
 * - `owners`: whose paths, in the ledger's order, each with at most 8 `paths` (its workflow state
 *   first) of its `count`. A Specification (`title` when readable) has `workflowState` (its
 *   `.execution` and Tasks, written by workflow and Task operations; with automatic commits off the
 *   finish of a step in progress, `stepInProgress`, commits them) and `documents` (its other files).
 *   The Specification a Close archives is listed only for paths its archive commit does not take
 *   along (its documents).
 * - `unreadable`: ledger records that cannot be read (they hold the checkout too).
 */
export const UncommittedHoldDetailsSchema = Type.Object(
  {
    reasons: Type.Array(UncommittedReasonSchema, { maxItems: 2, uniqueItems: true }),
    policy: Type.Optional(
      Type.Object(
        { documents: CommitPolicyModeSchema, source: CommitPolicySourceSchema },
        { additionalProperties: false },
      ),
    ),
    owners: Type.Array(
      Type.Union([
        Type.Object(
          {
            kind: Type.Literal('specification'),
            specId: SpecIdSchema,
            /** The Specification's title, when it can be read. */
            title: Type.Optional(Type.String()),
            workflowState: Type.Integer({ minimum: 0 }),
            documents: Type.Integer({ minimum: 0 }),
            /**
             * A step of its run or of one of its Task runs is in progress, whose finish commits the
             * workflow state (automatic commits off). Absent when unknown or without workflow state.
             */
            stepInProgress: Type.Optional(Type.Boolean()),
            count: Type.Integer({ minimum: 1 }),
            paths: OwnerPathsSchema,
          },
          { additionalProperties: false },
        ),
        Type.Object(
          {
            kind: Type.Literal('definitions'),
            count: Type.Integer({ minimum: 1 }),
            paths: OwnerPathsSchema,
          },
          { additionalProperties: false },
        ),
      ]),
      { maxItems: UNCOMMITTED_HOLD_OWNERS_MAX },
    ),
    /** Agent attempts whose commit failed; their paths are not in `owners`. */
    attempts: Type.Optional(
      Type.Array(UncommittedAttemptSchema, { maxItems: UNCOMMITTED_ATTEMPTS_MAX }),
    ),
    unreadable: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type UncommittedHoldDetails = Static<typeof UncommittedHoldDetailsSchema>;

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
    /** `DOCUMENT_COMMITS_PENDING` (`cause: commit-uncommitted`): what the ledger holds and why. */
    uncommitted: Type.Optional(UncommittedHoldDetailsSchema),
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
  { $id: 'DocumentError', additionalProperties: false },
);
export type DocumentErrorBody = Static<typeof DocumentErrorSchema>;
