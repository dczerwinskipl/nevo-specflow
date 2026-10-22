import { Type, type Static } from 'typebox';

const Uuid = Type.String({
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});

const Reason = Type.Union([
  Type.Literal('git-disabled'),
  Type.Literal('git-unavailable'),
  Type.Literal('checkout-unavailable'),
  Type.Literal('git-membership-mismatch'),
  Type.Literal('detached'),
  Type.Literal('dirty'),
  /** Only with `git.enabled`: the checkout's branch matches `git.commits.protectedBranches`. */
  Type.Literal('branch-protected'),
  /** Only with `git.enabled`: `git.commits.allowedBranches` is set and the branch matches none. */
  Type.Literal('branch-not-allowed'),
  Type.Literal('git-policy-invalid'),
]);

/**
 * Present exactly when the Engine commits the scaffold of a new Specification (`git.enabled`), even
 * with empty lists. Absent for a project with Git disabled. Patterns are those of
 * `git.commits` (grammar: `branch-protection.ts`); the lists are for display only, `selectable`
 * and `reason` already carry the per-workspace decision.
 */
export const CreateCommitsSchema = Type.Object(
  {
    protectedBranches: Type.Array(Type.String({ minLength: 1 })),
    allowedBranches: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);

export const CreateOptionsSchema = Type.Object(
  {
    primaryWorkspaceId: Uuid,
    workspaces: Type.Array(
      Type.Object(
        {
          workspaceId: Uuid,
          kind: Type.Union([Type.Literal('primary'), Type.Literal('linked')]),
          /** Display label: the checkout folder name (the repository folder for the primary one). */
          name: Type.String({ minLength: 1 }),
          /** Display path of the registered checkout. */
          path: Type.String({ minLength: 1 }),
          managed: Type.Boolean(),
          specCount: Type.Integer({ minimum: 0 }),
          state: Type.Union([
            Type.Literal('available'),
            Type.Literal('unavailable'),
            Type.Literal('detached'),
            Type.Literal('dirty'),
          ]),
          selectable: Type.Boolean(),
          integrationSelectable: Type.Optional(Type.Boolean()),
          integrationDestination: Type.Optional(
            Type.Object(
              { workspaceId: Uuid, branch: Type.String({ minLength: 1 }) },
              { additionalProperties: false },
            ),
          ),
          branch: Type.Optional(Type.String({ minLength: 1 })),
          reason: Type.Optional(Reason),
        },
        { additionalProperties: false },
      ),
    ),
    newWorktree: Type.Object(
      {
        status: Type.Union([
          Type.Literal('available'),
          Type.Literal('disabled'),
          Type.Literal('unavailable'),
        ]),
        reason: Type.Optional(Reason),
        /**
         * Only with `git.enabled`, and then only `true`: the branch the pattern generates for a
         * representative name is protected, so the user has to type another branch name.
         */
        branchProtected: Type.Optional(Type.Literal(true)),
      },
      { additionalProperties: false },
    ),
    defaultBaseRef: Type.String({ minLength: 1 }),
    /** Effective pattern; `{shortId}` is optional, so `feature/{slug}` previews as `feature/<slug>`. */
    branchPattern: Type.String({ minLength: 1 }),
    /** Effective folder for new worktrees (machine-local `git.worktreesRoot` or the default). */
    worktreesRoot: Type.Object(
      { path: Type.String({ minLength: 1 }), exists: Type.Boolean() },
      { additionalProperties: false },
    ),
    integrationTargetBranch: Type.Optional(Type.String({ minLength: 1 })),
    commits: Type.Optional(CreateCommitsSchema),
    baseRefs: Type.Array(
      Type.Object(
        {
          ref: Type.String({ minLength: 1 }),
          checkedOutWorkspaceId: Type.Optional(Uuid),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export type CreateOptions = Static<typeof CreateOptionsSchema>;
