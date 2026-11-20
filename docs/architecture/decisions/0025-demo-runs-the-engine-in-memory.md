---
id: adr.0025-demo-runs-the-engine-in-memory
type: adr
title: The demo Runtime runs the Engine's workflow in memory
status: current
date: 2026-11-16
summary: >
  The `--demo` Runtime runs the real Engine workflow operations over an in-memory execution store
  seeded through Engine commands, and serves the project routes over it, so the UI shows the same
  Overview Now, Tasks page and Full Task in both modes. In-memory implementations sit behind the
  Engine's existing ports; no demo branch enters Engine logic or the UI. The snapshot-based demo
  Task screen and its sections are removed.
related:
  - adr.0019-workflow-kernel-and-automatic-continuation
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - adr.0024-tasks-are-resources
  - architecture.workflow.workflow-kernel
  - architecture.runtime.task-read-composition
  - engineering.shared.code-organization
  - reference.api.task-reads
  - reference.api.specification-workflow
---

# 0025 — The demo Runtime runs the Engine in memory

## Status

Current. Owner decision of 2026-11-16 (UX round 168). Builds on
[ADR 0024](0024-tasks-are-resources.md) and [ADR 0023](0023-neutral-workflow-coordinator-and-manual-execution.md).

## Context

- The demo Runtime had no Engine: it turned the workflow routes off and served synthetic Task
  reads (a snapshot with human requirements, related resources and recovery, but no Task
  resource). The UI kept a second Task screen and `runtimeMode === 'project'` branches for the
  Overview Now card, the Tasks page and the Full Task.
- Demo and project screens drifted apart; UX reviews in demo mode no longer showed the product.
- The workflow operations already take their dependencies (`WorkflowDependencies`: store,
  catalogue, lookups, holds, clock, serialization), and an in-memory store with the filesystem
  store's checks existed for tests.

## Decision

1. **Same operations, in memory.** `@nevo/specflow-engine/demo` exports `openInMemoryWorkflow`
   (the in-memory execution store, serialized mutations, the Close/Abandon projection) and
   `loadShippedExecutionEntities` (the shipped workflows, task types and agent archetypes). The
   demo builds its catalogue from them with the demo catalogue's Specification archetypes.
2. **Ports, not branches.** What cannot run in memory gets an in-memory implementation behind the
   existing port: the Task references (archetype and documents from the demo documents, no project
   documentation, no checkout paths, nothing pending), no holds, no post actions (nothing is
   committed), and a Specification exit port that projects Close `unavailable: no-repository`
   (there is no checkout to archive in) while Abandon stays the Engine's. Engine logic has no demo
   branch.
3. **Project routes.** The demo Runtime serves the workflow actions, the Tasks page, the Task
   reads with their resource, the Task commands and the Task document routes through the same
   features as a project Runtime (`TaskEngine`, `WorkflowPort`, `TaskDocumentSource`).
4. **Seeded through commands, at startup.** The demo state is reached while the Runtime starts,
   before it serves anything, through Engine commands (start, finish, set status) from a small
   catalogue: Specifications at different steps; Tasks done, in review, in progress (by the owner
   or the agent Session the catalogue's executions name), on hold with a reason and blocked by a
   dependency. A seed that fails stops the start. The state is writable until the Runtime stops.
   Workflow facts (progress, Task states) are the Engine's; the demo catalogue keeps only what the
   Engine does not hold (titles, Sessions and their executions).
5. **One UI.** The UI has no demo branch for these screens. The snapshot-based Task screen and its
   human requirements, evidence, related resources, recovery and Task preview are removed; they
   come back as new project features if needed.

## Consequences

- A demo UX review shows the project screens, and demo changes exercise the real rules.
- Close is not emulated: the projection says it is unavailable (`no-repository`), so the UI says
  so before anyone tries.
- The Task document tree states its capabilities apart (`save`, `organize`): the demo saves Task
  documents but does not add, rename, move or delete them, and the UI offers only what is allowed.
- The demo's history times are those of its seed run, a few days before the Runtime started.
- A future demo need is met by another in-memory port implementation, never by a synthetic read.

## Rejected

- **Keeping a synthetic demo Task source.** It is a second product to maintain and drifts.
- **A temporary Project Home with Git for the demo.** It needs Git and a writable folder at
  startup, which the demo exists to avoid.
