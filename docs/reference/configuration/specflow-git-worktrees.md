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
```

| Field                         | Effect                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `git.enabled`                 | Required boolean if `git` exists; absent `git` disables managed new-worktree creation                                           |
| `git.worktrees.baseRef`       | Default `HEAD` at **Project Home**; accepted overrides also include local branches, full commit IDs and supported tags          |
| `git.worktrees.branchPattern` | Default `feature/{slug}`; supports `{slug}` and an optional `{shortId}` (each at most once, at least one required)              |
| `git.integrationTargetBranch` | Optional short local branch name for later default Close into **primary**; primary must physically have that branch checked out |

`nevo-specflow init` asks for the pattern right after the integration target: presets
`feature/{slug}` (default, recommended), `feature/{slug}-{shortId}`, `spec/{slug}-{shortId}` or a
custom text validated by the Engine's own pattern validator. `{shortId}` is optional; without it
a taken branch is a normal conflict (`BRANCH_ALREADY_EXISTS` at planning, `CREATE_CONFLICT` for
overlapping reservations) and an existing branch is never overwritten. The effective pattern is
returned as `branchPattern` by create-options, so the UI previews exactly `feature/<slug>` unless
the pattern contains `{shortId}`.

The workstation-local config cannot override committed `git` policy.
Create validates explicitly selected `integrationTargetWorkspaceId` as a **request field**, not a
configuration field. When selected, it pins the destination checkout ID, incarnation and branch
in the newly created workspace's local registration. When omitted, Close uses project policy.
Create does not validate eventual integration success, and changing `baseRef` alone does not
change the merge destination.

Generated worktree branch and path are reserved by Engine, not predicted by UI. Ref/branch
collisions, detached or dirty targets and unexpected membership are revalidated at mutation time.
See [HTTP API](../api/specflow-specification-operations.md).
