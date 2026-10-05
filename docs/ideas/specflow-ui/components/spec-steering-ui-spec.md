---
id: ideas.specflow-ui.components.spec-steering
type: product
title: Spec steering collection and item UI spec
status: draft
scope: specflow
areas:
  - ui
tags:
  - specs
  - steering
  - attention
  - ready
  - working
  - issue
read_when:
  - implementing Specs Overview steering groups/items
  - creating Storybook/Figma fixtures for Spec signals
  - deciding how concurrent Spec/Task signals aggregate
summary: >
  Detailed product presentation contract for the Specs steering list: semantic queue projection,
  strict row/group presentation models, stable visual grammar, responsive behavior, interaction,
  data loading, fixtures, and cardless list composition.
related:
  - ideas.specflow-ui.components
  - ideas.specflow-ui.screens.specs-overview
  - ideas.specflow-ui.data-loading-refresh-and-eventing
---

# Spec steering collection and item UI spec

## 1. Responsibility

The steering collection helps the human choose the next Specification to inspect.

It is not a general analytics dashboard and it is not a miniature Task/Session inspector.

Each visible row must make these questions cheap:

- Which Spec is this?
- Does it need me now?
- Is it ready or being worked?
- What is the concise reason for its current queue position?
- What happens if I activate the row?

Detailed Task IDs, raw signal lists, Session identifiers, provider/model details, and other inspection
data belong after entering the Specification unless a future product decision explicitly promotes
one of them to summary-level information.

## 2. Component ownership and stable pattern

Product-owned composition:

```text
SpecSteeringCollection
├── Active
│   └── SpecListGroup
│       ├── SpecListGroupHeader
│       └── ActiveSpecListRow
└── Archive
    └── ArchiveSpecListRow
```

Active and Archive may share low-level visual primitives, but their bounded presentation semantics are
different and must not be collapsed into one catch-all metadata model.

Use Nevo UI Typography, interaction/focus primitives, StatusIndicator/Badge sparingly, Separator,
Tabs or SegmentedControl for Active/Archive, EmptyState, and Skeleton.

Do not create a generic DashboardCard abstraction.

