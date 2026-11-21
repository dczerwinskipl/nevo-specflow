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
The Engine owns every rule; the routes authorize, derive the actor and map refusals. A project
Runtime serves them over its Project Home, the demo Runtime over in-memory state
([ADR 0025](../../architecture/decisions/0025-demo-runs-the-engine-in-memory.md)); without an
Engine they answer 503 `WORKFLOW_UNAVAILABLE`.

## Routes

| HTTP | Route                                                            | Capability                 | Meaning                                                           |
| ---- | ---------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| GET  | `/api/specs/:specId/workflow/actions`                            | `spec.view`                | Projection of the Specification                                   |
| GET  | `/api/specs/:specId/tasks/:taskId/workflow/actions`              | `spec.view`                | Projection of a Task                                              |
| POST | `/api/specs/:specId/workflow/start`                              | `spec.manage`              | Start or resume the next step                                     |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/start`                | `spec.manage`              | Same for a Task                                                   |
| POST | `/api/specs/:specId/workflow/finish`                             | `spec.manage`              | Finish the active attempt                                         |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/finish`               | `spec.manage`              | Same for a Task                                                   |
| POST | `/api/specs/:specId/workflow/reevaluate-wait`                    | `spec.manage`              | Deliver a missed completion event to a Specification wait attempt |
| POST | `/api/specs/:specId/workflow/return`                             | `spec.manage`              | Return to a declared earlier step                                 |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/return`               | `spec.manage`              | Same for a Task                                                   |
| POST | `/api/specs/:specId/workflow/confirmation/confirm`               | `spec.manage`              | Confirm an agent's result that waits for the owner (D17)          |
| POST | `/api/specs/:specId/workflow/confirmation/reject`                | `spec.manage`              | Reject it: back to its step with the owner's feedback             |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/confirmation/confirm` | `spec.manage`              | Same for a Task                                                   |
| POST | `/api/specs/:specId/tasks/:taskId/workflow/confirmation/reject`  | `spec.manage`              | Same for a Task                                                   |
| POST | `/api/specs/:specId/workflow/abandon`                            | `spec.close-specification` | End the Specification without realizing it                        |

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
last `handoff` (a finished attempt names the transition `label`, its step `title` and, where recorded, `at` and the `actor` who
finished it), `actions` (`start`, `finish` with its
transitions, `return` with its targets) and, per subject, `task` (the Task lifecycle actions, each
`allowed` or `unavailable` with a stable reason) or `specification` (`createTask`, and `exit`).
A Specification whose workflow resolves also has `outline`: `stepCount`, the `current` step (absent
before the first start and once the run ended), the `next` step and `tasksStep`, each
`{step, title, position}` with a 1-based position in the definition's declared order. `next` is
present only when it is certain: every transition of `current` leads to the same step. It is absent
when any transition ends the run (a Review whose approval completes the run has no `next`, even if
its other transition goes back to Implement) or when they lead to several steps; before the first
start it is the entry step. `tasksStep` is the first step that declares `produces: tasks`, present
only while the run is certain to get there: following `next` from `current` (itself included), or
from the entry step, arrives at it, so no step on the way branches or can end the run. These are
display facts: "Step 2 of 7" is the step's position in the definition, not progress, since a
workflow may loop or branch and declared order is no execution order.
Once the Specification run ended (completed or abandoned), `createTask` and a Task's edit and `remove`
actions are `unavailable` with reason `specification-ended`, as the commands refuse them with
`WORKFLOW_SPECIFICATION_ENDED`.

