---
id: product.specflow.ui.specification-overview
type: product
title: Specification Overview
status: current
scope: specflow
areas: [ui, workflow]
tags: [specification, overview, tasks, activity-history, responsive, focus]
read_when:
  - changing the Specification Overview at /specs/:specId, its sections or their order
  - changing the one/two-column arrangement, its threshold or focus behaviour
  - changing Activity history placement or its open/closed default
  - changing the Overview Tasks summary or the Tasks page (/specs/:specId/tasks)
  - changing what the Overview shows on a project Runtime (Now, Requires attention, Activity events, description)
summary: >
  Specification Overview as the control center of one Specification: summary, Now, Requires
  attention, the Tasks summary of the configured grouping, Sessions and Documents; the measured
  two-column arrangement from 1408 px of content width with 16 px hysteresis, focus restore across
  a crossing, Activity history as an on-demand Secondary, the preparation block, and the Tasks page
  (/specs/:specId/tasks) with its validated blocking and group filters.
related:
  - product.specflow.ui.shell-geometry
  - product.specflow.ui.interaction-model
  - product.specflow.ui.application-architecture
  - product.specflow.specification-creation
  - reference.api.specification-workspace
  - reference.api.task-reads
  - product.specflow.ui.specification-sessions
  - product.specflow.ui.workflow-execution
---

# Specification Overview

