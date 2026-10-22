import { Type, type Static } from 'typebox';

import { OPERATION_STEP_STATUSES, OperationIdSchema } from './progress';

/**
 * Operation list model: the read-only listing of operations a feature owns, served by that
 * feature's own route (the Specifications list is `GET /api/specs/operations`, see
 * docs/engineering/shared/operation-progress.md). The list carries no links, paths, journal
 * stages or server text: the UI derives detail and events URLs from `kind + operationId` and the
 * copy from `status`, step ids and `code`.
 *
 * Forward compatibility: consumers MUST treat an unknown `status`, `kind`, step id or `code` as a
 * renderable generic value instead of failing the whole list.
 */

/** Statuses a list row can currently carry. */
export const OPERATION_LIST_STATUSES = [
  'in-progress',
  'recovery-required',
  'failed',
  'completed',
] as const;

/** Reserved for a later operation runner; the list never produces them today. */
export const OPERATION_LIST_RESERVED_STATUSES = ['queued', 'scheduled'] as const;

export const OPERATION_LIST_ALL_STATUSES = [
  ...OPERATION_LIST_STATUSES,
  ...OPERATION_LIST_RESERVED_STATUSES,
] as const;

export type OperationListStatus = (typeof OPERATION_LIST_ALL_STATUSES)[number];

/** Kinds the list produces today. The wire type stays an open string (new kinds add rows only). */
export const OPERATION_LIST_KINDS = ['specification-create'] as const;
export type OperationListKind = (typeof OPERATION_LIST_KINDS)[number];

/**
 * Stable codes of a list row (`OperationSummary.code`). Open set: the Create failure codes
 * (`COMMIT_FAILED`, `COMMIT_BLOCKED`, ...) are also carried here.
 */
export const OPERATION_INTERRUPTED_CODE = 'OPERATION_INTERRUPTED';
export const OPERATION_JOURNAL_CORRUPT_CODE = 'CREATE_JOURNAL_CORRUPT';

/**
 * Public step id of a row. For `specification-create` this is the vocabulary of
 * `SPECIFICATION_CREATE_STEPS` (`reserving`, `preparing-workspace`, `writing-specification`,
 * `registering`, plus `committing-specification` once the commit slice lands). Kept an open string
 * so a new step or kind never invalidates a whole list.
 */
export const OperationListStepIdSchema = Type.String({ minLength: 1 });

const StatusSchema = Type.Union(OPERATION_LIST_ALL_STATUSES.map((status) => Type.Literal(status)));

const StepStatusSchema = Type.Union(OPERATION_STEP_STATUSES.map((s) => Type.Literal(s)));

export const OperationSummarySchema = Type.Object(
  {
    operationId: OperationIdSchema,
    kind: Type.String({ minLength: 1 }),
    status: StatusSchema,
    title: Type.Optional(Type.String()),
    subject: Type.Optional(
      Type.Object(
        { specId: Type.Optional(Type.String()), slug: Type.Optional(Type.String()) },
        { additionalProperties: false },
      ),
    ),
    target: Type.Optional(
      Type.Object(
        {
          workspaceKind: Type.Optional(
            Type.Union([Type.Literal('existing'), Type.Literal('new-worktree')]),
          ),
          workspaceId: Type.Optional(Type.String()),
          branch: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    currentStep: Type.Optional(OperationListStepIdSchema),
    steps: Type.Optional(
      Type.Array(
        Type.Object(
          { id: OperationListStepIdSchema, status: StepStatusSchema },
          { additionalProperties: false },
        ),
      ),
    ),
    /** ISO timestamps. */
    startedAt: Type.Optional(Type.String()),
    updatedAt: Type.String(),
    finishedAt: Type.Optional(Type.String()),
    /** Stable code, never server text. */
    code: Type.Optional(Type.String({ minLength: 1 })),
    /** Hint, absent or false today. */
    resumable: Type.Optional(Type.Boolean()),
    /** Reserved for `scheduled`, absent today. ISO. */
    scheduledFor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type OperationSummary = Static<typeof OperationSummarySchema>;

export const OperationListCountsSchema = Type.Object(
  {
    inProgress: Type.Integer({ minimum: 0 }),
    recoveryRequired: Type.Integer({ minimum: 0 }),
    failed: Type.Integer({ minimum: 0 }),
    completed: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type OperationListCounts = Static<typeof OperationListCountsSchema>;

/** Response of `GET <feature>/operations`. Counts are computed after authorization. */
export const OperationListResponseSchema = Type.Object(
  {
    items: Type.Array(OperationSummarySchema),
    counts: OperationListCountsSchema,
    truncated: Type.Boolean(),
    generatedAt: Type.String(),
  },
  { additionalProperties: false },
);
export type OperationListResponse = Static<typeof OperationListResponseSchema>;

export const OPERATION_LIST_DEFAULT_LIMIT = 20;
export const OPERATION_LIST_MAX_LIMIT = 50;

/** Query of the list route: `status` is a comma-separated filter (default all), `limit` 1..50. */
export const OperationListQuerySchema = Type.Object(
  {
    status: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: OPERATION_LIST_MAX_LIMIT,
        default: OPERATION_LIST_DEFAULT_LIMIT,
      }),
    ),
  },
  { additionalProperties: false },
);
export type OperationListQuery = Static<typeof OperationListQuerySchema>;
