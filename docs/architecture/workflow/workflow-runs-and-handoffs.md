---
id: architecture.workflow.workflow-runs-and-handoffs
type: architecture
title: Workflow attempts, returns and wait states
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - reviewing position and attempt transitions or handoffs
  - implementing owner return, wait or replay refusal
summary: >-
  Pinned Runs, step/attempt positions, handoff sequence, owner return and wait-step guard rules.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-definitions-and-gates
  - architecture.workflow.workflow-tasks
  - architecture.workflow.workflow-continuation-and-attention
---

# Workflow Runs, returns and wait states

## Positions, attempts and the handoff

A run stores only `workflow` (the pin), `position`, `attempts[]` and `returns[]`. The position is one
of:

- `not-started`;
- `active {step, attempt}`;
- `ready {step}`: a checkpoint after a finish or a return; the next start activates `step`;
- `terminal {outcome}`.

Readiness, Task facts and statuses are derived from these, never stored.

### Attempts and ordering

- **Attempt:** each step activation receives the next number for that step. Finish must name the current attempt or refuse `WORKFLOW_ATTEMPT_MISMATCH`.
- **Order:** attempts and returns share increasing `sequence` values; handoff uses the highest sequence, never timestamps.
- **Replay:** from `not-started`, the first attempt enters the entry step; every later attempt follows the previous transition/return, including Engine-entered wait steps. The replayed final position must match stored position.
- **Active:** only the last record may be an open attempt. Work steps record an allowed `actor` (`executors`); wait steps, entered by Engine, record none. Session resume/finish checks the original actor.
- **Finish:** store transition's declared result (or none) and required nonempty feedback; target must follow the pinned definition. Return records have a valid `from`, a declared `returns[]` target previously attempted, and required feedback.
- **Corruption:** impossible position/history (unreachable steps, undeclared or premature return, missing attempt) yields `WORKFLOW_STATE_CORRUPT` for Specifications and a broken Task.
- **Pinned definition:** if missing/changed, mark `definitionChanged:true` on inspect rather than replay against another definition; the next mutation refuses `WORKFLOW_DEFINITION_CHANGED`.

### Pinned definition and handoff

- **Pin.** A run is pinned to `{id, version, revision}`, where `revision` is the sha256 of the canonical
  JSON of the compiled definition (annotations included). If the loaded definition differs, the run fails with `WORKFLOW_DEFINITION_CHANGED`.
  Re-pinning is not supported.
- **Handoff.** The step context carries what the previous attempt handed over: its transition, result,
  feedback and artifacts, or the owner's feedback after a return.

### Input and history bounds

- **Input limits.** Finish and return input must fit the stored records. Feedback has at most 16 384
  characters, and a finish names at most 100 artifacts of 1 to 1 000 characters each. Input that does
  not fit is rejected with `WORKFLOW_INPUT_INVALID` before anything changes. The limits live in
  `workflow/limits.ts`, the single source for these checks and for the codec.
