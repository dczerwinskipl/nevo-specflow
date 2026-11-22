---
id: reference.api.specification-workflow
type: reference
title: Specification and Task workflow action HTTP API
status: current
scope: specflow
areas: [runtime, server, workflow, security]
tags: [workflow, tasks, openapi]
read_when:
  - implementing a client of the manual Specification or Task workflow actions
  - changing the workflow action projection, a workflow command or its refusal codes
  - rendering Close blockers or the Abandon action
summary: >
  The workflow action projection of a Specification and of a Task, the owner commands start, finish,
  return and abandon, the stable refusal codes with their HTTP status, and the blockers of a refused
  exit.
related:
  - reference.api.openapi
  - reference.api.specflow-specification-operations
  - reference.api.authorization
  - reference.cli.specflow-specification-commands
---

# Specification and Task workflow API

The `Workflow` group in [OpenAPI](openapi.md) contains action projections and
commands for Specification-level and Task-level workflows.

| Scope         | Operations                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Specification | `GET /api/specs/{specId}/workflow/actions`; `POST .../start`, `.../finish`, `.../return`, `.../reevaluate-wait`, `.../abandon` |
| Task          | `GET /api/specs/{specId}/tasks/{taskId}/workflow/actions`; `POST .../start`, `.../finish`, `.../return`                        |

The action projection reports what the caller can do, with current blockers and transition
requirements. Clients must not infer available actions from raw Task state or the workflow
definition. Commands recheck authorization and the current workflow position.

For gate evaluation, Task dependencies, replay and refusal semantics, see
[Workflow action projections](../../architecture/workflow/workflow-action-projections.md)
and the [workflow kernel](../../architecture/workflow/workflow-kernel.md).
The [workflow UI contract](../../product/specflow/ui/workflow-execution.md)
describes presentation and owner interactions.
