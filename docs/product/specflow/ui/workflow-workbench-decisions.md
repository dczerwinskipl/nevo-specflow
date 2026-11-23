---
id: product.specflow.ui.workflow-workbench-decisions
type: product
title: Workflow and Task workbench contract map
status: current
scope: specflow
areas: [ui, workflow]
tags: [decisions, status, attention, now-block, tasks, documents, close, demo]
read_when:
  - locating the product owner for Task status, attention, Now, document state or Close behavior
summary: >-
  Topic-to-owner map for the workflow and Task workbench: Task status, attention, Now,
  Task rows, document content and Close. Current contracts are linked without repeating their rules.
related:
  - product.specflow.ui.specification-overview
  - product.specflow.ui.workflow-execution
  - product.specflow.ui.documents-archetypes
  - product.specflow.ui.shell-geometry
  - architecture.workflow.workflow-kernel
  - architecture.runtime.specification-documents
  - architecture.runtime.specflow-lifecycle
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - adr.0025-demo-runs-the-engine-in-memory
---

# Workflow and Task workbench contract map

Use the topic's current owner below for behavior and implementation changes. Architecture owns
workflow transitions, authorization and lifecycle invariants; Product owns the user-visible
workbench; Design System owns reusable presentation mechanics. This map does not redefine them.

## Contract owners

| Topic                   | Current owner                                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status presentation     | [Task status presentation](specification-tasks.md#task-status-presentation), [Status glyphs](../../../design-system/implementation/react/component-feedback-and-content.md#status-glyphs), [Status and attention on a row](../../../design-system/principles/information-row-hierarchy.md#status-and-attention-on-a-row)    |
| One name per state      | [Task status presentation](specification-tasks.md#task-status-presentation)                                                                                                                                                                                                                                                 |
| Requires attention      | [Workflow kernel, Held Tasks](../../../architecture/workflow/workflow-continuation-and-attention.md#continuation-and-attention), [ADR 0023](../../../architecture/decisions/0023-neutral-workflow-coordinator-and-manual-execution.md) item 9 (amended), [Requires attention](specification-overview.md#sections-and-order) |
| Now block               | [Now](specification-overview.md#sections-and-order), [Now block](workflow-execution.md#now-block), [Progress position mode](../../../design-system/implementation/react/component-feedback-and-content.md#progress-position-mode)                                                                                           |
| Narrow Now              | [Now](specification-overview.md#sections-and-order), [Accent block bleed](../../../design-system/implementation/react/component-feedback-and-content.md#accent-block-bleed)                                                                                                                                                 |
| Overview Tasks          | [Tasks](specification-overview.md#sections-and-order), [Task reads, Tasks page](../../../reference/api/task-reads.md#read-tasks), [Interaction model](interaction-model.md#reachability)                                                                                                                                    |
| Tasks page              | [Tasks page](specification-tasks.md#tasks-page), [Specifications list](specs-overview.md)                                                                                                                                                                                                                                   |
| Full Task sections      | [Full Task](workflow-execution.md#full-task-specsspecidtaskstaskid)                                                                                                                                                                                                                                                         |
| Document content state  | [Registry rules](../../../architecture/runtime/document-manifest-and-registry.md#manifest-schema-specificationyaml), [Document state label](documents-tree.md#document-state-label)                                                                                                                                         |
| Workflow document gates | [Now block](workflow-execution.md#now-block)                                                                                                                                                                                                                                                                                |
| Close dialog            | [Close](workflow-execution.md#close), [Specification operations, Close](../../../reference/api/specflow-specification-operations.md#close)                                                                                                                                                                                  |
| Close with Git off      | [Close with Git off](../../../architecture/runtime/specification-close-lifecycle.md#close-with-git-off), [Specification operations, Close](../../../reference/api/specflow-specification-operations.md#close), [CLI](../../../reference/cli/specflow-specification-commands.md)                                             |
| Demo Runtime            | [ADR 0025](../../../architecture/decisions/0025-demo-runs-the-engine-in-memory.md)                                                                                                                                                                                                                                          |

## Decision history

The [November 2026 decision record](../../../ideas/audits/2026-11-workflow-workbench-decisions.md)
retains the review rationale as draft audit evidence. Durable architectural decisions belong to
ADR 0023 (held-Task attention) and ADR 0025 (the in-memory demo Engine), linked above.
