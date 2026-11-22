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
/**
 * Person-initiated: finish Close after the content was already merged externally (e.g. a GitHub
 * squash merge), never inferred automatically. Reuses the already-integrated disposal path after
 * proving the destination already has every path the source branch changed, by content rather than
 * ancestry; a mismatch refuses `CLOSE_EXTERNAL_MERGE_MISMATCH` naming every differing path.
 */
export const FinishAfterExternalMergeSchema = Type.Optional(Type.Boolean({ description: 'Only Worktree Close: assert that the branch has already been externally integrated. The Engine still verifies full content equivalence before disposal; never inferred automatically.' }));
export const CloseWorktreeRequestSchema = Type.Object(
  { operationId: OperationIdSchema, finishAfterExternalMerge: FinishAfterExternalMergeSchema },
  { additionalProperties: false },
);
/**
 * Specification Close never accepts `finishAfterExternalMerge` (owner decision 2026-11-20): its
 * contract requires the canonical Specification to end up archived at the destination, which this
 * mode never proves (it skips merge/integration entirely). A body that still sends it is rejected
 * here, at the schema boundary (`additionalProperties: false`), before it reaches the Engine, which
 * also refuses it explicitly (`CLOSE_EXTERNAL_MERGE_UNSUPPORTED`) for any caller that bypasses this
 * schema. Only `CloseWorktreeRequestSchema` accepts the field.
 */
export const CloseSpecificationRequestSchema = Type.Object(
  {
    operationId: OperationIdSchema,
    integrateToTargetBranch: Type.Optional(Type.Boolean({ description: 'When false, archive only without integrating. Git-off mode requires false or omitted; true is 400 CLOSE_INVALID. A replay must not flip this value.' })),
  },
  { additionalProperties: false },
);
export type CloseSpecificationRequest = Static<typeof CloseSpecificationRequestSchema>;
/**
 * `finishAfterExternalMerge` previews a Worktree Close's external-merge finish: it reports which
 * mode was *selected* (changes the previewed `merge` shape to `not-integrated`/
 * `already-merged-externally`), not a confirmed outcome of the content-equivalence proof, which
 * only the actual Close operation performs. A query string is always text, so this is the literal
 * `'true'` (never `boolean`, unlike {@link FinishAfterExternalMergeSchema}'s JSON body field): the
 * project's Ajv instance never coerces querystring types (`coerceTypes: false`), the convention
 * already used for `recheck` on the provider catalogue query.
 */
export const CloseWorktreePreviewQuerySchema = Type.Object(
  { finishAfterExternalMerge: Type.Optional(Type.Literal('true', { description: "Only the literal query value 'true'; preview describes selected already-merged-externally mode but does not prove equivalence." })) },
  { additionalProperties: false },
);
/**
 * `integrateToTargetBranch` previews a Specification Close's archive-only choice.
 * Specification Close never accepts `finishAfterExternalMerge` (owner decision 2026-11-20, same as
 * {@link CloseSpecificationRequestSchema}): this schema has no such field, so a preview request
 * that sends it is rejected here, at the schema boundary, rather than silently ignored.
 */
