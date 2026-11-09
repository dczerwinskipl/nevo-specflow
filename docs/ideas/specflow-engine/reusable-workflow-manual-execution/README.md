---
id: ideas.specflow-engine.reusable-workflow
type: hub
title: Reusable Workflow, Task resources and manual execution
status: draft
scope: specflow
areas: [workflow, runtime, ui, cli, docs]
tags: [proposal, workflow, task-resource, manual-execution, implementation-plan]
read_when:
  - planning a reusable Workflow capability independent of Specification and Task
  - adding Task authoring and manual Specification or Task execution through the UI
  - reviewing the gates and sequencing of the next workflow implementation slices
summary: >
  Non-authoritative proposal to separate neutral Workflow progression from SpecFlow
  resource and storage ownership, add standalone Task creation and documents,
  support fully manual UI execution, and later render typed transition inputs.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.task-resource-and-context
  - ideas.specflow-engine.workflow-api-requirements
  - architecture.workflow.workflow-kernel
  - adr.0019-workflow-kernel-and-automatic-continuation
---

# Reusable Workflow, Task resources and manual UI execution

**Proposal only.** This is an ideas-stage planning dossier, not an accepted ADR, public API, or instruction to start coding. [Current Workflow kernel](../../../architecture/workflow/workflow-kernel.md), current contracts and code remain authoritative. The goal is to preserve working behaviour while making Workflow a reusable capability rather than a Specification/Task-specific state machine.

## Product outcome

A person can create a Specification, author its documents, create Tasks of different user-defined types (e.g. spike, backend, UI, integration), edit their own task documents, approve work, advance their workflows and finish the Specification **entirely in the UI**, without creating a provider Session or involving an AI agent. CLI + skill remain an offline path for external agents and users; neither transport invents its own progression rules.

Each Task Type already selects its workflow definition. The proposal **does not** introduce hard-coded step names such as `implement`, `review`, `spike` or `discovery`. Future Automation/scheduled work is a prospective second product consumer of the same Workflow capability, **not** a new synonym for a SpecFlow Task. Scheduled triggers and managed agent dispatch are out of scope.

## Reading order and implementation gates

1. [Architecture boundaries and open decisions](boundaries-and-decisions.md): package ownership, special steps, atomic effects, pinning, manual policy, Task provenance and Close.
2. [Delivery plan](delivery-plan.md): E0–E5 with explicit dependencies, review checkpoints and end-to-end evidence.
3. Existing [Task Resource F20](../task-resource-and-context.md), [Workflow API requirements](../workflow-api-requirements.md), [Plan 06 follow-ups](../execution-plans/06-workflow-kernel/README.md), [offline CLI and agents](../offline-cli-and-external-agents.md).

**Gate:** E0 decisions must be approved and promoted to authoritative architecture before E1 code changes. E2 requires a decision on cross-resource journal/recovery. E4 requires a durable manual execution policy and trusted human identity. E5 cannot introduce typed UI-only fields that the Engine does not validate and persist.

## What already exists

- Engine: user-defined workflow, agent archetype and task-type definitions; pinned revisions, deterministic start/finish/return, task readiness/dependencies, draft/ready/on-hold/cancelled, breakdown-produced drafts, approval and escalation, wait-for-tasks, attention and recoverable execution-state writes.
- Specification Create/Close and Documents operations exist; the UI can already edit Specification documents.
- Task HTTP endpoints primarily expose reads. Task creation/edit as a standalone resource and manual Workflow commands are not yet a complete product path.
- `tasks/index.yaml`, per-Task `task.yaml` and `task.md`, Task context and the full F20 storage migration remain proposed. The current `.execution/tasks/<id>.yaml` includes Task metadata and run.
- The automatic continuation dispatcher that launches/reuses Managed Sessions (F01) is not part of this plan; a pure continuation decision already exists.

Use existing implementations wherever possible; do not recreate the Kernel or the document editor.

## Scope boundary

**In:** neutral Workflow extraction; SpecFlow-owned Task resources, lifecycle and documents; shared Engine use cases exposed via HTTP/UI and offline CLI; manual steps and owner approvals; minimal completion/Close integration; later typed input metadata and form rendering.

**Out:** automatic provider Session creation, scheduled triggers, arbitrary plugin/action framework, parallel Task worktrees, full F03 gates, MCP as a mandatory transport, browser execution of the neutral package and a visual Workflow designer. Do not promise automatically verified tests when only a human result is recorded.

## Ownership of this proposal

The decisions are candidates, not accepted rules. Before each implementation slice, reconcile against current `main`, [ADR 0012](../../../architecture/decisions/0012-product-package-topology-and-dependency-direction.md), [ADR 0019](../../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md), [code organization](../../../engineering/shared/code-organization.md), and any more recent promoted architecture. This plan does not retire or silently replace other open ideas.
