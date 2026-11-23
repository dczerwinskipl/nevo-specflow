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
  return and abandon, agent step execution (run with agent, check, stop, take over), Confirm and
  Reject of an agent's result, Retry commit, the workflow history, the stable refusal codes with
  their HTTP status, and the blockers of a refused exit.
related:
  - reference.api.openapi
  - reference.api.specflow-specification-operations
  - reference.api.authorization
  - reference.cli.specflow-specification-commands
  - architecture.runtime.agent-step-execution
  - adr.0026-agent-step-execution
---

# Specification and Task workflow API

The `Workflow` group in [OpenAPI](openapi.md) contains action projections and
commands for Specification-level and Task-level workflows.

| Scope                | Operations                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification        | `GET /api/specs/{specId}/workflow/actions`, `.../history`; `POST .../start`, `.../finish`, `.../return`, `.../reevaluate-wait`, `.../abandon`                       |
| Task                 | `GET /api/specs/{specId}/tasks/{taskId}/workflow/actions`, `.../history`; `POST .../start`, `.../finish`, `.../return`                                              |
| Agent step execution | Specification and Task: `POST .../workflow/agent-execution`, `GET .../agent-execution/check`, `POST .../agent-execution/stop`, `POST .../agent-execution/take-over` |
| Agent results        | Specification and Task: `POST .../workflow/confirmation/confirm`, `.../confirmation/reject`, `.../attempt-commit/retry`                                             |

The action projection reports what the caller can do, with current blockers and transition
requirements. Clients must not infer available actions from raw Task state or the workflow
definition. Commands recheck authorization and the current workflow position.

Every route is an **owner** action. An agent attempt is started, continued, stopped and taken over
by the owner through the `agent-execution` routes (`features/agent-execution/step-execution/endpoint.ts`),
but the agent's own writes and its finish proposal never use HTTP: they go through the Runtime's
agent broker with the Turn's capability
([agent step execution](../../architecture/runtime/agent-step-execution.md)). The routes are
protected by the configured authentication mode only; with `runtime.authentication.mode: none`
any local process can call them, by the host's choice
([ADR 0026](../../architecture/decisions/0026-agent-step-execution.md#trust-model-and-its-limits)).

For gate evaluation, Task dependencies, replay and refusal semantics, see
[Workflow action projections](../../architecture/workflow/workflow-action-projections.md)
and the [workflow kernel](../../architecture/workflow/workflow-kernel.md); for agent attempts,
confirmation and the attempt commit, [agent attempts](../../architecture/workflow/workflow-agent-attempts.md).
The [workflow UI contract](../../product/specflow/ui/workflow-execution.md)
describes presentation and owner interactions.
