---
id: ideas.specflow-engine.plan-06
type: engineering
title: Execution plan 06 — Workflow kernel for Specifications and Tasks
status: draft
scope: specflow
areas: [workflow, runtime, testing]
tags: [execution-plan, workflow, continuation, attention, archetypes]
read_when:
  - continuing the workflow kernel work (follow-ups F01–F09, F11–F20)
  - comparing the legacy nevo workflow engine with this one
  - planning Runtime, CLI or UI work on Specification or Task execution
summary: >
  Analysis of the legacy nevo deterministic workflow (what was reused and what was rewritten), a short
  note on what is implemented, and the open follow-ups with their design constraints, so each can be
  picked up independently.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.deterministic-workflow
  - adr.0019-workflow-kernel-and-automatic-continuation
  - ideas.specflow-engine.plan-03
  - ideas.specflow-engine.plan-05
  - architecture.runtime.workspace-execution-claims
  - ideas.specflow-engine.workflow-api-requirements
  - ideas.specflow-engine.task-resource-and-context
---

# Plan 06 — Workflow kernel

Normative behaviour is in [Workflow kernel](../../../../architecture/workflow/workflow-kernel.md), and
the decisions are in [ADR 0019](../../../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md).
This plan records the legacy analysis and the open follow-ups.

## 1. Legacy analysis: what was taken over and what was written anew

The legacy engine lives in `D:\repos\git\nevo\tools\specs\workflow` (plain `.mjs`, JSDoc). Its best
single reference is `docs/development/workflow-engine.md`, with ADR-0005/0006/0009–0012. No legacy
code was copied: the language and the infrastructure differ. Models and rules were ported.

| Legacy                                                                                                                                                | Here                                                                                        | Decision                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| YAML workflow (`steps`, `executor`, result transitions `pass/fail/blocked`, `continuation`, `execution.session`), hand-written fail-closed validation | Kind `workflow` (TypeBox file schema in contracts, `workflow-rules.ts`)                     | **Model taken over**, results are free ids, rules kept   |
| `step-runner` / `resolveWorkflowPosition` (derived status, monotonic `current_attempt`, history)                                                      | `progression/progression.ts` (`not-started / active / ready / terminal`, attempts per step) | **Semantics taken over**                                 |
| Start only advances, finish never starts the next step                                                                                                | Same; one documented exception: entering a wait step                                        | **Taken over**                                           |
| `previousTransition` handoff (feedback, artifacts from history)                                                                                       | `handoffOf` + owner return feedback                                                         | **Taken over, extended** with returns                    |
| Finish saga with durable stage records (`operation-record.mjs`)                                                                                       | One `ExecutionChange` through a per-Specification journal (`filesystem-store.ts`)           | **Pattern taken over, simplified** (no Git stages yet)   |
| `reconcileContinuation` rules (auto vs owner-action, no admission for barriers)                                                                       | `continuation/resolve.ts` (pure)                                                            | **Rules rewritten as a pure function**                   |
| Execution policy per spec (`roles` > `taskOverrides` > `default`)                                                                                     | Agent archetype definitions (preferred provider + model per provider)                       | **Rewritten**                                            |
| `change.workflow.definition` for every Task of a change                                                                                               | Task type per Task, Specification archetype restricts types                                 | **Rewritten**                                            |
| `change.yaml` as main state                                                                                                                           | `.execution/specification.yaml` + `.execution/tasks/<id>.yaml`                              | **Rewritten**, per-Task files                            |
| Spec-level workflow                                                                                                                                   | Did not exist                                                                               | **New** (requirements → … → wait for Tasks → acceptance) |
| Returns from any position, Task status decisions                                                                                                      | Did not exist (only `fail` loops)                                                           | **New**                                                  |
| Attention for missing model/provider                                                                                                                  | Did not exist (turn-level `requiresAttention` only)                                         | **New**                                                  |
| Gates (`command/markdown/human`), `inspect` vs `verify`                                                                                               | Not yet                                                                                     | **To port** (F03)                                        |
| Commit/push finalize, clean-worktree precondition                                                                                                     | Not yet                                                                                     | **To redesign** on Engine-owned commits (F04)            |
| CLI `workflow step start/finish --input-file`                                                                                                         | Not yet                                                                                     | **To port** (F02)                                        |
| Batch reservations, sequential continuation, remediation (~3 000 lines)                                                                               | Not taken                                                                                   | **Deferred** (F12); simplify before porting              |
| Workspace writer locks with PID liveness                                                                                                              | Already replaced by Engine control lock + durable claims (`src/execution`)                  | **Use existing** (F05)                                   |

