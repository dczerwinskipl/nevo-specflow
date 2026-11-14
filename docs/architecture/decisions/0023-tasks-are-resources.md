---
id: adr.0023-tasks-are-resources
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
  - adr.0022-neutral-workflow-coordinator-and-manual-execution
  - architecture.workflow.workflow-kernel
  - architecture.runtime.specification-documents
  - architecture.runtime.specflow-lifecycle
  - reference.api.task-reads
---

# 0023 — Tasks are resources

## Status

Current. Owner decisions of 2026-11-05 (F20) and of PR #137 (D03, D04, D06, D07, rounds 2–5),
implemented. Amends [ADR 0015](0015-specification-manifest-as-document-registry.md) (a Task has its own
registry) and [ADR 0019](0019-workflow-kernel-and-automatic-continuation.md) decision 9 (where Task
state lives, and that it is committed). Builds on
[ADR 0022](0022-neutral-workflow-coordinator-and-manual-execution.md). Behaviour:
[Workflow kernel, Tasks](../workflow/workflow-kernel.md#tasks). Commands:
[Task reads](../../reference/api/task-reads.md#task-commands).

## Context

- The first kernel kept a Task as one `.execution/tasks/<id>.yaml` record (metadata, status and run),
  created only by a producing step, with no document to work on.
- The owner wants to author Tasks by hand, before or without a running Specification workflow, with
  their own documents, context and dependencies.
- The product is pre-production, so a strict new format replaces the provisional one.

## Decision

1. **Layout and authority.** A Task is the folder `tasks/<id>/` (manifest `task.yaml`, required
   `task.md`, optional documents). `tasks/index.yaml` alone says which Tasks exist. `tasks/` is
   reserved. An inconsistent Task breaks only itself and is never repaired automatically.
2. **Slim run record.** `.execution/tasks/<id>.yaml` holds only the run and is created at the first
   start.
3. **First start validates and pins.** It checks the live Task Type, workflow and policy and pins the
   workflow; an optional `expectedWorkflowRevision` refuses a revision other than the previewed one.
   No creation-time binding or rebind.
4. **The Task Type is immutable.** A Task whose type is no longer allowed is cancelled or removed.
5. **Effective policy.** The Specification run's `taskTypes` snapshot once it started, otherwise the
   archetype's live binding.
6. **No Specification run needed.** Tasks are created, edited, removed and decided without one.
7. **Breakdown scope (D06).** A producing step's finish creates, revises or cancels only the drafts
   that step produced, in any attempt; drafts made by hand are never touched (owner decision, round
   2).
8. **One mutation boundary (D03).** The Specification execution store alone writes the index,
   manifests, the initial `task.md` and run records, in one journaled change per operation. Task
   documents are edited through the Documents capability, mutually exclusive per Task with the store.
9. **Context is input.** A Task's context lists what it needs before it starts, with an Engine-owned
   default. What a Task produces is an exit gate, not context.
10. **Close guard and Abandon (D07).** Close refuses unfinished work and pending writes. Abandon, with a
    required reason, ends every open run and cancels every open Task; it is final and not a bypass.
11. **Workflow state is committed (2026-11-12).** Store writes follow the document commit policy
    ([ADR 0018](0018-engine-commit-policy-and-manual-commit.md)); with auto-commit off a finish commits
    them and Close and Abandon take the rest
    ([Workflow kernel](../workflow/workflow-kernel.md#commits-of-the-execution-state)).

## Consequences

- Tasks can be authored, approved and started before the Specification workflow runs.
- A definition changed between authoring and first start is caught by the start; no binding to
  maintain.
- Close can no longer archive unfinished work; Abandon is the only way to end it undelivered.
- Context resolution for agents and path hints remain open
  ([E6 idea](../../ideas/specflow-engine/reusable-workflow-manual-execution/agent-assisted-execution.md)).

## Rejected

- **Creation-time binding with fingerprints and rebind.** The first start checks directly.
- **Editable Task Type.** It would silently change a Task's workflow.
- **A full-list Breakdown that cancels every unlisted draft.** It deletes manual drafts.
- **A separate journal for Task files.** Two journals are not atomic together.
- **A Close waiver.** Abandon covers ending without delivery.
