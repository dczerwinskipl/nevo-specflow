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

**Draft for owner acceptance.** Independent UX review: accepted with changes (applied). Not
implementation-ready until the data dependencies have exact contracts. Mock: Storybook
`SpecFlow/Screens/Manual workflow execution (mock)` (`packages/specflow-ui/src/mocks/workflow-manual-execution/`),
fixtures only. The task outcome is the [hub](README.md) product outcome; slices are E3/E4 of the
[delivery plan](delivery-plan.md).

## User task

Owner, no agent: create a Specification → author documents → create typed Tasks (also before the
Specification workflow starts) → edit each Task's `task.md`, title, summary, dependencies → approve /
hold / resume / cancel / remove → advance the Specification and each Task step by step (start,
finish with a result, return) → wait for Tasks → close, or abandon (close without realization). Opening anything is inspection only; every
mutation is an explicit action with the actor recorded as the person.

## Invariants

1. **Generic, projection-driven.** The UI renders the read-only Engine action projection (E4a): a
   position (`not-started`, `ready`, `active`, `waiting`, `terminal`) and the actions allowed now.
   It never branches on step ids, never invents results, and never mutates to discover actions.
   Step ids are shown verbatim in mono (`requirements`, `wait-for-tasks`, `spike`, `review` are
   fixture values, not product vocabulary).