## 2. Implemented

The kernel is implemented in the Engine (`packages/specflow-engine/src/workflow/`): the definition
kinds and seeds, the progression state machine, Tasks with their lifecycle (status, decisions,
approval, escalation, the draft and escalation guard, wait-step triggers), the continuation
resolver with derived attention, the operations, and the filesystem store with its journal. Its
current behaviour is documented in `architecture.workflow.workflow-kernel`; the decisions are in
ADR 0019. No Runtime, CLI or UI surface calls it yet (F01, F02, F09).

## 3. Follow-ups

Each follow-up is independent unless it says otherwise. All of them reuse the operations; none adds
a second progression algorithm.

### F01 — Runtime continuation orchestrator

- **Goal:** turn a `continue` decision into a Session.
  - `launch.session.mode = reuse`: a new Turn in that Session, with model `launch.model`.
  - `fresh`: a new Session with the archetype profile.
  - The Session calls `start…Execution` with the trusted executor, then sends the step context as the
    prompt.
- **Durability:** a `continue` decision is recomputable from state. The run is `ready`, the last
  attempt's outcome is an `auto` transition, and the finishing executor is stored on that attempt
  (`finishedBy`). On boot, the orchestrator scans `ready` subjects and re-derives the decision with
  `resolveContinuation`, so no extra record is needed.
- **Guard:** one launch per `(subject, step, attempt+1)`, recorded as a durable intent before
  dispatch. This reuses the Session idempotency keys.
- **Tasks:** the orchestrator never starts a Task, or records attention for it, just because it is
  ready. Running Tasks is F12.
- Touches `packages/specflow-runtime/src/features/` (new `workflow` feature) and
  `sessions/lifecycle/coordinator.ts`.

### F02 — Agent completion signal (CLI + MCP)

- **CLI:** `nevo-specflow workflow inspect|start|finish --input-file result.json --json`, offline, over
  the same operations (see `ideas.specflow-engine.offline-cli-and-external-agents`).
- **MCP:** a product MCP tool `workflow_finish` for managed Sessions. Today Claude and Codex start with
  empty MCP config.
- **Executor identity** comes from the Runtime (environment / Session binding), never from tool
  arguments.
- **Response:** the agent gets "accepted" plus the continuation summary, never the attention internals.

### F03 — Gates

- **Gate kinds:** command gates (tests, build, Task verification commands) and a human verification
  gate.
- **Model:** port the legacy `inspect()` / `verify()` split. Gate failure taxonomy: `failed` is
  recorded, `blocked` is an infrastructure problem.
- **Evidence** is scoped to the attempt. `planFinish` refuses before any change while a gate is not
  satisfied.

### F04 — Commits of execution state and finalize actions

- Commit `.execution/**` with the Engine-owned commit queue (ADR 0013/0016/0018). An optional
  per-step `finalize: [commit, push]` follows the legacy semantics.
- The finish journal gains stages after the record writes, for example commit and push with stored
  intent. This replaces the legacy staged saga.

### F05 — Workspace admission for writable steps

The store re-checks every target right before it publishes, which narrows but does not close the
window in which a concurrent external writer (Git: checkout, pull, merge) changes a record between
the check and the write. Writer admission closes it.

