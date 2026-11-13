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
   **Steps are shown by their title** (the optional human `title` of a workflow step, for example
   "Waiting for tasks", "Implementation", "Review") everywhere: Now block, Tasks rows, history,
   dialogs. The technical id appears only as detail (the muted line of the Now block and a
   tooltip); attempt numbers and revisions are muted detail (history meta, Now block line), not
   part of labels. A step without a title shows its id.
2. **Only allowed actions are shown.** A disallowed lifecycle or workflow action is omitted, not
   disabled. When nothing is allowed and the reason is not evident from the position, one
   sentence says why (for example "Approve the task to make it ready to start."). One exception:
   **Put on hold** during an active attempt stays visible, disabled, with its reason ("finish or
   return the current step first").
3. **One primary action, in the Now block.** The single primary action available now (Approve,
   Resume, Start, Finish step, Close specification) sits in the Now block; secondary lifecycle
   actions (Edit details, Put on hold, Cancel, Remove) stay in the header overflow.
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
   on the row. An icon inside running text (`Last: Review · ⚠ Changes requested · …`) is an inline
   icon on the same line, never a flex box that shifts the chunk off the baseline.
8. **Reuse.** Shell, Overview sections, Task rows, Full Task, history and the Documents editor are
   the existing ones; new compositions are listed in the component map.

## Specification Overview

Order (extends [Specification Overview](../../../product/specflow/ui/specification-overview.md)):
summary → Requires attention → Continue session → **Workflow** → Tasks → context sections. With
a bound Specification workflow, the Workflow section takes the preparation block's place.

- **Tasks section** (moves to the Tasks page in the control-center proposal below). The progress
  count uses the one progress definition below. Header keeps the progress count and adds **New task** (secondary, always
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

## Specification Overview as control center (direction accepted; refinements decided 2026-11-13)

Owner direction (2026-11-13): the Overview is the control center of one Specification; the full Task
list moves to the Tasks page. Restructuring, not a redesign: it keeps the accepted
[Specification Overview](../../../product/specflow/ui/specification-overview.md) and
[App Shell geometry](../../../product/specflow/ui/shell-geometry.md) decisions listed below. Mock:
Storybook `SpecFlow/Screens/Specification control center (mock)`.

**Kept from the accepted contracts:** the summary (title, description) leads; Requires attention keeps
its name and its place first among the work sections; the two-column switch from 1408 px of Overview
**content** width with 16 px hysteresis, measured on the container, one column below it or when one
side is empty, no empty bands, keyboard order = visible order; the work column / context column
split (context column `22rem`–`30rem`); Continue session's row shape (the Sessions list row);
Activity history in the Secondary, closed by default here, the header toggle opens it; the Now block
in the preparation block's place; one reading column (`content-standard`) at the workspace inset.

**Order:** summary → **Now** → **Requires attention** → **Tasks** (work column) and
**Sessions** → **Documents** (context column). In one column the same order.

- **Now** shows the current Specification workflow state from the projection: the step title and
  one human line (attempt, since, by whom; or what the step does: "Continues by itself when every
  task is done or cancelled"). The step id and workflow revision appear only in the Now operations
  menu (`⋯`), as a note under Workflow history. Unmet exit gates show under "To finish". The
  Specification-level progress (segmented bar over the counted total, the progress text, and a line
  that cancelled tasks are not counted) appears **only here**, for a `wait` step; a terminal
  position shows a summary instead ("All 6 tasks done · 1 cancelled", "6 tasks cancelled · 1
  done"). Now offers the projection's **main** action only: Start workflow, Finish step (a `work`
  step), Close specification (terminal). When every result of the active step needs an unmet gate,
  the gate's action is the main action and Finish step waits in the menu, unavailable with its
  reason ("Finish step becomes available once this is met"). A `wait` step gets **no** primary
  action; other transitions (Return to an earlier step) and Workflow history sit in the menu.
  Abandoned: one archive icon on the title, the reason under it.
- **Three concerns, kept apart** (owner decision 5A). **Workflow state** belongs to the Engine:
  authoritative states, transitions and execution semantics, exposed as neutral facts per Task
  (preparation status, position, whether a run exists, terminal outcome, broken, dependency state,
  start blockers). **Attention** belongs to the attention projection: which subjects need a person,
  with reason, required actor and available action. **Grouping** belongs to the dashboard
  configuration: groups, labels, order and the mapping from facts to groups, as declarative data.
  No presentation concept (group, label, order, lane) lives in the Engine or the kernel. A Task is
  in exactly one group and may independently require attention; attention is never a group, a
  state, or inferred from a status or group name.
- **Available actions are not attention.** A ready-to-start Task offers Start, but it needs no
  attention; a draft offers Approve, but it is not attention by itself.
- **Requires attention** shows the attention projection only, each item with the one action the
  projection carries and, when it is not the person viewing, the required actor ("Needs the spec
  writer"). Items: the Engine's derived attention (`owner-action`, `human-step`, launch problems,
  `task-escalated`), broken Tasks, **start blockers that need a person** on approved, not-started
  Tasks (owner decision 2A; classification below), Sessions waiting for input, and **one**
  Specification-level `tasks-stuck` item when no open Task can progress without the owner (owner
  decision 1A). That item states the intervention, not the diagnosis ("Resolve 2 blocking tasks ·
  Approve, resume or cancel them so the specification can finish"); Now carries the diagnosis and
  the Task links. Its action **Review tasks** opens the Tasks page filtered to the blocking Tasks
  (below). There is never one item per draft. At
  most five, then **Show N more**; the order is the projection's priority (broken first). On Narrow
  the action sits under the title and reason.
- **Now explains why the Specification cannot progress** (owner decision 3A) in one note under the
  progress, naming the Tasks as links ("It cannot continue now: T-04 is a draft, T-05 is on hold
  and no other task is open."). It carries no action and does not repeat the attention entry: Now
  explains state, Requires attention offers the operation.
- **Tasks** (owner decision 4A, 7A) previews the configured grouping. Groups the configuration
  marks as summary rows (default: Needs approval, In progress, Ready to start, Cannot start,
  Waiting, On hold) get one row each when non-empty: the group name, then "1 task · T-04 Return
  users to where they were" (count, up to two Tasks, "N more"), opening the Tasks page
  at that group. Groups marked compact (default: Done, Cancelled) share one quiet line of links
  ("Done 4 · Cancelled 1"). **On hold is a summary row**: it is not terminal and keeps the
  Specification from finishing. **All tasks** in the header opens the full page. A Task already
  referred to by Requires attention (its own item, or a Task a Specification item covers) or by
  Now appears in its group row by id only ("1 task · T-04"), never as a second full row. Omitted
  when there are no Tasks. Order
  and visibility of groups come from the configuration, so they can become configurable later
  without UI change.
- **Sessions** replaces Continue session: the recommended Session first, then other working Sessions
  of this Specification (at most three), same row as the Sessions list, **All sessions** in the
  header. A Session waiting for input is in Requires attention instead.
- **Documents** unchanged.
- **Narrow:** the same order in one column; nothing is collapsed on the Overview (it is short by
  construction); row actions stay on the row. Status icons sit on the first line of their text; a
  row's leading mark stays centred on the row (the operational row's documented rule).
- **Columns (decided):** A, Now, Requires attention and Tasks in the work column; Sessions
  and Documents in the context column. The 1408 px threshold stays.

**Progress, one definition** (Now and the Tasks page): done = Tasks whose workflow
completed; total = all Tasks except cancelled ones; cancelled and on hold are named separately, zero
parts omitted: `1 of 6 done · 1 cancelled · 1 on hold`. On hold counts in the total (unfinished).

## Tasks page (`/specs/:specId/tasks`)

The full inventory in the configured grouping (default: Needs approval, In progress, Ready to start,
Cannot start, Waiting, On hold, Done, Cancelled — Cancelled collapsed), the existing row, the row `⋯` lifecycle
menu, **New task** in the section header, the progress text as the section count, and a filter (id
or title). A Task in the attention projection keeps its group and shows "Requires attention ·
<reason>" on its row; a Task named by the `tasks-stuck` item shows "Requires attention · the
specification cannot continue until it moves". A draft row reads "Draft · needs approval" in the
neutral tone. **No checkboxes and no bulk actions** (owner decision 6A); "Run selected tasks" (plan
06 F12) is deferred, and when it returns it starts each Task through the workflow, never bypassing
a transition. The navigator's **Tasks** item becomes this page.

**Blocking filter (Review tasks).** `/specs/:specId/tasks?blocking=specification` shows only the
Tasks the current `tasks-stuck` item covers, in their normal groups, with a visible filter bar
above the list ("Blocking specification · 2 tasks", a clear button) and "2 of 7 shown" as the
section count. Per the routing contract (route state through the router, validated search, absence
means the default) the search carries one validated value, never a Task id list: the Tasks are
resolved from the projection when read, so a stale link cannot show stale Tasks. Opening it from
Review tasks pushes a history entry; clearing the filter replaces it. When nothing blocks any more,
the bar says "Nothing blocks the specification now" with the clear button. The id/title filter stays
local state.

## Universality

The sections take their content from the projection, so other definitions read the same way:

- **A Specification workflow without a waiting step** (for example _Small change_: Implementation →
  Review with no step that produces Tasks): Now carries its work steps with Finish step; the Tasks
  summary is omitted; Requires attention holds what the attention projection derives (Sessions,
  Specification items).
- **A single-step Task type** (Spike): the Task sits in the group the dashboard configuration maps its facts to; an unmet exit
  gate shows on the Task (and in Now for the Specification's own step), not as attention, because
  an active subject gets no derived attention.
- **A review-loop Task type** (Implementation ⇄ Review): when the review finishes with "changes
  requested" and the next attempt waits for the owner, the attention projection gives an
  `owner-action` item with the projection's action (**Start Implementation**); the Task stays in
  its group.
- **Custom grouping:** a project that groups as Ready / Design / Implementation / Review / Waiting /
  Completed gets those rows on the Overview summary and the Tasks page with no UI change.
- **Step names never matter:** rows say the step title; nothing tests for `wait-for-tasks`,
  `review` or a status string; a `wait` kind and `produces: tasks` are the only workflow facts the
  Overview reads.

## Start blockers: attention or not (owner decision 2A)

The attention projection classifies each start blocker (`StartBlocker`) of an approved (`ready`),
not-started Task. It never infers attention from a status name; the item carries reason, required
actor and action.

| Blocker                                                            | Attention?                                                                                       | Actor            | Action                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------- |
| `dependencies`, every dependency can still complete                | No: normal waiting, shown on the row ("Waiting for T-02")                                        | —                | —                                      |
| `dependencies` with `unsatisfiable` (cancelled, abandoned, broken) | Yes                                                                                              | owner            | Edit dependencies (or Cancel task)     |
| `context-unresolved`                                               | Yes                                                                                              | owner            | Edit context                           |
| `context-awaited` (an earlier step will produce it)                | No: expected                                                                                     | —                | —                                      |
| `gates-unsatisfied` (entry gate)                                   | Yes, when a person satisfies it                                                                  | the gate's actor | the gate's action                      |
| `definition-changed`                                               | Yes                                                                                              | owner            | Review the new workflow revision       |
| `type-not-allowed`, `definition-missing`                           | Yes                                                                                              | owner            | Open project settings (or Cancel task) |
| `broken`                                                           | Yes (already)                                                                                    | owner            | Open task (restore from Git)           |
| `status` (draft, on hold)                                          | No per Task; the Specification-level `tasks-stuck` item covers it when nothing else can progress | —                | —                                      |

## Grouping ownership and the default configuration (owner decision 5A)

The default grouping is a declarative data module in the **Runtime presentation layer**
(`specflow-runtime/src/features/tasks/workspace/`), replacing the hard-coded `GROUPS`. Each group:
id, label, order, a predicate over the Engine's neutral Task facts, its summary prominence (row or
compact) and whether the Tasks page collapses it; the first matching group wins and a Task matching
none falls into "Other". Recommended there rather than in the UI because the accepted contract
already has the backend supply groups as data in display order, one evaluation serves the Overview
summary, the Tasks page and other clients (CLI, MCP), and project- or user-level overrides later
need Runtime-owned settings; the UI stays render-only. The Engine and kernel keep no presentation
concepts. The mock's `dashboard-grouping.stories-support.ts` shows the shape.

**Neutral facts stand alone.** The Task facts (and attention) stay part of the Task read model for
every consumer: CLI, MCP and other clients understand authoritative Task state without dashboard
groups, and groups are only an optional presentation of those facts.

**"Ready to start" means startable.** The default configuration restricts it to approved,
not-started Tasks with no start blocker other than dependencies (fact `startBlocked`, from the
projection's start blockers) and adds **Cannot start** for approved, not-started Tasks the
projection reports blocked (context, entry gate, definition, broken). Waiting for dependencies stays
in **Waiting**. Recommended over renaming the group "Not started": the name stays true to what the
person can do, and the blocked case becomes visible as its own row. Config only; the Engine is
unchanged.

### Engine/Runtime changes requiring separate implementation work

1. **Remove lanes from the Engine:** `TaskLane` and `laneOf` in `workflow/operations/execution-read.ts`
   (and their export); the read model exposes neutral facts per Task instead: preparation status,
   position kind with step and attempt, whether a run exists, terminal outcome, broken, dependency
   state (`waitingFor`, `unsatisfiable`) and start blockers (from which `startBlocked` follows).
   These facts are available to every consumer (CLI, MCP) without any grouping.
2. **Contracts:** replace `TaskResource.lane` (`TaskLaneSchema`, `tasks/task-resource.ts`) with those
   facts; the Runtime's status line (`taskStatusOf`, `STATUS_OF_LANE` in
   `features/tasks/engine/projection.ts`) derives from facts, not lanes.
3. **Dashboard default grouping module** in the Runtime presentation layer (above), validated at
   load, replacing `GROUPS` in `features/tasks/workspace/engine-contribution.ts`; groups are sent as
   data with their summary prominence.
4. **Attention projection extension for start blockers** of approved, not-started Tasks, per the
   table above, each item with reason (code and human text), required actor and action (command
   and label).
5. **Specification-level `tasks-stuck` item with the affected Task ids** (the `waiting` position's
   `attention.taskIds`, always set for `tasks-stuck`), passed through the Runtime's attention list
   with the action that opens `/specs/:specId/tasks?blocking=specification`; the Tasks page route
   validates that search value and resolves the ids from the projection.
6. **Readable attention reasons and a per-Task attention flag** on the Task read (today the Runtime
   sends `"<step>: <reason>"`), so the Tasks page can mark rows.
7. **Now's explanation data:** the Specification read carries the `tasks-stuck` Task ids with each
   Task's blocking fact (draft, on hold, depends on a cancelled Task).
8. **Per-Specification Sessions read** for the Sessions section (this Specification's Sessions,
   recommended first; one waiting for input moves to Requires attention).

## Now block (Specification and Task)

The top of the Task page and of the Specification Overview, directly under the summary, is the
**Now** block: the one prominent region (accent block, section label "Now"). Everything below it
(Tasks, Documents, Context, Depends on) supports it with ordinary section weight. All of it comes
from the projection. Reading order:

1. **Subject status** when it changes what can happen (draft "needs approval before it can start",
   on hold with its reason; for an abandoned Specification its reason).
2. **Position**: the step title (primary) or Not started / Completed / Abandoned, then one quiet line
   (attempt, since, by whom; or first step; or how it continues) ending with the workflow and
   revision.
3. **Blocking reasons**, one line each with a link to where it is fixed: waiting (`Waiting for 5 of
6 tasks · See Tasks`, `Waiting for 1 dependency · See Depends on`, never repeating the list);
   missing required context (`1 required context entry is missing: Old login flow … See Context`).
4. **Latest hand-off**: `Last: Review · Changes requested · Dominik, 11:40` plus its
   feedback (how review-failed → rework reads on the new attempt).
5. **The one primary action**: Approve (draft), Resume (on hold), Start `<first step>`, Finish step,
   or Close specification (terminal); Return to earlier step is its secondary. A lifecycle primary
   (Approve, Resume) replaces the workflow actions and is not repeated in the header, whose overflow
   keeps the other lifecycle actions.

Full attempt history stays in the existing Secondary (Task history / Activity history). It is
**closed by default** and opened by the header history toggle (no half-empty side band). A terminal position is **Completed** or **Abandoned**.

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

- **Approve with missing required context** stays allowed and confirms first: an attention alert
  names the entry and says the task cannot start until it is fixed. Awaited process artifacts give
  no warning. Without a warning Approve acts directly.
- **Exit gates** come from the projection per result (label, met or not, detail, optional action);
  the UI knows nothing else about them. In the Finish dialog the selected result lists its gates
  ("Needed to finish with Done": met ones as satisfied checks, unmet ones with what is missing and
  an action such as **Create findings document**); while one is unmet, Finish is disabled for that
  result and other results stay available. In the Now block an active step lists its unmet gates
  under "To finish with <result>:".
- **Gate action round trip:** a gate action such as **Create findings document** closes the Finish
  dialog but keeps its draft (selected result, typed feedback, attached artifacts) and opens the new
  document in the Secondary editor; the Now block says the finish is kept. **Finish step** reopens
  the dialog with the draft and evaluates the gates again; a now-met gate shows as satisfied with a
  line that the result and feedback are as the person left them.
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
- **Narrow:** the Now block comes first; Documents, Context and Depends on are disclosures (title
  and count as the trigger, the **+** beside it), collapsed by default unless they hold a blocker
  (Context with a missing required entry opens).
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
- **What context is:** the inputs this Task needs before it starts. A **process artifact** entry is
  an input produced **earlier** in the process (for example by another Task); it is still required
  at start (entry gate). What this Task itself produces is **not** context: it is an **exit gate**
  of the step that produces it (and, if needed later, an entry gate of a later step). The add
  dialogs start with "Created earlier in the process (for example by another task)" ("Needed before
  this task starts…"); when checked, the item is named (path or id) instead of picked. A missing
  artifact is **Awaited**: neutral row ("Awaited: … is created earlier in the process. Needed when
  the step starts."), fact `Process artifact`, no warning and no blocker on Approve; the Now block
  lists it as one neutral line. Who produces it is not shown. Marking the Task's own document as a
  required artifact is refused by the Engine and shown in the dialog ("Not added: this is the
  task's own document … belongs to an exit gate").
- **Problems first, at every width:** the Context section lists the entries that need attention
  first (missing or broken, and awaited ones that are required), then **Show all N entries in
  order**, which shows every entry in its declared order (with **Show only entries that need
  attention** to go back). No separate Narrow layout; with no problems the full list shows.
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

**Close specification** is in the Overview header overflow; once the workflow is terminal
(completed or abandoned) it is also the Now block's one action. It opens the Engine Close
preflight (D07):

- **Blocked**: the description is one sentence saying why ("Single sign-on cannot close yet: its
  workflow is waiting for 5 unfinished tasks and one document is still being saved"). Groups follow
  in a fixed order: **Workflow** → **Unfinished tasks** → **Pending writes**. Each has a heading
  with its count, one explanation sentence, its items as links (linked id and title, then the
  state; at most five, then "and N more") and its resolving action where one exists (See workflow,
  Go to Tasks). No text repeats. Below the groups a quiet line: "Not going to finish this work?
  **Abandon instead**" (text link to the Abandon dialog, which keeps its reason and confirmation).
  Footer: only **Dismiss** (primary, initial focus).
- **Ready**: success summary and the cancelled Tasks listed as not delivered; **Close
  specification**; existing Git/workspace checks still run.

## Abandon (close without realization)

Owner decision. **Abandon is final**: there is no reopen. **Abandon specification** is a danger item in the Overview header overflow, shown
only when the projection allows it (never for a terminal Specification).

- **Dialog**: "Ends the specification without delivering it. This cannot be undone." A consequence
  list: the Specification workflow ends as **abandoned**; every **active attempt** is listed (Task,
  step, attempt, actor) and ends as abandoned with its work kept; every
  non-terminal Task is **cancelled**, including started ones (listed by id); nothing is marked
  delivered; documents, Tasks and history stay readable. A **required reason**. **Abandon
  specification** (destructive) / Cancel.
- **Blocked**: the same grouped-blocker layout as Close, in order **Pending writes** → **Agent
  sessions** (a running Managed Session on a Task step must be stopped first) → **Repository**
  (Git/workspace rules); only **Dismiss**.
- **Afterwards**: the Now block reads **Abandoned** with the reason (archive icon, status role) and
  **Close specification** as its one action; New task is gone; Activity history records the
  reason. Close lists every cancelled Task as
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
- Overview grouping and attention (owner, 2026-11-13): 1A one Specification-level `tasks-stuck`
  item with Task links, no per-draft attention; 2A start blockers that need a person become
  attention with reason, actor and action; 3A Now explains why the Specification cannot progress;
  4A compact Tasks summary, On hold stays a row; 5A grouping is dashboard configuration, not Engine;
  6A no checkboxes or bulk actions, F12 deferred; 7A section title "Tasks".

## Open questions

- Should Close-blocked point to Abandon as an alternative, or stay silent about it?
