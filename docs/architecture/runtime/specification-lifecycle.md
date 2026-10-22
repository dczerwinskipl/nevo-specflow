---
id: architecture.runtime.specflow-lifecycle
type: architecture
title: Specification Create, archive and shared-workspace lifecycle
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - modifying Create, Close, Git integration or registry rebind
  - reviewing whole-workspace disposal and recovery invariants
summary: >
  Implemented E2 Create and explicit Specification/workspace Close invariants, Git
  publication proof and CAS rebind.
related:
  - architecture.runtime.specflow-project-home
  - engineering.shared.specflow-git-recovery
  - reference.api.specflow-specification-operations
---

# Specification Create, archive and shared-workspace lifecycle

## Create and the three distinct Git choices

Create pins one immutable operation intent, Spec identity, normalized inputs and target workspace.
The Engine generates `slug`, `specId`, the new worktree's branch and its physical path.
`baseRef` selects the starting Git commit, not the eventual merge destination.
A new worktree's optional `integrationTargetWorkspaceId` chooses a verified registered checkout;
the source workspace pins the chosen destination's `workspaceId`, physical incarnation and branch.
Without an explicit destination the later Close uses project `integrationTargetBranch` through
primary. Omitted versus explicit `baseRef` or `branch` remains part of the retry fingerprint.
Create does not switch primary or promise that Close can merge in the future.

A Specification can instead be created inside a verified existing workspace without provisioning
another branch. Multiple Spec bindings in the same workspace deliberately share Git history.

### Create commits the scaffold when Git is enabled

When `git.enabled` is true Create commits the scaffold (`specs/active/<slug>/specification.yaml` and
`overview.md`, nothing else) through the Engine's one commit capability, between writing the
manifest and binding the registry (journal stages `commit-writing`, `commit-written`; public progress
step `committing-specification`). The commit lands on the checkout's current branch for the current
folder and existing-workspace targets, and on the new branch (one commit on top of the base commit) for
a new worktree. It is `git commit --only` over the two literal paths: the user's other staged hunks,
unstaged edits and untracked files are untouched. The author is the user's configured Git identity
(Engine identity when unconfigured), the committer is the Engine, hooks and signing are off, and an
operation trailer makes replay idempotent. See
[ADR 0013](../decisions/0013-engine-owned-commits-and-protected-branches.md).

- **Protected branches.** `git.commits.protectedBranches` / `allowedBranches` (committed project
  config; nothing protected by default) are evaluated before anything is written:
  `BRANCH_PROTECTED` (422) for a protected or not-allowed branch or a protected new-worktree branch name,
  `COMMIT_BLOCKED` (409) when the checkout cannot take a commit now (detached HEAD, merge/rebase in
  progress, unmerged paths, ignored scaffold path, held index lock). Nothing is reserved, written or
  journalled in these cases.
- **After files exist.** A commit that cannot be made after the scaffold was written (a branch protected
  or a merge started meanwhile, a Git failure) is `COMMIT_FAILED` (503): the journal stays at
  `commit-writing`, files stay in place, and the operation is recovery-required. The operator resumes
  the same operation with the Engine's `resumeInterruptedOperation` once the cause is fixed, or commits
  the two scaffold files by hand (resume accepts byte-identical, clean files). Re-submitting the same
  `operationId` meanwhile answers `CREATE_RECOVERY_REQUIRED`.
- **Replay.** The commit is applied at most once per operation: resume looks for a commit carrying
  the operation trailer on top of the recorded parent HEAD before committing.
- **Git disabled.** No commit, no branch check, no Git process, the former stage graph
  (`manifest-written` to `registry-writing`) and no `committing-specification` step. A journal
  reserved before commits existed also keeps that graph.
- Specifications created untracked earlier are not adopted automatically; Close archive and
  integration are unchanged by this behaviour.

## Explicit Close intents

| Operation                                                | Effect                                                                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification Close with `integrateToTargetBranch:false` | Archive only the selected Spec with one Engine-owned scoped commit; preserve shared siblings, bindings and workspace                                                        |
| Spec-scoped integrated Close / legacy Worktree Close     | Integrate and retire an **exclusive** managed source; reject shared sources with `CLOSE_SHARED_WORKTREE`                                                                    |
| Workspace Close                                          | Separate `workspace-close(workspaceId,operationId)`; preview every bound Spec, integrate the **entire source branch** and CAS-rebind all occupants in one registry revision |

Workspace Close derives the full occupant set from verified registry and canonical manifests.
It records exact IDs, locations, statuses and binding generations in its durable journal.
Callers cannot name an arbitrary subset or disguise a whole-branch merge as one Spec operation.
Active Specs remain active after whole-workspace rebind; already archived Specs remain archived.

## Safe integration, rebind and disposal

Git integration requires verified source and destination checkout identity, committed branch,
pinned HEAD/index/tree and physical publication proof. An already-integrated branch, fast-forward
or controlled divergent candidate may be supported; merge conflicts are reported and fenced.
No silent checkout, forced merge, rebasing, deletion of refs or synthetic confirmation of
external agent quiescence is allowed.

Only after publication proof does one CAS transfer every pinned binding. A second registry
revision retires the workspace registration only after a separate non-force physical removal.
The Engine checks source incarnation and inventories ignored/untracked user data before removing
any managed checkout. Failed or unknown effects preserve the journal, claims and recovery
evidence. Changed incarnation returns recovery-required instead of deleting the new occupant.

Writer/Session/Task admission belongs to later E3–E5 work and must not be faked by E2.
See [durable recovery](../../engineering/shared/specflow-git-recovery.md).
