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
  - changing what the Overview shows on a project Runtime (Tasks source, Activity events, description)
summary: >
  Specification Overview: priority order of its sections, the measured two-column arrangement
  from 1408 px of content width with 16 px hysteresis, focus restore across a crossing, Activity
  history as an on-demand Secondary whose explicit choice holds per Specification for the visit,
  the preparation block and empty Tasks, what project mode shows today (temporary Tasks source,
  partial Activity history), and Task multi-selection.
related:
  - product.specflow.ui.shell-geometry
  - product.specflow.ui.interaction-model
  - product.specflow.ui.application-architecture
  - product.specflow.specification-creation
  - reference.api.specification-workspace
  - product.specflow.ui.specification-sessions
---

# Specification Overview

`/specs/:specId` is the main working context of one Specification. In the order the user needs it,
it lets them remember what the Specification is about, notice what requires them now, continue a
recent Session, see the remaining Task work, and open deeper Task, document or history context
without leaving the Specification. Sections are contributions of their owning features
([application architecture](application-architecture.md)); the read is the
[Specification Workspace API](../../../reference/api/specification-workspace.md).

## Sections and order

**Proposed amendment (draft, awaiting owner approval):**
[Overview as control center](../../../ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md#specification-overview-as-control-center-proposal-awaiting-owner-approval)
replaces the Tasks section, its multi-selection and its `#tasks-heading` scroll target with an
Active tasks preview and a Tasks page (`/specs/:specId/tasks`); this document stays authoritative
until that contract is promoted.

The summary (title and description) leads. Below it, by priority: **Requires attention**,
**Continue session**, other context (for example the repository section), the **preparation**
block, **Tasks**, **Documents**. Sections render whenever their data exists, independently of
whether Tasks exist: "no Tasks" only selects the preparation block and the empty Tasks state.

- **Preparation block** — shown when the Specification has no Tasks and no Session to continue.
  Heading **Prepare specification for execution**. When `actions.startSession` is available (or
  its reason is `no_provider`) it says that an agent session prepares the tasks and offers **Start
  session**, which opens `/specs/:specId/sessions/new`. Otherwise it only explains the preparation
  path without a button: with `sessions_disabled` that Sessions are turned off on this server, with
  `forbidden` that the user may not start a Session for this Specification, and with any other
  reason that starting a Session is not available here.
- **Empty Tasks** — the Tasks section keeps its **Tasks** header (the `#tasks-heading` target of the
  navigator's Tasks item) without count or execute control, followed by an inline, start-aligned
  empty state **No tasks yet** without glyph, border or actions.
- **Continue session** — one navigation row, not a card, for the Runtime's `recommendedSessionId`:
  the same row as in the [Specification Sessions list](specification-sessions.md#rows) (provider
  mark, title or **Untitled session**, then age, agent and the associated Task count, then the
  Session status, which is Session readiness only;
  [AI session UX](ai-session-ux.md#session-status-ownership-accepted-2026-11-08)). The title is the
  row's link stretched over it, with the shared hover and focus tint and no trailing arrow. **All
  sessions** is a quiet action in the section header and opens `/specs/:specId/sessions`; when the
  start is offered, the header's overflow menu also holds **New session**.

## Project mode: what the sections show today

On a project Runtime (not `--demo`) the Overview shows what the Engine and the Session store hold
([Specification Workspace API, Data source](../../../reference/api/specification-workspace.md#data-source)):

- **Description** — the overview document's first paragraph as plain text (at most 320 graphemes),
  rendered as delivered, never parsed as Markdown again; empty when there is no readable overview.
- **Tasks — temporary source.** The section reflects only the verified manifest: with no Tasks there
  it is the empty Tasks state above; a manifest with Tasks has no verified schema yet, so the section
  shows the calm "Not available on this server" state. This source is temporary until the workflow
  kernel's Task source replaces it, so project mode shows no real Task rows today
  ([open follow-up](../../../ideas/specflow-runtime/project-mode-spec-overview/README.md#open-follow-ups)).
- **Activity history — partial.** It holds exactly two event kinds: **Specification created** (from
  the manifest's creation date) and **Session started** (one per associated, non-archived Session the
  caller may view, bounded by the workspace Sessions section's 100 rows), at most 50 events. No
  Task, document or commit events exist yet ([open follow-up](../../../ideas/specflow-runtime/project-mode-spec-overview/README.md#open-follow-ups)). A date-only event shows as a calendar date without time-zone conversion; other
  events show a relative time.
- **Documents** and **Continue session** come from the Engine's document registry and the Session
  association registry, independently of Tasks.
- Repository and Changes are not implemented in project mode and are hidden.

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
