---
id: architecture.workflow.workflow-kernel
type: architecture
title: Workflow kernel — Specification and Task execution
status: current
read_when:
  - changing workflow, agent archetype or task type definitions
  - implementing start, finish, return, continuation or attention behaviour
  - wiring the Runtime, CLI or UI to Specification or Task execution
  - adding a step kind, an effect, an attention reason or a new subject
summary: >
  One deterministic workflow core drives both a Specification and each of its Tasks. Entry points
  only select the subject. Workflows, agent archetypes (preferred provider and a model per provider)
  and task types are project definitions. Each Task has its own type and workflow. The Engine decides
  continuations; anything it cannot carry out becomes a local attention item. Canonical state lives in
  the Specification's `.execution/` folder; journals and attention are local.
related:
  - architecture.workflow.deterministic-workflow
  - adr.0019-workflow-kernel-and-automatic-continuation
  - adr.0017-definitions-as-project-data
  - architecture.runtime.specflow-engine
  - ideas.specflow-engine.plan-06
---

# Workflow kernel

This document describes how the rules of
[deterministic workflow](deterministic-workflow.md) are implemented. The owner decisions behind it are
recorded in [ADR 0019](../decisions/0019-workflow-kernel-and-automatic-continuation.md). The code
lives in `packages/specflow-engine/src/workflow/`. It is exported through `src/workflow/index.ts`.

## One core, two entry points

The core is subject-neutral. A **subject** is either the Specification or one of its Tasks:

```text
startSpecificationExecution(specId, archetype)  ─┐
startTaskExecution(specId, taskId)               ─┴─▶ start(subject) ─▶ progression state machine
finishStep(subject, step, attempt, input)          ─▶ finish ─▶ effects ─▶ continuation ─▶ attention
returnToStep(subject, step, feedback)              ─▶ return ─▶ effects ─▶ continuation ─▶ attention
inspectExecution(specId)                           ─▶ read-only view
```

The entry points differ in only two ways:

- **Starting a Specification** creates the Specification run the first time. It reads the execution
  binding of the Specification archetype and pins that workflow.
- **Starting a Task** checks that the Task is ready: not blocked, and every dependency completed.

Readiness of a Task is derived from the Task and its direct dependencies only: `blocked`,
`dependencies {waitingFor}` (a direct dependency has not completed) or `ready`. Starting a Task whose
direct dependency ended `abandoned` fails with `WORKFLOW_DEPENDENCY_UNSATISFIED` naming that
dependency.

Everything else is shared.

## Definitions (project data, ADR 0017)

Each kind of definition is a directory under `.nevo/definitions/`. The product ships seeds of each kind
in `packages/specflow-engine/definitions/`.