`/specs/:specId` is the control center of one Specification. In the order the user needs it, it
lets them remember what the Specification is about, see where its workflow stands and what it is
waiting for, act on what requires them now, see the Tasks at a glance, and continue a Session or
open a document. The full Task inventory is the Tasks page (`/specs/:specId/tasks`). Sections are
contributions of their owning features ([application architecture](application-architecture.md));
the read is the [Specification Workspace API](../../../reference/api/specification-workspace.md),
the Tasks page reads [Task reads, Tasks page](../../../reference/api/task-reads.md#tasks-page).

The Now block, its dialogs, Task authoring, Close and Abandon are described in
[Manual workflow execution](workflow-execution.md); the separation of workflow state, attention and
grouping is [ADR 0023](../../../architecture/decisions/0023-neutral-workflow-coordinator-and-manual-execution.md).

## Sections and order

The summary (title and description) leads. Below it: **Now** (or the preparation block),
**Requires attention**, **Tasks** (work), then **Sessions**, **Documents** and other context (the
repository section). **Tasks**, **Sessions** and **Documents** always keep their place: an empty
one is its header and the design system's inline empty state (`EmptyState variant="inline"`).
Requires attention appears only with items, or with its unavailable state when a source cannot
answer; it never shows empty (owner decision on the early-state Overview, variant E, 2026-11-15).

Three concerns stay apart and the UI computes none of them: workflow state (the Engine's projection
and neutral Task facts), attention (the attention projection) and grouping (the Runtime's
dashboard configuration). The Overview renders what the reads deliver.

- **Now** — the Specification workflow's position, in this order: the step title; the **step
  track** (the design system's `Progress` position mode) followed by its label "Step 2 of 7 · next:
  Design the solution" (the projection's `outline`; "Step 7 of 7" at the last step); one quiet line
  "In progress since 11:18 · started by you" ("Attempt 2 · …" only from a second attempt on, never
  "Attempt 1"); then the step's purpose. The track and the number show the step's position in the
  workflow definition, not progress (a workflow may loop or branch, and after a return the current
  segment moves back), and "next" appears only when the step leads to one step only. The track is
  one image named "Step 2 of 7: Write the Specification"; its visible label is not read twice.
  Before the first start the track outlines the first segment and its label reads "First step ·
  Gather requirements"; a completed workflow fills every segment ("All 7 steps · completed"); an
  abandoned one has no track (the outline no longer says where it stopped). On a `wait` step the
  track is compact and the Task progress bar stays the dominant one. Below a 40rem page the label
  goes under the track. For a `wait` step the Task progress appears here only,
  once: a continuous bar filled in the success tone (never a second segmented track under the step
  track) with its label to the right, "1 of 6 tasks done · 1 cancelled · 1 ended · 1 on hold" (zero
  parts omitted; below a 40rem page it goes under the bar); the label's tooltip says that cancelled
  (and ended) Tasks are not counted. When the wait cannot
  continue, one note names the blocking Tasks as links ("It cannot continue now: T-04 is a draft,
  T-05 is on hold and no other task is open."). Now offers the workflow's **main** action: Start
  workflow, Finish step, or Close specification once it ended; none while the workflow waits by
  itself. While a start is being recorded the Start button reads "Starting…" (busy) and the quiet
  line says the same until the new position is read, never a stale "Ready to start". Under the
  step's purpose, **Done when** lists the active step's exit gates as a neutral checklist (an unmet
  gate is an open circle with "not yet"; the list is shared with the Task Now, see
  [Now block](workflow-execution.md#now-block)). When every
  result of the active step needs an unmet exit gate that names a document, opening it (**Open
  behaviour.md**) is the main action, a line above the actions says what is missing ("Add the
  Acceptance section to behaviour.md to finish.") and **Finish step** stays beside it as the
  secondary action (its dialog shows what is still unmet). Beside the main action there is **at most
  one contextual secondary action**, chosen from projection facts, never from step ids: **New task**
  at an active step that produces Tasks while a Task may be created (`specification.createTask`;
  it opens the New task dialog), else **Open <document>** for an unmet exit gate that is not the
  main action, else nothing. New task is never dropped at such a step: when Finish step is not
  available (and no gate action replaces it) New task is Now's only action, primary-styled; beside
  an unmet gate's action and Finish step it stays as a quiet (ghost) button, one tap away. Now never
  offers "View N tasks", on any step, wait steps included: the Tasks section follows it. The
  **⋯** menu holds Return to an earlier step, Workflow history (Activity history) and one note with
  the step id and workflow revision; neither appears anywhere else in Now. A terminal position
  shows a summary of the Tasks ("All 6 tasks done · 1 cancelled"); an abandoned one its reason
  under the title. **Narrow containment:** below a 40rem page content container Now is a flush band
  across the body padding (`AccentBlock bleed="narrow"`, a container query, never a viewport
  check), not a card inside the sheet: its text lines up with the page gutter, the section after it
  drops its divider, and the tint and the 3 px bar stay. From 40rem (834 included) it is the card.
- **Preparation block** — in Now's place when the Specification has no workflow, no Tasks and no
  Session. Heading **Prepare specification for execution**. When `actions.startSession` is
  available (or its reason is `no_provider`) it offers **Start session**, which opens
  `/specs/:specId/sessions/new`; otherwise it explains the preparation path without a button
  (`sessions_disabled`, `forbidden`, any other reason).
- **Requires attention** — the attention items only, at most five, then **Show N more**, in the
  projection's priority order. Each item names what it is about (`T-07 · Backend`, Specification,
  `Session · Claude`), its reason (the attention tone, danger for a broken Task; an icon on the
  first text line) and the one action its code maps to an existing flow: Review tasks (the Tasks
  page filtered to the blocking Tasks), Edit context and Edit dependencies (the Task's section),
  Start step, Review new revision (the first-start confirmation), Cancel task (its confirmation),
  Open task (restore a broken Task, meet an entry gate), Resume (a held Task), Return to
  an earlier step (the Specification's Return dialog), Answer (the Session). Actions without a UI
  of their own yet (project settings, archetype configuration) are shown unavailable. The actor
  shows only when it is not the viewer. The Specification-level `tasks-stuck` item states the
  intervention ("Resolve 2 blocking tasks · Approve, resume or cancel them so the specification can
  finish"); Now carries the diagnosis. On a narrow row the actions follow the title and reason.
  A Task on hold appears here only when the Engine reports it (never from the status): escalated
  with no Specification step deciding it (`task-escalated` on the Task), or `on-hold-blocking`
  when open Tasks wait on it or the current step cannot finish while it is on hold (`blocks`).
  Its primary action **Resume** (`resume-task`) sets it ready right there (`on-hold → ready`,
  without a confirmation, like the Task page's Resume; a refusal is a notification; a repeated
  click while it runs sends nothing more, and the same holds for Start step), its alternative
  Cancel task. A hold that nothing waits on is not listed; its row shows
  "On hold" with the reason as its supporting line ([workflow kernel, Held Tasks](../../../architecture/workflow/workflow-kernel.md#continuation-and-attention)).
- **Tasks** — the Runtime's preview of the configured grouping, rendered as delivered, always as
  Task rows (no mode switch by Task count). Each group the configuration marks `row` shows its first
  Tasks (at most two, `TaskOverview.rows[].tasks`, chosen by the Runtime in importance order:
  Requires attention first, then held or unable to start with a Task waiting on it, then in
  progress, then Task order) as the Tasks page's own **Task row** ([below](#tasks-page)), on the same
  tracks without a column header. The rows switch with the Tasks page's one 48rem container query
  (no second width switch): at a tablet's 834 px the section is wider than 48rem and keeps the
  columns; on a phone the rows stack. There are no group headers: each row's status names its
  group, and groups are divided like the rows inside them. A held Task that requires attention
  shows the overlay and its hold reason, one line each. Under a group's last row a quiet link
  "2 more in Waiting" (the count beyond the preview and the
  group's name as the Runtime delivers it) opens the Tasks page filtered to that group
  (`?group=<groupId>`); a group that fits shows no link. The section therefore never exceeds
  row groups × 2 rows. Compact groups (Done, Cancelled, Ended) share one line of the same quiet
  links, "Done 2 · Cancelled 1", that open the Tasks page filtered to that group (owner decision at the final
  Overview approval, 2026-11-14). A held Task carries its Requires attention overlay on its row
  only when the Engine reports it; the Requires attention item with Resume and Cancel task is the
  section above (its Resume and Start step show busy while their command runs). **All tasks** in the header opens the page; the header's overflow menu holds
  **New task** when the projection allows creating a Task. Without Tasks the section keeps its
  place with one line, "Tasks appear when Break the solution down (step 4 of 7) finishes." when
  the run is certain to get to a step that produces Tasks (`outline.tasksStep`, never a step id: no
  branch on the way; the same line before the run reaches that step and while it is at it), else
  "No tasks yet", with a quiet **New task** beside it when allowed. No checkboxes and no bulk
  actions.
- **Sessions** — the recommended Session first, then the Specification's other Sessions, at most
  three; the same row as in the [Specification Sessions list](specification-sessions.md#rows). A
  Session waiting for the person is in Requires attention instead, never twice. **All sessions** is
  a quiet header action; when the start is offered, the header's overflow menu holds **New
  session**. A Specification without Sessions shows the Sessions page's text, "This specification
  has no sessions yet.", with **New session** (`chat-plus`) as the section's secondary action when
  the start is offered; never beside Start workflow. With Sessions turned off or an unreadable
  Sessions read the section is left out.
- **Documents** — the Documents page's own row (type glyph and file name, the type in the tooltip
  and read with the name) in a flat list, every row the same height, at most eight before **Show
  all**. Each row carries the shared document state label
  ([document state](documents-archetypes-ui.md#document-state-label)): **Initial content only**
  while the file is still the initial content the Engine wrote (the workspace read's
  `contentState: baseline`), and how the workflow uses the document now, from the Specification
  projection's `documentRelations`, with "this step" for the active step that Now shows (**Needed to
  finish this step**, in the attention tone only while it refuses Finish now). Both facts are named
  together only when both apply (**Initial content only · needed to finish this step**). When every
  listed document would carry the same content-only label, the header says it once ("4 · initial
  content only") and the rows carry none. The overflow menu opens all documents. A document opened from
  the Overview takes half of the workspace (50/50), and the Overview reads in one column beside it.

## Tasks page

`/specs/:specId/tasks` is the Specification's full Task inventory and the navigator's **Tasks**
item (a Full Task under it keeps Tasks active). It renders the Runtime's grouping as delivered, in
configured order, with the groups the configuration collapses (Cancelled, Ended) collapsed; the
section count is the progress text and the header offers **New task** when the Specification
projection allows it. No checkboxes and no bulk actions (plan 06 F12 is deferred).

It follows the [Specifications list](specs-overview.md) collection pattern: the `task` preset of
`CollectionColumns` (`minmax(0,40rem) minmax(15rem,22rem)`, `gap-x-6`), with a **Task | Status**
column header from 48rem of list width, group headers (dot, name, count) across both tracks, and
bounded tracks at any width while the row's hover and focus span the whole row. The filter by id
or title (local state) and the filter chip (blocking or group) are as wide as the title track. Below 48rem the
header is hidden and every row stacks: title, "id · Type", status, supporting line.

A row is the **Task row** (`TaskRow`, reused by the Overview Tasks section):

- **Task cell:** the title (`h3`, the link to the Full Task stretched over the row), then the id in
  mono and the Task Type ("`oidc-callback` · Implementation"). The title track is wide enough that
  an id does not break at Wide.
- **Status cell:** the status mark and label ([below](#task-status-presentation); "Waiting for
  T-02", "Draft · needs approval"), then at most two lines of support (pretty wrapping):
  - the **Requires attention overlay** when the Engine reports one for the Task, in the attention
    tone with `triangle-alert`. It is added under the status, never in its place. A Task on hold
    keeps its reason under the overlay (one line each, the full text in their tooltip), except an
    escalated one, whose overlay already quotes it. The row's item is the read's own `attention` field (the Task's own item, or
    the Specification's `task-escalated` naming it, resolved by the Runtime), or the `tasks-stuck`
    its `blocksSpecification` reflects; the row renders it and never derives attention. A broken
    Task gets no overlay line: its status already says it ("Cannot start · files broken"). The
    reason is worded from the item: a held Task that keeps the step from finishing "<step> cannot
    finish while this task is on hold" (it names the finish; its dependents only when it holds up
    no finish), one that holds up others "holds up T-02, T-03 (+N)", an escalated one "escalated
    to the specification: <feedback>", a Task the `tasks-stuck` names "<specification> cannot
    continue until it moves"; other reasons keep the Engine's message;
  - without an overlay, the hold reason of a Task on hold, verbatim (`holdReason` of the read; the label
    already says "On hold"), or the dependencies of a Task that has not run ("after T-02").

### Task status presentation

Every Task surface (Tasks page rows, Overview Task rows, Close blocker items, the Full Task status
line, Depends on rows) presents a status by its presented id, one mark and tone each:

| Status (label, presented id)           | Mark                                                    | Tone               |
| -------------------------------------- | ------------------------------------------------------- | ------------------ |
| Draft                                  | `edit`                                                  | neutral            |
| Ready to start (`ready`)               | info `StatusIndicator` dot                              | neutral            |
| Waiting                                | `clock`                                                 | neutral            |
| In progress                            | spinning `loader` (static under reduced motion)         | info               |
| On hold                                | `circle-pause`                                          | neutral            |
| Cannot start (`blocked`)               | none, its slot kept (until a Blocked state is designed) | neutral            |
| Done (`completed`)                     | `circle-check`                                          | success            |
| Cancelled, Abandoned                   | `close`, muted label                                    | neutral            |
| Cannot start · files broken (`broken`) | `circle-alert`                                          | danger (label too) |

One name per state: a status label matches the default grouping's group name ("Ready to start",
"Cannot start", "Done"; coordinator decision 2026-11-17).

One owner each in `features/tasks/read-model`: `getTaskStatePresentation` / `taskStatusSupporting`
(the status) and `taskAttentionOverlay` with its predicate `taskRequiresAttention` (the attention
wording, and whether a row has one at all). Requires attention is an overlay added under the
status, never a status, and only when the Engine reports it. The Runtime presents only the ids of
this table; an unknown id is a contract drift that development builds assert.

Its search is router-owned and validated; absence is the default:

- `blocking=specification` (the only value) keeps the Tasks the current `tasks-stuck` names, in
  their groups, resolved by the Runtime when read, never from ids in the URL. A filter bar shows
  "Blocking specification · 2 tasks" (or "Nothing blocks the specification now") with a clear
  button, and the count reads "2 of 7 shown". Review tasks pushes the entry; clearing replaces it.
- `group=<id>` (the Overview's "N more in <group>" and its compact links) lists only that group's
  Tasks, resolved by the Runtime when read (`GET /api/specs/:specId/tasks?group=<id>`), as rows
  without a group header (also a group the configuration collapses); focus stays where the page
  puts it. A filter chip names the group ("Waiting") with a clear button, and the section count
  reads "4 of 12 shown" (the one count); with none left, "No tasks in this group now". The link pushes the entry; clearing replaces it.
- The two never combine: with both in the URL, `blocking` is kept and `group` dropped.

Without Tasks the page names the step that produces them with the Overview's line ("Tasks appear
when … finishes."), from the same projection; without such a step it keeps its own description.

The demo Runtime serves the same Tasks page read: it runs the Engine's workflow over in-memory
state ([ADR 0025](../../../architecture/decisions/0025-demo-runs-the-engine-in-memory.md)).

## What the sections show today

The Overview shows what the Engine and the Session store hold. The demo Runtime renders the same
screens from the same reads: its Engine runs in memory over seeded state (Now, Requires attention,
Tasks and Full Task are a project's; Start, Finish and Task commands change that state until the
Runtime stops), and its documents, Sessions and history are the demo data
([Specification Workspace API, Data source](../../../reference/api/specification-workspace.md#data-source)):
([Specification Workspace API, Data source](../../../reference/api/specification-workspace.md#data-source)):

- **Description** — the first paragraph of the overview document's **Goal** section (else its
  first paragraph) as plain text (at most 320 graphemes),
  rendered as delivered, never parsed as Markdown again; empty when there is no readable overview.
  **Show more** (expanding the overview document) appears only when the description was cut (it
  ends with `…`) or there is none; a whole description has no Show more.
- **Now, Requires attention and Tasks** — the Engine's workflow projection and one execution read
  presented in the Runtime's dashboard grouping; an execution the Engine cannot read makes the
  Tasks summary say the Tasks are unavailable.
- **Activity history — partial.** It holds exactly two event kinds: **Specification created** (from
  the manifest's creation date) and **Session started** (one per associated, non-archived Session the
  caller may view, bounded by the workspace Sessions section's 100 rows), at most 50 events. A
  date-only event shows as a calendar date without time-zone conversion; other events show a
  relative time.
- **Documents** and **Sessions** come from the Engine's document registry and the Session
  association registry, independently of Tasks.
- Repository and Changes are not implemented in project mode and are hidden.

## One or two columns

The arrangement follows the Overview's **content width**, not the viewport.

- **Below 1408 px** it is one left-aligned reading column (`content-standard`) in the order above.
- **From 1408 px** the summary spans two columns that fill the pane at the workspace's 16 px inset.
  The **work column** (left, flexible) holds Now (or the preparation block), Requires attention and
  Tasks. The **context column** (right, `22rem`–`30rem`) holds Sessions, then Documents, then the
  repository section and any other context. Sessions has its own slot (`resume`), so its place
  never depends on module registration order.
- **No empty bands.** Each column stacks on its own; a missing section leaves no gap and both columns
  start on one line under the summary. Two columns need a section on each side; otherwise the
  Overview stays one column at any width.
- **No oscillation.** Two columns stay until the content is narrower than 1392 px (16 px
  hysteresis), which also absorbs a classic scrollbar appearing with the new arrangement.
- Opening the Secondary narrows the Overview and may return it to one column; that is intended.

Keyboard and reading order follow the visible order in both arrangements (one column in priority
order; two columns: the work column, then the context column). The width is therefore measured on a
zero-height sentinel (`useContainerMinWidth`), not a CSS container query, and the context sections
are not mounted before the first measurement.

**State across a crossing.** Work sections move without remounting. Context sections change parent
and remount; their view state lives outside them (Documents' "show all" is kept per Specification
for the visit). Focus inside them returns to the same control, found by its row's `data-focus-key`
(`document:<id>`, `session:<id>`), but only when the crossing removed the focused control; once the
user moved focus, clicked inside the Overview or blurred to empty space, a later crossing leaves
focus alone. A Secondary opened from such a row returns focus to it the same way.

## Activity history

Activity history is the Overview's Secondary on split-capable layouts, not part of the Primary.

- It is open by default only when the history has entries; an empty, unavailable, forbidden or
  not-provided history never reserves the Secondary and is shown on demand only. The "Specification
  created" event alone does not count as a reason to open it; a Session (later Task or document)
  event does.
- The Primary header toggle **Activity history** (clock icon, `aria-pressed`) shows and hides it;
  the open Secondary also has its own Close. Now's **Workflow history** opens it as well. While a
  Task or document preview covers the history, the toggle brings the history forward (after the
  preview's leave guard).
- **The user's choice wins.** Once the user shows or hides the history of a Specification, that
  choice holds for that Specification for the rest of the app session (in memory; a reload forgets
  it), including after leaving for Documents or a Session and coming back. Other Specifications are
  unaffected.
- Without a choice the default is taken when the Overview mounts, so a refresh or a first event
  never opens or closes the panel.
- On Narrow the **Activity history** action opens the history as a contextual flow.
