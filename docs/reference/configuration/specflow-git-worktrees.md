---
id: reference.configuration.specflow-git-worktrees
type: reference
title: SpecFlow Git/worktree policy reference
status: current
scope: specflow
areas: [configuration, cli]
read_when:
  - editing committed git policy
  - implementing branch and integration destination choices
summary: >
  Exact implemented E2 Git configuration defaults and their Create versus Close meanings.
related:
  - architecture.runtime.specflow-project-home
  - architecture.runtime.specflow-lifecycle
---

# SpecFlow Git/worktree policy reference

## Committed Project Home policy

```yaml
git:
  enabled: true
  integrationTargetBranch: develop
  worktrees:
    baseRef: HEAD
    branchPattern: feature/{slug}
  commits:
    protectedBranches: [main, 'release/**']
    allowedBranches: ['feature/**', develop]
```

| Field                         | Effect                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `git.enabled`                 | Required boolean if `git` exists; absent `git` disables managed new-worktree creation                                           |
| `git.worktrees.baseRef`       | Default `HEAD` at **Project Home**; accepted overrides also include local branches, full commit IDs and supported tags          |
| `git.worktrees.branchPattern` | Default `feature/{slug}`; supports `{slug}` and an optional `{shortId}` (each at most once, at least one required)              |
| `git.integrationTargetBranch` | Optional short local branch name for later default Close into **primary**; primary must physically have that branch checked out |
| `git.commits.protectedBranches` | Optional list of branch patterns on which the Engine never commits (default: none). See [Engine commits and protected branches](#engine-commits-and-protected-branches) |
| `git.commits.allowedBranches` | Optional allow-list of branch patterns; when non-empty the Engine commits only on matching branches (default: none = any branch) |

`nevo-specflow init` asks for the pattern right after the integration target: presets
`feature/{slug}` (default, recommended), `feature/{slug}-{shortId}`, `spec/{slug}-{shortId}` or a
custom text validated by the Engine's own pattern validator. `{shortId}` is optional; without it
a taken branch is a normal conflict (`BRANCH_ALREADY_EXISTS` at planning, `CREATE_CONFLICT` for
overlapping reservations) and an existing branch is never overwritten. The effective pattern is
returned as `branchPattern` by create-options, so the UI previews exactly `feature/<slug>` unless
the pattern contains `{shortId}`.

The workstation-local config cannot override committed `git` policy, with one exception: the
machine-specific worktree folder.

## Engine commits and protected branches

When `git.enabled` is `true` the Engine commits the scaffold of a new Specification (see
[lifecycle](../../architecture/runtime/specification-lifecycle.md)). `git.commits` decides on which
branches it may do so. It is committed Project Home configuration only: the workstation-local config
cannot set it and a linked checkout's own copy of the config is never consulted.

- **Nothing is protected by default.** `integrationTargetBranch` is not implicitly protected.
- A branch is refused when it matches any `protectedBranches` pattern (`branch-protected`), or when
  `allowedBranches` is non-empty and it matches none (`branch-not-allowed`). Protected always wins.
- A new worktree's generated or typed branch name is evaluated the same way and refused with
  `BRANCH_PROTECTED`; it is never renamed silently. The base ref and the integration destination are
  not evaluated, and Close/integration is not changed by this setting.
- With `git.enabled: false` (or no `git` block) the block is syntax-validated but inert: no commit,
  no check, no `commits` field in create-options.

Pattern grammar (close to GitHub's branch-protection patterns, matched case-sensitively against the
short local branch name, never `refs/heads/...`):

| Syntax                   | Matches                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `*`                      | any run of characters except `/` (`release/*` matches `release/1.0`, not `release/1.0/rc`) |
| `**`                     | any run of characters including `/` (`release/**` matches `release/1.0/rc`)                |
| `?`                      | exactly one character except `/`                                                           |
| `[a-z]` `[abc]` `[!0-9]` | one character of the set (`!` or `^` negates; never `/`)                                  |
| anything else            | itself                                                                                     |

Validation is fail-closed with `GIT_POLICY_INVALID`: at most 50 entries per list, each 1-200 characters
of `A-Za-z0-9._/-` plus the pattern characters, no leading/trailing `/`, no `//`, no `..`, no
`refs/` prefix, no `.lock` suffix, balanced non-empty sets, no duplicates, and no pattern in both
lists. A wildcard-free entry must be a valid branch name. The UI can reuse the exact rule from
`@nevo/specflow-contracts/specs` (`matchesBranchPattern`, `branchPatternProblem`).

`nevo-specflow init` asks for the protected branches only when Git is enabled and writes
`git.commits.protectedBranches` only when the answer is not empty.

## Local worktree folder

```yaml
# .nevo/local/config.yaml (per machine, never committed)
git:
  worktreesRoot: ../my-trees
```

| Field               | Effect                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git.worktreesRoot` | Folder receiving managed worktrees (`<root>/<slug>`). Default `<repo>-worktrees` next to the repository. Relative values resolve against the repository, absolute ones are used as is |

The folder must be outside the repository working tree and the `.git` directory; Create fails
closed otherwise. `nevo-specflow init` asks for it (default shown) and stores it only when it
differs from the default. Create journals store the absolute target path, so changing the folder
never affects a worktree reserved or created under a previous folder: recovery and idempotent
retries still use the originally reserved path (its folder name must equal the reserved slug and it
must stay outside the repository). Create-options return the effective folder as `worktreesRoot`
(`{path, exists}`) for a read-only "Worktree folder" line in the UI.

Create validates explicitly selected `integrationTargetWorkspaceId` as a **request field**, not a
configuration field. When selected, it pins the destination checkout ID, incarnation and branch
in the newly created workspace's local registration. When omitted, Close uses project policy.
Create does not validate eventual integration success, and changing `baseRef` alone does not
change the merge destination.

Generated worktree branch and path are reserved by Engine, not predicted by UI. Ref/branch
collisions, detached or dirty targets and unexpected membership are revalidated at mutation time.
See [HTTP API](../api/specflow-specification-operations.md).