2. **Only allowed actions are shown.** A disallowed lifecycle or workflow action is omitted, not
   disabled. When nothing is allowed and the reason is not evident from the position, one
   sentence says why (for example "Approve the task to make it ready to start."). One exception:
   **Put on hold** during an active attempt stays visible, disabled, with its reason ("finish or
   return the current step first").
3. **Two action families, two places.** Task lifecycle (Approve, Resume, Edit details, Put on hold,
   Cancel, Remove) lives in the Task header: at most one primary (Approve for a draft, Resume when
   on hold), the rest in overflow. Workflow actions live only in the step panel.
4. **Task Type is immutable.** It is chosen at creation and never edited; a Task whose type is no
   longer allowed is removed (or cancelled) and recreated.
5. **State is never colour alone.** Every toned state line carries an icon or words; refusals and
   conflicts are `role="alert"`; the panel position is a polite live region.
6. **Action labels carry no trailing ellipsis**, also when they open a dialog (`Finish step`,
   `Remove task`, `Abandon specification`); hidden actions sit behind the More (`⋯`) icon button;
   only in-progress status text may end with `…`
   ([UI/UX guidelines, Action labels](../../../design-system/principles/ui-ux-guidelines.md#action-labels)).
7. **Icons sit on the first text line.** Every status icon is centred on the first line of its
   text, also when the text wraps: `InlineNote`, `Alert` and the operational row status use an
   icon slot one line box tall (`1lh`) aligned to the start. Row-level leading icons stay centred
   on the row. An icon inside running text (`Last: review · attempt 1 · ⚠ Changes requested · …`) is an inline
   icon on the same line, never a flex box that shifts the chunk off the baseline.
8. **Reuse.** Shell, Overview sections, Task rows, Full Task, history and the Documents editor are
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
- **Activity history** (existing Secondary) carries the Specification step attempts. Its header
  toggle (clock icon) is the history entry at every width; on Narrow it opens a pushed page.

## Workflow step panel (Specification and Task)

`WORKFLOW` section, count = workflow title and revision. Reading order:

1. **Position**: the step id (primary) or Not started / Completed; one quiet facts line (attempt,
   since, by whom; or first step; or how it continues).
2. **Semantic line** when it changes the next action: waiting (`Waiting for 5 of 6 tasks`,
   `Waiting for 1 dependency`) with a link to the section that lists them (**See Tasks**, **See
   Depends on**). The blocking Tasks are not repeated in the panel.
3. **Latest hand-off**: `Last: review · attempt 1 · Changes requested · Dominik, 11:40` plus its
   feedback. This is how review-failed → rework reads on the new `implement` attempt.
4. **Action row**: Start (`Start workflow` / `Start <first step>` / `Start step`), **Finish
   step** (primary while active), **Return to earlier step** (secondary).

Full attempt history stays in the existing Secondary (Task history / Activity history), opened by
the header history toggle at every width. A terminal position is **Completed** or **Abandoned**.

- **Finish dialog.** Result = radio list of the projection's transitions, each with its target
  ("Goes to implement · feedback required", "Ends the workflow"). Feedback is required when the
  chosen transition demands it (inline error, Finish disabled); Artifacts optional (attach a
  document). The person is recorded as the actor.
- **Return dialog.** Allowed earlier steps from the projection, required reason.
- **First start of a Task** always confirms the binding that will be pinned: Task Type, workflow
  and revision, first step. Confirming sends the **previewed revision** (expected workflow
  revision); the Engine refuses if it no longer matches. Refusals reuse the same dialog, focused on
  its dismiss:
  - _definition changed since creation_ (attention; rev N → N+1 and the change; **Start with rev
    N+1** = owner rebind);
  - _changed since the preview_ (attention, "Not started: the workflow changed just now"; the
    dialog re-opens on the new revision and change; **Start with rev N+1** confirms again);
  - _Task Type no longer allowed_ (danger; "Spike is no longer allowed for Feature
    specifications… remove this task and create a new one with an allowed type"; **Not now**,
    **Cancel task**, **Remove task**).

  Later steps start without confirmation.

- **wait-for-tasks** has no Finish; it settles by itself. Only Return is offered when allowed.

## Full Task (`/specs/:specId/tasks/:taskId`)

Back to specification, title, `id · Task Type`, preparation notice (draft / on hold with reason /
cancelled with reason; absent when ready), summary; then sections **Workflow** (omitted when
cancelled), **Documents**, **Context**, **Depends on**. Task history is the Secondary.

- **Edit details** dialog: Title and Summary only; Task Type always read-only, with the
  remove-and-recreate hint. **Revision conflict** mirrors the Documents conflict: danger alert "Not
  saved: T-02 changed since you opened it", **Copy my changes**, **Load the latest version**, Save
  disabled, edits kept. The same alert appears when a section edit (context, dependencies) meets a
  newer Task revision.

### Task authoring: documents, context, dependencies

Editing a Task is more than `task.md`: its other registered documents, the context a step reads
(F20 entry kinds) and its dependencies.

- **Row and header actions (decided):** a row click opens the row's object (a document as a
  Secondary tab, a context reference its preview or target, a dependency that Task); the row `⋯`
  menu holds everything else (Rename, Remove, Required / Optional, Move up / down, Edit note). No
  per-row Edit buttons. A section's add action is an icon-only **+** in its header, following the
  WorkspaceHeader icon action (ghost `sm` `IconButton`, `aria-label` and tooltip with the same
  label: "New document", "Add dependency"); when the section offers several kinds (Context) the
  **+** opens a menu and has `aria-label` "Add context" but no tooltip (a tooltip trigger nested
  around a menu trigger swallows taps on touch). An empty section shows one labelled button as its
  call to action ("Add dependency"); once rows exist only **+** remains. Primary and consequential
  actions keep text labels (Approve, Start, Finish step, Return to earlier step, Abandon
  specification, Close specification).
- **Placement (decided):** structured facts are edited where they are read, in the Task page
  sections (no separate edit mode); documents open in the
  **Secondary** editor (variant A, unchanged), several as tabs on the Documents tab rail. Checked
  at real widths: at 1440 the Task page (about 590 px) and the editor (about 580 px) sit side by side
  and context rows stay one line of facts; at 900 both panes keep working with stacked facts; at 390
  one surface shows the Task page, a document is a pushed page with Back. Rejected: everything in
  the Secondary (it would need tabs that hide the workflow and context while writing, and a
  580 px pane is too narrow for the context list) and a separate edit page (a second surface for the
  same object).
- **Documents** section: `task.md` (Task content) first, then other registered Task documents;
  **+** New document; a row click opens it in the Secondary; `⋯` Rename / Delete document (none for `task.md`).
- **Context** section: the effective list in declared order, with a one-line explanation ("What
  the person or agent doing a step reads, in this order. task.md always comes first."). Row: kind
  icon, name, facts `kind · Required|Optional` (or `Always first` for `task.md`), supporting
  `ref · detail · note`. Kinds: Task document, Specification document, Project document
  (repository document), Code path (file or glob, with the current match count), Instructions,
  Where to change (path hint: allowed / not allowed). The **+** menu offers one dialog per kind (pick
  Specification documents with already-added and missing ones disabled; search project
  documentation; type a path and see its match count), each with **When the step starts:
  Required / Optional** and an optional "why" note; entries are appended at the end. Row menu:
  Required / Optional, Edit note, Replace, Move up, Move down, Remove from context.
- **Defaults:** with no explicit list the effective context is `task.md`, the Task's documents and
  the Specification overview; the section shows them, and the first edit writes them out as
  explicit entries so nothing drops silently (an explicit list replaces the default).
- **Broken and stale references:** a missing required entry is a danger row ("Not found: … Required,
  so the next step cannot start until you replace or remove it") plus one danger line above the
  list; a superseded or missing optional entry is an attention row ("… Optional, so the next step
  skips it"). Starting the step is refused by the Engine with the same cause.
- **Depends on** section: rows with the dependency's state; **+** (or the empty-state **Add dependency**) opens a checklist where
  existing dependencies are checked and disabled and a cycle is disabled with its reason; row menu
  **Remove dependency**. After the Task has started, dependencies are fixed (InlineNote, no add action, no row menu).

- **Lifecycle matrix** (the projection decides; this is the mock's assumption):

| Preparation | Never started                           | Started, between steps   | Active attempt                          | Terminal |
| ----------- | --------------------------------------- | ------------------------ | --------------------------------------- | -------- |
| draft       | **Approve**, Edit, Hold, Cancel, Remove | —                        | —                                       | —        |
| ready       | Edit, Hold, Cancel, Remove              | Edit, Hold, Cancel       | Edit, Cancel; Hold disabled with reason | none     |
| on-hold     | **Resume**, Edit, Cancel, Remove        | **Resume**, Edit, Cancel | —                                       | —        |
| cancelled   | none                                    | none                     | —                                       | none     |

## Close

**Close specification** is in the Overview header overflow and becomes the header's primary
action once the workflow is terminal (completed or abandoned). It opens the Engine Close
preflight (D07):

- **Blocked**: the description is one sentence saying why ("Single sign-on cannot close yet: its
  workflow is waiting for 5 unfinished tasks and one document is still being saved"). Groups follow
  in a fixed order: **Workflow** → **Unfinished tasks** → **Pending writes**. Each has a heading
  with its count, one explanation sentence, its items as links (linked id and title, then the
  state; at most five, then "and N more") and its resolving action where one exists (See workflow,
  Go to Tasks). No text repeats between the description, explanations and rows. Footer: primary
  **Dismiss** (initial focus), secondary **Abandon instead**, which opens the Abandon dialog. The
  Abandon-blocked dialog uses the same layout (Pending writes → Repository).
- **Ready**: success summary and the cancelled Tasks listed as not delivered; **Close
  specification**; existing Git/workspace checks still run.

## Abandon (close without realization)

Owner decision. **Abandon is final**: there is no reopen. **Abandon specification** is a danger item in the Overview header overflow, shown
only when the projection allows it (never for a terminal Specification).

- **Dialog**: "Ends the specification without delivering it. This cannot be undone." A consequence
  list: the Specification workflow and every running Task workflow end as **abandoned**; every
  non-terminal Task is **cancelled**, including started ones (listed by id); nothing is marked
  delivered; documents, Tasks and history stay readable. A **required reason**. **Abandon
  specification** (destructive) / Cancel.
- **Blocked**: the same grouped-blocker layout as Close (pending writes, Git/workspace rules); only
  **Dismiss**.
- **Afterwards**: the Overview shows "Abandoned · <reason>" under the title (archive icon, status
  role), the Workflow position reads **Abandoned**, New task is gone, Activity history records the
  reason, and **Close specification** is the header primary. Close lists every cancelled Task as
  not delivered (cancelled by abandon, or earlier by a person).

This also covers the D07 waiver need: no separate waiver is designed. Later idea, not in scope: a
front-end-only undo toast for about 5 seconds before the abandon request is sent.

## Responsive

Wide 1440 and Compact 900: Primary + existing Secondary (history or `task.md`). Narrow 390: one
surface; history is the header toggle; `task.md` is a pushed page with Back.
Dialogs keep one column at every width. The blocker and Task rows keep id → title → state order.

## Later: Do it myself / Ask agent (E6)

Not rendered. The action row (`data-slot="workflow-actions"`) is the single attachment point. For
an eligible step the start action becomes a split choice: the main part stays **Start step** (do
it myself; same label, primary identity, position and keyboard order) and an attached menu adds
**Ask agent**. Non-eligible steps keep the plain button. An active agent attempt shows in the
same position line with its Session link and Stop. No other panel region changes.

## Component and ownership map

| Region                                     | Decision                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Shell, Secondary, header actions           | `AppShell`, `AppWorkspace`, `WorkspaceHeader` — reuse                                                  |
| Sections, groups, rows                     | `WorkspaceSection`, `TaskGroupHeader`, `InformationList` + `OperationalRow` — reuse                    |
| History                                    | `Timeline` (md) in the existing Secondaries — reuse                                                    |
| `task.md`                                  | `DocumentEditorProvider` + `DocumentEditor` — reuse unchanged                                          |
| Context and dependency rows                | `OperationalRow` (inline facts) + `Menu` — reuse; status lines `InlineNote` — reuse                    |
| Dialogs                                    | `Dialog`, `RadioGroupOption`, `Field`, `TextArea`, `CheckboxField`, `Alert`, `DescriptionList` — reuse |
| Step panel, grouped blockers, step-id mono | product-owned composition (SpecFlow tasks/workflow feature)                                            |
| Depends on picker                          | checkbox list; Nevo UI has no multi-select Combobox (gap, not blocking)                                |

## Data dependencies (missing, route to E2/E3/E4a planning)

Read-only action projection with positions, allowed lifecycle and workflow actions, transitions
(target, feedback requirement) and unavailable reasons; Task resource (F20) with preparation
status, dependencies, revision and creation-time binding; Task create/edit/lifecycle and
start (with expected workflow revision)/finish/return/rebind commands with expected revision;
Specification abandon command with reason; attempt history with result,
feedback, artifacts and actor; structured Close and Abandon preflight blockers. No exact contract exists yet;
the mock fixtures name the scenarios implementation fixtures must cover.

## Decisions closed in review

- `task.md` placement: **A** (Secondary). B (replaces the Task page) remains only as a screenshot
  for the owner comparison.
- Declared step order: **no step strip** (workflows loop and branch).
- Hold during an active attempt: **disallowed**, shown disabled with its reason.
- Close waiver: **deferred**; Abandon covers closing without realization.
- Task Type: **immutable** after creation.
- Abandon: **final**, also reachable from Close-blocked as **Abandon instead**.
- Task authoring placement: sections in the Primary, documents in the Secondary.

## Open questions

- Should Close-blocked point to Abandon as an alternative, or stay silent about it?
