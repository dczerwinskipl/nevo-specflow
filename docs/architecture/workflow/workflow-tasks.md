---
id: architecture.workflow.workflow-tasks
type: architecture
title: Task resources, preparation and completion
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - changing Task authoring, status, preparation, dependency or escalations
  - reviewing Task completion and Specification Task-set settlement
summary: >-
    Task index and manifests, creation, manual editing, start blockers, escalations and completion requirements.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-runs-and-handoffs
  - architecture.workflow.workflow-continuation-and-attention
  - adr.0024-tasks-are-resources
---

# Workflow Task resources and preparation

## Tasks

A Task is a resource of its Specification ([ADR 0024](../decisions/0024-tasks-are-resources.md)):
what it is lives in its folder, how far it got in its run record.

| File                                 | Holds                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `tasks/index.yaml`                   | The Task ids in order: the only authority for which Tasks exist.                                                                  |
| `tasks/<id>/task.yaml`               | The manifest: `title`, `summary?`, `type` (immutable), `status`, `statusChange?`, `dependsOn`, `origin`, `documents`, `context?`. |
| `tasks/<id>/task.md` and other files | The required `task` document and the Task's other registered documents.                                                           |
| `.execution/tasks/<id>.yaml`         | `{specId, taskId, run}`, created at the first start.                                                                              |

The formats are `@nevo/specflow-contracts/documents` (`task-resource-files.ts`), parsed strictly by
`tasks/resource/codec.ts`. `tasks/` is reserved: the Specification's document tree and registry exclude
it. A Task needs no Specification run: it can be created, edited, approved and started before the
Specification workflow starts, or in a Specification whose archetype binds no workflow.

### The Task set

`tasks/index.yaml` is the Task set. Every read and every change checks it against the folders, the
manifests and the run records (`tasks/resource/validate.ts`, `state/validate.ts`); a change may keep the
issues the state already has but never adds one (`WORKFLOW_STATE_CORRUPT`). The issues are isolated to
one Task:

- **dangling:** an index entry without its folder or its `task.yaml`;
- **unregistered:** a folder below `tasks/` that the index does not list; it is reported and never
  executed;
- **broken:** a run record of an unregistered Task, a run record of a draft, or of a Task cancelled while
  it was active; and (`executionTasks` in `operations/loaded-execution.ts`) a Task whose stored position
  does not follow from its history under its pinned definition.

- A dangling or broken Task is **broken** for every decision.
- A Task whose pinned workflow is missing or changed is not broken: it is trusted as stored until re-pinning ([plan 06](../../ideas/specflow-engine/execution-plans/06-workflow-kernel/README.md), F07), and its next operation fails with `WORKFLOW_DEFINITION_CHANGED`.
- Only that Task breaks, and every decision sees the same list (`executionTasks` leaves broken Tasks out of the Tasks the operations, `deriveAttention` and `inspectExecution` decide on): `inspectExecution` lists it in `brokenTasks`; starting, finishing, returning or deciding it with `setTaskStatus` is refused with `WORKFLOW_STATE_CORRUPT` naming it, before anything is written; it counts as open, so the wait step never completes over it; a Task that depends on it never becomes startable (`dependencies {waitingFor}`); and when nothing else can progress, the Specification gets `tasks-stuck`.
- The Engine never repairs it: restoring the files from Git makes the Task usable again.
- If the restored Task is already closed and no Task is open any more, no Task event will complete the wait.
- The owner can re-evaluate the active wait attempt to deliver the `tasks-finished` event.
- A broken Task is open, so a Specification never completes over it (see "Completion requires closed Tasks").
- A Specification step's context lists the broken Tasks by id in `broken`, not in `existingTasks`; a `taskDecisions` entry naming one is refused with `WORKFLOW_INPUT_INVALID` (`Unknown Task`).

Every `dependsOn` names a registered Task, and the dependencies form no cycle; a stored state that
breaks this is `WORKFLOW_STATE_CORRUPT`.

### Authoring Tasks by hand

