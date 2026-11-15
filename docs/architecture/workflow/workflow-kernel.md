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
  One deterministic workflow core (the neutral @nevo/workflow coordinator, with the SpecFlow adapter in
  the Engine) drives both a Specification and each of its Tasks. Entry points only select the subject.
  Workflows, agent archetypes (preferred provider and a model per provider) and task types are project
  definitions. A step declares which executor classes may do it, and every attempt records its actor.
  A Task is a resource (tasks/index.yaml, task.yaml, task.md) with its own type, workflow and
  preparation status (draft, ready, on-hold, cancelled), changed only by explicit decisions, a declared
  approval effect or its own escalation; its run is created at its first start. The Engine decides
  continuations; anything it cannot carry out is attention for the owner, derived from the state on
  every inspection and never stored. Runs live in the Specification's `.execution/` folder; only the
  change journal is local. The writes are committed like the Specification's documents (the document
  commit policy, queue and ledger); with auto-commit off a step's finish commits them, and a Close
  takes what is left.
related:
  - architecture.workflow.deterministic-workflow
  - adr.0019-workflow-kernel-and-automatic-continuation
  - adr.0024-tasks-are-resources
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - reference.api.specification-workflow
  - adr.0017-definitions-as-project-data
  - architecture.runtime.specflow-engine
  - ideas.specflow-engine.plan-06
---

# Workflow kernel

This document describes how the rules of
[deterministic workflow](deterministic-workflow.md) are implemented. The owner decisions behind it are
recorded in [ADR 0019](../decisions/0019-workflow-kernel-and-automatic-continuation.md),
[ADR 0024](../decisions/0024-tasks-are-resources.md) (Tasks are resources) and
[ADR 0023](../decisions/0023-neutral-workflow-coordinator-and-manual-execution.md) (neutral
coordinator, executors and actors). The code lives in two places:

- `packages/workflow/src/` (`@nevo/workflow`): the product-neutral core. Compiled definitions
  (`definitions/`), runs, pins, replay (`execution/replay.ts`) and the coordinator
  (`execution/coordinator.ts`). It is pure: no I/O, clock or host keys, and its imports are an
  allowlist ([ADR 0012](../decisions/0012-product-package-topology-and-dependency-direction.md)).
- `packages/specflow-engine/src/workflow/`: the SpecFlow adapter, exported through its `index.ts`.
  It compiles the SpecFlow YAML, owns storage, Task effects, continuation, gates and attention, and
  applies each decision with its effects in one store change. The Task resource format is
  `packages/specflow-engine/src/tasks/resource/`.

## One core, two entry points

The core is subject-neutral. A **subject** is either the Specification or one of its Tasks:

```text
startSpecificationExecution(specId, archetype, actor) ─┐
startTaskExecution(specId, taskId, actor)              ─┴─▶ start(subject) ─▶ decide(start)
finishStep(subject, step, attempt, input, actor)         ─▶ decide(finish) ─▶ Tasks, decisions, effects, escalation ─▶ continuation
returnToStep(subject, step, feedback, owner)             ─▶ decide(return) ─▶ effects ─▶ continuation
setTaskStatus(specId, taskId, status, reason, owner)     ─▶ decision ─▶ settle the Specification (decide(event))
createTask / editTask / removeTask (owner)               ─▶ Task resource change
abandonSpecification(specId, reason, owner)              ─▶ every open run abandoned, open Tasks cancelled
inspectExecution(specId) / readExecution / inspectActions ─▶ read-only views, broken Tasks, facts, derived attention
```

`decide(definition, run, command)` is the coordinator: for `start`, `finish`, `event` (a wait step's
trigger) and `return` it checks the pin and the replayed history, chooses the legal step or
transition, and returns the next run, an intent (`execute`, `ready` with its continuation,
`await-event` with the triggers, `terminal`) and the declared effects with their host annotations. The
core never sees whose run it is: the adapter keeps a run per Specification and per Task and hands the
core the run value.

The entry points differ in only two ways:

- **Starting a Specification** creates the Specification run the first time. It reads the execution
  binding of the Specification archetype, pins that workflow and snapshots its `taskTypes`.
- **Starting a Task** checks that the Task is ready: its status is `ready`, and every dependency
  completed (see "Tasks"). Its first start creates its run record (see "First start").

Everything else is shared.

## Definitions (project data, ADR 0017)

Each kind of definition is a directory under `.nevo/definitions/`. The product ships seeds of each kind
in `packages/specflow-engine/definitions/`.

