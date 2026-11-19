import { Type, type Static } from 'typebox';

import { DocumentErrorDetailsSchema } from '../documents/errors';
import { ExitBlockerSchema } from '../workflow/projection';
import { WorkspaceIdSchema } from '../identifiers';
import { OperationIdSchema } from '../operations/progress';

export const CloseUuidSchema = Type.String({
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});
export const CloseSpecParamsSchema = Type.Object(
  { specId: CloseUuidSchema },
  { additionalProperties: false },
);
export const CloseOperationParamsSchema = Type.Object(
  { specId: CloseUuidSchema, operationId: OperationIdSchema },
  { additionalProperties: false },
);
export const CloseWorkspaceParamsSchema = Type.Object(
  { workspaceId: WorkspaceIdSchema },
  { additionalProperties: false },
);
export const CloseWorkspaceOperationParamsSchema = Type.Object(
  { workspaceId: WorkspaceIdSchema, operationId: OperationIdSchema },
  { additionalProperties: false },
);
export const CloseWorktreeRequestSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    /** Finish after the content was already merged externally, e.g. a GitHub squash merge (#157). */
    finishAfterExternalMerge: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export const CloseSpecificationRequestSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    integrateToTargetBranch: Type.Optional(Type.Boolean()),
    finishAfterExternalMerge: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type CloseSpecificationRequest = Static<typeof CloseSpecificationRequestSchema>;
export const ClosePreviewQuerySchema = Type.Object(
  {
    integrateToTargetBranch: Type.Optional(Type.Boolean()),
    finishAfterExternalMerge: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
// Trusted operator acknowledgement only: `true` asserts the operator has
// independently established Git-process quiescence. The server cannot derive
// process liveness from this boolean and still verifies physical scratch absence.
export const CloseScratchReconciliationRequestSchema = Type.Object(
  { confirmedNoActiveGitProcess: Type.Literal(true) },
  { additionalProperties: false },
);
export const ClosePreviewSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    specId: CloseUuidSchema,
    kind: Type.Union([Type.Literal('worktree-close'), Type.Literal('specification-close')]),
    location: Type.Union([Type.Literal('active'), Type.Literal('archive')]),
    integrationRequired: Type.Boolean(),
  },
  { $id: 'ClosePreview', additionalProperties: false },
);
export const CloseResultSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    specId: CloseUuidSchema,
    kind: Type.Union([Type.Literal('worktree-close'), Type.Literal('specification-close')]),
    status: Type.Union([
      Type.Literal('completed'),
      Type.Literal('requires-resolution'),
      Type.Literal('in-progress'),
      Type.Literal('recovery-required'),
    ]),
    outcome: Type.Optional(
      Type.Union([
        Type.Literal('integrated-and-removed'),
        Type.Literal('archive-only-closed'),
        Type.Literal('archived-linked-awaiting-integration'),
        Type.Literal('archived-in-primary'),
        Type.Literal('worktree-integrated-and-removed'),
      ]),
    ),
    conflictPaths: Type.Optional(Type.Array(Type.String())),
    scratchRetired: Type.Optional(Type.Boolean()),
  },
  { $id: 'CloseResult', additionalProperties: false },
);
/**
 * Runtime only: agent Session Turns work in the checkout Close would remove (`subjectIds` are
 * Session ids). The Engine never reports it; the Runtime adds it to a `CLOSE_BLOCKED` refusal.
 */
export const SessionTurnBlockerSchema = Type.Object({
  kind: Type.Literal('session-turn-running'),
  subjectIds: Type.Array(Type.String(), { maxItems: 1000 }),
  message: Type.String({ maxLength: 20_000 }),
});
export type SessionTurnBlocker = Static<typeof SessionTurnBlockerSchema>;
/**
 * `GET /api/specs/:specId/close/occupancy`: the agent Session Turns that work now in the linked
 * checkout a Close of the Specification would remove, read without planning the Close (for a Close
 * the workflow already blocks). Empty when none run or the Specification has no linked checkout.
 */
export const CloseOccupancySchema = Type.Object(
  { blockers: Type.Array(SessionTurnBlockerSchema, { maxItems: 1 }) },
  { additionalProperties: false },
);
export type CloseOccupancy = Static<typeof CloseOccupancySchema>;
/** One group of a `CLOSE_BLOCKED` refusal: a workflow blocker, or running Session Turns. */
export const CloseRefusalBlockerSchema = Type.Union([ExitBlockerSchema, SessionTurnBlockerSchema]);
export type CloseRefusalBlocker = Static<typeof CloseRefusalBlockerSchema>;

export const CloseErrorSchema = Type.Object(
  {
    error: Type.String(),
    code: Type.String(),
    remedy: Type.Optional(Type.String()),
    /** Present for `DOCUMENT_COMMITS_PENDING` (`details.cause`: `commit-pending`, `commit-failed`, ...). */
    details: Type.Optional(DocumentErrorDetailsSchema),
    /**
     * `CLOSE_BLOCKED` (409): what the Specification workflow still holds, grouped, for a list with
     * links. `message` of a blocker is display-only.
     */
    blockers: Type.Optional(Type.Array(CloseRefusalBlockerSchema)),
    /**
     * Present for `CLOSE_LOCAL_CONFIG_MODIFIED`: the worktree's `.nevo/local/config.yaml` was
     * edited (`changed`), was not copied by Create (`unrecorded`), or cannot be read
     * (`unreadable`). Move or delete it, then resume the same Close operation.
     */
    localConfig: Type.Optional(
      Type.Union([Type.Literal('changed'), Type.Literal('unrecorded'), Type.Literal('unreadable')]),
    ),
  },
  { $id: 'CloseError', additionalProperties: false },
);

export const CloseWorkspacePreviewSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    workspaceId: WorkspaceIdSchema,
    kind: Type.Literal('workspace-close'),
    sourceBranch: Type.String(),
    targetWorkspaceId: WorkspaceIdSchema,
    targetBranch: Type.String(),
    wholeBranchIntegration: Type.Literal(true),
    occupantCount: Type.Integer({ minimum: 1 }),
    occupants: Type.Array(
      Type.Object(
        {
          specId: CloseUuidSchema,
          slug: Type.String(),
          location: Type.Union([Type.Literal('active'), Type.Literal('archive')]),
          status: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const CloseWorkspaceResultSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    workspaceId: WorkspaceIdSchema,
    kind: Type.Literal('workspace-close'),
    status: Type.Union([
      Type.Literal('completed'),
      Type.Literal('requires-resolution'),
      Type.Literal('in-progress'),
      Type.Literal('recovery-required'),
    ]),
    outcome: Type.Optional(Type.Literal('worktree-integrated-and-removed')),
    occupantCount: Type.Integer({ minimum: 1 }),
    conflictPaths: Type.Optional(Type.Array(Type.String())),
  },
  { $id: 'CloseWorkspaceResult', additionalProperties: false },
);
