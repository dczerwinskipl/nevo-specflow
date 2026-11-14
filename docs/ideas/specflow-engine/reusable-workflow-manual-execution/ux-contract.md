---
id: ideas.specflow-engine.reusable-workflow.ux-contract
type: product
title: Manual Specification and Task workflow execution — UX contract (superseded)
status: superseded
superseded_by: product.specflow.ui.workflow-execution
scope: specflow
areas: [ui, workflow]
tags: [superseded, ux-contract, manual-execution]
read_when:
  - following an old link to the manual execution UX contract
summary: >
  Superseded working UX contract of the manual execution mock. The accepted behaviour is the
  manual workflow execution product document and the Specification Overview document.
related:
  - product.specflow.ui.workflow-execution
  - product.specflow.ui.specification-overview
---

# Manual workflow execution — UX contract (superseded)

Accepted and implemented. The authoritative contracts are:

- [Manual workflow execution](../../../product/specflow/ui/workflow-execution.md): Now block, dialogs,
  exit gates, Task authoring, lifecycle actions, Close and Abandon;
- [Specification Overview](../../../product/specflow/ui/specification-overview.md): the control center
  and the Tasks page;
- [ADR 0022](../../../architecture/decisions/0022-neutral-workflow-coordinator-and-manual-execution.md):
  workflow state, attention and grouping kept apart;
- [Task reads](../../../reference/api/task-reads.md#dashboard-grouping): the default dashboard grouping.

The presentation mock was removed; the production Storybook stories are `SpecFlow/Screens/Manual
workflow execution` (`packages/specflow-ui/src/features/tasks/execution/ProjectWorkflowExecution.stories.tsx`)
and `SpecFlow/Screens/Specification control center`
(`packages/specflow-ui/src/features/tasks/overview/SpecificationControlCenter.stories.tsx`).

The Ask agent attachment point remains an open idea
([agent-assisted execution](agent-assisted-execution.md)).
