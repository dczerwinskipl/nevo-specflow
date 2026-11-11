---
id: ideas.specflow-engine.reusable-workflow.ux-contract
type: product
title: Manual Specification and Task workflow execution — UX contract (mock)
status: draft
scope: specflow
areas: [ui, workflow]
tags: [proposal, ux-contract, manual-execution, task-authoring, workflow-step-panel, close]
read_when:
  - designing or implementing the E3/E4 manual Specification and Task UI
  - reviewing the manual workflow execution Storybook mock
  - adding Ask agent to a workflow step (E6) without redesigning the step panel
summary: >
  Draft screen contract, for owner acceptance, of manual Specification and Task workflow
  execution in the UI: Tasks on the Overview, Task creation and authoring, lifecycle actions,
  one generic workflow step panel driven by a read-only action projection, first-start binding
  confirmation and refusals, review-failed rework, wait-for-tasks and Close blockers.
related:
  - ideas.specflow-engine.reusable-workflow
  - ideas.specflow-engine.reusable-workflow.delivery
  - ideas.specflow-engine.reusable-workflow.boundaries
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - ideas.specflow-engine.task-resource-and-context
  - product.specflow.ui.specification-overview
  - product.specflow.ui.interaction-model
---

# Manual workflow execution — UX contract (mock)

**Draft for owner acceptance.** Not implementation-ready until the open decisions below are closed
and the data dependencies have exact contracts. Mock: Storybook
`SpecFlow/Screens/Manual workflow execution (mock)` (`packages/specflow-ui/src/mocks/workflow-manual-execution/`),
fixtures only. The task outcome is the [hub](README.md) product outcome; slices are E3/E4 of the
[delivery plan](delivery-plan.md).

## User task

Owner, no agent: create a Specification → author documents → create typed Tasks (also before the
Specification workflow starts) → edit each Task's `task.md`, title, summary, dependencies → approve /
hold / resume / cancel / remove → advance the Specification and each Task step by step (start,
finish with a result, return) → wait for Tasks → close. Opening anything is inspection only; every
mutation is an explicit action with the actor recorded as the person.

## Invariants

1. **Generic, projection-driven.** The UI renders the read-only Engine action projection (E4a): a
   position (`not-started`, `ready`, `active`, `waiting`, `terminal`) and the actions allowed now.
   It never branches on step ids, never invents results, and never mutates to discover actions.
   Step ids are shown verbatim in mono (`requirements`, `wait-for-tasks`, `spike`, `review` are
   fixture values, not product vocabulary).
2. **Only allowed actions are shown.** A disallowed lifecycle or workflow action is omitted, not
   disabled. When nothing is allowed and the reason is not evident from the position, one
   sentence says why (for example "Approve the task to make it ready to start.").
3. **Two action families, two places.** Task lifecycle (Approve, Resume, Edit details, Put on hold,
   Cancel, Remove) lives in the Task header: at most one primary (Approve for a draft, Resume when
   on hold), the rest in overflow. Workflow actions live only in the step panel.
4. **Reuse.** Shell, Overview sections, Task rows, Full Task, history and the Documents editor are
   the existing ones; new compositions are listed in the component map.

## Specification Overview

Order (extends [Specification Overview](../../../product/specflow/ui/specification-overview.md)):
summary → Requires attention → Continue session → **Workflow** → Tasks → context sections. With
a bound Specification workflow, the Workflow section takes the preparation block's place.

- **Tasks section.** Header keeps the progress count and adds **New task** (secondary, always
  when creation is allowed). The empty state is unchanged (inline, no action) with copy saying
  Tasks can be created before the workflow starts. Groups follow what the owner must do: **Needs
  approval** (drafts), **In progress**, **Ready to start**, **Waiting** (dependencies), **Done**,
  **On hold or cancelled** (collapsed by default). The row is the existing Task row: title; facts
  `id`, Task Type; one supporting line with the preparation status or workflow position (`implement
· attempt 2 · in progress`, `Waiting for T-02`, `Draft · needs approval · after T-02, T-03`).
  Overflow holds the allowed lifecycle actions. Selection checkbox and Execute are unchanged.
- **New task dialog.** Task Type (only types the archetype allows; each shows its workflow and
  steps), Title, Summary, Depends on (checkbox list). Creates a draft.
- **Activity history** (existing Secondary) carries the Specification step attempts.

## Workflow step panel (Specification and Task)

`WORKFLOW` section, count = workflow title and revision. Reading order:

1. **Position**: the step id (primary) or Not started / Completed; one quiet facts line (attempt,
   since, by whom; or first step; or how it continues).
2. **Semantic line** when it changes the next action: waiting (`Waiting for 5 of 6 tasks`,
   `Waiting for 1 dependency`) with the blocking Tasks as id · title link · state rows.
3. **Latest hand-off**: `Last: review · attempt 1 · Changes requested · Dominik, 11:40` plus its
   feedback. This is how review-failed → rework reads on the new `implement` attempt.
4. **Action row**: Start (`Start workflow` / `Start <first step>…` / `Start step`), **Finish
   step…** (primary while active), **Return to earlier step…** (secondary).

Full attempt history stays in the existing Secondary (Task history / Activity history); on Narrow
the section header offers **History**.

