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
  - adr.0023-tasks-are-resources
  - adr.0022-neutral-workflow-coordinator-and-manual-execution
  - ideas.specflow-engine.reusable-workflow.agent-execution
---

# Plan 06 — Workflow kernel

Normative behaviour is in [Workflow kernel](../../../../architecture/workflow/workflow-kernel.md), and
the decisions are in [ADR 0019](../../../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md),
[ADR 0023](../../../../architecture/decisions/0023-tasks-are-resources.md) and
[ADR 0022](../../../../architecture/decisions/0022-neutral-workflow-coordinator-and-manual-execution.md).
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

The neutral core is `@nevo/workflow` (`packages/workflow/`); the SpecFlow adapter is in the Engine
(`packages/specflow-engine/src/workflow/`) with the Task resource in `src/tasks/resource/`: definition
kinds and seeds, the coordinator, Tasks as resources with their lifecycle, the continuation resolver
with derived attention, document gates, the operations and the filesystem store with its journal and
commits. PR #137 added manual execution end to end: Task and workflow commands over HTTP (Runtime
`features/tasks`, `features/workflow`) and the offline CLI (`tasks`, `workflow`), and the UI (Task
authoring, the Now block, the Overview control center and the Tasks page). Behaviour:
`architecture.workflow.workflow-kernel`.

Status of the follow-ups below: **done** F04 (commits; the agent push is E6), F16, F18, F20 (storage
and context authoring; context resolution for agents is E6); **partly done** F02 (CLI; MCP open), F03
(`document` gates; `command` and `human` open), F06, F09 (manual commands and UI; the quick screen and
"remember" are open); **deferred** F12; **open** F01, F05, F07, F08, F11, F13, F14, F15, F17, F19.

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

**Partly done.** The offline CLI `nevo-specflow workflow actions|start|finish|return` exists (owner
actor `local:<os-user>`); the MCP tool and an agent actor from a Session binding are open (E6).

- **CLI:** `nevo-specflow workflow inspect|start|finish --input-file result.json --json`, offline, over
  the same operations (see `ideas.specflow-engine.offline-cli-and-external-agents`).
- **MCP:** a product MCP tool `workflow_finish` for managed Sessions. Today Claude and Codex start with
  empty MCP config.
- **Executor identity** comes from the Runtime (environment / Session binding), never from tool
  arguments.
- **Response:** the agent gets "accepted" plus the continuation summary, never the attention internals.

### F03 — Gates

**Partly done.** Step-level `entryGates` / `exitGates` with `when` and the gate type `document` are
implemented (workflow kernel, "Gates"). Open: the `command` and `human` gate types on the same model.

- **Gate kinds:** command gates (tests, build, Task verification commands) and a human verification
  gate.
- **Model:** port the legacy `inspect()` / `verify()` split. Gate failure taxonomy: `failed` is
  recorded, `blocked` is an infrastructure problem.
- **Evidence** is scoped to the attempt. `planFinish` refuses before any change while a gate is not
  satisfied.

### F04 — Commits of execution state and finalize actions

**Done** (owner decision 2026-11-12): store writes are committed through the document commit policy,
queue and ledger; with auto-commit off a finish runs the post action `commit-execution-state`; Close
and Abandon take what is left. Open: the push of an agent step's work through the same post-action
seam (E6).

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

- Done: revising drafts, cancelling, and editing title, summary, context and (until the first start)
  dependencies of any Task (`editTask`). The Task Type is immutable by owner decision.
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

**Partly done.** Reads, attention, the manual commands (start, finish, return, Task commands,
abandon) and the UI exist. Open: the quick start screen with `suggestion` / `blocker` and the
"remember" checkbox (`rememberArchetypeModel`).

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

**Deferred** (owner decision 6A, 2026-11-13): the Tasks page has no selection or bulk actions.

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

**Done:** the attempt stores the request digest; a repeated finish of the last finished attempt with the
same digest and actor returns the recorded result and completes a pending journal
(`architecture.workflow.workflow-kernel`, "Executors and actors"). The analysis below is history.

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

**Open.** Today a step allows a person when its `executors` include `human`, but an active attempt is
continued only by the class that started it, and an active agent attempt started
in a Session is resumed and finished only by that Session (`WORKFLOW_EXECUTOR_NOT_ALLOWED`). If the owner should be
able to take over an agent step (for example after the Session died), that is an explicit operation
that records the takeover, ends or transfers the agent attempt, and lets the Runtime stop the Session
(see F13). It is never a plain human finish of an agent step.

### F18 — Register workflow definition kinds from a composition root

**Done:** the shipped registry (`src/definitions/shipped-registry.ts`) registers the workflow kinds, so `specs/definitions` no longer imports the workflow capability; the cycle gate (`tools/eslint/check-import-cycles.mjs`) forbids that edge and checks the folders of
`workflow/`.

`specs/definitions/kinds/index.ts` imports `workflow/definitions/kinds` to register `workflow`,
`agent-archetype` and `task-type` in the default registry, so the generic definitions module depends
on the workflow module. Register the workflow kinds from a composition root instead, keeping the
definitions module independent of the workflow capability.

### F19 — Bound run history so a long run cannot reach the record byte budget

**Open.** A prerequisite of typed transition inputs
([E5 idea](../../reusable-workflow-manual-execution/typed-transition-inputs.md)).

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

**Done** ([ADR 0023](../../../../architecture/decisions/0023-tasks-are-resources.md)): Task folders,
the index, `task.md` and Task-scoped documents, the slim run record created at the first start, typed
context authoring with process artifacts, and broken-Task isolation. Open: resolving the context for an
agent (references with digests, budgets, per-attempt evidence) and path hints, part of
[agent-assisted execution](../../reusable-workflow-manual-execution/agent-assisted-execution.md).

## 4. What is missing (summary)

Runtime orchestration (F01), the MCP completion transport (F02), `command` and `human` gates (F03),
writer admission (F05), acceptance after cancelled Tasks (F06), re-pinning (F07), parallel worktrees
(F08), the quick start screen (F09), caching (F11), running selected Tasks (F12, deferred), Session
cancel on return (F13), status projection (F14), model availability (F15), owner takeover of an agent
step (F17) and a bounded run history (F19). Agent delegation of single steps and typed inputs are the
open ideas [E6](../../reusable-workflow-manual-execution/agent-assisted-execution.md) and
[E5](../../reusable-workflow-manual-execution/typed-transition-inputs.md).