| Kind                      | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow`                | `subject: specification \| task`, `entryStep`, `steps[]`, `returns[]`. A step is `work` (fields `executors: [agent, human]` (one or both), `archetype`, `interaction`, optional `produces: tasks`, `entryGates`, `exitGates`; see "Gates") or `wait-for-tasks`. A transition has `result?`, `to: {step} \| {terminal}`, `continuation: auto \| owner-action`, `session: fresh \| reuse`, `feedback`, `effects`, in a Task workflow `escalate`, and on a wait step `on`. |
| `agent-archetype`         | Who works on a step: an optional agent `profile`, `instructions`, `preferredProvider`, and `providers[]` with an optional `model` and `effort` each. An entry without a model means "known provider, model not chosen yet".                                                                                                                                                                                                                                             |
| `task-type`               | What a Task is (`description`, `useWhen`, `instructions`) and the Task `workflow` it runs.                                                                                                                                                                                                                                                                                                                                                                              |
| `specification-archetype` | Gains an optional `execution: {workflow, taskTypes?}`. `taskTypes` defaults to `['*']`, meaning every task type is allowed. Resolved when execution starts.                                                                                                                                                                                                                                                                                                             |

A workflow and a Specification archetype are separate definitions. The archetype only refers to a
workflow. The adapter compiles a workflow file into a core definition (`definitions/model.ts`): a
`wait-for-tasks` step becomes a neutral `wait` step whose transitions are selected by the trigger
names `tasks-finished` and `task-escalated`; `archetype`, `interaction`, `produces`, `effects`,
`session`, `escalate` and gates become SpecFlow annotations that the core carries without
interpreting. Definitions, runs and the journal have one strict format: a record in an older shape
fails closed with `WORKFLOW_STATE_CORRUPT`, and nothing reads or migrates it.

**No cascade.** A broken definition never takes the definitions that refer to it down:

- A workflow does not check the agent archetypes of its steps. They are resolved when a step is
  continued, and a missing or invalid one gives the attention reason `archetype-missing`.
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
- a step an agent may do (`executors` includes `agent`) names an archetype, and a human-only step
  names none;
- only a Specification workflow can produce Tasks, wait for Tasks or have Task effects;
- only a Task workflow escalates, and an escalating transition has `feedback: required` and a step
  target;
- `session: reuse` can only lead to a step an agent may do;
- a wait step's transitions are selected by a Task event `on: tasks-finished | task-escalated`
  instead of a result (see "Wait step"). `on` exists only on wait-step transitions; a wait-step
  transition without `on` counts as `tasks-finished`, so older files stay valid. A wait step has
  exactly one `tasks-finished` transition (without `feedback: required`) and at most one
  `task-escalated` transition, which needs `feedback: required` and a step target. No wait-step
  transition has a result, reuses the Session (the Engine settles a wait without one) or leads to
  another wait step;
- the entry step is not a wait step: starting a run enters its entry step;
- a return never targets a wait step: a return waits for the owner, and nobody can start a wait step;
- every step has a `title`, a single line with a non-whitespace character (as do workflow titles and
  transition and return labels); surfaces show it with the id as the stable reference: the projection
  carries `title` on every step, `firstStepTitle` on the pin preview, `targetTitle` on a transition to a
  step, `title` on each return target and `stepTitle` on a gate refusal, and the Task reads carry the
  step `title`;
- only a work step has gates; gate ids are unique within the step, an exit gate's `when` names results
  the step's transitions declare (an entry gate has no `when`), only the gate type `document` exists, and
  its `documentType` is a defined document type (a missing one is `reference-missing`; an invalid
  document-type file does not take the workflow down).

## Positions, attempts and the handoff

A run stores only `workflow` (the pin), `position`, `attempts[]` and `returns[]`. The position is one
of:

- `not-started`;
- `active {step, attempt}`;
- `ready {step}`: a checkpoint after a finish or a return; the next start activates `step`;
- `terminal {outcome}`.

Readiness, Task facts and statuses are derived from these, never stored.

- **Attempts.** Every activation of a step creates the next attempt number for that step. Finish must
  name the exact active attempt (`WORKFLOW_ATTEMPT_MISMATCH` otherwise).
- **Sequence.** Every attempt and return record carries a `sequence` (1, 2, ...) in the order the
  records were made. The handoff takes the latest record by sequence, never by timestamp.
- **Position follows from the history.** The stored position must be where the history leads, read
  with the pinned definition (`assertPositionJustified` in `@nevo/workflow` `execution/replay.ts`, checked
  whenever a run is loaded with its definition, by every operation and by `inspectExecution`). The
  attempts and returns are replayed in sequence order from `not-started`: the first attempt is of the
  entry step, and every later attempt is of the step the previous record led to (an Engine-entered
  wait step included); an open attempt makes the run `active` on it, so it can only be the last
  record; an attempt of a work step carries an `actor` whose class the step's `executors` allow,
  and an attempt of a wait step, which the Engine starts, carries none, so the Session check of a
  finish or resume always has the starting actor; a finished attempt leads where its recorded
  transition (from that attempt's step) targets, and it records the transition's `result` (none when
  the transition declares none) and non-empty feedback when the transition requires feedback, as
  `planFinish` enforces; an attempt ended by a return, and a return record (whose `from` must be the
  replayed position), lead to the return's step. A replayed return follows the rules of
  `returnToStep`: its step is one the definition declares in `returns[]`, an attempt replayed so far
  (the returned attempt included) was of that step, and it carries non-empty feedback when the
  return requires feedback. The replay must end at the stored position, whatever its state. A hand-edited
  position or history that does not follow (for example `ready: acceptance` with an empty history,
  `active` on `acceptance` right after `requirements`, an attempt of a step nothing led to, or a return
  from `specification` to the undeclared `acceptance` or to the not yet reached `breakdown`) fails
  with `WORKFLOW_STATE_CORRUPT` for the Specification, and makes a Task broken (see "The Task set"). A
  run whose pinned definition is missing or changed is not checked; `inspectExecution` marks it
  `definitionChanged: true`, and its next operation fails with `WORKFLOW_DEFINITION_CHANGED`.
- **Pin.** A run is pinned to `{id, version, revision}`, where `revision` is the sha256 of the canonical
  JSON of the compiled definition (annotations included). If the loaded definition differs, the run fails with `WORKFLOW_DEFINITION_CHANGED`.
  Re-pinning is a follow-up (plan 06, F07).
- **Handoff.** The step context carries what the previous attempt handed over: its transition, result,
  feedback and artifacts, or the owner's feedback after a return.
- **Input limits.** Finish and return input must fit the stored records. Feedback has at most 16 384
  characters, and a finish names at most 100 artifacts of 1 to 1 000 characters each. Input that does
  not fit is rejected with `WORKFLOW_INPUT_INVALID` before anything changes. The limits live in
  `workflow/limits.ts`, the single source for these checks and for the codec.
- **History size.** The codec bounds a run to 1 000 attempts and 1 000 return records. That is a plain
  size bound checked by write-side validation, not a workflow rule; no run is expected to reach it.
  A record file is also bounded to 256 KiB (see the budgets under "State and storage"). Known limit: a
  history that grows over that byte budget is refused only when the change is serialized
  (`WORKFLOW_INPUT_INVALID`, nothing is stored); no operation checks it earlier, and bounding the run
  history is a follow-up (plan 06, F19).

## Executors and actors

A work step declares the executor classes that may do it: `executors: [agent, human]`, `[agent]` or
`[human]`. Every shipped agent step allows both; a human-only step (the seed's `acceptance`) stays
human-only. Every start of a work step (including a start that resumes the active attempt) and every
finish names its **actor** `{class, details}`, from trusted Runtime or CLI context, never from
agent-supplied input or a request body (`state/model.ts`, `operations/actors.ts`):

- **Agent:** `details {archetype?, provider, model?, sessionId?}`.
- **Owner (`OwnerActor`):** class `human`, `details {actorId, trust}`. The Runtime builds it from the
  authenticated subject (`trust: authenticated`, or `runtime:trusted-local` with `trust: local` when
  authentication is off); the CLI builds `local:<os-user>` with `trust: local`. `trust: local` is not
  proof of a human: an agent running as the same OS user looks the same.

The rules:

- The core (`decide`) checks that the actor's class is one the step allows, and that an active
  attempt is resumed or finished only by an actor of the class that started it: a person never
  finishes an agent's attempt and an agent never a person's.
- The adapter adds that an active agent attempt started in a Session (its actor carries a
  `sessionId`) can be resumed and finished only by the same provider and Session id.
- The attempt records who started it (`actor`) and who finished it (`finishedBy`).
- The owner operations `returnToStep`, `setTaskStatus`, the Task resource commands and
  `abandonSpecification` take an `OwnerActor` (`assertOwner`); anything else, including no actor, is
  refused the same way.

Breaking a rule fails with `WORKFLOW_EXECUTOR_NOT_ALLOWED` before anything changes. Handing an active
agent step over to the owner (owner takeover) is not supported; it would be an explicit operation of
its own (plan 06, F17), not a finish. No dispatch preference is stored: whether a person or an agent
does the next step is chosen when it starts.

**After a manual step, no Session to reuse.** When a person finishes into a `session: reuse`
transition, the continuation is `session-unavailable` and the action projection reports the next
step's agent option as unavailable with that reason. Nothing falls back to a fresh Session.

**Idempotent finish (F16).** A finish stores the digest of its request (step, attempt and the whole
input, `finishDigest`) on the attempt (`requestDigest`). A finish that names the run's last finished
work attempt with the same digest and actor is a retry: it returns the recorded result
(`FinishStepResult.replayed: true`) and changes nothing; when the original change did not finish
publishing, the retry first completes the pending journal (an empty change publishes it) and runs the
post actions again. Anything else naming that attempt is `WORKFLOW_ATTEMPT_MISMATCH`. A replayed
finish does not evaluate gates again.

## Gates

A work step may declare **entry gates** (checked before it starts) and **exit gates** (checked before it
finishes). They are user-definable conditions of the definition, so a project adds process checks
without code; nothing about a particular process is built in. The only gate type today is `document`
(`command` and `human` gates are planned on the same model, F03):

```yaml
steps:
  - id: investigate
    kind: work
    title: Investigate
    executors: [agent, human]
    archetype: implementer
    purpose: Answer the open questions of the Task.
    exitGates:
      - id: findings # optional; default exit-<n> / entry-<n> (from 1)
        type: document
        documentType: research # a defined document type
        scope: subject # default; or specification (the Specification of a Task)
        requiredSections: [Findings, Open questions] # optional Markdown headings
        when: [answered] # exit gates only: just for these results; default every one
        label: Findings are written # optional display text
    transitions:
      - { id: answered, result: answered, to: { terminal: completed } }
      - { id: blocked, result: blocked, to: { step: investigate }, feedback: required }
