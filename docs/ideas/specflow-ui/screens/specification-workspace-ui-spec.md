---
id: ideas.specflow-ui.screens.specification-workspace
type: product
title: Specification screen — open items
status: draft
scope: specflow
areas: [ui, workflow]
tags: [specification, workspace, tasks, workflow, evidence, floating-session]
read_when:
  - designing batch Task execution from the Specification
  - designing Specification-level decisions or a future Specification workflow
  - deciding how the recommended Session is chosen, Task filtering, or Floating Session on Compact
summary: >
  Open product/UX items of the Specification screen that are not yet implemented: batch Start of
  selected Tasks, Specification-level decisions and future Specification workflow, Task filtering,
  choosing the one relevant Session, and Floating Session validation. The implemented Overview is
  product.specflow.ui.specification-overview.
related:
  - ideas.specflow-ui.screens
  - product.specflow.ui.specification-overview
  - product.specflow.ui.interaction-model
  - ideas.specflow-ui.screens.floating-session
---

# Specification screen — open items

The implemented Specification Overview (sections, columns, focus, Activity history, Task
selection) is specified in [Specification Overview](../../../product/specflow/ui/specification-overview.md).
This document keeps only what is still open.

## Owner direction that still frames the open work

### Create, prepare and refine a Specification

Owner clarifications from UX discovery (2026-10-07):

- Creation establishes the Specification and its scaffold independently of an agent Session; an
  optional agent initialization starts a Session that fills the files.
- Specification preparation has no deterministic workflow yet. Tasks emerge while the agent refines
  the Specification, followed by review; no manual Add Task control is in scope.
- Once Tasks have passed review and left Draft, the owner can start their deterministic work. A new
  Specification Session stays possible during execution and may add Tasks; a prepared Specification
  is not a frozen Task set. Unselected new Tasks are never silently added to an execution batch.
- A future iteration adds a deterministic Specification workflow. Its steps, statuses and actions
  are unresolved; do not invent a Refine/Progress/Deploy command or stepper. Whether
  Specification-wide deployment is a Task or a Specification step is left open.

**Task groups** are configured by the project and supplied by the backend in display order with
their members. Do not apply the Specifications list's Requires attention / Active / Ready / Draft
taxonomy to Tasks; the frontend renders the returned grouping. Exact configuration and transport
schemas are deferred.

## Open items

1. **Batch Start of selected Tasks.** Selection and the Execute action exist; the execution itself
   is a placeholder dialog. Target: the backend validates the whole selected set, shows warnings and
   blockers (a warning can leave the action available, a blocker prevents it and explains why;
   never computed from status strings), then the shared Session-start interaction starts a
   Task-associated Session whose scope is the complete selected set. Open: the bulk-action command
   envelope and the selection-validation projection, and the action wording.
2. **Specification-level decision.** Cross-object attention may link to the owning evidence or
   decision context; the decision stays owned by the Specification/Task/Session workflow semantics.
   Needs the future Specification workflow and its read model.
3. **Task filter.** A local filter over loaded Task summaries by id, title or semantic category, only
   when collections are large enough to need it.
4. **Choosing the relevant Session.** How the product picks the one recommended Session when several
   are plausible resume targets (today the Runtime's `recommendedSessionId`), and the information
   model for the same Session appearing in the navigator, Requires attention and Continue session
   ([App Shell geometry open findings](../../../product/specflow/ui/shell-geometry.md#open-findings-for-later-work)).
5. **Floating Session.** Wide may use Floating Session; Compact/Narrow open Full Session. Validate
   with rendered compositions (long conversation, Composer, Work, reading width, viewport height,
   several widths near the boundary) whether Floating Session is also useful on some Compact
   widths. See [Floating Session](floating-session-ui-spec.md).
6. **Smaller open questions:** the maximum number of attention summaries before bounded
   disclosure; whether New session earns a persistent header primary slot; default Task group
   examples and the Task-row information budget; canonical artifact/Handover references; the
   project-level operations surface once deployment/pipeline capabilities exist.
