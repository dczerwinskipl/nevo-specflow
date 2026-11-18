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
/**
 * What the Close merges, read at preview time. `integrates`: `sourceBranch` is merged into
 * `targetBranch`, and `commitsAhead` counts the source commits not on the target (0: nothing to
 * merge; a Specification Close adds its archive commit on top). `not-integrated`: nothing is
 * merged because the linked Specification is archived on its own branch as asked (`archive-only`)
 * or lives in the primary checkout and is archived directly on its branch (`primary-checkout`), or
 * because Git is off for the project (`git-off`: `git.enabled: false` or no `git:` block): the
 * Specification is archived in place in `checkout` (the primary checkout or its linked worktree),
 * nothing is committed and no branch is read. The archive stays uncommitted there: a linked
 * worktree created while Git was on meets `uncommitted-changes` in a later Worktree Close with Git
 * on until the archive is committed.
 */
export const CloseMergeSchema = Type.Union([
  Type.Object(
    {
      status: Type.Literal('integrates'),
      sourceBranch: Type.String(),
      targetBranch: Type.String(),
      commitsAhead: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Literal('not-integrated'),
      reason: Type.Union([Type.Literal('archive-only'), Type.Literal('primary-checkout')]),
      sourceBranch: Type.String(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Literal('not-integrated'),
      reason: Type.Literal('git-off'),
      checkout: Type.Union([Type.Literal('primary'), Type.Literal('linked')]),
    },
    { additionalProperties: false },
  ),
]);
export type CloseMerge = Static<typeof CloseMergeSchema>;
export const ClosePreviewSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    specId: CloseUuidSchema,
    kind: Type.Union([Type.Literal('worktree-close'), Type.Literal('specification-close')]),
    location: Type.Union([Type.Literal('active'), Type.Literal('archive')]),
    integrationRequired: Type.Boolean(),
    merge: CloseMergeSchema,
  },
  { $id: 'ClosePreview', additionalProperties: false },
);
export type ClosePreview = Static<typeof ClosePreviewSchema>;
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
        // Git is off for the project: archived in place, nothing committed or merged.
        Type.Literal('archived-without-git'),
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
const CloseCheckoutRoleSchema = Type.Union([
  Type.Literal('specification'),
  Type.Literal('integration-target'),
]);
/**
 * Why a local branch is offered as the integration branch: `remote-default` (the default branch of
 * `remote`, from the local `refs/remotes/<remote>/HEAD`, never fetched), `started-from` (the
 * Specification's linked workspace was created from it; the workspace may hold other Specifications
 * too), `primary-checkout` (checked out in the primary checkout, the main folder).
 */
export const IntegrationBranchFactSchema = Type.Union([
  Type.Literal('remote-default'),
  Type.Literal('started-from'),
  Type.Literal('primary-checkout'),
]);
export type IntegrationBranchFact = Static<typeof IntegrationBranchFactSchema>;
const BlockerBranchSchema = Type.String({ minLength: 1, maxLength: 255 });
/**
 * A local branch with every fact that makes it a candidate, in fact order. Never preselected.
 * `remote` (the remote whose default branch it is) is present exactly with the `remote-default` fact.
 */
export const IntegrationBranchCandidateSchema = Type.Union([
  Type.Object(
    {
      branch: BlockerBranchSchema,
      facts: Type.Array(IntegrationBranchFactSchema, {
        minItems: 1,
        maxItems: 3,
        uniqueItems: true,
        contains: Type.Literal('remote-default'),
      }),
      remote: BlockerBranchSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      branch: BlockerBranchSchema,
      facts: Type.Array(
        Type.Union([Type.Literal('started-from'), Type.Literal('primary-checkout')]),
        { minItems: 1, maxItems: 2, uniqueItems: true },
      ),
    },
    { additionalProperties: false },
  ),
]);
export type IntegrationBranchCandidate = Static<typeof IntegrationBranchCandidateSchema>;
/**
 * A repository precondition of a Close the owner fixes in the repository (`CLOSE_PREFLIGHT`, from the
 * preview or the Close): `checkout` is the Specification's own checkout or the one it is integrated
 * into. `uncommitted-changes` names at most 10 `paths` of `count` in the checkout at the absolute
 * `checkoutPath`. `integration-target-missing` (no `git.integrationTargetBranch`) names at most 50 `candidates` ordered by their first fact, and
 * `otherBranches`: at most 200 of the `otherBranchCount` remaining local branches by name, without
 * the Specification's own linked branch and branches `git.worktrees.branchPattern` names. Both may be
 * empty, and no branch (`main` included) is assumed. With Git off (`git.enabled: false` or no `git:`
 * block) a Specification Close has no repository precondition. `integration-target-branch` is the
 * checkout the Close integrates into (the primary checkout for the configured
 * `git.integrationTargetBranch`, or a pinned integration destination) on `branch` instead of
 * `expectedBranch`.
 */
export const RepositoryBlockerSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('uncommitted-changes'),
      checkout: CloseCheckoutRoleSchema,
      /** The absolute path of that checkout, where the owner commits the files. */
      checkoutPath: Type.String({ minLength: 1, maxLength: 4096 }),
      paths: Type.Array(Type.String({ maxLength: 4096 }), { maxItems: 10 }),
      count: Type.Integer({ minimum: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('integration-target-missing'),
      /**
       * The Specification's checkout: `linked` merges its branch into the integration branch,
       * `primary` archives directly on the integration branch in the main folder (nothing to merge).
       */
      sourceCheckout: Type.Union([Type.Literal('primary'), Type.Literal('linked')]),
      candidates: Type.Array(IntegrationBranchCandidateSchema, { maxItems: 50 }),
      otherBranches: Type.Array(BlockerBranchSchema, { maxItems: 200 }),
      otherBranchCount: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('integration-target-branch'),
      expectedBranch: Type.String(),
      branch: Type.String(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('git-operation-in-progress'), checkout: CloseCheckoutRoleSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('branch-detached'), checkout: CloseCheckoutRoleSchema },
    { additionalProperties: false },
  ),
]);
export type RepositoryBlocker = Static<typeof RepositoryBlockerSchema>;
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
     * `CLOSE_PREFLIGHT` (422): the repository preconditions the owner fixes in the repository before
     * the Close can start, all that are known at once. Absent for a preflight refusal without one.
     */
    repository: Type.Optional(Type.Array(RepositoryBlockerSchema, { maxItems: 8 })),
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
