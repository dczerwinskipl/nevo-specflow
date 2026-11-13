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

# Specification and Task workflow action HTTP API

Exact schemas are in `packages/specflow-contracts/src/workflow/` (subpath
`@nevo/specflow-contracts/workflow`); the routes are `packages/specflow-runtime/src/features/workflow/`.
The Engine owns every rule; the routes authorize, derive the actor and map refusals. The routes belong to
project mode (the demo Runtime has no Engine and serves none); without an Engine they answer 503
`WORKFLOW_UNAVAILABLE`.

## Routes

| HTTP | Route                                               | Capability                 | Meaning                                    |
| ---- | --------------------------------------------------- | -------------------------- | ------------------------------------------ |
| GET  | `/api/specs/:specId/workflow/actions`               | `spec.view`                | Projection of the Specification            |
| GET  | `/api/specs/:specId/tasks/:taskId/workflow/actions` | `spec.view`                | Projection of a Task                       |
| POST | `/api/specs/:specId/workflow/start`                 | `spec.manage`              | Start or resume the next step              |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/start`   | `spec.manage`              | Same for a Task                            |
| POST | `/api/specs/:specId/workflow/finish`                | `spec.manage`              | Finish the active attempt                  |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/finish`  | `spec.manage`              | Same for a Task                            |
| POST | `/api/specs/:specId/workflow/return`                | `spec.manage`              | Return to a declared earlier step          |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/return`  | `spec.manage`              | Same for a Task                            |
| POST | `/api/specs/:specId/workflow/abandon`               | `spec.close-specification` | End the Specification without realizing it |

Capabilities are checked on the Specification scope before the body is read. All answers are
`Cache-Control: no-store`; bodies are limited to 64 KiB.

## Actor

The recorded actor is always the authenticated caller, derived from `request.authz`; no request carries
an actor, an executor class or a trust level. An authenticated subject is `{class: human, trust:
authenticated}`; the trusted local identity of a Runtime without authentication is `trust: local`.
Every route is an **owner** action: an agent attempt is never started or finished through these routes.

## Projection

`GET .../workflow/actions` answers `WorkflowActionProjection`: `subject`, `workflow` (the pinned
workflow, or the one a first start would pin), `position` (`not-started`, `ready`, `active`, `waiting`,
`blocked` with `StartBlocker`s, `terminal`, with `abandonment` `{at, reason, actor}` once abandoned), the
last `handoff` (a finished attempt names its step `title` and, where recorded, `at` and the `actor` who
finished it), `actions` (`start`, `finish` with its
transitions, `return` with its targets) and, per subject, `task` (the Task lifecycle actions, each
`allowed` or `unavailable` with a stable reason) or `specification` (`createTask`, and `exit`).

A client renders only what the projection allows. `kind`, `reason` and every code are stable values; the
only free text is a `message` (and the step `purpose` and `instructions`), which is for display and must
not be parsed. A step the owner may do has `human: true`; `agent` states whether an agent could do it
(`unavailable` with a reason such as `provider-not-chosen` or `session-unavailable`) and nothing is
dispatched.

**Gates.** A step's declared gates
([workflow kernel](../../architecture/workflow/workflow-kernel.md#gates)) are reported as `GateStatus`
`{id, type: document, label, documentType, scope, status: satisfied|unsatisfied, documentId?, reason?,
missingSections?}`; `scope` is the Specification or Task the gate looked in (`{kind, specId, taskId?}`,
to link its documents) and `reason` is `no-document`, `file-missing`, `sections-missing` or `unreadable` (fails closed). Each
`actions.finish.transitions[]` entry lists the exit gates that apply to it in `gates`, and is
`unavailable: gate-unsatisfied` while one does not hold. A startable step (`next`) lists its
`entryGates`, and unsatisfied ones block the start (`StartBlocker` `gates-unsatisfied`). A Task's
required context entry marked as a process artifact (`artifact: true`) that does not exist yet is the
blocker `context-awaited` (expected, not a warning), apart from the stale references of
`context-unresolved`.

`specification.taskTypes` lists the task types a new Task may have now (the effective policy: the
Specification run's snapshot once it started, else its archetype's binding), in catalogue order, each
`{id, title, description, useWhen, workflow: {id, title, steps: [{id, title}]}}` with the work steps of
its Task workflow in declared order (display only); a type whose workflow is not a defined Task
workflow is left out. A client offers exactly these when creating a Task.

`taskAuthoring` (a Task that is not broken) is what the owner edits, as the Engine reads it:
`context` is the **effective** context, `{isDefault, entries: [{entry, state: resolved|unresolved|awaited,
reason?}]}`. Without an explicit list it is the Engine's single default rule (`task.md`, the Task's
other documents, then the Specification overview when registered, each required); every start, entry
check and blocker index uses the same list, and a client's first edit sends these entries as the
explicit list. `dependencyCandidates` lists the other Tasks in list order, each with `unavailable`
(`dependency`, `would-create-cycle`, `cancelled`, `broken`) when the edit would refuse it; it is empty
once the dependencies cannot change.

`specification.exit` holds `close` (`allowed`, or `blocked` with blockers) and `abandon` (`allowed`,
`blocked` with blockers, or `unavailable`: `ended` or `not-configured`). It reports the workflow's view;
Close still checks Git and the workspace itself.

## Commands

| Command | Body                                                           | Result                                                                                 |
| ------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| start   | `{expectedWorkflowRevision?}`                                  | `{kind: started\|resumed\|terminal, subject, step?, attempt?}`                         |
| finish  | `{step, attempt, result?, feedback?, artifacts?}`              | `{subject, transition, position, continuation, createdTasks, replayed?, postActions?}` |
| return  | `{step, reason?}` (`reason` is carried as the step's feedback) | `{subject, position, continuation}`                                                    |
| abandon | `{reason}`                                                     | `{specId, abandonment, cancelledTasks, abandonedTaskRuns}`                             |

- A step that produces Tasks (`produces: tasks` in the projection, for example Breakdown) is finished with `tasks`:
  the complete list of draft Tasks `{id, title, summary?, type, dependsOn?}`, possibly empty; a listed draft is
  revised, an unlisted one cancelled, and any other step refuses `tasks` (`WORKFLOW_INPUT_INVALID`). Task status
  decisions are not part of a finish.
- A Task's first start sends the `expectedWorkflowRevision` the projection showed
  (`actions.start.expectedWorkflowRevision`); another live revision is refused with
  `WORKFLOW_DEFINITION_CHANGED`.
- `finish` names the `step` and `attempt` the owner worked on, so a stale caller never finishes a newer
  attempt (`WORKFLOW_ATTEMPT_MISMATCH`). **Repeating the same finish** returns `200` with the recorded
  result and `replayed: true`; no state changes. `postActions` reports what ran after the finish
  (`commit-execution-state`: `completed`, `skipped` with a reason, or `failed` with a code); a failed
  post action does not fail the finish and runs again on a repeated finish. A different finish of that attempt is
  `WORKFLOW_ATTEMPT_MISMATCH` (409).
- `abandon` is final. A retry with the same reason returns the same result; it is not a bypass of Close:
  pending writes, broken Tasks and other operations refuse it.

## Refusals

A refusal is `{error, code, message, details?}`: `error` repeats `code`, `message` is display-only,
`details.blockers` lists the groups that hold a Specification (`WORKFLOW_EXIT_BLOCKED`). A blocker is
`{kind, subjectIds, message}`; `kind` is one of `specification-run`, `draft-tasks`, `on-hold-tasks`,
`unfinished-tasks`, `broken-tasks`, `pending-execution-change`, `pending-task-documents`,
`operation-in-progress`, `execution-state-unreadable`, and `subjectIds` are Task ids (or the
Specification id for Specification-wide holds), so a client can link them.
`details.unresolved` (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`) names each context entry that does not
resolve as `{index, key, reason}`: its position from 0, its key (`<kind>:<id>` or `path:<path>`) and
`not-found` or `not-registered`; `details.awaited` lists, apart, the required process artifacts that do
not exist yet as `{index, key}`. `details.gate` (`WORKFLOW_GATE_UNSATISFIED`, 409) is `{phase: entry|exit,
step, gates}` with every unsatisfied `GateStatus`; it refuses a start or a finish before anything is
written, and a repeated finish (`replayed`) never evaluates gates again. An unknown Specification is `WORKFLOW_SUBJECT_NOT_FOUND`; a canonical
source that cannot be used now is `WORKFLOW_UNAVAILABLE`. The same refusals, statuses and body answer
the [Task commands](task-reads.md#task-commands) (`workflowFailure` in `features/workflow`).

| Status | Codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 404    | `WORKFLOW_SUBJECT_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 409    | `WORKFLOW_DEFINITION_CHANGED`, `WORKFLOW_ATTEMPT_MISMATCH`, `WORKFLOW_POSITION_INVALID`, `WORKFLOW_EXECUTOR_NOT_ALLOWED`, `WORKFLOW_TASK_BLOCKED`, `WORKFLOW_DEPENDENCY_UNSATISFIED`, `WORKFLOW_SPECIFICATION_NOT_STARTED`, `WORKFLOW_SPECIFICATION_ENDED`, `WORKFLOW_SPECIFICATION_BUSY`, `WORKFLOW_EXIT_BLOCKED`, `WORKFLOW_TASK_BUSY`, `WORKFLOW_STATE_CONFLICT`, `WORKFLOW_TASK_REVISION_CONFLICT`, `WORKFLOW_TASK_EXISTS`, `WORKFLOW_TASK_NOT_REMOVABLE`, `WORKFLOW_GATE_UNSATISFIED` |
| 422    | `WORKFLOW_INPUT_INVALID`, `WORKFLOW_RETURN_NOT_ALLOWED`, `WORKFLOW_NOT_CONFIGURED`, `WORKFLOW_DEFINITION_MISSING`, `WORKFLOW_TASK_TYPE_NOT_ALLOWED`, `WORKFLOW_TASK_TYPE_IMMUTABLE`, `WORKFLOW_TASK_CONTEXT_UNRESOLVED`                                                                                                                                                                                                                                                                    |
| 503    | `WORKFLOW_STATE_CORRUPT`, `WORKFLOW_UNAVAILABLE`, and the project lock's `CONTROL_LOCK_BUSY` (with `Retry-After`; the only retryable one), `CONTROL_LOCK_CORRUPT`, `CONTROL_LOCK_OWNERSHIP_LOST`, `CONTROL_LOCK_INVALID_HOME`                                                                                                                                                                                                                                                              |

`401`, `403` and `400` (request validation) are the shared Runtime answers. A Specification Close that
the workflow refuses is `409 CLOSE_BLOCKED` with the same `blockers` (see
[Specification Create and Close](specflow-specification-operations.md#close)).
