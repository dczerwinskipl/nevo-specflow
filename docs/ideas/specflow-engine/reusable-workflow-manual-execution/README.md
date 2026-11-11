---
id: ideas.specflow-engine.reusable-workflow
type: hub
title: Reusable Workflow, Task resources and manual/agent execution
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
  support fully manual UI execution and optional owner-delegated agent steps,
  and later render typed transition inputs.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.task-resource-and-context
  - ideas.specflow-engine.workflow-api-requirements
  - architecture.workflow.workflow-kernel
  - adr.0019-workflow-kernel-and-automatic-continuation
---

# Reusable Workflow, Task resources and manual/agent execution

**Proposal only.** This is an ideas-stage planning dossier, not an accepted ADR, public API, or instruction to start coding. [Current Workflow kernel](../../../architecture/workflow/workflow-kernel.md), current contracts and code remain authoritative. The goal is to preserve working behaviour while giving Workflow a reusable **execution coordinator** as well as deterministic progression, without moving product storage, Session dispatch or Task effects into that package.

## Product outcome

A person can create a Specification, author its documents, create Tasks of different user-defined types (e.g. spike, backend, UI, integration), edit their own task documents, approve work, advance their workflows and finish the Specification **entirely in the UI**, without creating a provider Session or involving an AI agent. In E6 the owner can instead **ask an agent** to execute an eligible individual step using the same Engine contracts, including writing Specification documents and preparing complete linked Task drafts. CLI + skill remain an offline path for external agents and users; neither transport invents its own progression rules.

Each Task Type already selects its workflow definition. The proposal **does not** introduce hard-coded step names such as `implement`, `review`, `spike` or `discovery`. Future Automation/scheduled work is a prospective second product consumer of the same Workflow capability, **not** a new synonym for a SpecFlow Task. Multiple independent runs of one definition must be possible without inventing a Specification or Task. Scheduled triggers and **unattended** agent dispatch are out of scope; E6 covers only explicit owner-authorized delegation of one eligible step.

## Reading order and implementation gates

1. [Architecture boundaries and open decisions](boundaries-and-decisions.md): package ownership, special steps, atomic effects, pinning, manual policy, Task provenance and Close.
2. [Delivery plan](delivery-plan.md): E0–E6 with explicit dependencies, review checkpoints and end-to-end evidence.
3. [Agent-assisted execution](agent-assisted-execution.md): an owner may delegate an eligible step to a Managed Session; includes Specification writing, Task drafting with content/dependencies/context, and selected Task steps.
4. Existing [Task Resource F20](../task-resource-and-context.md), [Workflow API requirements](../workflow-api-requirements.md), [Plan 06 follow-ups](../execution-plans/06-workflow-kernel/README.md), [offline CLI and agents](../offline-cli-and-external-agents.md).

**Decision gates are phased.** Before E1, approve the neutral execution/coordinator boundary, definition pin compatibility, and Run identity; reserve the necessary storage/dispatch extension points. Before E2, approve cross-resource recovery, Task Type resolution and draft ownership. Before E3/E4, approve human authorization and manual execution policy; before E4 Close, approve completion/sign-off semantics. Before E5, approve typed input persistence and validation. Before E6a, resolve D10–D12: explicit delegation, claim-owned Engine writes, durable finish/stop recovery and Session reuse. Agent Task authoring additionally requires D13 and F20. E6 does not depend on E5; an early Specification-only agent slice may be delivered separately once its prerequisites hold. See the [decision gates](boundaries-and-decisions.md#2-decision-register-and-gates). None is implicitly accepted by this draft.

## What already exists

- Engine: user-defined workflow, agent archetype and task-type definitions; pinned revisions, deterministic start/finish/return, task readiness/dependencies, draft/ready/on-hold/cancelled, breakdown-produced drafts, approval and escalation, wait-for-tasks, attention and recoverable execution-state writes.
- Specification Create/Close and Documents operations exist; the UI can already edit Specification documents.
- Product documentation search now exists through `nevo-specflow docs search` and `GET /api/docs/search`. It uses hybrid semantic/BM25 search when configured and indexed, otherwise lexical fallback. Integration into a Managed Session remains to be demonstrated.
- Task HTTP endpoints primarily expose reads. Task creation/edit as a standalone resource and manual Workflow commands are not yet a complete product path.
- `tasks/index.yaml`, per-Task `task.yaml` and `task.md`, Task context and the full F20 storage migration remain proposed. The current `.execution/tasks/<id>.yaml` includes Task metadata and run.
- Full F01 **unattended** continuation is deferred, but E6 introduces a narrow, **explicit owner-requested** Managed Session for one selected Workflow step (using F01/F02/F05/F09 integration seams). The Kernel already derives a continuation decision; that alone does not launch a Session.

Use existing implementations wherever possible; do not recreate the Kernel or the document editor.

## Scope boundary

**In:** neutral Workflow extraction; SpecFlow-owned Task resources, lifecycle and documents; shared Engine use cases exposed via HTTP/UI and offline CLI; manual steps and owner approvals; minimal completion/Close integration; later typed input metadata and form rendering; E6 agent delegation of eligible Specification/Task steps, with Task drafts, their documents, dependencies and context.

**Out:** unattended automatic provider Session chaining and automatic Task scheduling, scheduled triggers, arbitrary plugin/action framework, parallel Task worktrees, full F03 gates, MCP as a mandatory transport, browser execution of the neutral package and a visual Workflow designer. Do not promise automatically verified tests when only a human result is recorded.

## Ownership of this proposal

The decisions are candidates, not accepted rules. Before each implementation slice, reconcile against current `main`, [ADR 0012](../../../architecture/decisions/0012-product-package-topology-and-dependency-direction.md), [ADR 0019](../../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md), [code organization](../../../engineering/shared/code-organization.md), and any more recent promoted architecture. This plan does not retire or silently replace other open ideas.