- **History size.** The codec bounds a run to 1 000 attempts and 1 000 return records. That is a plain
  size bound checked by write-side validation, not a workflow rule; no run is expected to reach it.
  A record file is also bounded to 256 KiB (see [workflow storage budgets](workflow-storage-and-recovery.md#state-and-storage)). Known limit: a
  history that grows over that byte budget is refused only when the change is serialized
  (`WORKFLOW_INPUT_INVALID`, nothing is stored); no operation checks it earlier, and bounding the run
  history is not automatically compacted.

## Returns ("back to the table")

`returns[]` declares the steps the owner may move the run back to from any non-terminal position. This
includes a Specification that is waiting for its Tasks. A return is an owner action: `returnToStep`
requires the owner as executor (see [executor trust](workflow-definitions-and-gates.md#executors-and-actors)). A return goes only to a declared step the run
has already reached (it has an attempt of that step), never ahead; otherwise it fails with
`WORKFLOW_RETURN_NOT_ALLOWED`. When the owner returns:

- an active attempt ends with the outcome `returned`;
- the return's declared effects apply in the same change;
- the step that follows always waits for the owner.

**A return changes no Task status.** There are no automatic Task effects on a return. If Tasks should
be held or cancelled while the Specification is reworked, the spec writer step that follows decides it
with `taskDecisions` (its context lists every Task with its status), or the owner uses
`setTaskStatus`. Running Tasks are never interrupted by the Engine.

**Effects.** There is one, `approve-draft-tasks` (see "Status"). Only a Specification workflow
declares effects. Only a `ready` Task can return (`WORKFLOW_TASK_BLOCKED` otherwise).

## Wait step

A wait step has no work and no executor, so entering it is part of the transition that leads to it.

### Wait admission

- **Draft and escalation guard.** A wait step is never entered while a Task is `draft` or on hold by its own escalation (`statusChange.source: escalation`): every Task must be approved or cancelled, and every escalation resolved (the Task resumed or cancelled), before implementation is handed over.
- The guard is checked on the state the change would produce, after the finish's `tasks`, its `taskDecisions` and the transition's effects (so `approve-draft-tasks` on the seed's `breakdown-review` `pass` satisfies it in the same change).
- A change that would enter a wait step with a draft or escalated Task is refused with `WORKFLOW_INPUT_INVALID` naming them (`Cannot enter the wait step "implementation": Tasks still draft: a; Tasks escalated: b.`) before anything is written, so the attempt stays active and can finish again with other decisions.
- The rule belongs to the kernel (`advance` in `operations/advance.ts`), so every workflow gets it.
- Only a Specification finish enters a wait step: the entry step is not a wait step, a return never targets one, and no wait-step transition leads to another.

### Wait outcomes

The Engine completes the wait step itself, with the transition of the Task event (`on`):

- **`tasks-finished`** when every Task is **closed** (its run is terminal, or it is `cancelled`), in
  the same change as the finish of the last Task or the `setTaskStatus` that cancels the last open
  Task. An `on-hold` or `ready` Task that has not finished, and a broken Task, keep it waiting. With
  zero Tasks, the wait step completes as soon as it is entered.
- **`task-escalated`** when a Task is escalated (on hold by its own escalation), in the same change
  as the escalating finish (the guard keeps escalated Tasks out of the wait step's entry). The next
  step's handoff feedback is a bounded Engine text naming the escalated Tasks in id order:
  `Escalated Tasks: <ids, comma-separated>. Each Task's escalation feedback is in its status change.`
  Each reason stays on its Task (`statusChange.reason`), which the next step's context lists in
  `existingTasks`, so no escalation feedback is joined or truncated.

`FinishStepResult.specification` then says what the Specification does next. Nobody starts or
resumes a wait step: a start whose next step is a wait step is refused with
`WORKFLOW_POSITION_INVALID` before anything changes, so its attention (for example `tasks-stuck`)
still shows.

### Wait settlement and recovery

Settling the wait runs inside a Task's finish or a Task status change and never makes it fail:

- A Specification that is not active is left alone. So is one whose pinned workflow is no longer the
  loaded definition: the Task finish succeeds, and the next Specification operation fails with
  `WORKFLOW_DEFINITION_CHANGED`.
- Otherwise the Engine settles only when the active step is a wait step. A Specification active on
  another step (for example a new breakdown after a return while a running Task finishes) is left
  alone.
- If a Task is escalated and the workflow declares no `task-escalated` transition, the wait step
  stays active and the Specification gets `task-escalated` listing every escalated Task
  (`taskIds`, in id order; also in `FinishStepResult.specification`). There is at most one item per
  subject, and the escalation wins over `tasks-stuck` because it names the cause. The owner resolves
  it with a decision or a return; the item goes once no Task is escalated any more.
- Otherwise, if Tasks are still open but none can progress (none is running, and none is `ready` with
  its dependencies completed; a broken Task never progresses), the Specification gets `tasks-stuck`.
  The dependency graph is acyclic (checked on every read and write), so this is exactly the case when
  every open Task is a draft, on hold, or waits, directly or through other open Tasks, for such a
  Task, a broken one, or an abandoned or cancelled one. The owner resolves it with a decision
  (`setTaskStatus`), a return (for example to the breakdown) or by restoring a broken Task's file.
