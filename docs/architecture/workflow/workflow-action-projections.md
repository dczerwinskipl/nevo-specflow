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
[OpenAPI](../../reference/api/openapi.md) under the `Workflow` tag.

## Owner actor and read boundary

- **Actor:** HTTP actions are human-owner operations. Runtime derives actor/trust from authenticated or trusted-local `request.authz`; never accept actor, executor or trust from request bodies. Managed agents use a separate authorized path.
- **Capabilities:** `spec.view` for projections; `spec.manage` for start/finish/return/reevaluate; `spec.close-specification` for Abandon. Check trusted Specification scope before reading bodies (max 64 KiB). Responses: `Cache-Control: no-store`.
- **Runtime:** demo uses the same Engine rules in memory (ADR 0025); missing Engine returns `503 WORKFLOW_UNAVAILABLE`.
- **Authority:** `GET .../workflow/actions` is definitive. Clients render available typed actions and never infer choices from file presence, history, labels or message text. `kind`/`reason`/`code` are stable; explanatory strings are not.

## Position, outline and next-step certainty

### Run position and next-step certainty

- **Projection:** subject, pinned workflow (or start candidate), `not-started`/`ready`/`active`/`waiting`/`blocked`/`terminal` position, last handoff, allowed actions and terminal abandonment attribution.
- **Outline:** `stepCount` and 1-based step positions follow the **definition**, not runtime progress; runs can branch or loop.
- **Certainty:** `current` is absent before start/after terminal. `next` exists only if all possible transitions reach the same step; before start it is the entry. `tasksStep` is the first certainly reachable `produces:tasks` step without branch/terminal edge.

### Action availability and Task types

- Task edit/remove/status/approval and Specification `createTask`/`exit` are typed `allowed` or `unavailable`. Once Specification ends, Create/Edit/Remove are `specification-ended`; mutations refuse `WORKFLOW_SPECIFICATION_ENDED`.
- `specification.taskTypes` lists allowed Task types in effective order: pinned workflow policy after start, otherwise archetype binding. Each type lists declared Task workflow steps. Exclude unresolved/invalid workflow types; the client offers no others.

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

### Document relations

- Project `documentRelations` only for one Specification or Task with resolved, unchanged workflow, not multi-Task lists.
- Relate active exit gates and certain next-step entry gates as `needed-to-finish`, `needed-to-start` or `used` with `blocksNow`. Only unmet exit gates shared by **every** result block finish; conditional gates do not. Next-step entry gates block only without an active step.
- A missing section points to the closest registered document; a missing file points to registered documents of that type, or none. Consolidate duplicate relations by strongest, preferring active step. Terminal runs have none. UI does not infer relations from text.

### Terminal Task blockers

A completed transition reports `unavailable:tasks-open` while Tasks remain. `openTasks` lists stable causes. `resolvableByFinish:true` / `closableTasks` appear only if this finish's `tasks`/`taskDecisions` close **all** blockers. `documentChangePending` identifies Tasks held by queued writes; an active/broken Task cannot be silently cancelled.

## Task context and dependency authoring

- **Scope:** `taskAuthoring` appears only for one non-broken Task. Engine `context` entries are `resolved`, `unresolved` or `awaited`; `artifact:true` marks an expected process artifact.
- **Default:** without explicit context, require `task.md`, other Task documents and registered Specification overview. `defaultEntries` is Engine's read-time default; `context:null` resets to it, not to UI-calculated rules.
- **Dependencies:** `dependencyCandidates` gives ordered Tasks and `dependency`/`would-create-cycle`/`cancelled`/`broken` refusals. Empty when editing is unavailable; UI never approximates graph checks.

## Start, finish, return, wait and Abandon

### Start and pinned revisions

- First Task start should send the `expectedWorkflowRevision` confirmed by the
  projection. Changed definitions refuse `409 WORKFLOW_DEFINITION_CHANGED`.
  A pin preview shows all declared steps and their possible next steps so an
  owner can explain what changed after a stale confirmation.

### Finish attempts and idempotency

- Finish names **step and attempt**; a stale attempt refuses
  `409 WORKFLOW_ATTEMPT_MISMATCH`. Repeating the **same successful finish**
  returns the recorded result with `replayed:true`, without rerunning the
  transition. A different finish for that same attempt is a conflict.

### Draft Task proposals and decisions

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

### Post-action outcomes

- `postActions` is a **separate effect outcome**, not part of whether finish
  succeeded. `commit-execution-state` can complete, skip or fail; a failure
  does not undo finish and may be retried on an identical finish request.
  `held` lists user-edited execution paths and every path that travels in the
  same atomic commit operation. The Engine does not commit user-edited files
  by surprise.

### Wait, return and Abandon

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