The owner's Task use cases (`operations/task-resource.ts`, each with an `OwnerActor`; HTTP in
[Task reads, Task commands](../../reference/api/task-reads.md#edit-tasks), CLI in
[Specification commands](../../reference/cli/specflow-specification-commands.md)):

- **`createTask`** writes the index entry, `task.yaml` (status `draft`, origin `{kind: manual,
actorId}`) and the initial `task.md` in one change. Its type must be defined and allowed by the
  effective policy (below); its dependencies registered, not cancelled and acyclic; its context valid.
- **`editTask`** changes title, summary, context and, until the first start, dependencies
  (`WORKFLOW_INPUT_INVALID` after it). The type never changes.
- **`removeTask`** removes a Task that never started, has no dependents and no pending document change,
  with its folder; a started Task is cancelled instead.
- **`setTaskStatus`** decides its status (see "Status").

An edit or a removal names the revision of `task.yaml` it was made against (`expectedRevision`); a
different stored revision refuses it.
Once the Specification run ended (completed or abandoned), `createTask`, `editTask` and `removeTask`
refuse with `WORKFLOW_SPECIFICATION_ENDED`: the Tasks stay as they are, readable for audit. The projection
reports the same (`createTask` and the Task's edit and `remove` actions `unavailable` with reason
`specification-ended`). `setTaskStatus` does not consult the Specification run.

#### Task type admission

**Effective policy.** The task types a Specification allows now are its run's `taskTypes` snapshot once
it started, otherwise the live execution binding of its archetype (`effectiveTaskTypesOf`); without a
binding every type is allowed.

### First start

A Task's first start (`startTaskExecution` without a run record) validates the live definitions and pins
them; nothing was bound when the Task was created:

- the live task type exists and its workflow is a defined Task workflow (`WORKFLOW_DEFINITION_MISSING`),
  and the effective policy allows the type (`WORKFLOW_TASK_TYPE_NOT_ALLOWED`);
- with `expectedWorkflowRevision` (the revision a pin preview showed), the live revision must equal it
  (`WORKFLOW_DEFINITION_CHANGED`, nothing starts);
- the run record is created pinned to that workflow, in the same change as the first attempt.

The action projection's pin preview (`not-started`) names the workflow, its revision and its steps, so a
surface can confirm what will be pinned and name what changed after a refusal.

### Producing steps and the Breakdown

A step with `produces: tasks` finishes with `input.tasks[]`. Each entry is `{id, title, summary?, type,
dependsOn?}`. Every Task:

- gets its own type, which the effective policy must allow; its workflow is pinned at its first start;
- must not create a dependency cycle, and must not depend on a cancelled Task;
- has an id of lowercase letters, digits and dashes (at most 64 characters). The id is a file name, so
  the id pattern excludes Windows device names (`con`, `prn`, `aux`, `nul`, `com1` to `com9`, `lpt1` to
  `lpt9`);
- has a title of at most 200 characters, a summary of at most 4 000 and at most 100 dependencies.

#### Draft replacement semantics

The list is the complete set of **the drafts this producing step owns** after the finish
(`materializeTasks`): the drafts whose origin is `produced` by the same step, from any of its attempts.
Drafts created by hand or by another step are never touched:

- an entry with a new id creates a Task folder, index entry and `task.yaml` with status `draft`, without
  a run record;
- an entry with the id of a draft the step owns replaces its definition (a draft never ran);
- an entry with the id of any other Task (one that is no longer a draft, a manual draft, another step's
  draft) rejects the whole finish;
- a draft the step owns that is not listed becomes `cancelled` (reason "Left out of the breakdown.").
  Keeping a draft that depends on a draft the same finish cancels is refused (`WORKFLOW_INPUT_INVALID`,
  `details.draftConflicts [{kept, dependsOnCancelled}]`). A Task outside the list that depends on it is
  not refused: it can no longer start, and the wait reports `tasks-stuck` (see "Wait step").

