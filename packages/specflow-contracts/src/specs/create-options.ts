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
  /**
   * The Git section of the project configuration is invalid (for example an unknown key). Nothing
   * about Git is known, so the Git part is unavailable; the cause is logged on the server only.
   */
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
    /**
     * The configured base ref as written: `HEAD`, a full commit SHA, `refs/heads/...` or
     * `refs/tags/...`, or a short local branch name without `/` (which designates
     * `refs/heads/<name>`; a short tag name such as `v1.0` is therefore read as a branch). Not
     * necessarily one of `baseRefs`; {@link designatedBaseRef} gives the ref it designates.
     */
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
    /**
     * Local branches a new worktree can start from. Every other branch in this document
     * (`workspaces[].branch`, `integrationTargetBranch`, `integrationDestination.branch`) is a
     * short name; these are not.
     */
    baseRefs: Type.Array(
      Type.Object(
        {
          /**
           * Always the full ref `refs/heads/<branch>`: the identity of the option and the value a
           * `target.baseRef` override sends. Its display name is `<branch>`.
           */
          ref: Type.String({ pattern: '^refs/heads/.+$' }),
          checkedOutWorkspaceId: Type.Optional(Uuid),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export type CreateOptions = Static<typeof CreateOptionsSchema>;

const LOCAL_BRANCH_REF_PREFIX = 'refs/heads/';

/** The full ref of the local branch with this short name, written like `baseRefs[].ref`. */
export function localBranchRef(branch: string): string {
  return LOCAL_BRANCH_REF_PREFIX + branch;
}

const COMMIT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;

/**
 * The ref a configured base ref (`defaultBaseRef`) designates, in the same order as the Engine's
 * `normalizeBaseRef` (`version-control/git/refs.ts`): `HEAD`, a full commit SHA and a `refs/...`
 * name as written, anything else as the local branch of that name. It does not validate: the
 * value comes from a policy the Engine has already validated.
 */
export function designatedBaseRef(value: string): string {
  return value === 'HEAD' || COMMIT.test(value) || value.startsWith('refs/')
    ? value
    : localBranchRef(value);
}

/** How a ref is shown: a local branch by its short name, any other ref (`HEAD`, a tag) as is. */
export function refDisplayName(ref: string): string {
  return ref.startsWith(LOCAL_BRANCH_REF_PREFIX) ? ref.slice(LOCAL_BRANCH_REF_PREFIX.length) : ref;
}
