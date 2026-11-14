---
id: adr.0022-tasks-are-resources
type: adr
title: Tasks are resources of their Specification, with their own manifest, documents and context
status: current
date: 2026-11-14
summary: >
  A Task is a resource of its Specification: a folder under the reserved tasks/ folder with a
  manifest (task.yaml), a main document (task.md) and optional documents, listed in tasks/index.yaml,
  which alone says which Tasks exist. A Task exists before any workflow runs; its slim run record is
  created at its first start, which validates the live type and workflow and pins it. The Task Type is
  immutable. One Specification execution store owns every Task resource write; Task documents use the
  Documents capability, mutually exclusive with it. Context lists a Task's inputs. Close refuses
  unfinished work and Abandon ends it for good. Workflow state is committed like documents.
related:
  - adr.0015-specification-manifest-as-document-registry
  - adr.0018-engine-commit-policy-and-manual-commit
  - adr.0019-workflow-kernel-and-automatic-continuation
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - architecture.workflow.workflow-kernel
  - architecture.runtime.specification-documents
  - architecture.runtime.specflow-lifecycle
  - reference.api.task-reads
---

# 0022 — Tasks are resources

## Status

Current. Owner decisions of 2026-11-05 (F20, Q1–Q12) and of PR #137 (D03, D04, D06, D07, rounds 2–5),
implemented. It amends [ADR 0015](0015-specification-manifest-as-document-registry.md) (a Task is a
resource with its own registry, not "not a document") and decision 9 of
[ADR 0019](0019-workflow-kernel-and-automatic-continuation.md) (where Task state lives and that it is
committed). The behaviour is described in
[Workflow kernel](../workflow/workflow-kernel.md#tasks); the Task commands in
[Task reads](../../reference/api/task-reads.md#task-commands).

## Context

- The first kernel kept a Task as one `.execution/tasks/<id>.yaml` record: title, type, dependencies,
  status and run together, listed by the Specification run (`taskIds`). A Task could exist only once
  the Specification workflow ran and a producing step drafted it, and it had no document to work on.
- The owner wants to author Tasks by hand, before or without a running Specification workflow, with
  their own documents, context and dependencies, entirely in the UI.
- The product is pre-production: no stored state needs preserving, so a strict new format replaces the
  provisional one without readers, migrations or fingerprints.

## Decision

1. **Layout and authority.** A Task is the folder `tasks/<id>/` of its Specification: `task.yaml` (the
   manifest: title, summary, type, status and `statusChange`, `dependsOn`, tagged `origin`, the
   document registry `documents[]` and an optional `context[]`), `task.md` (the required `task`
   document) and optional further documents. `tasks/index.yaml` is the only authority for which Tasks
   exist and in which order. `tasks/` is reserved: the Specification's document tree and registry
   exclude it, and `specification.yaml` has no `tasks` field. Inconsistencies are isolated to one Task:
   a dangling index entry (no folder or no `task.yaml`), a run record of an unregistered Task (or of a
   draft, or of a Task cancelled while active) and a run whose position does not follow from its
   history make only that Task broken; an unregistered folder is reported and never executed. Nothing
   is repaired automatically.
2. **Slim run record, created at first start.** `.execution/tasks/<id>.yaml` holds only
   `{specId, taskId, run}`. A Task without one has not started. The Specification run record
   (`.execution/specification.yaml`) holds the archetype, the `taskTypes` snapshot and the run, and no
   Task list.
3. **First start validates and pins.** No creation-time binding, fingerprint or rebind exists. The
   first start checks the live Task Type, its workflow and the effective policy
   (`WORKFLOW_DEFINITION_MISSING`, `WORKFLOW_TASK_TYPE_NOT_ALLOWED`) and pins the workflow it starts.
   A caller may send the revision it previewed (`expectedWorkflowRevision`); a different live revision
   refuses with `WORKFLOW_DEFINITION_CHANGED` and nothing starts.
4. **The Task Type is immutable** after creation. A Task whose type is no longer allowed is cancelled or
   removed and created again.
5. **Effective policy.** The allowed task types are the Specification run's `taskTypes` snapshot once
   it started, otherwise the live execution binding of the Specification's archetype.
6. **Tasks without a Specification run.** Create, edit (title, summary, dependencies until the first
   start, context), remove (never started, no dependents, no pending document change) and status
   decisions work without a Specification run. A status change settles the Specification's wait only
   while that run is active. A manual Task records the owner as its origin.
7. **Breakdown scope (D06).** A producing step's finish lists the complete set of the drafts **that step
   owns** (origin `produced` by the same step, any attempt): it creates, replaces or cancels only those.
   Drafts made by hand or by another step are never touched; listing one refuses the finish. The finish
   action projection offers the step's own drafts as unchanged proposals, so a person finishing the
   step keeps them by sending them back. A kept draft that depends on a draft the same finish cancels
   refuses the finish (`draftConflicts`).
8. **One mutation boundary (D03).** The Specification execution store is the only writer of
   `tasks/index.yaml`, `task.yaml`, the initial `task.md`, Task removals and run records: one change,
   one local journal and compare-and-swap per operation, under the project control lock. Later edits of
   Task documents go through the Documents capability scoped to the Task. The two are mutually exclusive
   per Task: a store change writing a Task's folder is refused (`WORKFLOW_TASK_BUSY`) while a document
   change of that Task is not final, and a document change is refused (`SPEC_BUSY`) while the store has
   a pending change of that Task.
9. **Context is input.** `context[]` lists what a Task needs before it starts (Task, Specification and
   project documents, paths, instructions; each required or optional). Without an explicit list the
   Engine's default applies: `task.md`, the Task's other documents and the Specification overview. A
   required entry that does not resolve refuses the start. A reference may be marked `artifact`
   (produced earlier in the process): missing, it is awaited, not broken, and still refuses the start
   when required. What a Task produces is an exit gate, so a required `artifact` entry naming one of
   the Task's own documents is refused at create and edit.
10. **Close guard and Abandon (D07).** Close refuses while the Specification run has not ended, while a
    Task is draft, on hold, ready and not ended, or broken, and while an execution or Task document
    change is pending. A Specification that never started and has no Tasks closes as before. Abandon
    ("close without realization") is an owner command with a required reason: in one store change the
    Specification run and every open Task run end `abandoned` and every open Task is cancelled. It is
    final, idempotent on retry, and not a bypass: pending writes, broken Tasks and other operations on
    the Specification still refuse it.
11. **Workflow state is committed (owner, 2026-11-12).** Store writes (`.execution/**`, `tasks/**`) made
    by owner, UI and CLI operations are committed like Specification document changes, through the same
    policy, queue and ledger ([ADR 0018](0018-engine-commit-policy-and-manual-commit.md)). With
    auto-commit off, finishing a step runs a post action that commits the Specification's execution
    state; Close and Abandon take what is still uncommitted of it. The post action is the seam where
    agent steps will also push (E6, not implemented).

## Consequences

- A Task can be authored, approved and started before the Specification workflow runs, and a
  Specification without a workflow can still have Tasks.
- Changing a definition between authoring and the first start is caught by the start itself; there is
  no stale binding to maintain.
- Close can no longer archive unfinished work; abandoning is the only way to end it without delivery.
- Context **resolution** for agents (resolved references with digests, budgets, per-attempt evidence)
  and path hints are not implemented; they belong to agent-assisted execution
  ([E6 idea](../../ideas/specflow-engine/reusable-workflow-manual-execution/agent-assisted-execution.md)).

## Rejected

- **Creation-time binding with fingerprints and a rebind command.** It adds state that the first start
  can check directly.
- **Editable Task Type.** It would silently change the workflow of a Task.
- **A full-list Breakdown that cancels every unlisted draft.** It deletes the owner's manual drafts.
- **A separate journal for Task files.** Two journals are not atomic together.
- **A Close waiver.** Abandon covers closing without delivery, recorded and final.