- An agent step that writes calls `admitWorkspaceExecution` before dispatch and settles it after the
  Turn (`src/execution`, see `architecture.runtime.workspace-execution-claims`; managed Turns already
  do this). Read-only steps (review) skip the writer claim only when the provider enforces
  read-only.
- Plan 03 T05/T06 define the recovery.
- **Acceptance criteria:**
  - a writable step admits a workspace execution claim before it is dispatched and settles the claim
    after it ends (finish, return or failure);
  - an external Git writer that runs while a journal is pending is either excluded by the claim or
    detected and refused (`WORKFLOW_STATE_CONFLICT`); a record is never overwritten with a change
    planned against another revision;
  - tests run a competing writer process against a pending journal and prove both outcomes.

### F06 — Revising and cancelling Tasks

- Revising draft Tasks and cancelling Tasks are done. Still open: revising a `ready` Task that
  never started (today it is cancelled and replaced by a new Task), and editing the dependencies of
  Tasks that are not drafts.
- A wait step that has only abandoned or cancelled Tasks still completes. Define the acceptance semantics when
  Tasks were abandoned: whether acceptance warns, lists them, or requires an owner confirmation
  (review R12 of PR #120).

### F07 — Re-pinning and definition snapshots

- `repinRun(subject)`: adopt the current definition when the active or ready step still exists with
  compatible transitions.
- Optionally keep resolved definition snapshots by revision under local state, so an old run keeps
  working after an edit on the same machine.

### F08 — Parallel Tasks in separate worktrees

- One Task per worktree. The per-Task files avoid merge conflicts.
- Spec returns must reach other worktrees: blocks are written in the Specification's checkout, and Task
  worktrees read the Specification state from there, or the block is propagated through the workspace
  registry.
- Claims per Task instead of `project-write:` for the whole project.

### F09 — Runtime projection, API and UI

- Read projection: Task reads stop returning `not_implemented`, and attention feeds the overview and
  workspace attention.
- Commands: start, finish (human), return and remember-model.
- UI: a quick start screen prefilled with `suggestion` / `blocker`, and a "remember" checkbox that
  calls `rememberArchetypeModel`.
- See the [draft API requirements](../../workflow-api-requirements.md).

### F11 — Catalogue caching and definition tooling

- `openWorkflow` loads definitions on every call; reuse the catalogue memo of `catalogue-source.ts`
  for execution kinds.
- Check `definitions list/show/validate` output and messages for the new kinds.

### F12 — Run selected Tasks

- **Goal:** the owner selects Tasks and presses "run". The Runtime orchestrator (F01) runs that
  selection with agents in dependency order, through `startTaskExecution` and the same continuation
  decisions, and records attention only when the run cannot proceed (a blocker, a human step, a
  blocked or abandoned dependency).
- Tasks are never started, and get no attention item, merely because they are ready.
- **Batches:** the legacy `reviewTogether` and `batchContinuation` modes are redesigned as part of
  this, not ported (no legacy saga).
- **Open owner decision:** whether a selection may run Tasks in parallel, and how many.

### F13 — Stopping a Session on return

A return ends the active attempt as `returned`; the Runtime must cancel a Session still working on it
and ignore a late finish (already rejected as `WORKFLOW_ATTEMPT_MISMATCH`).

### F14 — Specification status from the workflow

`specification.yaml` `status` is a free string today. Project the Specification run position into
the overview status instead of storing a second status.

### F15 — Model availability

Validate archetype models against the Runtime's `ProviderDescriptor` models. An unknown or disabled
model becomes attention reason `model-unavailable`, and a disabled provider becomes
`provider-unavailable`.

### F16 — Idempotent finish retry

When a finish was planned but the store failed while publishing it (an I/O error after the journal
was written), the caller does not know whether the finish happened. A retry of the same finish then
fails with `WORKFLOW_POSITION_INVALID` or `WORKFLOW_ATTEMPT_MISMATCH`, because the journal replay
already completed the attempt. A retry of exactly the attempt that is already finished, with the same
input, should instead return the recorded result (transition, position and continuation decision)
without changing anything. The check compares the attempt's stored outcome with the request; a
different input for a finished attempt stays a mismatch.

- **Acceptance criteria:**
  - a repeated finish of the same attempt with the same input, after a publish that failed, returns
    the recorded result instead of `WORKFLOW_ATTEMPT_MISMATCH`, and changes nothing;
  - a repeated finish of that attempt with a different input is refused;
  - tests inject a failure after the journal is written and retry the finish.

### F17 — Owner takeover of an agent step (explicit operation)

Today only an executor of the step's kind can start or finish it, and an active agent attempt started
in a Session is resumed and finished only by that Session (`WORKFLOW_EXECUTOR_NOT_ALLOWED`). If the owner should be
able to take over an agent step (for example after the Session died), that is an explicit operation
that records the takeover, ends or transfers the agent attempt, and lets the Runtime stop the Session
(see F13). It is never a plain human finish of an agent step.

### F18 — Register workflow definition kinds from a composition root

`specs/definitions/kinds/index.ts` imports `workflow/definitions/kinds` to register `workflow`,
`agent-archetype` and `task-type` in the default registry, so the generic definitions module depends
on the workflow module. Register the workflow kinds from a composition root instead, keeping the
definitions module independent of the workflow capability.

### F19 — Bound run history so a long run cannot reach the record byte budget

A run's attempts and returns are stored in its record, which is bounded to `RECORD_BYTES_MAX`. Each
attempt may carry up to 16 384 characters of feedback and 100 artifacts, so a long run with many
returns can grow its record over the budget. The change is then refused when it is serialized
(`WORKFLOW_INPUT_INVALID`) and the run cannot progress. Bound the history instead (for example by
moving the feedback of ended attempts out of the record, or capping what an ended attempt keeps), so
that no sequence of valid operations reaches the budget.

- **Acceptance criteria:**
  - a run with the maximum number of attempts, each with maximal input, still serializes within
    `RECORD_BYTES_MAX`;
  - the handoff of the latest attempt is unchanged.

### F20 — Task resource, lifecycle and context

The Task record of this kernel is provisional. `.execution/tasks/<id>.yaml` holds the Task's metadata
(title, summary, type, dependencies, status) together with its run, and a Task has no document to work
on. The Task lifecycle (status, explicit decisions, approval, escalation) is done in this storage;
F20 now covers only the storage and the context.

- **Goal:** one workflow-managed subject contract for Specifications and Tasks; one folder per Task
  (`tasks/<id>/task.yaml`, `task.md`, extra files) with an ordered Task index (`tasks/index.yaml`);
  an explicit typed context list per subject.
- The Task execution record then keeps only the run, the status and the Task metadata move to
  `task.yaml`, and `materializeTasks` writes Task folders and index entries. A follow-up ADR amends
  ADR 0015 and ADR 0019.
- The owner decided every open question (2026-11-05). The preparation status stays Task-only, the
  Specification reports only completed / ready to merge from its run (F14). A started Task whose
  folder is deleted by hand breaks only that Task.
- Options, decisions and slices:
  [Tasks as workflow-managed resources, and context building](../../task-resource-and-context.md).

## 4. What is missing (summary)

Runtime orchestration (F01), the agent completion transport (F02), gates (F03), commits (F04),
writer admission (F05), revising ready Tasks and acceptance after cancelled Tasks (F06), re-pinning (F07), parallel worktrees (F08),
API and UI (F09), caching (F11), running selected Tasks (F12), Session cancel on
return (F13), status projection (F14), model availability (F15), idempotent finish retries (F16), owner
takeover of an agent step (F17), kind registration from a composition root (F18), a bounded run
history (F19), and the Task resource (folders, index, `task.md`) and context, which replaces the
provisional Task record (F20).
