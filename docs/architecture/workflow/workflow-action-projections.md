---
id: architecture.workflow.action-projections
type: architecture
title: Owner workflow actions and projection semantics
status: current
scope: specflow
areas: [workflow, runtime, ui, security]
tags: [workflow, task, transitions, gates, projection, authorization]
read_when:
  - changing manual owner workflow actions or projections
  - implementing gated Task/Specification completion and replay
  - rendering workflow documents, steps, Tasks and exit blockers in UI
summary: >-
  Workflow action projections are Engine-owned decisions over pinned definitions,
  gates and Task state. Owner commands carry trusted actor identity, deterministic
  attempts, idempotent finish and typed refusals.
related:
  - architecture.workflow.workflow-kernel
  - reference.api.specification-workflow
  - reference.api.specflow-specification-operations
  - architecture.runtime.task-read-composition
  - product.specflow.ui.workflow-execution
---

# Owner workflow action projections

The Engine owns workflow definitions, pinned revisions, runs, transitions, gates and Task effects
(see [workflow kernel](workflow-kernel.md)). The HTTP transport is described in generated
[OpenAPI](../../reference/api/openapi.md) under the `Workflow` tag. This document owns
the **interpretation of an owner action projection** so clients do not reconstruct Engine
decisions from raw Task data or attempt history.

## Owner actor and read boundary

- Every HTTP action is a **human owner** action. The Runtime derives actor identity and
  trust from authenticated/trusted-local `request.authz`; request bodies must never supply
  an actor, executor class or trust level. A managed **agent** attempt uses its separate
  authorized execution path, not these owner endpoints.
- Read projections require `spec.view`; start/finish/return/reevaluate require `spec.manage`;
  Specification Abandon requires `spec.close-specification`. Capabilities are checked at
  the trusted Specification scope **before** reading the request body. Bodies are capped at
  **64 KiB**; responses are `Cache-Control: no-store`. The demo Runtime supplies the same
  Engine rules over in-memory execution state (ADR 0025); without Engine the route responds
  `503 WORKFLOW_UNAVAILABLE`.
- `GET .../workflow/actions` is an **authoritative projection**, not a list of suggested
  actions. Clients render only actions whose availability permits them; they never infer an
  alternative action from history, gate labels, presence of files or error message text.
  Stable `kind`, `reason` and `code` values are machine-readable, while messages,
  purposes and instructions are display-only text.

## Position, outline and next-step certainty

- A projection names the Specification or Task subject, the pinned workflow (or first-start
  candidate), run position (`not-started`, `ready`, `active`, `waiting`,
  `blocked`, `terminal`), the last handoff and allowed start/finish/return options.
  A terminal abandonment includes `abandonment` attribution where recorded.
- For a Specification with a resolvable workflow, the outline's `stepCount` and each
  step's **1-based position** reflect the definition's declared order, **not execution
  progress**. A run can branch or loop. `current` is absent before start and after terminal
  completion. `next` exists only when every transition certainly reaches the same step;
  it is absent if any transition ends the run or several next steps are possible. Before
  first start, it is the entry step. `tasksStep` is the first certain reachable
  `produces:tasks` step along this chain with no branch or terminal edge.
- A Task's effective status/edit/remove/approval actions and a Specification's
  `createTask`/`exit` appear as typed `allowed` or `unavailable` results.
  After the Specification run ends, Task edits/removal and Create Task are unavailable
  with `specification-ended`; the commands refuse `WORKFLOW_SPECIFICATION_ENDED`.
- `specification.taskTypes` is the **effective** allowed Task-type catalogue in order:
  pinned workflow policy after the Specification starts, otherwise the archetype binding.
  Each type includes the work steps of its Task workflow in declared order. Unresolved or
  invalid Task workflow types are absent; clients offer exactly the returned types.

## Gates and document relations

- Entry and exit gates are Engine checks, projected as `GateStatus` with stable type, scope
  and reasons (`no-document`, `file-missing`, `sections-missing`, `unreadable`).
  `requiredSections` is the declared heading list and `scope` points to the
  Specification or Task whose documents were searched. Textual `label` may be
  Engine-derived when `labelDeclared:false`; never parse it for rules.
- A transition's `gates` are evaluated for its result, including `when` conditions.
  `active.exits` are read-only status facts even when an agent owns the attempt.
  `actions.finish.transitions` additionally says what the **human owner** can finish
  now; a result is unavailable with `gate-unsatisfied` when any applicable exit gate
  fails. A next step's unsatisfied entry gates block start. The same gate check runs
  on the mutation, fail-closed.
- `documentRelations` is calculated only for the Specification or **one Task's own**
  projection with a resolved unchanged workflow, not for a multi-Task listing. It
  relates the active step's exit gates and the certainly next step's entry gates
  to documents: `needed-to-finish`, `needed-to-start` or `used`, with
  `blocksNow`. Unmet exit gates that apply to **every result** are needed to finish;
  conditional unmet gates do not falsely block all results. Unmet next-step entry gates
  block only when no step is active (ready/not-started/blocked).
