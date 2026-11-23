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
  - architecture.workflow.workflow-agent-attempts
---

# Owner workflow action projections

The Engine owns workflow definitions, pinned revisions, runs, transitions, gates and Task effects
(see [workflow kernel](workflow-kernel.md)). The HTTP transport is described in generated
[OpenAPI](../../reference/api/openapi.md) under the `Workflow` tag.

## Owner actor and read boundary

- **Actor:** HTTP actions are human-owner operations. Runtime derives actor/trust from authenticated or trusted-local `request.authz`; never accept actor, executor or trust from request bodies. Managed agents use a separate authorized path: the agent broker with the Turn's capability ([agent step execution](../runtime/agent-step-execution.md)).
- **Capabilities:** `spec.view` for projections, history and `agent-execution/check`; `spec.manage` for start/finish/return/reevaluate, `agent-execution` (run, Continue, stop, take-over), confirm/reject and `attempt-commit/retry`; `spec.close-specification` for Abandon. Check trusted Specification scope before reading bodies (max 64 KiB). Responses: `Cache-Control: no-store`.
- **Runtime:** demo uses the same Engine rules in memory (ADR 0025); missing Engine returns `503 WORKFLOW_UNAVAILABLE`.
- **Authority:** `GET .../workflow/actions` is definitive. Clients render available typed actions and never infer choices from file presence, history, labels or message text. `kind`/`reason`/`code` are stable; explanatory strings are not.

## Position, outline and next-step certainty

### Run position and next-step certainty

- **Projection:** subject, pinned workflow (or start candidate), `not-started`/`ready`/`active`/`waiting`/`blocked`/`terminal` position, last handoff, allowed actions and terminal abandonment attribution.
- **Outline:** `stepCount` and 1-based step positions follow the **definition**, not runtime progress; runs can branch or loop.
- **Certainty:** `current` is absent before start/after terminal. `next` exists only if all possible transitions reach the same step; before start it is the entry. `tasksStep` is the first certainly reachable `produces:tasks` step without branch/terminal edge.

### Agent option, agent attempt and project hold

- **Agent option.** A step the owner may do has `human: true`; `agent` states whether an agent could do it, and nothing is dispatched by reading it: `available` with the `launch` the workflow resolves (`{archetype, provider, model, effort?, session: fresh | reuse+sessionId}`), `independent: true` for an independent archetype (always a fresh Session) and `baseline: unchecked` (the projection runs no Git; `agent-execution/check` judges the checkout), or `unavailable` with a `reason`: `not-an-executor`, `archetype-missing`, `provider-not-chosen`, `model-missing`, `session-unavailable` (the definitions), `demo`, `provider-not-ready`, `project-busy`, `dirty-baseline`, `baseline-changed` (the Runtime; `paths` and `count` name the files), with an optional `detail` and the `launch` that would run once resolved.
- **Agent attempt.** While the active attempt is an agent's, the projection carries `agentAttempt`: `{attemptId, step, attempt, sessionId, provider, model?, turn, turns, proposal?, continue, returnRequest?, takeOver, work}`.
  - `turn.state` is `working`, `stopping` (stopped, its process not yet proven ended), `unknown` (every project write is blocked until it is known), `ended` or `session-missing` (the fresh Session was never created: Continue creates it).
  - `proposal` is `{transition, state: pending | refused | finalized, submittedAt, refusal?: {code, message, paths?}}`; `continue` is an agent option (Continue possible now, or why not); `returnRequest` (`requested` with `stop: sent | failed` and `appliesOn: next-action` once no Turn runs, or `refused`) and `takeOver` (`available`, or `unavailable`: `agent-working`, `outcome-unknown`, `return-requested`).
  - `work` is what the attempt left, never rolled back: `documents` (uncommitted SpecFlow files only it wrote), `mixed` (those someone else changed too), `tasks` (its drafts), `declared` (its declared code paths), `changed` (dirty when its last Turn ended) and `commit {state: none | pending | committed | failed, code?, runs?, sha?, documents?, files?}`: once `committed`, its `sha` (absent when every path already equalled HEAD), how many of its paths SpecFlow wrote (`documents`) and how many are the agent's declared files (`files`). The workflow history serves the same `work`.
- **Project hold.** While an agent working on another subject holds the whole project (its Turn's execution claim is unsettled), every projection carries `projectHold`: `{kind: agent-working | agent-outcome-unknown, subject: {specId, taskId?, title}, sessionId}`; `agent-outcome-unknown` means SpecFlow cannot tell whether that agent's process still runs. It is absent for the holder's own subject, and read without Git (the execution claims and the attempt's journal).

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

### Agent step execution and results