`documentRelations` (the Specification projection and one Task's own projection, whenever the
workflow resolves and is unchanged; never in reads of several Tasks) says how the workflow uses
each document now, from the exit gates of the step the run is at and the entry gates of the step it
certainly goes to next (the outline's `next` rule: every transition leads there; before a start, the
step a start would activate). One entry per document:
`{scope, documentId, relation: needed-to-finish|needed-to-start|used, blocksNow, step: {id, title,
active}, gate: {id, label, labelDeclared, documentType, requiredSections, missingSections?}}` (the
gate facts as in `GateStatus`). `needed-to-finish` is an unmet exit gate of the
active step (`active: true`) that applies to every result of the step; an exit gate conditioned by
`when` on only some results relates nothing while unmet (and is `used` once satisfied).
`needed-to-start` is an unmet entry gate of the next step, and `used` a satisfied gate of either.
`blocksNow` is true when the unmet gate refuses the action the run waits for now: always for
`needed-to-finish`, and for `needed-to-start` when no step is active (`not-started`, `ready`,
`blocked`: the start of that step is refused); false for `used` and for the next step's entry gates
while a step is active or waiting. A gate names the document that satisfies it, the closest one
(`sections-missing`) or the unreadable one; one that found no file names every registered document
of its type in its scope, and one that found none names nothing. A document named by several gates
keeps the strongest relation (in that order), then the active step's gate. The evaluation is the one
a start or finish checks; it is empty once the run ended. Clients format these facts (the UI's [document state label](../../product/specflow/ui/documents-archetypes-ui.md#document-state-label))
and never derive them from `actions.finish` or `next.entryGates` themselves.

A client renders only what the projection allows. `kind`, `reason` and every code are stable values; the
only free text is a `message` (and the step `purpose` and `instructions`), which is for display and must
not be parsed. A step the owner may do has `human: true`; `agent` states whether an agent could do it
(`unavailable` with a reason such as `provider-not-chosen` or `session-unavailable`) and nothing is
dispatched.

**Gates.** A step's declared gates
([workflow kernel](../../architecture/workflow/workflow-kernel.md#gates)) are reported as `GateStatus`
`{id, type: document, label, labelDeclared, documentType, requiredSections, scope, status:
satisfied|unsatisfied, documentId?, reason?, missingSections?}`. `label` is display text: the
definition's own when `labelDeclared` is true, else one the Engine derives (`A "<type>" document with
<sections>`) that clients MUST NOT parse; they word the gate from `documentType` and
`requiredSections` (the required section headings in declared order, possibly empty). `scope` is the Specification or Task the gate looked in (`{kind, specId, taskId?}`,
to link its documents) and `reason` is `no-document`, `file-missing`, `sections-missing` or `unreadable` (fails closed). Each
`actions.finish.transitions[]` entry lists the exit gates that apply to it in `gates`, and is
`unavailable: gate-unsatisfied` while one does not hold. The `active` position also carries
`exits`: the step's results (`{id, result?, label?, target, targetTitle?, feedback}`), each with
the exit gates that apply to it (a gate's `when` names its results) in `gates`, evaluated now. It
is a read-only fact present whoever runs the attempt; `actions.finish`, which only the person who
may finish gets (never on an agent's attempt), adds whether each result can be taken now. A Specification transition to `terminal
completed` is `unavailable: tasks-open` while any Task is open, with `openTasks` `[{taskId, cause}]`
in id order (`cause`: `draft`, `on-hold`, `broken`, `dependency-unsatisfiable`, `active`, `waiting`
or `ready`); see [Workflow kernel, Completion](../../architecture/workflow/workflow-kernel.md#completion-requires-closed-tasks).
When the finish's own input can close every open Task (its Task list leaves out the step's own
drafts, `taskDecisions` cancel the others), such a transition also carries
`resolvableByFinish: true` and `closableTasks` `[{taskId, by: left-out|decision}]` in id order:
a client lets the person submit it, names what has to close, and still handles `WORKFLOW_TASKS_OPEN`
(409). Without it (an active attempt, a broken Task, a pending Task document change) no finish can
take it now; `documentChangePending` names the open Tasks whose document change is still pending. A startable step (`next`) lists its
`entryGates`, and unsatisfied ones block the start (`StartBlocker` `gates-unsatisfied`). A Task's
required context entry marked as a process artifact (`artifact: true`) that does not exist yet is the
blocker `context-awaited` (expected, not a warning), apart from the stale references of
`context-unresolved`.

`specification.taskTypes` lists the task types a new Task may have now (the effective policy: the
Specification run's snapshot once it started, else its archetype's binding), in catalogue order, each
`{id, title, description, useWhen, workflow: {id, title, steps: [{id, title}]}}` with the work steps of
its Task workflow in declared order (display only); a type whose workflow is not a defined Task
workflow is left out. A client offers exactly these when creating a Task.

`taskAuthoring` (a Task that is not broken, only in that Task's own projection: the Task lists and
reads of several Tasks never compute it) is what the owner edits, as the Engine reads it:
`context` is the **effective** context, `{isDefault, entries: [{entry, state: resolved|unresolved|awaited,
reason?}], defaultEntries}`. Without an explicit list it is the Engine's single default rule (`task.md`, the Task's
other documents, then the Specification overview when registered, each required); every start, entry
check and blocker index uses the same list, and a client's first edit sends these entries as the
explicit list. `defaultEntries` is that default rule read now (read-only): the same entries while
`isDefault`, else the list an edit with `context: null` returns to, so a client can name what the
return removes without deriving the default itself. `dependencyCandidates` lists the other Tasks in list order, each with `unavailable`
(`dependency`, `would-create-cycle`, `cancelled`, `broken`) when the edit would refuse it; it is empty
once the dependencies cannot change.

`specification.exit` holds `close` (`allowed`, or `blocked` with blockers) and `abandon` (`allowed`,
`blocked` with blockers, or `unavailable`: `ended` or `not-configured`). It reports the workflow's view;
Close still checks Git and the workspace itself.

## Commands

| Command | Body                                                                      | Result                                                                                 |
| ------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| start   | `{expectedWorkflowRevision?}`                                             | `{kind: started\|resumed\|terminal, subject, step?, attempt?}`                         |
| finish  | `{step, attempt, result?, feedback?, artifacts?, tasks?, taskDecisions?}` | `{subject, transition, position, continuation, createdTasks, replayed?, postActions?}` |
| return  | `{step, reason?}` (`reason` is carried as the step's feedback)            | `{subject, position, continuation}`                                                    |
| abandon | `{reason}`                                                                | `{specId, abandonment, cancelledTasks, abandonedTaskRuns}`                             |

- A step that produces Tasks (`produces: tasks` in the projection, for example Breakdown) is finished with `tasks`:
  the complete list of draft Tasks `{id, title, summary?, type, dependsOn?}`, possibly empty; a listed draft is
  revised, an unlisted one cancelled, and any other step refuses `tasks` (`WORKFLOW_INPUT_INVALID`). The list covers only the drafts the step owns (produced by this step in any
  attempt); `actions.finish.drafts` lists them as unchanged proposals, so a person finishing the step keeps them by
  sending them back. Drafts created by hand or by another step are never affected. Keeping a draft
  that depends on one the same finish leaves out is refused (`WORKFLOW_INPUT_INVALID` with
  `details.draftConflicts` `[{kept, dependsOnCancelled}]`): keep both, or leave out both.
- A Specification step's finish may carry `taskDecisions` `[{taskId, status: ready|on-hold|cancelled,
reason?}]` (as the CLI's `--task-decisions-file`): applied after `tasks` and before the transition's
  effects, with the rules of `setTaskStatus`; one refused decision rejects the whole finish
  (`WORKFLOW_INPUT_INVALID`, or `WORKFLOW_TASK_BLOCKED` during a Task's attempt). A Task's finish refuses
  them. A finish to `terminal completed` is judged after them, so it may cancel the open Tasks.
- A pin preview (`preview` of `not-started`) lists the `steps` it would pin, in declared order, each with `next`
  (the steps its transitions lead to, `end` for a terminal target): a client that confirmed an earlier preview
  names what changed when the start is refused with `WORKFLOW_DEFINITION_CHANGED`.
- A Task's first start sends the `expectedWorkflowRevision` the projection showed
  (`actions.start.expectedWorkflowRevision`); another live revision is refused with
  `WORKFLOW_DEFINITION_CHANGED`.
- `finish` names the `step` and `attempt` the owner worked on, so a stale caller never finishes a newer
  attempt (`WORKFLOW_ATTEMPT_MISMATCH`). **Repeating the same finish** returns `200` with the recorded
  result and `replayed: true`; no state changes. `postActions` reports what ran after the finish
  (`commit-execution-state`: `completed`, `skipped` with a reason, or `failed` with a code), separately
  from the finish itself. A `completed` commit carries `held: {edited, paths}` when it left execution
  state uncommitted because someone edited it since the Engine wrote it (`edited`, for example a
  `task.md` an agent wrote directly) together with every path of the same operations (`paths`: that Task's files, and the Task index
  while it would register a Task HEAD does not have, with every Task created or removed since, so
  HEAD stays consistent; edits of Tasks HEAD registers are never held with it); the rest is committed. Committing the edited files with Git releases them for the next finish. A failed
  post action does not fail the finish and runs again on a repeated finish. A different finish of that attempt is
  `WORKFLOW_ATTEMPT_MISMATCH` (409).
- `reevaluate-wait` takes `{step, attempt}` from `attention.waitAttempt` and returns
  `{step, attempt, status}`. The status is `settled` when the command completes the wait
  and `already-settled` when the named attempt already took the `tasks-finished` transition.
  A stale attempt with a different outcome yields `WORKFLOW_ATTEMPT_MISMATCH` (409).
  Open or escalated Tasks, and Tasks classified as broken, yield `WORKFLOW_TASK_BLOCKED` (409).
  An unreadable Task record can fail earlier with `WORKFLOW_STATE_CORRUPT` (503).
- **Owner confirmation (D17).** An agent's result that takes a decision only the owner takes (a
  transition with an owner-authority effect such as `approve-draft-tasks`, one marked
  `confirmation: owner`, or `taskDecisions`) ends the agent's attempt and leaves the run at
  `position.state: awaiting-confirmation` (projection `kind: awaiting-confirmation` with the attempt,
  the agent's `proposal` `{transition, feedback?, artifacts}` and `confirms` `{approvesDrafts?,
taskDecisions?}`; `actions.confirm` and `actions.reject` name the attempt). The drafts the agent
  produced are written; nothing else applies until Confirm. `confirm` takes
  `{requestId, step, attempt}` and answers `{subject, transition, position, continuation,
specification?, replayed?, postActions}`: the transition, the agent's Task decisions and the effects
  apply with the owner as actor, judged again by every finish rule (gates, open Tasks), then the
  attempt commit runs (`postActions`). `reject` takes `{requestId, step, attempt, feedback}` (required)
  and answers `{subject, position, continuation, replayed?}`: the step is ready again with the
  feedback as its handoff (`kind: return`); the agent's work is neither undone nor committed (Close
  lists it). The same `requestId` again is replayed (`replayed: true`); a confirm or reject of an
  attempt another request decided is `WORKFLOW_ATTEMPT_MISMATCH`, one with nothing waiting
  `WORKFLOW_POSITION_INVALID`. While a result waits, start, finish and return are refused
  (`WORKFLOW_POSITION_INVALID`). An agent finish outside an agent attempt that takes such a decision
  stays refused with `WORKFLOW_OWNER_DECISION_REQUIRED`.
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
written, and a repeated finish (`replayed`) never evaluates gates again. `details.openTasks`
(`WORKFLOW_TASKS_OPEN`, 409) lists the open Tasks `[{taskId, cause}]` that refuse a Specification
finish into `terminal completed`, judged after the finish's own Task decisions and before anything is
written; Abandon is not affected and a repeated finish returns the recorded result. An unknown Specification is `WORKFLOW_SUBJECT_NOT_FOUND`; a canonical
source that cannot be used now is `WORKFLOW_UNAVAILABLE`. The same refusals, statuses and body answer
the [Task commands](task-reads.md#task-commands) (`workflowFailure` in `features/workflow`).

| Status | Codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404    | `WORKFLOW_SUBJECT_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 409    | `WORKFLOW_DEFINITION_CHANGED`, `WORKFLOW_ATTEMPT_MISMATCH`, `WORKFLOW_POSITION_INVALID`, `WORKFLOW_EXECUTOR_NOT_ALLOWED`, `WORKFLOW_TASK_BLOCKED`, `WORKFLOW_DEPENDENCY_UNSATISFIED`, `WORKFLOW_SPECIFICATION_NOT_STARTED`, `WORKFLOW_SPECIFICATION_ENDED`, `WORKFLOW_SPECIFICATION_BUSY`, `WORKFLOW_EXIT_BLOCKED`, `WORKFLOW_TASK_BUSY`, `WORKFLOW_STATE_CONFLICT`, `WORKFLOW_TASK_REVISION_CONFLICT`, `WORKFLOW_TASK_EXISTS`, `WORKFLOW_TASK_NOT_REMOVABLE`, `WORKFLOW_GATE_UNSATISFIED`, `WORKFLOW_TASKS_OPEN` |
| 422    | `WORKFLOW_INPUT_INVALID`, `WORKFLOW_RETURN_NOT_ALLOWED`, `WORKFLOW_NOT_CONFIGURED`, `WORKFLOW_DEFINITION_MISSING`, `WORKFLOW_TASK_TYPE_NOT_ALLOWED`, `WORKFLOW_TASK_TYPE_IMMUTABLE`, `WORKFLOW_TASK_CONTEXT_UNRESOLVED`                                                                                                                                                                                                                                                                                           |
| 503    | `WORKFLOW_STATE_CORRUPT`, `WORKFLOW_UNAVAILABLE`, and the project lock's `CONTROL_LOCK_BUSY` (with `Retry-After`; the only retryable one), `CONTROL_LOCK_CORRUPT`, `CONTROL_LOCK_OWNERSHIP_LOST`, `CONTROL_LOCK_INVALID_HOME`                                                                                                                                                                                                                                                                                     |

`401`, `403` and `400` (request validation) are the shared Runtime answers. A Specification Close that
the workflow refuses is `409 CLOSE_BLOCKED` with the same `blockers` (see
[Specification Create and Close](specflow-specification-operations.md#close)).
