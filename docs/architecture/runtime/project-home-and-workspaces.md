---
id: architecture.runtime.specflow-project-home
type: architecture
title: SpecFlow Project Home and workspace identities
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - resolving Project Home from primary and linked worktrees
  - changing registry, canonical discovery or managed workspace capacity
summary: >
  Implemented E1/E2 Project Home identity, local registry authority and canonical
  Specification binding.
related:
  - architecture.runtime.specflow-engine
  - architecture.runtime.specflow-lifecycle
---

# SpecFlow Project Home and workspace identities

## One local authority

Project Home is the designated primary Git checkout, identified by independent bootstrap
evidence and the verified Git common directory/instance. `.nevo/config.yaml` is committed
project policy; ignored `.nevo/local/` holds workstation-local registry, journals and locks.
A linked checkout MUST resolve the same verified Project Home. A missing, moved, mismatched or
ambiguous home does not authorize silent reinitialization or a substitute registry.

The revisioned local registry contains stable project and primary IDs, explicitly registered
linked checkout identities and `specId -> workspaceId` bindings with generations. Physical root,
Git membership and linked checkout incarnation are independently verified. A similar remote URL,
reused path or branch name is not an equivalent workspace. Primary is not a managed worktree.

## Verification trust model: Git on mutations, disk on reads

Reads must be fast and must not spawn Git. Verification is split by what an operation does.

| Moment                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                    | Git |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Engine open (`openSpecFlowEngine`, once per process)                                                                                     | Full resolution: `rev-parse`, `worktree list`, ignore audit of the local namespace, competing-home scan, Git instance sentinel, current workspace membership. Produces the cached `ResolvedProjectHome`.                                                                                                                                                                                                                                    | yes |
| Each read request (overview, workspace, documents, tasks, create-options, registry)                                                      | Cached identity plus disk checks: home marker still carries the same project/instance/common-dir identity, the Git instance sentinel is intact, `realpath(root) === root`, the checkout's `.git` link resolves to the verified common directory (a linked `.git` file must be mirrored by the admin directory's `gitdir` back-link), the linked identity marker matches the registered incarnation, registry revision and primary identity. | no  |
| Each mutation (create with a new-worktree target or with Git enabled, close/integrate, archive, registry writes, control-lock admission) | Full resolution again, ignore-rule audit of the linked identity marker, and the REGISTRY_CONFLICT revision checks.                                                                                                                                                                                                                                                                                                                          | yes |
| Create into an existing workspace of a project with `git.enabled: false`                                                                 | The disk checks of a read, re-run at every admission step (not memoised); no Git is involved in the operation.                                                                                                                                                                                                                                                                                                                              | no  |

A stale open-time identity can only cause the following on a read, never a write: a deleted or
moved workspace is reported `workspace_unavailable` by the filesystem check; a replaced or
foreign checkout fails the `.git` link or identity-marker check and the read is refused; a repository
re-initialised at the same path fails the Git instance sentinel. A rebound repository, a second
Project Home designation or a weakened ignore rule is NOT detected by reads; it is detected by the
next mutation or by reopening the Engine. Reads in a Git-disabled project answer from the registry
and the filesystem alone, report no branch or dirty state, and `create-options` reports
`newWorktree` as disabled with reason `git-disabled`. The Engine still needs Git once at open to
establish Project Home; a project that is not a Git repository is not supported.

## Canonical discovery

A bound Specification is read from the registered verified checkout's
`specs/active/<slug>/specification.yaml` or `specs/archive/<slug>/specification.yaml`.
There is one canonical `specId` per binding. Unsupported legacy manifests, duplicate identities
and redirected source paths fail closed. A bound unavailable checkout stays unavailable rather
than falling back to primary or to an index. Read projections recheck registry authority and
must not claim an atomic multi-file filesystem snapshot.

A managed linked worktree may contain multiple Specifications, with a **1024 canonical binding**
admission limit. Create counts committed bindings and in-flight Create reservations under the
shared Project Home coordination lock. Finished operations or already bound Specs are not counted
twice. Close pins the complete occupant list with identity and generation evidence.

Only verified registered worktrees participate in this authority model. A list returned by Git
alone does not register a workspace or grant access.

See [Git configuration](../../reference/configuration/specflow-git-worktrees.md) and
[Specification lifecycle](specification-lifecycle.md). E1/E2 does not supply network-distributed
locks, active provider Session fencing or automatic moved-home repair.