```

- A `document` gate holds when its scope **registers** a document of `documentType` (the
  Specification's or the Task's document registry) whose file exists and, with `requiredSections`, has a
  heading for each text. One such document is enough. Otherwise its reason is `no-document`,
  `file-missing`, `sections-missing` (with the closest document and the sections it lacks) or
  `unreadable` (the only documents with a file could not be read: not a regular file, redirected, or a
  failed read; the gate fails closed and the rest of the projection is unaffected). Evaluation is
  `workflow/gates/`: pure over what a read found, and the read goes through the Documents capability
  (`readRegisteredDocumentsOfType`), never the execution store.
- **Section rules.** Only ATX headings count (`#` to `######`, any level, the closing `#` sequence
  dropped); setext (underlined) headings do not. A section matches a heading by its exact text after
  trimming, case-insensitive; inline markup is not stripped (`## *Risks*` matches `*Risks*`, not `Risks`).
  Ignored: a front matter block at the very start (`---` to `---` or `...`), fenced code (CommonMark: a
  fence closes only with the same character, at least as many, and no info string) and the lines of an
  HTML comment (`<!--` to `-->`). A required section has a non-whitespace character (schema).
- **Neutral core.** Gates are SpecFlow annotations of a work step (`SpecFlowAnnotations.work`); the
  `@nevo/workflow` core carries them opaquely and never evaluates them. Annotations are part of the
  compiled definition, so gates are covered by its revision and a run keeps the gates it was pinned with.
  A step without gates has no gate fields at all, so adding the feature did not change the revision of
  existing workflows.
