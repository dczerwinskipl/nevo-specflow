---
id: ideas.specflow-engine.task-resource-and-context
type: engineering
title: Tasks as workflow-managed resources and context building (superseded)
status: superseded
superseded_by: adr.0022-tasks-are-resources
scope: specflow
areas: [workflow, runtime, ai]
tags: [superseded, tasks, context]
read_when:
  - following an old link to the F20 Task resource dossier
summary: >
  Superseded F20 decision dossier (owner decisions 2026-11-05). Tasks as resources are ADR 0022 and
  the workflow kernel document; context resolution for agents is part of the agent-assisted execution
  idea.
related:
  - adr.0022-tasks-are-resources
  - architecture.workflow.workflow-kernel
  - ideas.specflow-engine.reusable-workflow.agent-execution
---

# Tasks as resources and context building (superseded)

Dispositions of the F20 decisions:

- **Implemented** ([ADR 0022](../../architecture/decisions/0022-tasks-are-resources.md),
  [Workflow kernel](../../architecture/workflow/workflow-kernel.md#tasks)): Q1 the Task index as
  registry, Q2 Task-only preparation status, Q3 `summary` in `task.yaml`, Q8 the default Task context,
  Q10 broken-Task isolation, the slim run record, typed context authoring and process artifacts.
- **Superseded:** the creation-time `expectedBinding` and rebind (replaced by first-start validation
  with `expectedWorkflowRevision`).
- **Still open** ([agent-assisted execution](reusable-workflow-manual-execution/agent-assisted-execution.md#context-resolution-for-agents)):
  Q9 path hints, Q12 per-attempt context evidence, resolved references with digests and budgets.
