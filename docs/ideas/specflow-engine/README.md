---
id: ideas.specflow-engine
type: hub
title: Open SpecFlow Engine proposals
status: draft
scope: specflow
areas: [workflow, runtime, cli, configuration]
tags: [engine, workflow, claims, offline, migration]
read_when:
  - evaluating open offline workflow, writer claim or managed execution work
  - finding which Engine proposals are still open after the kernel and Sessions shipped
summary: >
  Index of the open Engine proposals: offline workflow coordination, writer claims and recovery,
  managed execution integration, human gates, Task resources and context, multi-instance execution,
  and the remaining execution plans. Implemented foundations have current architecture docs.
related:
  - ideas.readme
  - architecture.runtime.specflow-engine
  - architecture.runtime.workspace-execution-claims
  - architecture.workflow.workflow-kernel
  - architecture.runtime.specflow-project-home
  - architecture.runtime.specflow-lifecycle
---

# Open SpecFlow Engine proposals

**Implemented and promoted:** the Engine, Project Home and workspaces, Specification Create and
Close, documents and Engine-owned commits, managed Sessions with
[workspace execution claims](../../architecture/runtime/workspace-execution-claims.md), and the
[workflow kernel](../../architecture/workflow/workflow-kernel.md) in the Engine. See
[Engine architecture](../../architecture/runtime/specflow-engine.md),
[Project Home/workspaces](../../architecture/runtime/project-home-and-workspaces.md),
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md) and
[durable recovery](../../engineering/shared/specflow-git-recovery.md). The kernel is not yet wired to
the Runtime, CLI or UI.

Open proposals (drafts, not current rules; current documentation and code win):

| Document                                                                                              | Open subject                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Offline CLI and external agents](offline-cli-and-external-agents.md)                                 | Workflow commands for agents outside Runtime                                                         |
| [Workflow API requirements](workflow-api-requirements.md)                                             | Runtime HTTP surface for the kernel                                                                  |
| [Execution scopes and recovery](execution-scopes-and-recovery.md)                                     | Which steps need a claim; operator inspect/reconcile/release/takeover; batches                       |
| [Locking and admission](locking-and-admission.md)                                                     | Workflow step claims, external agent liveness, lock ordering                                         |
| [Durable operations](durable-operations-and-recovery.md)                                              | Git stages in the finish journal; external writer recovery; Close protection and conflict resolution |
| [Managed Session integration](managed-session-integration.md)                                         | Sessions driving workflow steps; batch, handover, rebind                                             |
| [Workspace binding lifecycle](workspace-binding-lifecycle.md)                                         | Relocate, repair, active Turn blocking rebind                                                        |
| [Ownership and state](ownership-and-state.md)                                                         | Human approval provenance; external claim reconciliation on boot                                     |
| [Local actor and human gates](local-actor-and-human-gates.md)                                         | Local trust model for human approvals                                                                |
| [Task resource and context](task-resource-and-context.md)                                             | Task folders, index, documents and context lists (plan 06 F20)                                       |
| [Legacy Nevo migration](legacy-nevo-migration.md)                                                     | Legacy modules not yet ported                                                                        |
| [Decisions](decisions-and-promotion.md)                                                               | Open decision register                                                                               |
| [Acceptance criteria](acceptance-criteria.md) and [test plan](test-plan.md)                           | Open gates FB01–FB09, SI04–SI08 and their test rows                                                  |
| [Multi-instance execution](multi-instance-execution.md) and [its plan](multi-instance-plan/README.md) | Deferred same-step multi-instance runs                                                               |

The temporary [execution plans](execution-plans/README.md) (03, 05, 06) order the remaining work.
Do not implement a workflow or Session capability merely because the Engine infrastructure exists.