The collection follows the shared
[scan-column rule](../../../design-system/principles/layout-and-containment.md#scan-column-rule).
Group headers and rows are one scanning system, not independently composed blocks.

The outer list grid owns three stable tracks:

```text
[ utility gutter ] [ semantic marker ] [ content ................................ ]
```

Conceptually:

```text
[      ▾       ] [ ● ] Requires attention  3
[              ] [   ] UI-1234  Deterministic admission...        PR #27  Auth
[              ] [   ] UI-1235  Runtime authorization...                  Runtime
```

The disclosure control occupies the utility gutter. Current Specs Overview rows have no selection
checkbox or bulk-Spec action, so that row track is empty; a future selection variant would reuse the
same track rather than introducing new indentation.

The semantic marker has its own fixed scan column. It may carry restrained group colour, which keeps
group scanning fast without shifting the group label or colouring every row. Rows reserve the same
marker track even when they do not render a marker.

The group label and row identity therefore start on the same **content axis** after both leading
tracks. Implementations SHOULD realize this with one shared outer grid, for example:

```css
grid-template-columns:
  var(--spec-list-utility-gutter)
  var(--spec-list-marker-column)
  minmax(0, 1fr);
```

The exact token values belong to the owning implementation/design-system scale, but group and row
MUST use the same template. Do not recreate the leading columns independently in each state.

## 3. Source projection versus presentation model

The backend/application overview projection may remain rich enough to preserve semantic information:

```text
{
  id,
  slug,
  title,
  summary?,
  updatedAt,
  lastMeaningfulActivityAt?,
  workflow,
  progress,
  signals[],
  currentExecutions[],
  completedAt?,
  archivedAt?
}
```

That rich projection MUST NOT be passed directly to `SpecListRow`.

A feature-owned mapper converts it to a bounded presentation model before rendering. The visual row
does not receive raw `signals[]`, raw `currentExecutions[]`, Task IDs, or arbitrary arrays of
metadata.

Reference presentation contract:

```ts
type SpecListGroupKind = 'attention' | 'in-progress' | 'ready-idle';

type SpecListStateSummary =
  | {
      kind: 'attention';
      reason: 'agent-input' | 'owner-decision' | 'review' | 'spec-approval';
      count?: number;
    }
  | { kind: 'in-progress'; role?: string; taskCount?: number }
  | { kind: 'ready'; readyCount: number }
  | { kind: 'idle'; reason: 'no-immediate-action' | 'agent-remediation-available' };

type SpecListConcurrentQualifier =
  | { kind: 'in-progress'; role?: string; taskCount?: number }
  | { kind: 'ready'; readyCount: number };

type SpecListPullRequestSummary =
  { kind: 'single'; number: number; href: string } | { kind: 'multiple'; count: number };

type SpecListTagTuple = readonly [] | readonly [string] | readonly [string, string];

interface SpecListTrailingMetadata {
  pullRequests?: SpecListPullRequestSummary;
  tags?: SpecListTagTuple;
}

interface ActiveSpecListRowModel {
  id: string;
  key?: string;
  title: string;
  progress?: {
    completed: number;
    total: number;
  };
  stateSummary: SpecListStateSummary;
  qualifier?: SpecListConcurrentQualifier;
  trailing?: SpecListTrailingMetadata;
}

type ArchiveSpecHistorySummary =
  { kind: 'completed'; completedAt: string } | { kind: 'archived'; archivedAt: string };

interface ArchiveSpecListRowModel {
  id: string;
  key?: string;
  title: string;
  progress?: {
    completed: number;
    total: number;
  };
  history: ArchiveSpecHistorySummary;
  trailing?: SpecListTrailingMetadata;
}

interface SpecListGroupModel {
  kind: SpecListGroupKind;
  label: string;
  count: number;
  items: readonly ActiveSpecListRowModel[];
}
```

The type names are illustrative, but the constraints are normative:

- Active and Archive row inputs are separate bounded presentation models, not the raw overview
  projection;
- `ActiveSpecListRowModel.stateSummary.kind` is the dominant semantic state and determines the one
  group that owns the Active row through the mapping below;
- same-category multiplicity is represented by the dominant summary's count, never by repeating raw
  signals;
- `qualifier` is optional and may represent **one** materially useful concurrent lower-priority
  state; it is aggregate, non-interactive, and never contains Task IDs;
- when attention, ready, and in-progress state coexist, authoritative current work is normally a more
  useful qualifier than merely-ready work because it changes the interpretation of what is happening
  now;
- tags are capped at two visible values;
- `pullRequests.kind: 'single'` renders one explicit PR link using the provided `href`; the
  component never constructs provider URLs;
- `pullRequests.kind: 'multiple'` renders bounded non-interactive metadata such as `3 PRs`; opening
  the Spec exposes the individual links;
- Archive rows use `ArchiveSpecListRowModel.history` instead of Active steering state; the UI formats
  the authoritative `completedAt` / `archivedAt` timestamp for display and does not invent
  historical prose from unrelated fields;
- Task IDs and per-Task signal labels are forbidden in the canonical Specs list row;
- arbitrary `string[]` metadata bags are forbidden because they make visual budget unenforceable.

If product requirements later need another summary fact, extend the corresponding Active or Archive
presentation contract deliberately rather than exposing raw source arrays or a generic metadata bag.

## 4. Primary queue ordering and grouping

One Spec appears in **one canonical Active queue position**.

The current Active collection has three semantic groups:

```text
requires attention
in progress
ready / idle
```

Cross-group priority is:

```text
attention > in-progress > ready-idle
```

The row-state mapping is deterministic:

- `attention` -> Requires attention;
- `in-progress` -> In progress;
- `ready` and `idle` -> Ready / idle.

Ready and idle remain distinct **row summaries** inside the same low-priority group. Ready means a
useful operation is available if the human chooses to start/continue it. Idle means no immediate
useful action or active progress needs emphasis. Within Ready / idle, ready rows sort ahead of idle
rows unless a more specific product ordering rule is introduced later.

For the current Specs Overview, use grouped sections. A future flat queue is a separate design
decision and must not be introduced as an implementation convenience.

An "issue" is not automatically its own human-attention category. If the issue requires owner
intervention, it contributes an attention summary. If the agent/system is actively remediating it
without human input, it belongs in In progress. If remediation is merely available or nothing is
currently progressing, it remains in Ready / idle with the appropriate row summary.

Within Requires attention, an active Session interaction waiting for the human is normally the
strongest signal. Beyond that, the application/read model should provide semantic priority rather
than the frontend reverse-engineering urgency from raw statuses.

Do not duplicate one Spec across groups. Lower-priority concurrent state stays in the source
projection and may contribute at most one bounded `qualifier` when omitting it would materially
misrepresent the row. The qualifier never changes the row's group or navigation target.

## 5. Interaction model and affordance budget

The **entire Spec row** is the primary interactive surface and has one stable meaning:

```text
Spec row -> Specification
```

Summary/status prose inside the row is non-interactive. It MUST NOT be styled as an inline link,
underlined action, or separate navigation target.

Allowed nested interactive exceptions are limited to genuinely different external/contextual
resources whose destination is obvious independently of the row, for example a linked pull request.
Such controls must be explicit compact controls/chips and must not visually compete with the row.

The DOM contract MUST remain valid when selection or nested controls exist:

- `SpecListRow` root is a non-interactive list/container element;
- the Specification navigation target is a real semantic link and owns the row's primary hit area;
- any future selection control and the linked-PR control are sibling interactive elements, never
  descendants of that link/button;
- activating a sibling selection control (when present) or PR MUST NOT trigger Specification
  navigation;
- keyboard focus order is predictable: future selection control when present, Specification target,
  then any allowed trailing interactive control;
- do not implement a clickable row by wrapping `<input>`, `<button>`, or another `<a>` inside
  one outer `<a>`/`<button>`.

A stretched-link technique MAY make the Specification link cover the otherwise non-interactive row
surface, provided sibling controls remain independently clickable/focusable and sit above that hit
layer.

Forbidden examples in the canonical list:

```text
Owner decision required      // underlined/clickable prose
TASK-03 requires review      // task-level deep link inside row
Agent asks for input         // second competing row navigation target
+2 more                      // expandable signal navigation
```

The row summary may say what is happening, but opening the responsible Task/Session happens after
entering the Specification, where that context can be explained properly.

## 6. Row anatomy, scan columns, and information budget

Every active Spec row uses the same two-level skeleton and the same nested scan columns.

Wide conceptual shape:

```text
[utility][marker][ Deterministic admission and execution boundaries ........ ][ PR #27  Auth ]
                 [ UI-1234 ][ 5 / 9 tasks ][ Owner decision required ....... ]
```

Another state uses the same columns:

```text
[utility][marker][ Provider diagnostics and replay ......................... ][ Runtime ]
                 [ RT-104  ][ 2 / 8 tasks ][ Reviewer working on 3 tasks ... ]
```

The title spans the secondary identity/progress/summary tracks, while trailing metadata occupies one
bounded trailing track. On the secondary line, key, progress, and state summary align vertically
across rows so the eye can compare them without re-parsing every item.

A suitable nested information-rail grid is conceptually:

```css
grid-template-columns:
  max-content            /* key */
  max-content            /* progress */
  minmax(0, 1fr)         /* state summary / flexible title span */
  max-content;           /* bounded trailing metadata */
```

Exact widths/gaps remain token-driven, but semantic fields MUST keep their scan column across sibling
rows. Optional values do not cause later columns to drift left.

Hierarchy:

1. primary line: title spanning the main reading columns + compact trailing metadata;
2. secondary line: stable key column + progress column + one concise aggregate state-summary column;
3. no third signal/detail line in the normal list row.

The secondary line has a strict budget:

- task progress when known;
- one aggregate state summary;
- at most one `qualifier` only when omitting concurrent state would materially change the user's
  interpretation.

Render no more than **three high-level semantic fragments total** on the secondary line: progress,
dominant summary, and the optional qualifier.
Do not enumerate individual Task IDs, multiple concurrent signals, raw workflow labels, provider
details, model/effort, branch, owner, reviewer, timestamps, and other available fields merely because
the data exists.

Good:

```text
5 / 9 tasks · Owner decision required
2 / 8 tasks · Reviewer working on 3 tasks
0 / 5 tasks · Ready to start
```

Bad:

```text
5 / 9 Tasks · Agent asks for input · TASK-03 requires review · +1 more · Reviewer · 2 Tasks
```

The mapper decides which aggregate fact wins; the visual row does not concatenate arbitrary source
signals.

Linked-PR examples:

```text
single   -> PR #27        // explicit link using the supplied href
multiple -> 3 PRs         // non-interactive aggregate metadata
```

The multiple-PR aggregate never guesses which provider page or representative PR should open. Enter
the Specification to inspect the individual links.

## 7. Horizontal composition and ultra-wide behavior

The row interaction surface, divider, hover, focus, and selection treatment span the available list
width. The **information rail inside the row** does not have to stretch title and trailing metadata
to opposite edges of an ultra-wide workspace.

Do not use an unbounded `1fr auto` arrangement that leaves a very large dead zone between title and
trailing metadata.

Use one shared pattern: the row surface remains full width, while the inner information rail is
bounded by a product/design-system max inline size and stays anchored to the content start. The rail
may shrink to `100%` on smaller viewports, but it MUST NOT expand indefinitely on ultra-wide
screens. Trailing metadata belongs inside that same rail, so any width beyond the rail becomes neutral
space after the related title/metadata cluster.

Conceptually:

```text
| full-width interactive row .................................................... |
| gutter | UI-1234 Title.................. PR #27 Auth | neutral remaining space   |
```

not:

```text
| gutter | UI-1234 Title.................... huge dead zone .............. PR #27 |
```

The exact max-inline-size token remains an implementation/design-system decision, but there is one
geometry family: full-width row surface + bounded information rail. Visual verification on a
wide/ultra-wide viewport MUST prove that title and trailing metadata still read as one row.

## 8. Responsive behavior

Wide preserves the full scan-column grammar:

```text
[utility][marker][ Deterministic admission and execution boundaries ........ ][ PR #27  Auth ]
                 [ UI-1234 ][ 5 / 9 tasks ][ Owner decision required ....... ]
```

Compact preserves the leading/content axis and the secondary comparison columns, but may move
trailing metadata into the secondary flow:

```text
[utility][marker][ Deterministic admission and execution boundaries ]
                 [ UI-1234 ][ 5 / 9 tasks ][ Owner decision required ][ PR #27 · Auth ]
```

Narrow keeps the same semantic order while collapsing comparison columns into a compact reading
sequence:

```text
[utility][marker][ Deterministic admission and execution boundaries ]
                 [ UI-1234 · 5 / 9 tasks ]
                 [ Owner decision required ]
                 [ PR #27 · Auth ]
```

Keep logically related content inline while useful width exists. Wrap because the viewport requires
it, not because a fixed split reserves empty space elsewhere.

Responsive collapse must happen **consistently for the collection**, not independently per row state.
Tertiary metadata may move below primary content or be omitted on Narrow, but Spec identity,
progress, and aggregate state summary remain discoverable in the same semantic order.

## 9. Group headers and vertical rhythm

Groups are full-width list sections, not Cards.

A group header contains:

- disclosure chevron in the shared gutter;
- group label starting at the shared content axis;
- count.

Semantic tone may use restrained color/surface treatment, but it MUST NOT insert a new leading column
that moves the group label away from the Spec-key/title axis.

Use semantic color sparingly. The group may use a subtle surface or divider treatment, but do not
turn every status group into a strongly colored block.

Spacing ownership belongs to the group/list pattern:

- rows do not invent outer margins per state;
- row-to-row separation uses the row rhythm owned by the list;
- separation between status groups MUST use a larger semantic spacing token than separation between
  rows within one group;
- the visual gap after/before a group header must make the group boundary clearly stronger than a
  normal row boundary.

Normative relationship:

```text
groupGap > rowGap
```

Use design-system spacing tokens rather than scattering literal pixel values.

## 10. Active versus Archive

### Active

Steering semantics dominate.

Group by Requires attention / In progress / Ready / idle.

### Archive

Historical browsing dominates. Archive uses `ArchiveSpecListRowModel`; it does not reuse
`ActiveSpecListRowModel.stateSummary` or map historical completion to `quiet`.

The Archive mapper uses deterministic history precedence:

1. if authoritative `completedAt` exists, emit
   `{ kind: 'completed', completedAt }`;
2. otherwise, if authoritative `archivedAt` exists, emit
   `{ kind: 'archived', archivedAt }`;
3. Archive collection membership by itself is not evidence of completion and MUST NOT be converted to
   `kind: 'completed'`.

When both timestamps exist, completion wins because it describes the stronger historical lifecycle
fact while Archive membership remains a collection/storage distinction.

Default:

```text
Archive

Search specs…

Spec Z
12 / 12 tasks · Completed Sep 24

Spec Y
...
```

Do not force archived Specs into Requires attention / In progress / Ready / idle groups based on
stale historical signals.

Search/filter becomes more important in Archive because the collection grows monotonically.

## 11. Payload-backed fixtures

Fixtures SHOULD retain rich source projection data where useful, but each story must assert or expose
the bounded presentation model produced for its collection: `ActiveSpecListRowModel` for Active
steering stories and `ArchiveSpecListRowModel` for Archive stories.

### SS-01 — attention

Source may contain Task-specific evidence, but row projection is aggregate:

```text
Requires attention  1

UI-1234  Deterministic admission
5 / 8 tasks · Owner decision required
```

No `TASK-03` appears in the canonical row.

### SS-02 — concurrent attention + ready + in-progress

Source may contain several signals:

```text
attention: TASK-03 requires review
ready: TASK-05 ready
in-progress: Reviewer on TASK-02/TASK-03
```

The mapper chooses `attention` as the dominant group/summary and one materially useful concurrent
qualifier. Current authoritative work wins the qualifier slot over merely-ready work in this case.

Rendered row remains bounded:

```text
Requires attention  1

UI-1234  Deterministic admission
5 / 9 tasks · Review required · Reviewer working on 2 tasks
```

This is representable as `stateSummary: { kind: 'attention', reason: 'review', count: 1 }` plus one
`in-progress` qualifier. The ready signal remains preserved in the source projection and becomes explicit after entering the
Specification. The overview does not concatenate it into a fourth fragment or imply that it is the
dominant state.

### SS-03 — aggregate attention

```text
UI-1234  Deterministic admission
5 / 9 tasks · 3 tasks require review
```

### SS-04 — Spec-level attention

`stateSummary: { kind: 'attention', reason: 'spec-approval' }`

```text
UI-1235  Authorization policy
3 / 7 tasks · Specification approval required
```

### SS-05 — ready inside Ready / idle

```text
Ready / idle  2

UI-1236  Localization preferences
0 / 5 tasks · Ready to start
```

### SS-06 — batch in progress

```text
In progress  1

RT-104  Provider diagnostics and replay
2 / 8 tasks · Reviewer working on 3 tasks
```

Do not choose a representative Task.

### SS-07 — available remediation inside Ready / idle

`stateSummary: { kind: 'idle', reason: 'agent-remediation-available' }`

```text
Ready / idle  2

RT-105  Runtime recovery
4 / 7 tasks · Agent remediation available
```

If owner intervention is required, the projection belongs in Requires attention instead.

### SS-08 — idle inside Ready / idle

`stateSummary: { kind: 'idle', reason: 'no-immediate-action' }`

```text
Ready / idle  2

UI-1237  Navigation cleanup
4 / 7 tasks · No immediate action
```

### SS-09 — archived

Presentation model:

```ts
{
  id: 'spec-z',
  title: 'Previous workflow hardening',
  progress: { completed: 12, total: 12 },
  history: { kind: 'completed', completedAt: '2026-09-24T16:30:00Z' }
}
```

Rendered row:

```text
Previous workflow hardening
12 / 12 tasks · Completed Sep 24
```

The localized date label is derived from the semantic history field; Archive does not fake an Active
`quiet` summary to render completion.

### SS-10 — archived source with completion and archive timestamps

Source:

```ts
{
  id: 'spec-y',
  title: 'Authentication hardening',
  completedAt: '2026-09-22T14:00:00Z',
  archivedAt: '2026-09-25T09:00:00Z'
}
```

Mapper result:

```ts
{
  id: 'spec-y',
  title: 'Authentication hardening',
  history: { kind: 'completed', completedAt: '2026-09-22T14:00:00Z' }
}
```

The later `archivedAt` does not replace authoritative completion semantics.

## 12. Hover, focus, disclosure, and optional future selection

The whole row has one hover/focus treatment.

Current Specs Overview does **not** expose Spec multi-select or bulk-Spec actions. Its row gutter is
empty while group headers use that same gutter for disclosure.

If a future product variant gains an actual selection capability and authoritative bulk actions, its
selection control occupies the existing fixed gutter and must not shift title alignment. The generic
DOM guidance below remains conditional on such a product contract.

Group disclosure is a real local interaction, not decorative iconography:

- every rendered group starts expanded on first mount;
- the gutter chevron is a semantic button that toggles only that group's rows;
- the button exposes `aria-expanded` and an accessible name such as
  "Collapse Requires attention group" / "Expand Requires attention group";
- native button keyboard behavior applies, including Enter/Space activation and visible focus;
- collapsed/expanded state is local presentation state, is not encoded in the URL or persisted to
  project settings, and is preserved only while the Specs Overview remains mounted;
- collapsing a group does not change its count, ordering, underlying projection, or workflow state.

A small disclosure chevron (and any future selection control) may have a larger invisible hit target,
but the visible gutter width stays stable.

### Search, group counts, and disclosure

Search narrows the selected collection and must never leave a matching result hidden only because the
user previously collapsed its Active group.

For Active:

- `SpecListGroupModel.count` is the number of rows matching the current collection/filter in that
  group; collapse state never changes the count;
- a **non-empty Search query** activates filtered-disclosure behavior;
- while that query is non-empty, groups with zero matches are omitted and groups containing matches
  are temporarily expanded so every result is discoverable;
- the empty -> non-empty query transition snapshots the user's current local disclosure state without
  overwriting it;
- changing one non-empty query to another recomputes visible rows/counts and temporary expansion, but
  does not mutate that pre-search disclosure snapshot;
- clearing Search back to an empty query restores the user's pre-search expanded/collapsed choices
  while the screen remains mounted;
- a no-match result is a filtered empty state, not an empty Active collection.

Archive has no Active semantic groups/disclosure. Search simply filters bounded
`ArchiveSpecListRowModel` rows; no-match Archive search is likewise distinct from an empty Archive
collection.

Nested PR control focus/hover, when present, must be visually distinct from the row target without
turning ordinary metadata text into buttons.

## 13. Data loading / events

Use one collection projection for the selected Active/Archive collection.

A Spec/Task semantic event should update/invalidate only affected item(s) where possible.

When a burst affects several Tasks in the same Spec, batch/coalesce into one resulting Spec row
update.

Do not render one row update per raw Task/provider event.

## 14. Refresh

One collection Refresh in header/overflow.

Refreshes selected collection only.

Does not hydrate Task details, Session histories, or documents.

Keep visible rows while refreshing.

## 15. Visual/token contract

- group heading: clear but not oversized;
- identity/title: primary text;
- key: secondary/metadata treatment, visible but quieter than title;
- state summary: secondary text with restrained semantic tone where useful;
- progress/trailing metadata: muted/secondary;
- dividers subtle;
- attention carries the strongest semantic tone;
- in-progress uses a restrained running/activity tone;
- Ready / idle remains neutral/subtle, with row prose distinguishing ready from idle;
- group semantics cannot rely on color alone;
- no decorative different strong background per group.

## 16. Containment rules

- no Card per Spec;
- no Card around each group;
- no nested signal Cards;
- no chip/badge for every available signal;
- use text hierarchy, spacing, alignment, subtle surfaces, and dividers;
- exceptional system-wide error may use Alert above the collection.

## 17. Storybook/Figma matrix

Required:

```text
spec-steering/attention
spec-steering/concurrent-source-signals-bounded-row
spec-steering/spec-attention
spec-steering/ready-idle
spec-steering/batch-in-progress
spec-steering/remediation-available
spec-steering/idle
spec-steering/archive-row
spec-steering/archive-completed-and-archived
spec-steering/long-title
spec-steering/max-trailing-metadata
spec-steering/multiple-pull-requests
spec-steering/ultra-wide
spec-steering/compact-wrap
spec-steering/narrow
spec-steering/search-matching-collapsed-group
spec-steering/search-no-matches
spec-steering/loading
spec-steering/empty-active
```

The concurrent-signals story must prove that a rich source projection still renders a bounded
secondary line rather than exposing all source details. The search/disclosure story starts with a
collapsed group, activates Search for a matching row, proves forced expansion, proves that the visible
disclosure control is `aria-disabled` and cannot collapse the matching result, then clears Search and
proves exact restoration of the pre-search local disclosure state. The Archive precedence story must
prove that `completedAt` wins when both authoritative completion and archive timestamps exist.

## 18. Acceptance criteria

1. A Spec appears once in the canonical Active queue.
2. Requires attention means human intervention is actually needed.
3. Cross-group priority is `attention > in-progress > ready-idle`; ready and idle remain distinct row
   summaries within the same Ready / idle group.
4. The entire Spec row has one stable destination: the Specification.
5. Ordinary status/summary prose inside a row is non-interactive and is not styled as a link.
6. Only explicitly allowed external/contextual controls such as a linked PR may coexist with the row target, using sibling interactive elements rather than invalid nested controls.
7. Group headers and rows share one outer utility/marker/content grid: disclosure uses the utility
   track, restrained group colour may use the fixed marker track, and labels/row identity share one
   content axis. Current Specs Overview exposes no row-selection checkbox.
8. All active rows preserve one primary-line + secondary-line skeleton and stable semantic scan
   columns across states; key, progress, summary, and bounded trailing metadata do not drift because
   another row has different content.
9. The secondary line is bounded to progress + dominant aggregate summary + at most one explicit
   concurrent qualifier; it does not render Task IDs or raw signal lists.
10. Active and Archive rows consume their strict bounded presentation models rather than raw
    `signals[]` / `currentExecutions[]` or one generic metadata bag.
11. One linked PR is an explicit link with a provided href; multiple PRs render as non-interactive
    aggregate metadata, and visible tags are capped at two.
12. Ultra-wide layout uses a full-width row surface with one bounded information rail, preventing a large dead zone between title and trailing metadata.
13. Group spacing is visually stronger than row spacing: `groupGap > rowGap`.
14. Group chevrons are real disclosure buttons: groups start expanded, expose accessible expanded
    state, and preserve local collapse state only while the screen remains mounted.
15. Search counts only filtered visible rows, omits zero-match groups, forces matching groups
    expanded, makes their visible disclosure control non-toggleable/accessibly disabled, and restores
    the exact pre-search disclosure snapshot after Search clears.
16. Batch execution remains batch-shaped and never invents a representative Task.
17. Archive uses its historical bounded row model rather than Active steering state; authoritative
    `completedAt` takes precedence over `archivedAt`, and Archive membership alone never implies
    completion.
18. Rows remain compact, cardless, scannable, and resilient at Wide, Compact, Narrow, long-title, and
    dense-metadata fixtures.
