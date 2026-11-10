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
  The Specifications list at "/": backend-owned Current sections (Requires attention, Active,
  Ready, Draft) or a flat list when the Runtime has no work status, the row anatomy and its
  information budget, Archive milestones, search with filtered counts and forced disclosure,
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
intervention now, what is being worked on, what is ready to start, and what is still a draft. It
does not own Task evidence, Session transcripts or workflow inspection; those are reached after
entering a Specification.

The read is `GET /api/specs/overview` ([Specs Overview API](../../../reference/api/specs-overview.md)).
Classification, ordering and section membership are Runtime-owned; the UI MUST NOT infer attention
from raw statuses, readiness from lifecycle strings, current execution from historical Session
associations, or a representative Task for a batch.

## Current: sections

The Runtime supplies one `classification.section` per Specification and the enabled section ids in
display order (`sections`; a project may configure `specs.overview.current.sections` in
`.nevo/config.yaml`, ids only, no labels or rules). Defaults, in order:

1. **Requires attention** — progress waits on a human (a decision, review, input or blocker on the
   Specification, a Task or a Session);
2. **Active** — authoritative current execution or Session activity without higher attention;
3. **Ready** — ready for work, no execution and no attention;
4. **Draft** — still in preparation.

Precedence is `requires-attention > active > ready > draft`. A Specification appears in exactly one
section. A section with no rows is not rendered. The UI maps ids to its own i18n labels.

**Layout follows the data.** When no Specification in the collection has a real section (a
project Runtime that knows the Specifications but not their work status), the list is **one flat
list**: title and facts, an **Updated** column, and a progress column only when some row has
progress. It never shows a "Status unavailable" group with empty columns. The decision is taken
from the whole collection (`overviewCapabilities`), never from a search result, so typing does not
change the layout. An empty collection shows only the empty state, without column headers.

## Row anatomy and information budget

A row is one link to `/specs/:specId` (with the collection as return context) and has one stable
meaning: its destination never changes because another issue became the most important. There is
no trailing arrow and no row actions menu.

- **Title** (`title-sm`), the row's accessible name and primary hit area.
- **Facts line** under the title: key (monospace), at most two tags plus `+N`, and the pull
  request(s). One pull request is an explicit nested link (`PR #27`), the only allowed nested
  target; several are a non-interactive count (`3 PRs`) that never guesses a representative PR.
- **Situation**: one dominant summary from the classification. Attention carries one passive icon
  (review: document inspection; blocked: warning; input, decision or unknown reason: conversation)
  and the attention tone; Active says how many Sessions are active; Ready says **Ready to start**;
  Draft says **In preparation**. At most one concurrent qualifier (for example "1 session active"
  under an attention summary) when omitting it would misrepresent the row. Summary prose is never
  a link.
- **Progress**: a compact segmented bar with "N / M tasks", **No tasks yet** (muted) when the
  Specification has no Tasks, or an explicit unknown/invalid text.

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

**Section headers** are full-width list sections, not Cards: a leading disclosure chevron, the
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
target and no critical state is hidden behind hover.

## States

- **Loading:** header and controls keep their geometry; restrained row skeletons.
- **Empty Current:** empty state with New specification. **Empty Archive:** concise empty state.
- **Read failed:** a notice with Retry; with rows already shown they stay (a transient refresh
  failure keeps the last permitted projection). A collection switch hides the previous collection.
  401 enters session recovery; 403 opens the standalone access-denied screen.
- **Demo:** a quiet sample label next to the collection switch when the Runtime serves demonstration
  data.
