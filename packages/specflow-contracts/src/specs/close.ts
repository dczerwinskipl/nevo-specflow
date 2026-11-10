import { Type, type Static } from 'typebox';

import { DocumentErrorDetailsSchema } from '../documents/errors';
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
  { operationId: OperationIdSchema },
  { additionalProperties: false },
);
export const CloseSpecificationRequestSchema = Type.Object(
  { operationId: OperationIdSchema, integrateToTargetBranch: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
export type CloseSpecificationRequest = Static<typeof CloseSpecificationRequestSchema>;
export const ClosePreviewQuerySchema = Type.Object(
  { integrateToTargetBranch: Type.Optional(Type.Boolean()) },
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
export const CloseErrorSchema = Type.Object(
  {
    error: Type.String(),
    code: Type.String(),
    remedy: Type.Optional(Type.String()),
    /** Present for `DOCUMENT_COMMITS_PENDING` (`details.cause`: `commit-pending`, `commit-failed`, ...). */
    details: Type.Optional(DocumentErrorDetailsSchema),
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
