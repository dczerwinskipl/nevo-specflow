---
id: ideas.specflow-engine.workspace-binding-lifecycle
type: architecture
title: Workspace relocate, repair and rebind under active execution
status: draft
scope: specflow
areas: [workflow, runtime, configuration, security]
tags: [workspace-binding, worktree, rebind, relocation, repair]
read_when:
  - relocating a registered worktree or repairing an unavailable Specification source
  - deciding how a rebind or relocation interacts with an active managed Turn
  - planning binding changes for multi-instance steps
summary: >
  Open binding operations beyond the implemented register, resolve, Worktree/Workspace Close and
  rebind: relocate, explicit repair and mark-unavailable, blocking a rebind or relocation while a
  managed Turn is active, and multi-instance implications.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.recovery
  - architecture.runtime.specflow-project-home
  - architecture.runtime.specflow-lifecycle
---

# Workspace relocate, repair and rebind under active execution

Register, resolve, integration-backed rebind and disposal are implemented by Create and
Worktree/Workspace Close
([Project Home and workspaces](../../architecture/runtime/project-home-and-workspaces.md),
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)). The registry owns
`specId -> workspaceId` placement; Git-tracked manifests own content; a branch name is never a
binding. The operations and rules below are still proposals.

## Relocate

`relocate` updates the physical root of the **same** workspace identity after verifying Git
metadata and the path, under a compare-and-set registry revision. It may invalidate provider-native
resume compatibility for Sessions created at the old root (see below). It never creates a new
workspace identity or moves bindings.

## Repair and mark-unavailable

No registry entry where one was required, a missing checkout, a missing manifest in a verified
checkout, a substituted path, a divergent `specId` and an unavailable Project Home are distinct
errors with different remediation. Today reads fail closed for each. Proposed:

- `mark-unavailable` keeps the binding and identity and returns a repairable source-unavailable
  state;
- an explicit `repair` restores a validated path/binding with evidence and operator authorization.
  It must not turn an absent worktree into a fresh empty source.

## Active managed Turns block rebind and relocation

- A canonical Session keeps its historical `workspaceId` correlation; moving or rebinding a Spec
  does not change old Turn provenance.
- A Session with an active Turn cannot silently switch its workspace; reconcile or cancel that Turn
  first. Today an unsettled workspace execution claim already blocks Close, and a registry change
  while a claim is held makes the claim recovery-required; relocate and repair must take the same
  admission.
- For a **new Turn**, Runtime resolves the current binding and verified root. If the previous
  provider-native session was created in another workspace, apply an explicit resume-compatibility
  policy; when uncertain, refuse automatic native resume.
- A missing workspace **does not erase or hide authorized historical Session content**. It blocks
  new workspace-dependent execution only.

## Multi-instance implications

A group of instances for one user-defined step may depend on a configured input baseline or hold
effect-specific resource ownership even without an exclusive writer claim. Rebind, relocation and
cleanup must account for active instances, source reservations, writer claims and managed Turns,
preserve per-instance history, and reject stale results when declared input consistency is
violated. See [multi-instance execution](multi-instance-execution.md).

## Verification

- Relocation keeps identity; a stale binding generation cannot overwrite a concurrent move.
- A managed active Turn prevents an uncoordinated rebind or relocation; Turn history stays readable
  after relocation.
- A missing worktree shows unavailable, not a stale source or a fabricated 404.
- A different actor cannot repair or relocate by supplying an authorized `specId` with an
  unauthorized destination.