- **Run with agent** (`POST .../agent-execution`, `{requestId, expected: {step, attempt?}, provider?, model?, effort?, message?}`): without `expected.attempt` a new agent attempt of the step the owner was shown; with it (Continue) a new Turn of that active agent attempt in its own Session. `provider`, `model` and `effort` choose the agent of a fresh Session only (naming them for a continued Session is `WORKFLOW_INPUT_INVALID`); `message` is the owner's note after the brief. It answers `started | continued` with the attempt, Session and Turn; the same `requestId` again returns the same attempt and Turn and completes what a failure left out. Every refusal that can be known comes before anything exists: `WORKFLOW_AGENT_UNAVAILABLE` with `details.agent` (a Session refusal on the way is mapped to `provider-not-ready`, `project-busy` or `session-unavailable`), `WORKFLOW_ATTEMPT_MISMATCH` for a stale position, `WORKFLOW_DIRTY_BASELINE`, `WORKFLOW_BASELINE_CHANGED`. `GET .../check` answers the position and the agent option with the same reasons, the checkout's baseline included. Without an Engine (the demo) these routes answer 503 `WORKFLOW_UNAVAILABLE`.
- **Stop** (`{requestId, attemptId}`) cancels the Turn; the step stays locked until the process is proven ended. **Take over** (`{step, attempt}`) ends the agent attempt `taken-over` and starts the owner's attempt; while the agent may still run `WORKFLOW_SPECIFICATION_BUSY`, while a return waits `WORKFLOW_POSITION_INVALID`. Take over commits nothing.
- **Return during an agent attempt (D19).** When an agent Turn of the active attempt may still run, `return` answers `kind: return-requested` (with the attempt, Turn and `stop?: sent | failed`): the return is recorded, the Runtime stopped the Turn (`failed`: stop it again), and it applies once the process is proven stopped (a late proposal is then `WORKFLOW_ATTEMPT_MISMATCH`). Otherwise it returns now (`kind: returned`).
- **Owner confirmation (D17).** An agent result that takes a decision only the owner takes (an owner-authority effect such as `approve-draft-tasks`, a transition marked `confirmation: owner`, or `taskDecisions`) leaves the run `awaiting-confirmation` (projection with the agent's `proposal`, `confirms` and `confirmsDigest`; `actions.confirm` / `actions.reject`; attention item `awaiting-confirmation` offers `confirm-result` and `reject-result`). The agent's drafts are written and its attempt commit ran; nothing else applies until Confirm.
  - `confirm` (`{requestId, step, attempt, confirmsDigest}`) applies the transition, the Task decisions and the effects with the owner as actor, judged again by every finish rule, as an ordinary owner write (`postActions`: `commit-execution-state`). A digest that no longer matches (a draft added, removed or edited, its `task.md` included) is `WORKFLOW_CONFIRMATION_CHANGED`; with Git on, while the attempt's own commit has not run or failed, `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` (`actions.confirm.unavailable` says which, with the failed commit's `code`): retry the attempt commit first.
  - `reject` (`{requestId, step, attempt, feedback}`, feedback required) makes the step ready again with the feedback as its handoff (`kind: return`); the agent's work stays committed.
  - The same `requestId` again is replayed; a confirm or reject of an attempt another request decided is `WORKFLOW_ATTEMPT_MISMATCH`, one with nothing waiting `WORKFLOW_POSITION_INVALID`. While a result waits, start, finish and return are `WORKFLOW_POSITION_INVALID`. An agent finish outside an agent attempt that takes such a decision is `WORKFLOW_OWNER_DECISION_REQUIRED`.
- **Retry commit** (`attempt-commit/retry`, `{step, attempt}`) answers `postActions` (`attempt-commit`: `completed` with `commit {sha?, paths}`, `skipped` with a reason, or `failed` with `ATTEMPT_COMMIT_MIXED_AUTHORS`, `ATTEMPT_COMMIT_UNATTRIBUTABLE`, `MANUAL_COMMIT_CONFLICT` or another commit code). For a confirmed attempt whose commit did not fail it runs the confirmation's owner commit again. Not a finished agent attempt: `WORKFLOW_ATTEMPT_MISMATCH`; its commit did not fail: `WORKFLOW_POSITION_INVALID`.
- **History** (`GET .../history`) lists `attempt` and `return` items newest first (at most 200, `truncated?`); an agent attempt adds `agent` with its provider, Session, Turns, how it ended, proposal, return request, step `events` (`started`, `turn-started`, `turn-ended`, `proposal-refused`, `return-requested`, `returned`, `finished`, `committed`, `commit-failed`, `taken-over`, `abandoned`, `awaiting-confirmation`, `confirmed`, `rejected`) and `work`.

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
  `WORKFLOW_SPECIFICATION_BUSY` carries `details.cause` (`agent-turn` and `agent-turn-unknown` with
  `details.sessionId`: an agent Turn holds the project-wide write claim, or ended without a verified
  outcome; `claim-not-held`; `close`; `write-in-progress`; the commit admission's causes). The
  attribution codes (`WORKFLOW_DIRTY_BASELINE` ... `WORKFLOW_NESTED_REPOSITORY`) carry
  `details.attribution` `{paths, count, undeclared?, unchanged?, remedies?, incomplete?}`: the first
  paths of `count`; for `WORKFLOW_UNDECLARED_CHANGES` the undeclared and the declared-but-unchanged
  files; for `WORKFLOW_UNREGISTERED_DOCUMENTS` the remedies (`classify`, `delete`, `restore`);
  `incomplete` when the checkout could not be read in full, so nothing was attributed.
- Client-visible 404, 409, 422 and 503 codes and error bodies live in
  generated OpenAPI and the `WorkflowErrorSchema`; `CONTROL_LOCK_BUSY`
  is retryable with `Retry-After`, other lock-corruption/ownership errors
  are not blindly retried. This same contract is used by Task commands.
- `specification.exit.close` describes **workflow** readiness only; a successful
  workflow gate does not guarantee Git Close will succeed. The Close preview
  and mutation can additionally refuse repository, pending document commits
  or occupied worktrees ([Close admission](../runtime/specification-close-admission.md)).