- **Inspection.** The action projection reports each gate as a `GateStatus` (`satisfied` or
  `unsatisfied`, with `scope` as link data): every finish transition lists the exit gates that apply to
  it and is `unavailable: gate-unsatisfied` while one does not hold (unless it is `tasks-open`, see
  "Completion requires closed Tasks"); a startable step lists its
  `entryGates`, and unsatisfied ones are the start blocker `gates-unsatisfied`. The inspection writes
  nothing.
- **Authoritative check.** `finishStep` evaluates the exit gates of the taken transition inside the
  lock after every input rule and the open-Tasks rule of a completion (so `WORKFLOW_TASKS_OPEN` wins,
  as in the projection), on the planned change, before anything is written; a start (not a resume)
  evaluates the step's entry gates after the Task's own readiness and context checks. An unsatisfied
  gate refuses with `WORKFLOW_GATE_UNSATISFIED` (`GateUnsatisfiedError`: `phase`, `step`, `gates`). A
  repeated finish (F16 replay) returns the recorded result without evaluating gates again.

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

A dangling or broken Task is **broken** for every decision. A Task whose pinned workflow is missing or
changed is not broken: by owner decision it is trusted as stored until re-pinning
([plan 06](../../ideas/specflow-engine/execution-plans/06-workflow-kernel/README.md), F07), and its next
operation fails with `WORKFLOW_DEFINITION_CHANGED`. Only that Task breaks, and every decision sees the
same list (`executionTasks` leaves broken Tasks out of the Tasks the operations, `deriveAttention` and
`inspectExecution` decide on): `inspectExecution` lists it in `brokenTasks`; starting, finishing,
returning or deciding it with `setTaskStatus` is refused with `WORKFLOW_STATE_CORRUPT` naming it, before
anything is written; it counts as open, so the wait step never completes over it; a Task that depends on
it never becomes startable (`dependencies {waitingFor}`); and when nothing else can progress, the
Specification gets `tasks-stuck`. The Engine never repairs it: restoring the files from Git makes the
Task usable again. If the restored Task is already closed and no Task is open any more, no Task event
will complete the wait, so the Specification keeps `tasks-stuck` and the owner returns it (for example
to the breakdown). A broken Task is open, so a Specification never completes over it (see
"Completion requires closed Tasks"). A Specification
step's context lists the broken Tasks by id in `broken`, not in `existingTasks`; a `taskDecisions` entry
naming one is refused with `WORKFLOW_INPUT_INVALID` (`Unknown Task`).

Every `dependsOn` names a registered Task, and the dependencies form no cycle; a stored state that
breaks this is `WORKFLOW_STATE_CORRUPT`.

### Authoring Tasks by hand