The finish action of a producing step lists the drafts it owns as unchanged proposals
(`actions.finish.drafts`), so a person finishing the step keeps them by sending them back. One finish
lists at most 100 Tasks, and a Specification has at most 200. A list that breaks a rule rejects the
whole finish with `WORKFLOW_INPUT_INVALID`, and nothing is stored. Before anything is planned, the
Engine checks the shape of the finish input (`result`, `feedback`, `artifacts`, `tasks`,
`taskDecisions`) and of a `setTaskStatus` decision (`input-schema.ts`): a value of the wrong type is
`WORKFLOW_INPUT_INVALID`. A breakdown may also draft no Task at all.

### Status

Each Task has a preparation status, separate from its run position (`TaskRecord.status`, with the
last explicit change in `statusChange {source: decision | escalation, at, reason?}`):

| Status      | Meaning                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `draft`     | Created by a producing step and not approved yet. It never ran.                |
| `ready`     | Approved. It starts once its dependencies completed.                           |
| `on-hold`   | Kept, but no step of it starts until a decision makes it `ready` again.        |
| `cancelled` | Will not be done. Final: a cancelled Task is replaced by a new Task if needed. |

#### Task status versus completion

There is no `completed` status: completion is the run reaching `terminal {completed}`. The status
changes only by:

- the declared effect **`approve-draft-tasks`** on a Specification transition or return: every
  `draft` becomes `ready`. The seed declares it on the `pass` of `breakdown-review`;
- **explicit decisions** `{taskId, status, reason?}`: `input.taskDecisions[]` in the finish of any
  Specification work step (the spec writer), applied after `tasks` and before the transition's
  effects, and the owner operation `setTaskStatus(dependencies, {specId, taskId, status, reason?,
executor})`, which requires a human executor (`WORKFLOW_EXECUTOR_NOT_ALLOWED` otherwise) and runs
  under the same serialization. Allowed: `draft → ready | cancelled`, `ready → on-hold | cancelled`,
  `on-hold → ready | cancelled`. A Task whose run ended keeps its status. A Task with an active
  attempt is neither put on hold nor cancelled (`WORKFLOW_TASK_BLOCKED`, reason `active-attempt`):
  its current step is finished or returned first. The status is preparation and completion is the
  run. Anything else is `WORKFLOW_INPUT_INVALID`; in a finish, one refused decision rejects the whole
  finish;
- the Task's own **escalation** (below).

No attention is derived for a Task that is not `ready`, except for a Task on hold the user has to
resume or cancel (see "Held Tasks" under "Continuation and attention"). After a status change,
`setTaskStatus` settles the Specification in the same change (see "Wait step").

### Readiness and the step context

Readiness of a Task is derived from the Task and its direct dependencies only: `status {status}` (not
`ready`), `dependencies {waitingFor}` (a direct dependency has not completed) or `ready`. Starting a
step of a Task that is not ready fails with `WORKFLOW_TASK_BLOCKED` naming the status, and starting a
Task whose direct dependency ended `abandoned` or was cancelled fails with
`WORKFLOW_DEPENDENCY_UNSATISFIED` naming that dependency (also a broken one). Only a `ready` Task can
be returned. A Task that is not `ready` after its own finish gets the continuation `none {on-hold}`
and no attention.

#### Context admission