- **Finish dialog.** Result = radio list of the projection's transitions, each with its target
  ("Goes to implement · feedback required", "Ends the workflow"). Feedback is required when the
  chosen transition demands it (inline error, Finish disabled); Artifacts optional (attach a
  document). The person is recorded as the actor.
- **Return dialog.** Allowed earlier steps from the projection, required reason.
- **First start of a Task** always confirms the binding that will be pinned: Task Type, workflow
  and revision, first step. Refusals reuse the same dialog: _definition changed_ (attention;
  shows rev N → N+1 and the change; **Use rev N+1 and start** = owner rebind) and _Task Type no
  longer allowed_ (danger; **Change task type…**). Later steps start without confirmation.
- **wait-for-tasks** has no Finish; it settles by itself. Only Return is offered when allowed.

## Full Task (`/specs/:specId/tasks/:taskId`)

Back to specification, title, `id · Task Type`, preparation notice (draft / on hold with reason /
cancelled with reason; absent when ready), summary; sections **Workflow** (omitted when
cancelled), **Task document** (`task.md` row with **Edit**), **Depends on** (Task rows with state).
Task history is the Secondary.

- **Edit details** dialog: Title, Summary, Depends on; Task Type read-only once started.
  **Revision conflict** mirrors the Documents conflict: danger alert "Not saved: T-02 changed since
  you opened it", **Copy my changes**, **Load the latest version…**, Save disabled, edits kept.
- **task.md** opens in the existing Documents editor (header actions, save, conflict and leave
  guard unchanged). Placement: see Q1.
- **Lifecycle matrix** (the projection decides; this is the mock's assumption):

| Preparation | Never started                           | Started, between steps   | Active attempt | Terminal |
| ----------- | --------------------------------------- | ------------------------ | -------------- | -------- |
| draft       | **Approve**, Edit, Hold, Cancel, Remove | —                        | —              | —        |
| ready       | Edit, Hold, Cancel, Remove              | Edit, Hold, Cancel       | Edit, Cancel   | none     |
| on-hold     | **Resume**, Edit, Cancel, Remove        | **Resume**, Edit, Cancel | —              | —        |
| cancelled   | none                                    | none                     | —              | none     |

## Close

**Close specification…** is in the Overview header overflow; when the workflow is terminal it is
also the button under the Workflow section. It opens the Engine Close preflight (D07):

- **Blocked**: attention alert, then grouped blockers, each Task a link with its state:
  Specification workflow, Unfinished tasks, Drafts, On hold (and active Runs / pending writers when
  present). Only a dismiss action.
- **Ready**: success summary (workflow complete, N done, cancelled Tasks listed as not delivered)
  and **Close specification**; existing Git/workspace checks still run.

## Responsive

Wide 1440 and Compact 900: Primary + existing Secondary (history or `task.md`). Narrow 390: one
surface; History is an action in the Workflow header; `task.md` is a pushed page with Back.
Dialogs keep one column at every width. The blocker and Task rows keep id → title → state order.

## Later: Do it myself / Ask agent (E6)

Not rendered. The action row (`data-slot="workflow-actions"`) is the single attachment point:
**Start** gains the executor choice for an eligible step (split choice or a choice inside the start
dialog), and an active agent attempt shows in the same position line with its Session link and
Stop. No other panel region changes.

## Component and ownership map

| Region                                 | Decision                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Shell, Secondary, header actions       | `AppShell`, `AppWorkspace`, `WorkspaceHeader` — reuse                                                  |
| Sections, groups, rows                 | `WorkspaceSection`, `TaskGroupHeader`, `InformationList` + `OperationalRow` — reuse                    |
| History                                | `Timeline` (md) in the existing Secondaries — reuse                                                    |
| `task.md`                              | `DocumentEditorProvider` + `DocumentEditor` — reuse unchanged                                          |
| Dialogs                                | `Dialog`, `RadioGroupOption`, `Field`, `TextArea`, `CheckboxField`, `Alert`, `DescriptionList` — reuse |
| Step panel, blocker rows, step-id mono | product-owned composition (SpecFlow tasks/workflow feature)                                            |
| Depends on picker                      | checkbox list; Nevo UI has no multi-select Combobox (gap, not blocking)                                |

## Data dependencies (missing, route to E2/E3/E4a planning)

Read-only action projection with positions, allowed lifecycle and workflow actions, transitions
(target, feedback requirement) and unavailable reasons; Task resource (F20) with preparation
status, dependencies, revision and creation-time binding; Task create/edit/lifecycle and
start/finish/return/rebind commands with expected revision; attempt history with result,
feedback, artifacts and actor; structured Close preflight blockers. No exact contract exists yet;
the mock fixtures name the scenarios implementation fixtures must cover.

## Open decisions

- **Q1 `task.md` placement** — A: Secondary next to the Task (keeps workflow and feedback visible
  while writing; replaces Task history while open). B: replaces the Task page with Back (full
  width, same as Narrow; loses context). **Recommend A.**
- **Q2 Declared step order** — the panel shows no step strip because workflows loop and branch.
  Confirm the owner does not need "step 2 of 4".
- **Q3 Hold during an active attempt** — the mock disallows it (Cancel only).
- **Q4 Close waiver** — D07 allows an audited waiver; not designed here.