The owner's Task use cases (`operations/task-resource.ts`, each with an `OwnerActor`; HTTP in
[Task reads, Task commands](../../reference/api/task-reads.md#task-commands), CLI in
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

The list is the complete set of **the drafts this producing step owns** after the finish
(`materializeTasks`): the drafts whose origin is `produced` by the same step, from any of its attempts.
Drafts created by hand or by another step are never touched (owner decision D06):

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

No attention is derived for a Task that is not `ready`. After a status change, `setTaskStatus`
settles the Specification in the same change (see "Wait step").

### Readiness and the step context

Readiness of a Task is derived from the Task and its direct dependencies only: `status {status}` (not
`ready`), `dependencies {waitingFor}` (a direct dependency has not completed) or `ready`. Starting a
step of a Task that is not ready fails with `WORKFLOW_TASK_BLOCKED` naming the status, and starting a
Task whose direct dependency ended `abandoned` or was cancelled fails with
`WORKFLOW_DEPENDENCY_UNSATISFIED` naming that dependency (also a broken one). Only a `ready` Task can
be returned. A Task that is not `ready` after its own finish gets the continuation `none {on-hold}`
and no attention.

The entry gate of every Task step is its own context: a required context entry that does not resolve
refuses the start (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`). A reference entry may be marked as a **process
artifact** (`artifact: true` in `task.yaml`; not for `instructions`): something another step or Task
produces. While it is missing it is `awaited`, not stale: create and edit accept it, the projection
reports it as the blocker `context-awaited` (apart from `context-unresolved`, so a surface shows no
warning on Approve), and a required one still refuses the start, listed apart in the refusal
(`awaited`). There is no producer link; the artifact simply has to exist when the step starts.

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

Owner decision A (2026-11-15, [ADR 0024](../decisions/0024-tasks-are-resources.md) decision 12): a
Specification run never reaches the terminal outcome `completed` while a Task is **open**, in any
Specification workflow, with or without a wait step. Open is every Task that is not closed (its run
is not terminal and it is not `cancelled`): a draft, an approved Task that never started, a running,
waiting or held one, and a broken one (its work is not known). A Task whose own workflow ended it,
completed or abandoned, is closed. The rule is `tasksOpenAtCompletion` (with `openTasks`) in
`tasks/tasks.ts`; it never looks at step ids or names.

- **Finish.** `advance` (`operations/advance.ts`) refuses a Specification decision whose intent is
  `terminal {completed}` while Tasks are open, with `WORKFLOW_TASKS_OPEN` (`TasksOpenError`,
  `openTasks: [{taskId, cause}]` in id order). Like the draft and escalation guard it judges the state
  the change would produce, after the finish's `tasks`, its `taskDecisions` and the transition's
  effects, so a finish that cancels the last open Tasks itself completes; and it runs before anything
  is written, so the attempt stays active. A wait step's `tasks-finished` completes only with every
  Task closed and `task-escalated` always leads to a step, so both pass. A repeated finish (F16
  replay) returns the recorded result without asking the rule again. Abandon is not affected. The
  finish asks the rule before its exit gates, so a finish with both problems is refused for its open
  Tasks; once they are closed, an unmet gate still refuses it.
- **Causes.** `cause` is one of `BLOCKING_TASK_CAUSES` (`draft`, `on-hold`, `broken`,
  `dependency-unsatisfiable`, which only a person resolves) or `active` (an attempt runs), `waiting`
  (`ready`, waiting for open dependencies) and `ready` (can start, or continue with its next step).
  `blockingTasks` (the `tasks-stuck` explanation) is `openTasks` restricted to the blocking causes, so
  both explanations use one model and one vocabulary.
- **Projection.** The action projection asks the same rule on the current Tasks: such a transition is
  `unavailable: tasks-open` with `openTasks` (it wins over `gate-unsatisfied`; meeting a gate would
  not help). It does not know a finish's own decisions, so a finish that cancels the open Tasks may
  still be accepted.
- **No attention item.** Open Tasks are the Tasks' normal progress, not something to fix: the
  Specification gets no attention item for them, and no Task gets one either. The Now block names them
  (see [Workflow execution](../../product/specflow/ui/workflow-execution.md#dialogs)).

## Returns ("back to the table")

`returns[]` declares the steps the owner may move the run back to from any non-terminal position. This
includes a Specification that is waiting for its Tasks. A return is an owner action: `returnToStep`
requires the owner as executor (see "Executors"). A return goes only to a declared step the run
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

**Draft and escalation guard.** A wait step is never entered while a Task is `draft` or on hold by
its own escalation (`statusChange.source: escalation`): every Task must be approved or cancelled,
and every escalation resolved (the Task resumed or cancelled), before implementation is handed over.
The guard is checked on the state the change
would produce, after the finish's `tasks`, its `taskDecisions` and the transition's effects (so
`approve-draft-tasks` on the seed's `breakdown-review` `pass` satisfies it in the same change). A
change that would enter a wait step with a draft or escalated Task is refused with
`WORKFLOW_INPUT_INVALID` naming them
(`Cannot enter the wait step "implementation": Tasks still draft: a; Tasks escalated: b.`) before
anything is written, so the attempt stays active and can finish again with other decisions. The rule
belongs to the kernel (`advance` in `operations/advance.ts`), so every workflow gets it. Only a
Specification finish enters a wait step: the entry step is not a wait step, a return never targets
one, and no wait-step transition leads to another.

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

## Continuation and attention

After every finish or return, `resolveContinuation` (a pure function) decides one of:

- `continue {step, launch}`, where `launch` is `{archetype, provider, model, effort?, session: fresh |
reuse(sessionId)}`;
- `attention {step, reason, …}`;
- `none` (the run is terminal, waiting for Tasks, or the Task is not `ready` after its finish:
  `on-hold`).

How a launch is resolved:

- **`session: reuse`.** The provider is the provider of the finishing Session, taken from trusted
  executor context. The model is the archetype's model for that provider.
- **`session: fresh`.** The provider is the archetype's `preferredProvider`, with its model.

Only an `auto` transition whose launch resolves gives `continue`. Otherwise the result is attention.
The reasons are:

| Reason                | When                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `owner-action`        | The transition is `owner-action`. Also adds `suggestion` and/or `blocker`.    |
| `human-step`          | The next step is done by a person.                                            |
| `model-missing`       | The provider to use has no model in the archetype.                            |
| `provider-not-chosen` | A fresh Session is needed and the archetype has no preferred provider.        |
| `session-unavailable` | The transition reuses the Session, but the finishing executor had none.       |
| `archetype-missing`   | The step's archetype is not defined, or its file is invalid.                  |
| `tasks-stuck`         | The Specification waits, but no open Task can progress without the owner.     |
| `task-escalated`      | Tasks escalated, no declared transition (`taskIds`). Wins over `tasks-stuck`. |

`tasks-stuck` always names the Tasks to resolve (`taskIds`, with `blocking: [{taskId, cause}]`,
`blockingTasks` in `tasks/tasks.ts`): each draft, each Task on hold, each broken Task, and each
`ready` Task with a direct dependency that was cancelled or ended without completing. A Task that
only waits for other open Tasks is not named, nor one whose only unsatisfiable dependencies are
broken (the broken Task is named). The list is resolved from the current state on every read and
is empty when every Task is closed but the wait is still active; that item then offers
`return-to-step` instead of `review-tasks`.

Attention is never a question to the agent. The agent's finish succeeds, and the finish (or return)
returns its `ContinuationDecision`.

**Attention items.** Besides the continuation reasons, an attention item (`AttentionItem`,
`attention/model.ts`) can come from the state of a subject:

| Reason                     | When                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `task-broken`              | A broken Task (see "The Task set").                                                                |
| `definition-changed`       | A run that has not ended (a Task's only while `ready`) is pinned to a missing or changed workflow. |
| `context-unresolved`       | An approved Task that has not started has a required entry that is stale.                          |
| `dependency-unsatisfiable` | It depends on a Task that was cancelled, ended otherwise or is broken.                             |
| `type-not-allowed`         | Its task type is not allowed by the effective policy any more.                                     |
| `definition-missing`       | Its task type or that type's workflow is not defined.                                              |
| `entry-gate-unsatisfied`   | An entry gate of its first step does not hold, and no dependency it waits for can still complete.  |

Every item carries the required `actor` (`owner`: neither the steps nor the gates the Engine
derives items from name another actor; `agent` is reserved), the primary `action` it offers and an
optional `secondaryAction` (`start-step`, `return-to-step`, `configure-archetype`, `review-tasks`,
`restore-task`, `confirm-definition`, `edit-context`, `edit-dependencies`,
`open-project-settings`, `cancel-task`, `satisfy-gate`), the step and its title where one
resolves, and a display-only English `message`. A type no longer allowed or not defined offers
`open-project-settings` or `cancel-task`; an unsatisfiable dependency `edit-dependencies` or
`cancel-task`, and `restore-task` (or `edit-dependencies`) when a dependency is broken. An unmet
entry gate is attention only once no dependency the Task waits for can still complete, since a
dependency may deliver the document. The start blockers that are **not** attention (owner decision 2A): a draft or a
Task on hold (`status`; the Specification's `tasks-stuck` covers them when nothing else can
progress), dependencies that can all still complete, an awaited process artifact
(`context-awaited`), and a Task that can start. Attention is never inferred from a status name.

**Attention is derived, never stored.** `inspectExecution` computes the attention items
(`deriveAttention` in `operations/attention.ts`) from the canonical runs, the pinned definitions and
the current archetypes, with the same functions the operations use for their results
(`continuationOf`, `waitDecision` in `operations/advance.ts`):

- a broken Task gets `task-broken` (broken Tasks come first, then the Specification, then its
  Tasks in id order);
- a subject `ready` on a step gets what its latest event decides: after a finished attempt, the
  recorded transition (from that attempt's step) with the executor that finished it (`finishedBy`,
  the Session a `reuse` continues); after an owner return, an owner action;
- a Specification active on its wait step gets `task-escalated` or `tasks-stuck` (also when every
  Task is closed but the wait is still active, which only a Task file changed outside the Engine
  causes);
- a run that has not ended whose pinned workflow is missing or changed gets `definition-changed`
  (its inspection entry carries `definitionChanged: true`; re-pinning is F07);
- nothing is derived for a subject that is active (being worked on), not started or terminal, or
  for a Task that is not `ready`.

The start blockers of a Task that has not started are read with the documents (context, gates), so
the action projection classifies them (`startBlockerAttention`). There is one list:
`inspectExecution` (and `readExecution`'s inspection, whichever Tasks it projects) projects every
approved Task that has not started and returns the derived items with those start-blocker items as
`attention`; `inspectActions` carries the subject's own item as `attention`.

**Neutral Task facts.** `readExecution` also returns the `TaskFacts` of each projected Task:
`preparation`, `escalated`, the run `position`, `startable` (the projection finds no start
blocker), `startBlockers`, `dependencyWait` (`waitingFor`, `unsatisfiable`), `definitionChanged`
and `attention`. They hold no presentation concept (no group, label, order or lane): a dashboard
grouping is a presentation of these facts owned by a surface (the Runtime's is described in
[Task reads](../../reference/api/task-reads.md#dashboard-grouping)), and the CLI and MCP read them
without any grouping. A broken Task has `BrokenTaskFacts` (`broken`: its id, its manifest's title
when readable, the broken reason). `TaskProgress` counts `completed` of `total` (cancelled Tasks
and those ended without completing left out; broken and on hold ones counted) and names
`cancelled`, `ended` (abandoned by its own workflow, not cancelled) and `onHold` apart.

So there is at most one item per subject, and **any start removes it** by construction, whether the
start comes from a quick screen, a manual start or an automatic continuation. Whatever changes the
runs (an operation, a branch switch, a pull), inspection shows the attention of the current
position, and a model chosen in an archetype afterwards changes it too. `inspectExecution` runs
inside the same serialization as the mutations, so it never sees a change half-applied.

"Remember my choice" is `rememberArchetypeModel`: it writes the model, and optionally the preferred
provider, into the agent archetype file, keeping its comments. Its read-edit-write runs under the
project control lock. `openWorkflow` returns a snapshot of the
definition catalogue: after a definition edit, including `rememberArchetypeModel`, call `openWorkflow`
again to see it.

The Engine only decides. Starting or continuing a Session from a `continue` decision is the Runtime's
job (plan 06, F01).

### Tasks are started by the owner

A Task has no previous step, so no transition decides how it continues. A Task never starts and never
gets attention just because it is ready: a continuation is derived for a Task only once one of its
own steps finished or returned, and before its first start only a start blocker a person has to fix
is attention (above). The owner starts Tasks. The intended model (plan 06,
"Run selected Tasks") is that the owner selects Tasks and presses "run", and the Runtime orchestrator
runs that selection with agents in dependency order, recording attention only when the run cannot
proceed.

## State and storage

| What                                    | Where                                                  | Belongs to                 |
| --------------------------------------- | ------------------------------------------------------ | -------------------------- |
| Specification run                       | `<specification>/.execution/specification.yaml`        | Git (committed, see below) |
| Task runs (created at the first start)  | `<specification>/.execution/tasks/<taskId>.yaml`       | Git (committed, see below) |
| Task resources (index, manifests, docs) | `<specification>/tasks/`                               | Git (committed, see below) |
| Change journal                          | `<stateRoot>/engine/operations/workflow/<specId>.json` | local                      |

- **Location.** `.execution/` starts with a dot, so the document tree never lists it. It moves with
  the Specification when the Specification is archived.
- **Revisions.** Every record is validated on read (`state/codec.ts`), and a hand-edited or truncated
  file fails closed. Writes are compare-and-swap on content revisions (`WORKFLOW_STATE_CONFLICT`).
- **Atomic change.** One operation produces one `ExecutionChange`. The store writes it whole to the
  journal (`state/journal.ts`), then writes the files, then deletes the journal. A read overlays a
  pending journal, and the next change finishes it.
- **Consistent reads.** The store does not lock. Its precondition is that callers serialize the reads
  and changes of one Specification; the operations do it with the project control lock, which is
  cross-process. So a read never sees a change in the middle of being published.
- **Write-side validation.** Every record is validated against the same codec while the change is
  built, before the journal is written. A record that would not read back fails with
  `WORKFLOW_STATE_CORRUPT`, one over its byte budget with `WORKFLOW_INPUT_INVALID`, and nothing is
  written.
- **Identity and coherence.** Every read, and the state a change would produce, is checked before it
  is used or stored: a Task file holds the Task its name says, every record belongs to the
  Specification (`specId`), Task ids are unique, and `validateExecutionState` (`state/validate.ts`)
  checks the invariants the operations rely on (one open attempt for an active step and none
  otherwise, attempt numbers without gaps, an ordered history) and the Task resource issues (see "The
  Task set"; every dependency a registered Task, no dependency cycle). A failure is
  `WORKFLOW_STATE_CORRUPT`. Whether a position follows from its history needs the definition and is
  checked when the run is loaded (see "Positions, attempts and the handoff").
- **Plain files only.** `.execution/`, `.execution/tasks/`, the journal folder and every
  record file must be a plain directory or a regular file at its expected physical path
  (`state/record-files.ts`). A symlink, a junction or a path that resolves elsewhere fails with
  `WORKFLOW_STATE_CORRUPT` before anything is read, written or removed.
- **Budgets.** A Specification holds at most `TASKS_PER_SPECIFICATION_MAX` (200) Task files, a record
  file at most `RECORD_BYTES_MAX` (256 KiB) and the journal at most `JOURNAL_BYTES_MAX`
  (`workflow/limits.ts`). A file's size is checked before it is read; a stored file over its budget
  fails the read with `WORKFLOW_STATE_CORRUPT`. The record budget is enforced when a change is
  serialized (`state/codec.ts`): a change over it is refused with `WORKFLOW_INPUT_INVALID`, and
  nothing is stored. The journal budget is checked
  when the journal is serialized (`state/journal.ts`); records within their budgets always fit it.
- **Replay and publish check.** Each journal target records the sha256 of the text it replaces, or
  that the file did not exist. A pending journal is used only while every target still holds that
  revision or already the new text, and each target is checked again right before it is published,
  both when a pending journal is replayed and for a fresh change. A target that changed means the
  state changed outside the Engine (a branch switch, a hand edit): the change fails with
  `WORKFLOW_STATE_CONFLICT`, the journal stays pending, and reads fail the same way. The error names
  the local journal file; the owner deletes it by hand to keep the records as they are on disk. A
  conflict found in the middle of publishing also leaves the journal pending, and deleting it then may
  keep a partly applied change; only a concurrent external writer can cause that (F05). This
  narrows, but does not close, the window against a concurrent external writer such as Git between the
  check and the write; full protection needs writer admission (plan 06, F05) through
  [workspace execution claims](../runtime/workspace-execution-claims.md).
- **Stage files.** An atomic write that crashed leaves a `.<record>.<uuid>.tmp` file. Reads skip
  dot-files, and the next change removes only the stage files of known record names
  (`specification.yaml` in `.execution/`, valid Task file names in `.execution/tasks/`); every other
  dot-file is left alone.
- **Other files among the Tasks.** In `.execution/tasks/`, only names that end in `.yaml` and do not
  start with a dot are Task records. Every other name (`.gitkeep`, `Thumbs.db`, `desktop.ini`, swap and
  `.orig` files) is ignored. A record whose name is not a valid Task id fails closed with
  `WORKFLOW_STATE_CORRUPT`.
- **Serialization.** All mutations, `inspectExecution` and `rememberArchetypeModel` run inside
  `withProjectControlLock`.
- **Per-Task files.** Each Task has its own file, so parallel Task worktrees can later merge without
  conflicts (follow-up F08).

### Commits of the execution state

Owner decision (2026-11-12, it replaces the earlier "the execution store does not commit" rule): the
store's writes (`.execution/**` and `tasks/**`: index, manifests, the initial `task.md`, run records,
removals) made by owner, UI or CLI operations are committed like a change of the Specification's
documents ([documents layer](../runtime/specification-documents.md#commits-of-workflow-state)).

- **Admission and record.** The filesystem store takes an `ExecutionStateCommits` port
  (`state/store.ts`; production `specs/documents/write/execution-state.ts`, wired in
  `composition.ts`). Under the control lock it admits the change with its paths before the journal
  is written (a refusal of the commit policy writes nothing), then records the published files in the
  same lock section, before the journal is removed, as one document operation of action `workflow`.
  The journal fixes the operation id, summary and each target's `pre` first, and the record is
  idempotent by that id, so a change finished after a stop is recorded exactly once with its
  original `pre`. Every operation names its change
  (`ExecutionChange.summary`): `create task <id>`, `edit task <id>`, `remove task <id>`,
  `set task <id> <status>`, `start step <step>[ of task <id>] (attempt <n>)`, `finish step ...`,
  `return to step ...`, `abandon the specification`; a pending journal finished by a later change is
  `finish an interrupted workflow change`.
- **Auto-commit on.** The operation is queued and committed by the document queue with its batch
  policy, identity and trailers (`Nevo-Action: workflow`); its subject is
  `spec(workflow): <summary> in <slug>` (`<n> workflow changes` when a batch holds several).
- **Auto-commit off.** The paths go to the uncommitted-changes ledger. Finishing a step ("Next")
  runs the post action `commit-execution-state` (`operations/post-actions.ts`): a manual commit of
  the Specification's ledger entries below `.execution/` and `tasks/` (closed under shared operation
  ids), reported in `FinishStepResult.postActions`. A failed post action does not fail the finish; a
  repeated finish runs it again. The post-action hook is the seam where E6 adds the push of an agent
  step's work (not implemented).
- **Close and Abandon.** Abandon is a workflow change like the others. A Specification Close takes
  whatever execution state of that Specification is still uncommitted (in the ledger, or dirty
  without a record, for example a hand edit) into its archive commit; anything else that is dirty still refuses
  it, naming the paths ([lifecycle](../runtime/specification-lifecycle.md)).

## Extension points

| To add                        | Change                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Task effect                 | Add a value to `WORKFLOW_EFFECTS` (contracts) and a case to `applyTaskEffects`.                                                                                                                                                                                                              |
| A Task status change          | Extend `ALLOWED_DECISIONS` in `tasks/tasks.ts`; the store invariants for statuses live in `state/validate.ts`.                                                                                                                                                                               |
| An attention reason           | A continuation reason: add it to `ATTENTION_REASONS` and give `resolveAgentLaunch` / `resolveContinuation` (or `waitDecision`) the rule that produces it. A state reason: add it to `ATTENTION_ITEM_REASONS` with its action, and derive it in `deriveAttention` or `startBlockerAttention`. |
| A step kind (e.g. gate)       | Add a union member in the contracts schema and in `definitions/model.ts`, then a rule in `workflow-rules.ts` and handling in `progression` and `advance`.                                                                                                                                    |
| A gate type (`command`, …)    | Add a variant to the gate schemas (contracts), a type to `DocumentGate`'s union and an evaluator in `workflow/gates/` (F03); the check points stay.                                                                                                                                          |
| A post action                 | Add it to `operations/post-actions.ts`; post actions run after a finish is recorded (also on a replay).                                                                                                                                                                                      |
| A store                       | Implement the `WorkflowStore` port (`state/store.ts`).                                                                                                                                                                                                                                       |
| A host other than SpecFlow    | Use `@nevo/workflow` directly: keep runs under your own keys, call `decide`, store `nextRun` with your effects.                                                                                                                                                                              |
| A surface (Runtime, CLI, MCP) | Call the operations with `openWorkflow(engine)`. Never reimplement progression.                                                                                                                                                                                                              |
