---
id: architecture.workflow.workflow-definitions-and-gates
type: architecture
title: Workflow definitions, executors and gates
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - editing workflow YAML, task types or agent archetypes
  - modifying entry/exit gates or actor attribution
summary: >-
  Versioned project workflow definitions, human/agent executor trust, entry/exit gates and refusal semantics.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-runs-and-handoffs
  - architecture.workflow.workflow-continuation-and-attention
  - adr.0017-definitions-as-project-data
---

# Workflow definitions and gates

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


### Non-cascading definitions

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


### Whole-workflow validation

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


### Executor admission

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
transition, the continuation is an owner action with the blocker `session-unavailable`, and the
action projection reports the next step's agent option as unavailable with that reason. Nothing
falls back to a fresh Session.


### Idempotent finish

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


### Document and section gates

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

### Gate projection and evaluation

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
