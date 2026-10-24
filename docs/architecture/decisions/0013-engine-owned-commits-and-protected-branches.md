---
id: adr.0013-engine-owned-commits-and-protected-branches
type: adr
title: Engine-owned scoped commits and protected branches
status: current
date: 2026-10-22
summary: >
  When Git is enabled, Specification Create commits its scaffold through one path-limited Engine
  commit capability that never commits on branches the project protects. Protection comes only from
  committed project configuration (git.commits); with Git disabled none of this applies.
related:
  - architecture.runtime.specflow-lifecycle
  - reference.configuration.specflow-git-worktrees
  - reference.api.specflow-specification-operations
  - engineering.shared.specflow-git-recovery
  - adr.0016-engine-owned-document-commits
---

# 0013 — Engine-owned scoped commits and protected branches

## Status

Current.

## Context

Create wrote the Specification scaffold (`specs/active/<slug>/specification.yaml` and
`overview.md`) and left it untracked. The checkout was dirty because of Nevo itself, and Close,
which requires a clean checkout and already commits its archive with an Engine-owned scoped
commit, refused to proceed until a human committed the scaffold. Teams also need a way to say that
the Engine must never commit on some branches (for example `main` or `release/**`).

## Decision

1. **One commit capability.** The Engine commits its own file changes only through
   `VersionControl.commits` (Engine-internal, not exported): `git commit --only` over explicit
   literal paths, so the user's other staged hunks, unstaged edits and untracked files stay exactly
   as they were. Hooks are disabled (the Engine's empty hooks directory) and signing is off, like the
   archive commit. The commit message carries an operation trailer (`Nevo-Operation: <uuid>`,
   `Nevo-Kind`, `Nevo-Spec`) so replay finds the commit instead of committing twice. Callers never
   stage or commit themselves.
2. **Identity.** The commit author is the user's configured Git identity (`user.name`/`user.email`
   of the repository or global configuration); the committer is the Engine identity
   `Nevo SpecFlow Engine <engine@nevo.invalid>`. When the user's identity is not configured the Engine
   identity is also the author: a missing identity never fails Create. _Revisitable:_ organisations that
   require signed commits or commit-message hooks are bypassed by Engine commits, and a different
   author/committer split, hook execution or signing could be made configurable later.
3. **Create commits its scaffold when `git.enabled` is true.** A journalled `commit-writing` /
   `commit-written` step sits between the manifest and the registry binding, so "the Specification
   exists" always implies a committed scaffold. It commits on the current branch for the current
   folder and existing-workspace targets and on the new branch for a new worktree (one commit on top
   of the base commit). With Git disabled there is no commit, no branch check, no Git process, no
   `commits` field in create-options and no committing progress step.
4. **Protected branches are configuration, not a default.** Nothing is protected unless the committed
   project config says so: `git.commits.protectedBranches` and optionally `git.commits.allowedBranches`
   (glob on the short branch name; `*` does not cross `/`, `**` does, `?`, `[...]`). Protected always
   wins over allowed. The local, machine-specific config cannot set them, and a linked checkout's own
   copy of the config is never consulted. `integrationTargetBranch` is not implicitly protected.
5. **Where the guard runs.** Inside the commit capability (it blocks every Engine commit by
   construction), at Create admission before anything is written, and as advisory information in
   create-options (`selectable:false` with reason `branch-protected` / `branch-not-allowed`, plus
   `newWorktree.branchProtected`). A generated or typed new-worktree branch name that matches a
   protected pattern is refused with `BRANCH_PROTECTED` and never silently renamed.
6. **Failure after files were written.** If the commit cannot be made after the scaffold exists
   (a branch that became protected, a merge started meanwhile, a Git failure), the journal stays at
   `commit-writing` and the operation is recovery-required (`COMMIT_FAILED`); there is no rolled-back
   stage. The operator resumes the same operation (`resumeInterruptedOperation`) after fixing the cause,
   or commits the two scaffold files manually, which resume accepts when they are byte-identical and
   clean. A normal re-submit of the same `operationId` answers `CREATE_RECOVERY_REQUIRED`.
7. **Scope.** Close archive and integration are not changed by this decision: they keep their own
   commit code and integration into a protected target branch is not forbidden. Migrating archive onto
   the commit capability (so protection guards it too) is a follow-up. Previously created untracked
   specifications are not adopted automatically. Specification document operations reuse this
   mechanism and are decided in [ADR 0016](0016-engine-owned-document-commits.md) (proposed).
