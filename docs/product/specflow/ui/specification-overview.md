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
  (/specs/:specId/tasks) with its validated blocking filter.
related:
  - product.specflow.ui.shell-geometry
  - product.specflow.ui.interaction-model
  - product.specflow.ui.application-architecture
  - product.specflow.specification-creation
  - reference.api.specification-workspace
  - reference.api.task-reads
  - product.specflow.ui.specification-sessions
---

# Specification Overview

`/specs/:specId` is the control center of one Specification. In the order the user needs it, it
lets them remember what the Specification is about, see where its workflow stands and what it is
waiting for, act on what requires them now, see the Tasks at a glance, and continue a Session or
open a document. The full Task inventory is the Tasks page (`/specs/:specId/tasks`). Sections are
contributions of their owning features ([application architecture](application-architecture.md));
the read is the [Specification Workspace API](../../../reference/api/specification-workspace.md),
the Tasks page reads [Task reads, Tasks page](../../../reference/api/task-reads.md#tasks-page).

The detailed interaction contract (Now block, attention classification, grouping ownership) is the
[manual execution UX contract](../../../ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md#specification-overview-as-control-center-direction-accepted-refinements-decided-2026-11-13);
this document states what the product does.

## Sections and order

The summary (title and description) leads. Below it: **Now** (or the preparation block),
**Requires attention**, **Tasks** (work), then **Sessions**, **Documents** and other context (the
repository section). Sections render whenever their data exists.

Three concerns stay apart and the UI computes none of them: workflow state (the Engine's projection
and neutral Task facts), attention (the attention projection) and grouping (the Runtime's
dashboard configuration). The Overview renders what the reads deliver.

- **Now** — the Specification workflow's position: the step title and one plain line (attempt,
  since, by whom; or what the step does). For a `wait` step the Task progress appears here only,
  once: a segmented bar, "Tasks 1 of 6 done · 1 cancelled · 1 ended · 1 on hold" (zero parts
  omitted) and a line that cancelled (and ended) Tasks are not counted. When the wait cannot
  continue, one note names the blocking Tasks as links ("It cannot continue now: T-04 is a draft,
  T-05 is on hold and no other task is open."). Now offers the workflow's **main** action only:
  Start workflow, Finish step, or Close specification once it ended; none while the workflow waits
  by itself. When every result of the active step needs an unmet exit gate, the gate's action (for
  example **Open specification.md**) is the main action and Finish step waits, unavailable, in the
  menu. The **⋯** menu holds Return to an earlier step, Workflow history (Activity history) and
  one note with the step id and workflow revision. A terminal position shows a summary of the Tasks
  ("All 6 tasks done · 1 cancelled"); an abandoned one its reason under the title.
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
  Open task (restore a broken Task, meet an entry gate), Return to an earlier step (the
  Specification's Return dialog), Answer (the Session). Actions without a UI of their own yet
  (project settings, archetype configuration) are shown unavailable. The actor shows only when it
  is not the viewer. The Specification-level `tasks-stuck` item states the intervention ("Resolve 2
  blocking tasks · Approve, resume or cancel them so the specification can finish"); Now carries
  the diagnosis. On a narrow row the actions follow the title and reason.
- **Tasks** — a preview of the configured grouping, omitted without Tasks. Each group the
  configuration marks as a summary row gets one row: its name, then "1 task · T-04 Return users to
  where they were" (count, up to two Tasks, "N more"), opening the Tasks page at that group. A Task
  already named by Requires attention or Now appears by id only. Compact groups (Done, Cancelled,
  Ended) share one line of links that open the Tasks page with that group expanded. **All tasks**
  in the header opens the page. No checkboxes and no bulk actions.
- **Sessions** — the recommended Session first, then the Specification's other Sessions, at most
  three; the same row as in the [Specification Sessions list](specification-sessions.md#rows). A
  Session waiting for the person is in Requires attention instead, never twice. **All sessions** is
  a quiet header action; when the start is offered, the header's overflow menu holds **New
  session**.
- **Documents** — unchanged.

## Tasks page

`/specs/:specId/tasks` is the Specification's full Task inventory and the navigator's **Tasks**
item (a Full Task under it keeps Tasks active). It renders the Runtime's grouping as delivered, in
configured order, with the groups the configuration collapses (Cancelled, Ended) collapsed; the
section count is the progress text and the header offers **New task** when the Specification
projection allows it. A row is the Task row (title, id, Task Type) with one supporting line: a
flagged Task's "Requires attention · <reason>" (danger for a broken Task, a row of Cannot start
with what is readable of it), a Task the `tasks-stuck` item names "Requires attention · the
specification cannot continue until it moves", otherwise its neutral status line ("Draft · needs
approval · after T-02", "Waiting for T-02"). A filter by id or title is local state. No checkboxes
and no bulk actions (plan 06 F12 is deferred).

Its search is router-owned and validated; absence is the default:

- `blocking=specification` (the only value) keeps the Tasks the current `tasks-stuck` names, in
  their groups, resolved by the Runtime when read, never from ids in the URL. A filter bar shows
  "Blocking specification · 2 tasks" (or "Nothing blocks the specification now") with a clear
  button, and the count reads "2 of 7 shown". Review tasks pushes the entry; clearing replaces it.
- `group=<id>` opens the page at that group, expanded, and moves focus to its header.

The demo Runtime has no Tasks page read; the page renders the workspace read's grouping instead.

## Project mode: what the sections show today

On a project Runtime (not `--demo`) the Overview shows what the Engine and the Session store hold
([Specification Workspace API, Data source](../../../reference/api/specification-workspace.md#data-source)):

- **Description** — the overview document's first paragraph as plain text (at most 320 graphemes),
  rendered as delivered, never parsed as Markdown again; empty when there is no readable overview.
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
