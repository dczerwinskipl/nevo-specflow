---
id: adr.0019-workflow-kernel-and-automatic-continuation
type: adr
title: One workflow kernel for Specifications and Tasks, per-Task types, agent archetypes and automatic continuation
status: current
date: 2026-11-05
summary: >
  Specifications and Tasks run through one deterministic workflow core and differ only in their entry
  points. Every Task has its own type and workflow, and the Specification archetype only restricts the
  types. Each step names a preferred agent archetype, which holds a preferred provider and a model per
  provider. A transition may continue automatically. When the Engine cannot resolve the next launch, it
  records a local attention item instead of asking the agent. Canonical execution state is Git-tracked
  in the Specification's .execution/ folder.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.deterministic-workflow
  - adr.0017-definitions-as-project-data
  - adr.0015-specification-manifest-as-document-registry
  - ideas.specflow-engine.plan-05
  - ideas.specflow-engine.plan-06
---

# 0019 — Workflow kernel and automatic continuation

## Status

Current. The decisions below were taken by the product owner on 2026-11-05.

## Context

- **The legacy engine (`nevo`, `tools/specs/workflow`) drove only Tasks.** Every Task of a change shared
  one workflow, which `change.yaml` selected, so a Specification of type X had only Tasks of type X.
  Provider and model came from a per-spec execution policy keyed by role.
- **This product has an architecture for deterministic workflow but no kernel.** The rules exist in
  `architecture.workflow.deterministic-workflow`, but nothing implements them. `SpecificationManifest.tasks`
  is a placeholder.
- **Plan 05 limits its first slice.** Its scenario (managed execution) says that handover "never spawns
  the next Session automatically", and the migration note repeats this. The limit was set to keep the
  first managed-execution slice small. It was never a product decision against automation.

## Decision

1. **One core, two entry points.** The workflow core is subject-neutral. The entry points
   `startSpecificationExecution` and `startTaskExecution` select the subject (the Specification, or one
   of its Tasks). Start, finish, return, continuation and attention behave the same for both.
2. **Each Task has its own type.** A task type (definition kind `task-type`) names the workflow its
   Tasks run. The planner gives each Task a type when it breaks the Specification down. The
   Specification archetype's `execution.taskTypes` only restricts the allowed types. The default is
   `['*']`, meaning every type is allowed. The owner defines the task types and agent archetypes of
   their project.
3. **Workflows are their own definitions.** Kind `workflow`, separate from Specification archetypes. A
   Specification archetype refers to its Specification workflow through `execution.workflow`.
4. **Every step names a preferred agent archetype.** Kind `agent-archetype` holds an optional agent
   profile, instructions, a `preferredProvider`, and per provider an optional `model` and `effort`. The
   model can be missing for a provider: the provider is known, but no model has been chosen yet.
5. **Review is an ordinary step.** It can appear anywhere, even after every step, and is selected by
   its results (`pass` / `fail`).
6. **The owner can always go back.** `returns[]` declares steps the owner may return to from any
   non-terminal position, including while the Specification waits for its Tasks. A return can apply
   Task effects (block the Tasks that have not started). Running Tasks are never interrupted by the
   Engine.
7. **Transitions may continue automatically.** A transition with `continuation: auto` lets the Runtime
   start the next step without the owner, but only when the Engine resolves a complete launch:
   - `session: reuse` uses the finishing Session's provider and the archetype's model for that
     provider;
   - `session: fresh` uses the archetype's preferred provider and its model.

   This supersedes the "never spawn the next Session automatically" limit of Plan 05 and of the
   migration note.

8. **An unresolved launch becomes an attention item, never a question to the agent.** The agent's
   finish succeeds. The Engine records an attention item for the subject: model missing, provider not
   chosen, no Session to continue, owner action, or human step. Every start of that subject removes
   the item, so a quick screen, a manual start and an automatic continuation behave the same. A
   "remember" choice writes the model into the agent archetype file.
9. **Canonical state is Git-tracked next to the Specification.**
   - `.execution/specification.yaml` holds the Specification run, and
     `.execution/tasks/<taskId>.yaml` holds one Task each.
   - These files store only position, attempts and returns. They are not named `change.yaml`, and they
     are not a change log.
   - Attention items and change journals are local state (`.nevo/local/state`).
   - A run is pinned to its definition revision.

## Consequences

- **Plan 05 and the migration note are corrected** to point here. The Runtime gains a continuation
  orchestrator (plan 06, F01).
- **Tasks are started by the owner.** A Task never starts, and gets no attention item, just because
  it is ready. The owner selects Tasks and the Runtime orchestrator runs them with agents in
  dependency order, recording attention only when the run cannot proceed (plan 06, F12).
- **Specification archetypes now refer to workflows and task types.** Installing an archetype also
  installs its workflow and that workflow's agent archetypes. The shipped catalogue revision changed.
- **The `.execution/` files are working-tree changes** until a commit integration exists (plan 06, F04).
- **Editing a workflow affects only new runs.** A run pinned to the old revision fails closed until it
  is re-pinned (plan 06, F07).

## Rejected

- **A per-Specification workflow for every Task**, as in the legacy engine. It couples Task types to the
  Specification type.
- **Asking the agent which model to use next.** The decision belongs to deterministic configuration
  and the owner, not to model output.
- **One state file for all Tasks.** Parallel Task worktrees would conflict on every change.
- **Storing derived status, readiness or lanes.** They are projections of position and definition.