8. **Line endings and attributes.** The commit port runs `git status`, `add` and `commit` (and the hash
   comparison below) with `-c core.autocrlf=false -c core.safecrlf=false`, so the user's own conversion
   setting never changes what is committed. `.gitattributes` still apply, exactly as they do for a
   hand `git add`: a `text`/`eol` rule stores LF (or the rule's form) in the blob while the disk keeps
   the pinned bytes. "Pinned bytes" therefore means the working-tree bytes the journal recorded; the
   committed blob is what Git's attributes store for them. Resume verifies a found commit by comparing
   its blob id with `git hash-object <path>` of the verified working file (the filters of the path
   apply, `--no-filters` is not used), never by hashing the blob content. A scaffold committed by hand
   is accepted when the full file list is committed and `git status` for those paths is clean under
   the same flags, so a hand commit made under the user's `core.autocrlf` that differs from the disk
   under `autocrlf=false` is not byte-identical and stays a recovery. Concretely: CRLF content committed by
   hand under `core.autocrlf=true` WITHOUT a normalising `.gitattributes` rule stores LF, the Engine treats
   the working bytes as authoritative, and resume is refused with `CREATE_RECOVERY_REQUIRED`; with a
   normalising rule (for example `* text=auto eol=lf`) the same hand commit is accepted. Operator remedy:
   undo the hand commit (`git reset --soft <parent>` then `git reset`), commit the scaffold again with
   `git -c core.autocrlf=false add specs` and finish with `specs recover <operation-id>
--confirmed-stopped`; or abandon the operation. `dropIntentToAdd` only runs after a
   commit that provably did not happen and only resets paths that HEAD does not track; it relies on
   the scaffold paths being new files written by this operation, which nobody can have staged before
   (the files do not exist before the operation writes them).

## Known gap: no product path to resume or abandon a stuck Create

The journal-first design (stage `commit-writing`, no rolled-back stage) leaves a crashed Create non terminal. There
is no HTTP or UI action to resume or abandon it; the operator uses `nevo-specflow specs recover <operation-id>
--confirmed-stopped` (Engine `resumeInterruptedCreateOperation`) or removes a journal without effects by hand. The
journal holds slug, branch and workspace capacity until then. See
[Recovering a stuck Create](../runtime/specification-lifecycle.md#recovering-a-stuck-create-operator-procedure-and-known-gap).

## Consequences

- A Specification cannot be created on a protected branch; "New workspace" remains the way forward
  unless the generated branch name is protected too, in which case the user types another name.
- Scaffold commits appear in history with the user as author and the Engine as committer.
- A checkout is clean after Create, so Close's clean-checkout admission is satisfiable immediately.
- The Create journal gains two stages and an optional `commit` block (pinned at reservation when Git is
  enabled; an in-flight journal reserved earlier keeps the old stage graph). The public progress
  vocabulary gains `committing-specification` for Git-enabled projects.
- Hooks and signing policies of a repository do not apply to Engine commits; this is an explicit
  trade-off.
- Close integration publish and archive are not yet covered by the guard.

## Rejected

- **The user commits the scaffold.** The status quo; the checkout stays dirty because of Nevo itself
  and Close refuses to start until someone commits two files Nevo wrote.
- **`git add` plus a plain `git commit`.** It would sweep up whatever else the user has staged; a
  path-limited `commit --only` over literal paths leaves the rest of the index and working tree alone.
- **Protecting `main` (or the integration target) by default.** A silent default would block Create in
  projects that commit straight to `main`; protection is an explicit, committed project decision.
- **Reading protection from local or per-checkout configuration.** A linked checkout or a
  machine-local file could loosen the project's policy; only the committed Project Home config counts.
- **Running repository hooks and signing on Engine commits.** Hooks can fail or mutate the scaffold and
  make replay non-deterministic; the trade-off is stated in the consequences and can be revisited.
- **Renaming a protected generated branch automatically.** The owner would not know where the work
  lives; the Engine refuses with `BRANCH_PROTECTED` and the owner types a name.
- **Rolling the files back when the commit fails.** It would add a stage that can itself fail; the
  journal stays recoverable at `commit-writing` and the same operation is resumed.