- The entry gate of every Task step is its own context: a required context entry that does not resolve refuses the start (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`).
- A reference entry may be marked as a **process artifact** (`artifact: true` in `task.yaml`; not for `instructions`): something another step or Task produces.
- While it is missing it is `awaited`, not stale: create and edit accept it, the projection reports it as the blocker `context-awaited` (apart from `context-unresolved`, so a surface shows no warning on Approve), and a required one still refuses the start, listed apart in the refusal (`awaited`).
- There is no producer link; the artifact simply has to exist when the step starts.

#### Context and gates

**Context is input, gates are output.** A Task's context lists what the Task needs before it starts.
What the Task itself produces is expressed by gates: an exit gate on the step that produces the
document and an entry gate on the step that consumes it. So a create or an edit refuses a **required**
`task-document` entry marked `artifact` (one of the Task's own documents, which its own start could
never find) with `WORKFLOW_INPUT_INVALID` and `details.invalidContext [{index, key, reason:
required-own-artifact}]` (`TaskContextInvalidError`); an optional own-document artifact stays allowed.
An edit checks this only when it changes the context.

The step context of a producing step lists the allowed task types, so the planner chooses among
them. The step context of every Specification work step lists the existing Tasks (`existingTasks`:
id, title, summary, type, dependencies, status, last status change, position state and readiness
kind), so the spec writer sees drafts, holds and escalations and new Tasks can depend on existing
ones.

The step context also exposes the bound archetype (profile and instructions), the Task's type
instructions and the step instructions. Together these are the custom instructions per step.

### Escalation

A Task workflow transition may declare `escalate: true`. It needs `feedback: required` and a step
target (checked at load time). Finishing with it:

- is accepted like any finish; the run goes to `ready {step}`, so the handoff of that step keeps the
  feedback;
- sets the Task `on-hold` with `statusChange {source: escalation, reason: feedback}`. A Task already
  on hold (held while its step ran) gets the same: the escalation replaces its earlier
  `statusChange`;
- settles the Specification in the same change, only while it is active on its wait step: it
  takes the wait step's `task-escalated` transition, or, when the workflow declares none, needs the
  owner's attention `task-escalated` (see "Wait step"). A Specification at any other position (for
  example `ready` at its breakdown after a return, needing an `owner-action`, or active on a work
  step) is left alone; it cannot enter the wait step again until the escalation is resolved
  (see "Draft and escalation guard").

The seeds `task-standard` and `task-ui` declare the result `needs-spec-change` on `review`, with
escalation, back to `implement`. The seed `specification-standard` declares `task-escalated` on its
wait step `implementation`, to `breakdown` with `continuation: owner-action`, so the owner sees the
move before the planner runs; that step's context lists every Task with its status and last status
change. Resuming the Task (`on-hold → ready`) continues at `implement` with the escalation feedback in
the handoff.

### Completion requires closed Tasks

#### Completion guards

A Specification cannot reach `terminal {completed}` with **any open Task**, regardless of workflow or wait step ([ADR 0024](../decisions/0024-tasks-are-resources.md)). Open includes draft, approved-not-started, active, waiting, held and broken. Closed means cancelled or a terminal Task run (completed or abandoned). The Engine's `tasksOpenAtCompletion` checks Task state, not step names.

#### Finish refusal

- `advance` evaluates the **post-finish** Task set, after `tasks`, `taskDecisions` and transition effects, but before writing. If any remain open, return `WORKFLOW_TASKS_OPEN` (`TasksOpenError`) with ordered `openTasks: [{taskId, cause}]`; keep the attempt active.
- A finish that closes the final open Tasks may complete immediately. `tasks-finished` waits require all Tasks closed; `task-escalated` leads to a step.
- Idempotent successful finish replay (F16) uses the recorded result; Abandon is not subject to this guard.
- Check open Tasks **before** exit gates, so an operation blocked by both reports Tasks first.

#### Blocker classification

`BLOCKING_TASK_CAUSES` are `draft`, `on-hold`, `broken` and `dependency-unsatisfiable` (require human action). Other open causes: `active`, `waiting` (ready but blocked by dependencies), `ready`. `blockingTasks`/`tasks-stuck` is the blocking subset of `openTasks`, with the same vocabulary.

#### Projected refusals

- Action projections report `unavailable: tasks-open` and `openTasks` before `gate-unsatisfied`. They simulate the finish's post-state, not merely today's Task list.
- `resolvableByFinish:true` and `closableTasks [{taskId, by: left-out | decision}]` appear only if omitting owned drafts and permitted `taskDecisions` can close **all** remaining Tasks. `approve-draft-tasks` never closes Tasks.
- Active/broken Tasks or pending document changes (`WORKFLOW_TASK_BUSY`) cannot be silently resolved; pending ones appear in `documentChangePending`. Mutation still performs authoritative checks, using the same rules as projection.
- Normally open Tasks do **not** produce Specification attention: they are progress. Only a blocking on-hold Task produces `on-hold-blocking` with `blocks.finish`; see [Continuation and attention](workflow-continuation-and-attention.md) and [Now UI](../../product/specflow/ui/workflow-execution.md#dialogs).
