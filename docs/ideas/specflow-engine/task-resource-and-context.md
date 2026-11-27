---
id: ideas.specflow-engine.task-resource-and-context
type: engineering
title: Tasks as workflow-managed resources and context building (superseded)
status: superseded
superseded_by: adr.0024-tasks-are-resources
scope: specflow
areas: [workflow, runtime, ai]
tags: [superseded, tasks, context]
read_when:
  - following an old link to the F20 Task resource dossier
summary: >
  Superseded F20 decision dossier (owner decisions 2026-11-05). Tasks as resources are ADR 0024 and
  the workflow kernel document; context resolution for agents is part of the agent-assisted execution
  idea.
related:
  - adr.0024-tasks-are-resources
  - architecture.workflow.workflow-kernel
  - adr.0026-agent-step-execution
---

# Tasks as resources and context building (superseded)

Dispositions of the F20 decisions:

- **Implemented** ([ADR 0024](../../architecture/decisions/0024-tasks-are-resources.md),
  [Workflow kernel](../../architecture/workflow/workflow-tasks.md#tasks)): Q1 the Task index as
  registry, Q2 Task-only preparation status, Q3 `summary` in `task.yaml`, Q8 the default Task context,
  Q10 broken-Task isolation, the slim run record, typed context authoring and process artifacts.
- **Superseded:** the creation-time `expectedBinding` and rebind (replaced by first-start validation
  with `expectedWorkflowRevision`).
- **Implemented with agent step execution** ([ADR 0026](../../architecture/decisions/0026-agent-step-execution.md), D13):
  the resolved context as references with digests and budgets, and the digest of the resolved
  context on the attempt (Q12 in part: the full resolved list is not kept as local evidence; `workflow
context` reads it again). Q9 path hints were not part of it.
