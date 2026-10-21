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
