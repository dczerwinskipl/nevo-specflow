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
