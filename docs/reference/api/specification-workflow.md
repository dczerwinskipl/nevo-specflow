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

## Refusal codes by status

A refusal is `{error, code, message, details?}` (`WorkflowErrorSchema` in OpenAPI). The same codes,
statuses and body answer every route above, the Task commands included (`workflowFailure` in
`features/workflow`). `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` refuses Confirm and Reject of an agent's
result while, with Git on, the attempt's own commit has not run or failed (`actions.confirm` and
`actions.reject` `unavailable` say which); Retry commit runs it.

| Status | Codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404    | `WORKFLOW_SUBJECT_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 409    | `WORKFLOW_DEFINITION_CHANGED`, `WORKFLOW_ATTEMPT_MISMATCH`, `WORKFLOW_POSITION_INVALID`, `WORKFLOW_EXECUTOR_NOT_ALLOWED`, `WORKFLOW_TASK_BLOCKED`, `WORKFLOW_DEPENDENCY_UNSATISFIED`, `WORKFLOW_SPECIFICATION_NOT_STARTED`, `WORKFLOW_SPECIFICATION_ENDED`, `WORKFLOW_SPECIFICATION_BUSY`, `WORKFLOW_EXIT_BLOCKED`, `WORKFLOW_TASK_BUSY`, `WORKFLOW_STATE_CONFLICT`, `WORKFLOW_TASK_REVISION_CONFLICT`, `WORKFLOW_TASK_EXISTS`, `WORKFLOW_TASK_NOT_REMOVABLE`, `WORKFLOW_GATE_UNSATISFIED`, `WORKFLOW_TASKS_OPEN`, `WORKFLOW_OWNER_DECISION_REQUIRED`, `WORKFLOW_CONFIRMATION_CHANGED`, `WORKFLOW_ATTEMPT_COMMIT_REQUIRED`, `WORKFLOW_DIRTY_BASELINE`, `WORKFLOW_BASELINE_CHANGED`, `WORKFLOW_UNREGISTERED_DOCUMENTS`, `WORKFLOW_ENGINE_FILE_EDITED`, `WORKFLOW_UNDECLARED_CHANGES`, `WORKFLOW_NESTED_REPOSITORY`, `WORKFLOW_AGENT_UNAVAILABLE`, `WORKFLOW_COMMIT_REFUSED` |
| 422    | `WORKFLOW_INPUT_INVALID`, `WORKFLOW_RETURN_NOT_ALLOWED`, `WORKFLOW_NOT_CONFIGURED`, `WORKFLOW_DEFINITION_MISSING`, `WORKFLOW_TASK_TYPE_NOT_ALLOWED`, `WORKFLOW_TASK_TYPE_IMMUTABLE`, `WORKFLOW_TASK_CONTEXT_UNRESOLVED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 503    | `WORKFLOW_STATE_CORRUPT`, `WORKFLOW_UNAVAILABLE`, and the project lock's `CONTROL_LOCK_BUSY` (with `Retry-After`; the only retryable one), `CONTROL_LOCK_CORRUPT`, `CONTROL_LOCK_OWNERSHIP_LOST`, `CONTROL_LOCK_INVALID_HOME`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`401`, `403` and `400` (request validation) are the shared Runtime answers.