| Kind                      | Holds                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow`                | `subject: specification \| task`, `entryStep`, `steps[]`, `returns[]`. A step is `work` (fields `executor: agent \| human`, `archetype`, `interaction`, optional `produces: tasks`) or `wait-for-tasks`. A transition has `result?`, `to: {step} \| {terminal}`, `continuation: auto \| owner-action`, `session: fresh \| reuse`, `feedback` and `effects`. |
| `agent-archetype`         | Who works on a step: an optional agent `profile`, `instructions`, `preferredProvider`, and `providers[]` with an optional `model` and `effort` each. An entry without a model means "known provider, model not chosen yet".                                                                                                                                 |
| `task-type`               | What a Task is (`description`, `useWhen`, `instructions`) and the Task `workflow` it runs.                                                                                                                                                                                                                                                                  |
| `specification-archetype` | Gains an optional `execution: {workflow, taskTypes?}`. `taskTypes` defaults to `['*']`, meaning every task type is allowed. Resolved when execution starts.                                                                                                                                                                                                 |

A workflow and a Specification archetype are separate definitions. The archetype only refers to a
workflow.

**No cascade.** A broken definition never takes the definitions that refer to it down:

- A workflow does not check the agent archetypes of its steps. They are resolved when a step is
  continued, and a missing or invalid one becomes the attention item `archetype-missing`.
- A Specification archetype does not check its execution binding, so its document templates keep
  working. `startSpecificationExecution` resolves the binding (`resolveSpecificationExecution`). It
  fails with `WORKFLOW_NOT_CONFIGURED` when the workflow is missing or does not drive a Specification,
  or when a named task type is missing. Surfaces can call the same function to show the problem
  earlier.
- The references stay declared, so installing a workflow still installs its archetypes, and installing
  a Specification archetype installs its workflow and task types.

A task type still requires its workflow to load, because a Task cannot exist without one.

Whole-workflow rules are checked at load time (`definitions/workflow-rules.ts`), so a broken workflow
never loads:

- ids are unique and every target exists;
- a step has either one unconditional transition or transitions with distinct results only;
- an agent step names an archetype, and a human step names none;
- only a Specification workflow can produce Tasks, wait for Tasks or have Task effects;
- `session: reuse` can only lead to an agent step;
- a wait step has exactly one unconditional transition, without `feedback: required` or
  `session: reuse` (the Engine settles a wait without owner input or a Session), and it does not lead
  to another wait step;
- the entry step is not a wait step: starting a run enters its entry step;
- a return never targets a wait step: a return waits for the owner, and nobody can start a wait step.

## Positions, attempts and the handoff

A run stores only `workflow` (the pin), `position`, `attempts[]` and `returns[]`. The position is one
of:

- `not-started`;
- `active {step, attempt}`;
- `ready {step}`: a checkpoint after a finish or a return; the next start activates `step`;
- `terminal {outcome}`.

Readiness, lanes and statuses are derived from these, never stored.

- **Attempts.** Every activation of a step creates the next attempt number for that step. Finish must
  name the exact active attempt (`WORKFLOW_ATTEMPT_MISMATCH` otherwise).
- **Sequence.** Every attempt and return record carries a `sequence` (1, 2, ...) in the order the
  records were made. The handoff takes the latest record by sequence, never by timestamp.
- **Pin.** A run is pinned to `{id, version, revision}`, where `revision` is the sha256 of the resolved
  definition. If the loaded definition differs, the run fails with `WORKFLOW_DEFINITION_CHANGED`.
  Re-pinning is a follow-up (plan 06, F07).
- **Handoff.** The step context carries what the previous attempt handed over: its transition, result,
  feedback and artifacts, or the owner's feedback after a return.
- **Input limits.** Finish and return input must fit the stored records. Feedback has at most 16 384
  characters, and a finish names at most 100 artifacts of 1 to 1 000 characters each. Input that does
  not fit is rejected with `WORKFLOW_INPUT_INVALID` before anything changes. The limits live in
  `workflow/limits.ts`, the single source for these checks and for the codec.
- **History size.** The codec bounds a run to 1 000 attempts and 1 000 return records. That is a plain
  size bound checked by write-side validation, not a workflow rule; no run is expected to reach it.

## Tasks

A step with `produces: tasks` must finish with `input.tasks[]`. Each entry is
`{id, title, summary?, type, dependsOn?}`. Every Task:

- gets its own type and pins its own workflow (`task-type.workflow`);
- must have a type that the Specification allows;
- must not create a dependency cycle;
- has an id of lowercase letters, digits and dashes (at most 64 characters). The id is a file name, so
  the id pattern excludes Windows device names (`con`, `prn`, `aux`, `nul`, `com1` to `com9`, `lpt1`
  to `lpt9`);
- has a title of at most 200 characters, a summary of at most 4 000 and at most 100 dependencies.

One finish creates at most 100 Tasks, and a Specification has at most 200. A proposal that breaks a
rule rejects the whole finish with `WORKFLOW_INPUT_INVALID`, and nothing is stored.

The finish lists only **new** Tasks. Existing Tasks are never redefined (revising and cancelling Tasks
is follow-up F06), and a proposal with an existing id rejects the whole finish. The step context of
such a step lists:

- the allowed task types, so the planner chooses among them;
- the existing Tasks (`existingTasks`: id, title, type, position state, blocked, readiness kind), so
  new Tasks can depend on them and avoid their ids.

A breakdown may also create no Task at all.

The step context also exposes the bound archetype (profile and instructions), the Task's type
instructions and the step instructions. Together these are the custom instructions per step.

## Returns ("back to the table")

`returns[]` declares the steps the owner may move the run back to from any non-terminal position. This
includes a Specification that is waiting for its Tasks. When the owner returns:

- an active attempt ends with the outcome `returned`;
- the return's effects apply in the same change;
- the step that follows always waits for the owner.

**Effects.** There are two:

- `block-pending-tasks` blocks Tasks that have never had an attempt: `not-started`, or `ready` after a
  return of the Task itself. Running Tasks are never interrupted.
- `unblock-tasks` removes the block. The seed workflow declares it on the transition after `create-tasks`.

A Task that is blocked can neither start nor return (`WORKFLOW_TASK_BLOCKED`). Blocking removes the
Task's attention item.

## Wait step

A wait step has no work and no executor, so entering it is part of the transition that leads to it. The
Engine completes the wait step itself when every Task is terminal, in the same change as the finish of
the last Task. With zero Tasks, the wait step completes as soon as it is entered. Nobody starts or
resumes a wait step: a start whose next step is a wait step is refused with
`WORKFLOW_POSITION_INVALID` before anything changes, so its attention item (for example `tasks-stuck`)
is kept.
`FinishStepResult.specification` then says what the Specification does next.

Settling the wait runs inside a Task's finish and never makes that finish fail:

- A Specification that is not active is left alone. So is one whose pinned workflow is no longer the
  loaded definition: the Task finish succeeds, and the next Specification operation fails with
  `WORKFLOW_DEFINITION_CHANGED`.
- Otherwise the Engine settles only when the active step is a wait step. A Specification active on
  another step (for example a new breakdown after a return while a running Task finishes) is left
  alone.
- If Tasks are still open but none of them is `ready`, the Specification gets the attention item
  `tasks-stuck`. The dependency graph is acyclic by construction, so this is exactly the case when
  every open Task is blocked or waits, directly or through other open Tasks, for an abandoned or
  blocked Task. The owner resolves it with a return (for example to the breakdown), which replaces the
  item like any start or return.

## Continuation and attention

After every finish or return, `resolveContinuation` (a pure function) decides one of:

- `continue {step, launch}`, where `launch` is `{archetype, provider, model, effort?, session: fresh |
reuse(sessionId)}`;
- `attention {step, reason, …}`;
- `none` (the run is terminal or waiting for Tasks).

How a launch is resolved:

- **`session: reuse`.** The provider is the provider of the finishing Session, taken from trusted
  executor context. The model is the archetype's model for that provider.
- **`session: fresh`.** The provider is the archetype's `preferredProvider`, with its model.

Only an `auto` transition whose launch resolves gives `continue`. Otherwise the result is an attention
item. The reasons are:

| Reason                | When                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `owner-action`        | The transition is `owner-action`. Also adds `suggestion` and/or `blocker`. |
| `human-step`          | The next step is done by a person.                                         |
| `model-missing`       | The provider to use has no model in the archetype.                         |
| `provider-not-chosen` | A fresh Session is needed and the archetype has no preferred provider.     |
| `session-unavailable` | The transition reuses the Session, but the finishing executor had none.    |
| `archetype-missing`   | The step's archetype is not defined, or its file is invalid.               |
| `tasks-stuck`         | The Specification waits, but no open Task can progress without the owner.  |

Attention is never a question to the agent. The agent's finish succeeds, and the attention item is
recorded for the subject. There is at most one item per subject. **Any start of that subject removes
it**, whether the start comes from a quick screen, a manual start or an automatic continuation, since
they all use the same start operation. "Remember my choice" is `rememberArchetypeModel`: it writes the
model, and optionally the preferred provider, into the agent archetype file, keeping its comments.

The Engine only decides. Starting or continuing a Session from a `continue` decision is the Runtime's
job (plan 06, F01).

### Tasks are started by the owner

A Task has no previous step, so no transition decides how it continues. A Task never starts and never
gets an attention item just because it is ready: the Engine records attention for a Task only after
one of its own steps finished or returned. The owner starts Tasks. The intended model (plan 06,
"Run selected Tasks") is that the owner selects Tasks and presses "run", and the Runtime orchestrator
runs that selection with agents in dependency order, recording attention only when the run cannot
proceed.

## State and storage

| What                                      | Where                                                  | Tracked |
| ----------------------------------------- | ------------------------------------------------------ | ------- |
| Specification run                         | `<specification>/.execution/specification.yaml`        | Git     |
| Task records (type, deps, block, own run) | `<specification>/.execution/tasks/<taskId>.yaml`       | Git     |
| Attention items                           | `<stateRoot>/engine/workflow/attention/<specId>.json`  | local   |
| Change journal                            | `<stateRoot>/engine/operations/workflow/<specId>.json` | local   |

- **Location.** `.execution/` starts with a dot, so the document tree never lists it. It moves with
  the Specification when the Specification is archived.
- **Revisions.** Every record is validated on read (`state/codec.ts`), and a hand-edited or truncated
  file fails closed. Writes are compare-and-swap on content revisions (`WORKFLOW_STATE_CONFLICT`).
- **Atomic change.** One operation produces one `ExecutionChange`. The store writes it whole to the
  journal, then writes the files, then removes the journal. A read overlays a pending journal, and the
  next write finishes it.
- **Write-side validation.** Every record, and the attention list, is validated against the same
  codec while the change is built, before the journal is written. A record that would not read back
  fails with `WORKFLOW_STATE_CORRUPT`, and nothing is written. The attention list holds at most one
  item per subject, so its limit is the Task limit plus one.
- **Replay check.** Each journal target records the sha256 of the text it replaces, or that the file
  did not exist. A pending journal is used only while every target still holds that revision or
  already the new text. Otherwise the state changed outside the Engine (a branch switch, a hand edit),
  and reads and writes fail closed with `WORKFLOW_STATE_CONFLICT`. The error names the local journal
  file; the owner deletes it by hand to keep the records as they are on disk.
- **Stage files.** An atomic write that crashed leaves a `.<name>.<uuid>.tmp` file. Reads skip
  dot-files, and the next change removes stage files in `.execution/` and `.execution/tasks/`.
- **Other files among the Tasks.** In `.execution/tasks/`, only names that end in `.yaml` and do not
  start with a dot are Task records. Every other name (`.gitkeep`, `Thumbs.db`, `desktop.ini`, swap and
  `.orig` files) is ignored. A record whose name is not a valid Task id fails closed with
  `WORKFLOW_STATE_CORRUPT`.
- **Serialization.** All mutations run inside `withProjectControlLock`.
- **Per-Task files.** Each Task has its own file, so parallel Task worktrees can later merge without
  conflicts (follow-up F08).

Committing the `.execution/` files is not done by this kernel yet (follow-up F04). Until then, they
are ordinary working-tree changes of the Specification's checkout.

## Extension points

| To add                        | Change                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Task effect                 | Add a value to `WORKFLOW_EFFECTS` (contracts) and a case to `applyTaskEffects`.                                                                           |
| An attention reason           | Add it to `ATTENTION_REASONS` and give `resolveAgentLaunch` / `resolveContinuation` the rule that produces it.                                            |
| A step kind (e.g. gate)       | Add a union member in the contracts schema and in `definitions/model.ts`, then a rule in `workflow-rules.ts` and handling in `progression` and `advance`. |
| Gates and finalize actions    | Planned as step fields checked by `planFinish` before the change is built (F03, F04).                                                                     |
| A store                       | Implement the `WorkflowStore` port (`state/store.ts`).                                                                                                    |
| A surface (Runtime, CLI, MCP) | Call the operations with `openWorkflow(engine)`. Never reimplement progression.                                                                           |