export const CloseSpecificationPreviewQuerySchema = Type.Object(
  { integrateToTargetBranch: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
// Trusted operator acknowledgement only: `true` asserts the operator has
// independently established Git-process quiescence. The server cannot derive
// process liveness from this boolean and still verifies physical scratch absence.
export const CloseScratchReconciliationRequestSchema = Type.Object(
  { confirmedNoActiveGitProcess: Type.Literal(true, { description: 'Operator acknowledgement only: no Git process is active. The Engine still verifies physical scratch evidence; server cannot derive liveness from this flag.' }) },
  { additionalProperties: false },
);
/**
 * What the Close merges, read at preview time. `integrates`: `sourceBranch` is merged into
 * `targetBranch`, and `commitsAhead` counts the source commits not on the target (0: nothing to
 * merge; a Specification Close adds its archive commit on top). `not-integrated`: nothing is
 * merged because the linked Specification is archived on its own branch as asked (`archive-only`)
 * or lives in the primary checkout and is archived directly on its branch (`primary-checkout`),
 * because a Worktree Close was requested with `finishAfterExternalMerge: true`
 * (`already-merged-externally`: `sourceBranch` was already merged into `targetBranch` outside this
 * Close, e.g. a GitHub squash merge; the Close proves whole-branch content equivalence instead of
 * merging again and creates no merge commit), or because Git is off for the project (`git-off`:
 * `git.enabled: false` or no `git:` block): the Specification is archived in place in `checkout`
 * (the primary checkout or its linked worktree), nothing is committed and no branch is read. The
 * archive stays uncommitted there: a linked worktree created while Git was on meets
 * `uncommitted-changes` in a later Worktree Close with Git on until the archive is committed.
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
      reason: Type.Literal('already-merged-externally'),
      sourceBranch: Type.String(),
      targetBranch: Type.String(),
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
], { description: 'Preview interpretation: integrates is branch merge with commitsAhead; not-integrated means archive-only, primary checkout, asserted external merge or Git-off archive. A preview is not a proof of future success.' });
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
    ], { description: 'Close operation outcome: completed, requires-resolution, in-progress or recovery-required. Inspect/retry by unchanged operation id; do not infer Git outcome from an interrupted response.' }),
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
 * One uncommitted path of an `uncommitted-changes` blocker, checkout-relative. `scope`:
 * `specification` below the Specification's own folder (`specs/active/<slug>/`: its documents,
 * manifest, Tasks and `.execution`), `other` anywhere else in the checkout (another Specification,
 * project files such as a note in the repository root).
 */
export const UncommittedPathSchema = Type.Object(
  {
    path: Type.String({ maxLength: 4096 }),
    scope: Type.Union([Type.Literal('specification'), Type.Literal('other')]),
  },
  { additionalProperties: false },
);
export type UncommittedPath = Static<typeof UncommittedPathSchema>;
/**
 * A repository precondition of a Close the owner fixes in the repository (`CLOSE_PREFLIGHT`, from the
 * preview or the Close): `checkout` is the Specification's own checkout or the one it is integrated
 * into. `uncommitted-changes` names at most 10 `paths` of `count` in the checkout registered as
 * `workspaceId`, each with its `scope` (the Specification's own first; `specificationCount` of them
 * in all are its own). A Specification Close accepts its own uncommitted Tasks and `.execution`
 * (its archive commit takes them along), so its `specification` paths are its documents and manifest;
 * any other uncommitted file of the checkout still refuses: the Close pins the checkout's HEAD, index
 * and tree and proves its archive commit (and merge) against them, so it starts from a committed
 * checkout and never commits, stashes or discards files that are not the Specification's. `integration-target-missing` (no `git.integrationTargetBranch`) names at most 50 `candidates` ordered by their first fact, and
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
      /**
       * The registered workspace of that checkout, where the owner commits the files; its path is
       * read from `GET /api/workspaces` (`workspace.view`), never sent here.
       */
      workspaceId: WorkspaceIdSchema,
      /** The Specification's own paths first, then the others, each group in Git's order. */
      paths: Type.Array(UncommittedPathSchema, { maxItems: 10 }),
      count: Type.Integer({ minimum: 1 }),
      /** How many of the `count` paths are the Specification's own (`scope: 'specification'`). */
      specificationCount: Type.Integer({ minimum: 0 }),
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
     * `CLOSE_EXTERNAL_MERGE_MISMATCH` (409): the paths that are missing or not yet
     * content-equivalent in the destination, naming every one known at once (at most 10 of the total).
     */
    paths: Type.Optional(Type.Array(Type.String({ maxLength: 4096 }), { maxItems: 10 })),
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