- A gate with a missing section names the closest registered document; one with no
  document file names the registered documents of its type, or nothing if none exist.
  When several gates name one document, retain the strongest relation and prefer
  the active step's gate. Once the run ended, relations are empty. The UI uses these
  structured facts, not a reconstruction from transition text.
- The terminal completed transition is `unavailable:tasks-open` while open Tasks
  remain. It includes stable `openTasks` causes. `resolvableByFinish:true` and
  `closableTasks` are supplied only when this finish's own `tasks` and
  `taskDecisions` can close all remaining Tasks. `documentChangePending` names
  Tasks that a pending document write still blocks; an active/broken Task cannot
  be silently cancelled by a speculative UI result.

## Task context and dependency authoring

- `taskAuthoring` is present for a single non-broken Task projection only, not for
  multi-Task listings. Its `context` is the Engine's effective list, explicit or
  default, with entries `resolved`, `unresolved` or `awaited`. An awaited
  process artifact (`artifact:true`) is expected, not a stale broken reference.
- Without explicit context, the default rule is `task.md`, the Task's other documents
  and the registered Specification overview, each required. `defaultEntries`
  is the read-only default at observation time; editing `context:null` returns
  to that list, not to a default reimplemented in the UI.
- `dependencyCandidates` lists other Tasks in list order and the Engine's
  `dependency`, `would-create-cycle`, `cancelled` or `broken` refusals.
  It is empty once dependency changes are unavailable. The client never validates
  the graph with its own approximation.

## Start, finish, return, wait and Abandon

- First Task start should send the `expectedWorkflowRevision` confirmed by the
  projection. Changed definitions refuse `409 WORKFLOW_DEFINITION_CHANGED`.
  A pin preview shows all declared steps and their possible next steps so an
  owner can explain what changed after a stale confirmation.
- Finish names **step and attempt**; a stale attempt refuses
  `409 WORKFLOW_ATTEMPT_MISMATCH`. Repeating the **same successful finish**
  returns the recorded result with `replayed:true`, without rerunning the
  transition. A different finish for that same attempt is a conflict.
- A step declaring `produces:tasks` receives the **complete set of draft Task
  proposals** that step owns, possibly empty. A retained draft is revised;
  an omitted one is cancelled. Manually created drafts or drafts from another
  step are untouched. Keeping a draft that depends on one cancelled in the
  same finish refuses `WORKFLOW_INPUT_INVALID` with `draftConflicts`.
- A Specification finish may include `taskDecisions` (ready/on-hold/cancelled),
  applied after the draft list and before transition effects. A Task finish may
  **not** send them. One invalid decision fails the entire finish. A terminal
  completion is judged after those decisions, allowing the same finish to
  resolve previously open Tasks when the projection says so.
- `postActions` is a **separate effect outcome**, not part of whether finish
  succeeded. `commit-execution-state` can complete, skip or fail; a failure
  does not undo finish and may be retried on an identical finish request.
  `held` lists user-edited execution paths and every path that travels in the
  same atomic commit operation. The Engine does not commit user-edited files
  by surprise.
- `reevaluate-wait` carries the named `step/attempt` of a waiting
  Specification. It returns `settled` or `already-settled` for the same
  tasks-finished outcome; other stale outcomes conflict. Open/escalated/broken
  Tasks produce `WORKFLOW_TASK_BLOCKED`; corrupt Task records can refuse 503.
- `return` is only to a declared earlier step; optional reason becomes handoff
  feedback. `abandon` is final and requires a reason. A same-reason retry
  replays the outcome but does not bypass pending writes, broken Tasks or
  conflicting operations. Close remains a different operation and also
  checks Git/workspace admission.

## Refusals and authoritative sources

- The Runtime sends typed `WorkflowError`: `error` repeats stable `code`,
  `message` is display-only and `details` contains structured blockers.
  `WORKFLOW_EXIT_BLOCKED` includes blocker groups. `WORKFLOW_TASK_CONTEXT_UNRESOLVED`
  distinguishes unresolved entries and awaited process artifacts.
  `WORKFLOW_GATE_UNSATISFIED` includes entry/exit phase and all failed gates;
  `WORKFLOW_TASKS_OPEN` lists each still-open Task after finish decisions.
- Client-visible 404, 409, 422 and 503 codes and error bodies live in
  generated OpenAPI and the `WorkflowErrorSchema`; `CONTROL_LOCK_BUSY`
  is retryable with `Retry-After`, other lock-corruption/ownership errors
  are not blindly retried. This same contract is used by Task commands.
- `specification.exit.close` describes **workflow** readiness only; a successful
  workflow gate does not guarantee Git Close will succeed. The Close preview
  and mutation can additionally refuse repository, pending document commits
  or occupied worktrees ([Close admission](../runtime/specification-close-admission.md)).
