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
  - changing Task selection on the Overview
summary: >
  Specification Overview: priority order of its sections, the measured two-column arrangement
  from 1408 px of content width with 16 px hysteresis, focus restore across a crossing, Activity
  history as an on-demand Secondary whose explicit choice holds per Specification for the visit,
  the preparation block and empty Tasks, and Task multi-selection.
related:
  - product.specflow.ui.shell-geometry
  - product.specflow.ui.interaction-model
  - product.specflow.ui.application-architecture
  - product.specflow.specification-creation
  - reference.api.specification-workspace
---

# Specification Overview

`/specs/:specId` is the main working context of one Specification. In the order the user needs it,
it lets them remember what the Specification is about, notice what requires them now, continue a
recent Session, see the remaining Task work, and open deeper Task, document or history context
without leaving the Specification. Sections are contributions of their owning features
([application architecture](application-architecture.md)); the read is the
[Specification Workspace API](../../../reference/api/specification-workspace.md).

## Sections and order

The summary (title and description) leads. Below it, by priority: **Requires attention**,
**Continue session**, other context (for example the repository section), the **preparation**
block, **Tasks**, **Documents**. Sections render whenever their data exists, independently of
whether Tasks exist: "no Tasks" only selects the preparation block and the empty Tasks state.

- **Preparation block** — shown when the Specification has no Tasks and no Session to continue.
  Heading **Prepare specification for execution**. When `actions.startSession` is available (or
  its reason is `no_provider`) it says that an agent session prepares the tasks and offers **Start
  session**, which opens `/specs/:specId/sessions/new`. With `sessions_disabled` or `forbidden` it
  only explains why there is no start here, without a button.
- **Empty Tasks** — the Tasks section keeps its **Tasks** header (the `#tasks-heading` target of the
  navigator's Tasks item) without count or execute control, followed by an inline, start-aligned
  empty state **No tasks yet** without glyph or actions.
- **Continue session** — one navigation row, not a card, for the Runtime's `recommendedSessionId`:
  the title (or **Untitled session**) is the row's link stretched over it, with the shared hover and
  focus tint and no trailing arrow. It shows the linked Tasks as a labelled count (`1 task`,
  `3 tasks`; nothing without a linked Task, never one chip per Task) and the Session status, which
  is Session readiness only ([AI session UX](ai-session-ux.md#session-status-ownership-accepted-2026-11-08)).
  **All sessions** is a quiet action in the section header and opens `/specs/:specId/sessions`.

## One or two columns

The arrangement follows the Overview's **content width**, not the viewport.

- **Below 1408 px** it is one left-aligned reading column (`content-standard`) in the order above.
- **From 1408 px** the summary spans two columns that fill the pane at the workspace's 16 px inset.
  The **work column** (left, flexible) holds Requires attention, the preparation block and Tasks.
  The **context column** (right, `22rem`–`30rem`) holds Continue session, then Documents and other
  related sections, then the repository section and any other context. Continue session has its own
  slot (`resume`), so its place never depends on module registration order.
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

**State across a crossing.** Work sections move without remounting, so a Task selection survives.
Context sections change parent and remount; their view state lives outside them (Documents' "show
all" is kept per Specification for the visit). Focus inside them returns to the same control, found
by its row's `data-focus-key` (`document:<id>`, `session:<id>`), but only when the crossing removed
the focused control; once the user moved focus, clicked inside the Overview or blurred to empty
space, a later crossing leaves focus alone. A Secondary opened from such a row returns focus to it
the same way.

## Activity history

Activity history is the Overview's Secondary on split-capable layouts, not part of the Primary.

- It is open by default only when the history has entries; an empty, unavailable, forbidden or
  not-provided history never reserves the Secondary and is shown on demand only. The "Specification
  created" event alone does not count as a reason to open it; a Session (later Task or document)
  event does.
- The Primary header toggle **Activity history** (clock icon, `aria-pressed`) shows and hides it;
  the open Secondary also has its own Close. While a Task or document preview covers the history,
  the toggle brings the history forward (after the preview's leave guard).
- **The user's choice wins.** Once the user shows or hides the history of a Specification, that
  choice holds for that Specification for the rest of the app session (in memory; a reload forgets
  it), including after leaving for Documents or a Session and coming back. Other Specifications are
  unaffected.
- Without a choice the default is taken when the Overview mounts, so a refresh or a first event
  never opens or closes the panel.
- On Narrow the **Activity history** action opens the history as a contextual flow.

## Task selection

- Every Task row has a leading checkbox, visible even when nothing is selected; selection needs no
  separate mode. While the Tasks are still in preparation the checkboxes are disabled.
- With nothing selected the Tasks header shows its progress count only; there is no "0 selected".
- With one or more Tasks selected the header shows the selected count and **Execute 1 task** /
  **Execute N tasks**. Its availability comes from the authoritative execution readiness; when it is
  unavailable the button is disabled with the reason as its title. The selected set is passed as one
  batch scope, never narrowed to one Task.
- A Task that disappears from the read leaves the selection; if the same id reappears later it is not
  silently selected again.

Selecting a Task row (outside its checkbox) opens the Task Preview in the Secondary; it performs no
workflow action ([interaction model](interaction-model.md)).
