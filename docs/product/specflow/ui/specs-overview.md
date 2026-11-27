---
id: product.specflow.ui.specs-overview
type: product
title: Specifications list (Specs Overview)
status: current
scope: specflow
areas: [ui]
tags: [specs, overview, attention, readiness, search, archive]
read_when:
  - changing the Specifications list, its sections, rows, search or Current/Archive switch
  - deciding what a Specification row may show or link to
  - adding a state or a responsive rule to the Specifications list
summary: >
  The Specifications list at "/": backend-owned Current sections from where each Specification's
  workflow run stands (Requires attention, In progress, Not started, Ended) or a flat list when the
  Runtime has no work status, the row anatomy (the current step, as the Overview's Now names it) and
  its information budget, Archive milestones, search with filtered counts and forced disclosure,
  responsive behaviour and states.
related:
  - product.specflow.ui.interaction-model
  - product.specflow.ui.shell-geometry
  - product.specflow.specification-creation
  - reference.api.specs-overview
  - design-system.principles.information-row-hierarchy
---

# Specifications list (Specs Overview)

The Specifications list (UI title **Specifications**; "Specs Overview" in code and the API) is the
default product entry at `/?collection=current|archive`. It answers, in order: what requires my
intervention now, what is being worked on (and at which step), what has not started, and what has
ended but is not archived yet. It does not own Task evidence, Session transcripts or workflow
inspection; those are reached after entering a Specification.

The read is `GET /api/specs/overview` ([Specs Overview API](../../../reference/api/specs-overview.md)).
Classification, ordering and section membership are Runtime-owned; the UI MUST NOT infer attention
from raw statuses, readiness from lifecycle strings, current execution from historical Session
associations, or a representative Task for a batch.

**Progress is the workflow run.** The manifest has no status (an older manifest's `status` key is
ignored); archived is the `specs/archive` location, the Archive collection. Sections and the
situation follow the Specification's workflow run, the same position its
[Overview](specification-overview.md)'s **Now** shows, in the same words and with the same
components, so the two screens never contradict each other. The Runtime reads every row in one
Engine read without Git (the Overview's own rules: Tasks, attention, start blockers), never one
request per row from the client.

## Current: sections

The Runtime supplies one `classification.section` per Specification and the enabled section ids in
display order (`sections`; a project may configure `specs.overview.current.sections` in
`.nevo/config.yaml`, ids only, no labels or rules). Defaults, in order:

1. **Requires attention** (`requires-attention`) — progress waits on a person: an attention item of
   the workflow (the Overview's Requires attention: a step to start, Tasks to decide, a blocker) or
   an attention signal on the Specification, a Task or a Session;
2. **In progress** (`in-progress`) — the run is at a step (an attempt works on it, it waits between
   attempts, or it waits for its Tasks), or a Session executes, without higher attention;
3. **Not started** (`not-started`) — the workflow run has not started;
4. **Ended** (`ended`) — the run ended (completed or abandoned) and Close has not archived it yet.

Precedence is `requires-attention > in-progress > not-started > ended`. `unknown` (**Status
unavailable**) holds a Specification whose workflow cannot be read; it is added after the configured
sections whenever a row needs it. A Specification appears in exactly one section. A section with no
rows is not rendered. The UI maps ids to its own i18n labels.

**Layout follows the data.** When no Specification in the collection has a real section or a
reason its workflow could not be read (a project Runtime that knows the Specifications but not
their work status), the list is **one flat list**: title and facts, an **Updated** column, and a progress column only when some row has
progress. It never shows a "Status unavailable" group with empty columns. The decision is taken
from the whole collection (`overviewCapabilities`), never from a search result, so typing does not
change the layout. A row the Runtime could not read (`unreadable`) is a status, not missing data:
it stays under **Status unavailable** with its reason, and a `busy` read (SpecFlow busy or
recovering from a stop) is the quiet marker **State unavailable · busy** with "Refresh the list in a
moment. If it keeps happening, restart SpecFlow.", not the danger line of files that cannot be read. A `recovery` read (the project lock
is held by a process nothing proves stopped) keeps the danger line and names the exact command
(`nevo-specflow specs documents recover --confirmed-stopped`, after stopping every SpecFlow
process of the project). An empty collection shows only the empty state, without column headers.

## Row anatomy and information budget

A row is one link to `/specs/:specId` (with the collection as return context) and has one stable
meaning: its destination never changes because another issue became the most important. There is
no trailing arrow and no row actions menu.

- **Title** (`title-sm`), the row's accessible name and primary hit area.
- **Facts line** under the title: key (monospace, muted: less prominent than the state), at most
  two tags plus `+N`, and the pull request(s). One pull request is an explicit nested link (`PR
#27`), the only allowed nested target; several are a non-interactive count (`3 PRs`) that never
  guesses a representative PR.
- **Situation**: where the workflow run stands, with the Overview's Now components in their
  compact list form (`StepProgress`, `TaskProgress`, the hand-off wording of `LastHandoff`) and its
  words, one source for both screens:
  - at a step: the **step title**; under it the DS segmented **step track** (compact); under that
    one line, the track's "Step N of M" and who or what the step waits for, as Now says it: the
    running attempt ("Attempt 1 · agent working since 11:18", "In progress since 11:18 · started
    by you"), between attempts **Ready to start**, or the hand-off the next attempt must act on
    (**Changes requested**, **Returned to this step**), and for a wait step its Tasks: "N ready to
    start", else "Waiting for N of M tasks";
  - **Not started**, with the not-started track and "First step · <title>" when the archetype's
    workflow resolves;
  - **Completed** (success check icon), with its Task progress in the Progress column ("12 of 12
    tasks done"); **Abandoned** (muted archive icon) with when it was abandoned, and no track and no
    Task progress.

  **Requires attention** leads with what to do, from the item the Overview's Requires attention
  lists first (the same record, `attention.first`): its intervention ("Resolve 2 blocking tasks"),
  else its action in the Overview's words ("Start Review the breakdown"; on a Task with the Task's
  title, "Resume · API"), else its reason; warning icon, attention tone. The step track stays under
  it, and its line says how many more items there are ("Step 5 of 7 · 1 more item requires
  attention"). An attention signal that is not the workflow's (a Session, demo only) keeps its
  passive icon (review: document inspection; blocked: warning; input, decision or unknown reason:
  conversation) with the step block as its one concurrent qualifier; without a workflow position a
  Session count ("1 session active") is that qualifier. Summary prose is never a link.

  A Specification whose workflow cannot be read says so in its row, **Could not read this
  Specification**, with why (`unreadable.reason`: its files are not valid, could not be read, the
  project was busy, or something unexpected the Runtime logged); the other rows are unaffected.

- **Progress**: the Overview's Task progress, compact (`TaskProgress`): the continuous bar (success
  fill) with "N of M tasks done", **No tasks yet** (muted) when the Specification has no Tasks, an
  explicit unknown/invalid text, and nothing for an abandoned run. Never a second segmented track:
  segments are the workflow's steps.

The row never lists Task ids, several concurrent signals, raw workflow labels, provider, model,
branch or owner details.

**Columns.** From a 48rem collection width the rows share column tracks with a column header:
Current `Specification | Situation | Progress` (`minmax(0,40rem) 15rem 8.25rem`), flat
`Specification | Updated [| Progress]`, Archive `Specification | Milestone | Pull request`. The
title track is bounded, so situation and progress stay next to the name on any width; the row
surface, hover and focus span the whole list while the rest of an ultra-wide row stays empty.
Text blocks above the rows (search field, notices) keep the title-track width
([App Shell geometry](shell-geometry.md)). Below 48rem each row stacks in the same order and the
Updated date moves into a line under the title.

The tracks, the column header and the 48rem switch belong to the shared collection pattern
(`CollectionColumns` in `shared/operational-list`), not to this list: its presets `specification`,
`specificationFlat`, `specificationFlatWithProgress` and `specificationArchive` are the columns
above, and the Tasks page and the Overview Task rows use the `task` preset of the same component
(`Task | Status`, `minmax(0,40rem) minmax(15rem,22rem)`, with an optional column header and one
supporting line under the status, at most two lines with pretty wrapping). A list changes its
geometry by choosing or adding a preset there, never with its own container queries.

**Section headers** are light full-width list sections (no filled band), not Cards: a leading disclosure chevron, the
label in the section's tone and the count, on the rows' content axis. Separation between sections
is larger than between rows. Rows follow
[information row hierarchy](../../../design-system/principles/information-row-hierarchy.md); no Card
per row or section.

**Dates.** An instant (Updated, an Archive milestone with a time) is shown as the calendar day in
the reader's time zone; a date-only value (`2026-09-01`) is shown as that day in every zone.

## Archive

Archive is historical browsing, not steering. Rows show the milestone, newest first (a note above
the list says so): **Completed** with its date when `completedAt` exists, else **Archived** with
`archivedAt`, else **Archived** without a date. The UI never synthesises a milestone date from
another field. Archive has no sections and no disclosure.

## Search, counts and disclosure

- A search field appears once the Current collection has at least 12 rows, in Archive as soon as it
  has one, and stays while a term is typed. It matches title, key, tags and `PR #n` within the
  selected collection.
- One filtered view feeds the rows, the section counts and the empty state. A count is the number
  of matching rows in that section; collapsing never changes it. Sections without a match disappear.
- A one-Specification section keeps the same heading, count and disclosure as a larger section.
  The heading communicates the Runtime classification; keeping its interaction stable avoids a
  different control as rows are added, removed or filtered. No special singleton layout is used.
- Every section starts expanded. Without a search term the chevron toggles its section
  (`aria-expanded`, "Collapse/Expand {section} section"). Collapse state is local to the mounted
  screen, not in the URL or settings.
- While a term is typed every section with a match is forced expanded: the chevron stays,
  `aria-disabled="true"`, named "{section} section expanded while search is active", and does
  nothing. Clearing the search restores the user's own collapse choices.
- No match is a filtered empty state ("try another title or clear the search") with a clear action,
  distinct from an empty collection.

## Header and actions

The header shows **Specifications** with a refresh indicator. Actions: **New specification**
(primary) when creation is available ([Specification creation](../specification-creation.md)) and
**Refresh**, which re-reads only the displayed collection and keeps the current rows while it runs.
An empty Current collection offers New specification in its empty state instead of the header. A
**Current / Archive** segmented control switches the collection (collection state, not workflow
state). The Background operations panel sits above the list when the host provides it.

## Responsive

Wide and Compact keep the same hierarchy in one Primary surface; navigation may be persistent or a
Drawer. Narrow keeps the same sections, summary and order with stacked rows; the whole row stays the
target and no critical state is hidden behind hover. On Narrow the header already names the screen,
so the page title under it is kept for assistive technology and focus only and is not shown again.

## States

- **Loading:** header and controls keep their geometry; restrained row skeletons.
- **Empty Current:** empty state with New specification. In project mode, a successful empty
  collection also reads the existing archetype catalogue. If it has no usable archetypes, replace
  the generic prose with the same short missing/invalid-definition blocker and **How to fix it?**
  details action used by
  [Create](../specification-creation.md#user-choices). Pending, failed and forbidden catalogue reads
  keep their distinct explanations; they never claim definitions are missing. New specification
  stays reachable for the full form. The empty state's Refresh re-reads creation availability after
  external repairs; the header Refresh retains its collection scope. Archive, search results and
  nonempty lists do not gain this first-run catalogue read.
  **Empty Archive:** concise empty state.
- **Read failed:** a notice with Retry; with rows already shown they stay (a transient refresh
  failure keeps the last permitted projection). A collection switch hides the previous collection.
  401 enters session recovery; 403 opens the standalone access-denied screen.
- **Demo:** a quiet sample label next to the collection switch when the Runtime serves demonstration
  data.
