---
id: ideas.specflow-engine.reusable-workflow
type: hub
title: Reusable Workflow, Task resources and manual/agent execution (superseded)
status: superseded
superseded_by: adr.0023-neutral-workflow-coordinator-and-manual-execution
scope: specflow
areas: [workflow, runtime, ui, cli, docs]
tags: [superseded, workflow, task-resource, manual-execution]
summary: >
  Superseded planning dossier of PR #137. The neutral coordinator, executors and actors, attention and
  gates are ADR 0023; Tasks as resources are ADR 0024; the UI is the manual workflow execution product
  document. Still open: agent delegation (E6) and typed transition inputs (E5).
related:
  - adr.0024-tasks-are-resources
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - ideas.specflow-engine.reusable-workflow.typed-inputs
---

# Reusable Workflow and manual execution (superseded)

The PR #137 dossier is implemented. Each part's disposition:

| Part                                                                   | Disposition                                                                                                                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 neutral coordinator, `@nevo/workflow`, Run identity, strict cutover | Implemented: [ADR 0023](../../../architecture/decisions/0023-neutral-workflow-coordinator-and-manual-execution.md), [ADR 0012](../../../architecture/decisions/0012-product-package-topology-and-dependency-direction.md) |
| D05 executors and actors, F16, D10, attention, gates, step titles      | Implemented: ADR 0023, [Workflow kernel](../../../architecture/workflow/workflow-kernel.md)                                                                                                                               |
| E2 Task resources, D03, D04, D06, D07 Close guard and Abandon, commits | Implemented: [ADR 0024](../../../architecture/decisions/0024-tasks-are-resources.md)                                                                                                                                      |
| E3/E4 UI ([UX contract](ux-contract.md))                               | Implemented: [Manual workflow execution](../../../product/specflow/ui/workflow-execution.md), [Specification Overview](../../../product/specflow/ui/specification-overview.md)                                            |
| E5 typed transition inputs (D08, with F19)                             | Still open: [Typed transition inputs](typed-transition-inputs.md)                                                                                                                                                         |
| E6 agent delegation (D11–D13, context resolution, push post action)    | Still open: [Agent-assisted execution](agent-assisted-execution.md)                                                                                                                                                       |

The boundaries and delivery-plan documents were working material and were removed after promotion.
