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
  - implementing Specs Overview steering sections/items
  - creating Storybook/Figma fixtures for Spec signals
  - deciding how concurrent Spec/Task signals aggregate
summary: >
  Detailed product presentation contract for the Specs steering list: semantic queue projection,
  strict row/section presentation models, stable visual grammar, responsive behavior, interaction,
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
SpecsOverviewCollection
├── Current
│   └── section
│       ├── SpecSectionHeader
│       └── SpecListRow (Current row model)
└── Archive
    └── SpecListRow (Archive row model)
```

Current and Archive may share low-level visual primitives, but their bounded presentation semantics are
different and must not be collapsed into one catch-all metadata model.

Use Nevo UI Typography, interaction/focus primitives, StatusIndicator/Badge sparingly, Separator,
Tabs or SegmentedControl for Current/Archive, EmptyState, and Skeleton.

Do not create a generic DashboardCard abstraction.

The collection follows the shared
[scan-column rule](../../../design-system/principles/layout-and-containment.md#scan-column-rule).
Section headers and rows are one scanning system, not independently composed blocks.

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

The semantic marker has its own fixed scan column. It may carry restrained section colour, which keeps
section scanning fast without shifting the section label or colouring every row. Rows reserve the same
marker track even when they do not render a marker.

The section label and row identity therefore start on the same **content axis** after both leading
tracks. Implementations SHOULD realize this with one shared outer grid, for example:

```css
grid-template-columns:
  var(--spec-list-utility-gutter)
  var(--spec-list-marker-column)
  minmax(0, 1fr);
```

The exact token values belong to the owning implementation/design-system scale, but section and row
MUST use the same template. Do not recreate the leading columns independently in each state.

## 3. Source projection versus presentation model

The backend/application overview projection may remain rich enough to preserve semantic information:

```text
{
  id,
  title,
  key?,
  updatedAt,
  progress,
  classification,
  pullRequests?,
  tags?,
  signals[],
  currentExecutions[]
}
```

That rich projection MUST NOT be passed directly to `SpecListRow`.

The transport envelope is discriminated by collection. Current (`current`) carries one
backend-owned `classification`, rich evidence, and the ordered `sections` list. Archive uses a
separate historical source item with identity/progress/metadata and optional authoritative
`completedAt` / `archivedAt`, but no Current `classification`, `signals`,
`currentExecutions`, or `sections`. Archive MUST NOT fabricate Ready or other steering state to
satisfy the Current source schema.

A feature-owned mapper converts it to a bounded presentation model before rendering. The visual row
does not receive raw `signals[]`, raw `currentExecutions[]`, Task IDs, or arbitrary arrays of
metadata.

Reference presentation contract:

```ts
type CurrentSpecSectionId = 'requires-attention' | 'active' | 'ready' | 'draft';

type SpecListStateSummary =
  | {
      kind: 'attention';
      reason: 'input' | 'decision' | 'review' | 'blocked' | 'approval';
      count?: number;
    }
  | { kind: 'active'; executionCount: number }
  | { kind: 'ready' }
  | { kind: 'draft' };

type SpecListConcurrentQualifier = { executionCount: number };

type SpecListPullRequestSummary =
  { kind: 'single'; number: number; href: string } | { kind: 'multiple'; count: number };

type SpecListTagTuple = readonly [] | readonly [string] | readonly [string, string];

interface SpecListTrailingMetadata {
  pullRequests?: SpecListPullRequestSummary;
  tags?: SpecListTagTuple;
}

interface CurrentSpecListRowModel {
  id: string;
  key?: string;
  title: string;
  progress?: {
    completed: number;
    total: number;
  };
  sectionId: CurrentSpecSectionId; // derived from backend-owned classification.section
  stateSummary: SpecListStateSummary;
  qualifier?: SpecListConcurrentQualifier;
  trailing?: SpecListTrailingMetadata;
}

type ArchiveSpecHistorySummary =
  { kind: 'completed'; completedAt: string } | { kind: 'archived'; archivedAt?: string };

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

interface SpecListSectionModel {
  kind: SpecListSectionKind;
  label: string;
  count: number;
  items: readonly CurrentSpecListRowModel[];
}
```

The type names are illustrative, but the constraints are normative:

- Current and Archive row inputs are separate bounded presentation models, not the raw overview
  projection;
- `CurrentSpecListRowModel.sectionId` is backend-owned; row summaries do not determine classification;
- same-category multiplicity is represented by the dominant summary's count, never by repeating raw
  signals;
- `qualifier` is optional and may represent **one** materially useful concurrent lower-priority
  state; it is aggregate, non-interactive, and never contains Task IDs;
- when attention, ready, and active state coexist, authoritative current work is normally a more
  useful qualifier than merely-ready work because it changes the interpretation of what is happening
  now;
- tags are capped at two visible values;
- `pullRequests.kind: 'single'` renders one explicit PR link using the provided `href`; the
  component never constructs provider URLs;
- `pullRequests.kind: 'multiple'` renders bounded non-interactive metadata such as `3 PRs`; opening
  the Spec exposes the individual links;
- Archive rows use `ArchiveSpecListRowModel.history` instead of Current steering state; the UI formats
  the authoritative `completedAt` / `archivedAt` timestamp for display and does not invent
  historical prose from unrelated fields;
- Task IDs and per-Task signal labels are forbidden in the canonical Specs list row;
- arbitrary `string[]` metadata bags are forbidden because they make visual budget unenforceable.

If product requirements later need another summary fact, extend the corresponding Current or Archive
presentation contract deliberately rather than exposing raw source arrays or a generic metadata bag.

## 4. Primary queue ordering and sections

One Spec appears in **one canonical Current queue position**.

The default backend-derived Current sections are, in order:

1. **Requires attention** (`requires-attention`): any actionable human-attention condition belonging
   to the Specification, a Task, Session, review, decision request, or blocker.
2. **Active** (`active`): authoritative current execution or Session activity without higher-priority
   human attention. This is not necessarily the Specification lifecycle status.
3. **Ready** (`ready`): approved/ready for work, with no execution and no human attention.
4. **Draft** (`draft`): still in preparation, before Ready.

Precedence is `requires-attention > active > ready > draft`. Each Current Specification has one
backend-owned `classification.section`; attention wins even when work is concurrent. Internal
`working`, `quiet`, `issue`, and similar signals are evidence, not top-level sections.

The backend supplies enabled section IDs in display order through the Current projection's
`sections` list. Project-owned `.nevo/config.yaml` may configure
`specs.overview.current.sections` as an ordered list. A configured list enables only listed IDs.
The frontend renders the supplied order and maps stable IDs to its normal i18n keys. English labels
and generic rule expressions MUST NOT be put in YAML. Semantics remain backend-owned.

The sample repository supplies read records and Runtime derives Current classification from them.
Replacing the sample with persistent repository data must preserve this contract.

Within Requires attention, an active Session interaction waiting for the human is normally the
strongest signal. Beyond that, the application/read model should provide semantic priority rather
than the frontend reverse-engineering urgency from raw statuses.

Do not duplicate one Spec across sections. Lower-priority concurrent state stays in the source
projection and may contribute at most one bounded `qualifier` when omitting it would materially
misrepresent the row. The qualifier never changes the row's section or navigation target.

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

Every Current Spec row uses the same two-level skeleton and the same nested scan columns.

Wide conceptual shape:

```text
[utility][marker][ Deterministic admission and execution boundaries ........ ][ PR #27  Auth ]
                 [ UI-1234 ][ 5 / 9 tasks ][ Owner decision required ....... ]
```

Another state uses the same columns:

```text
[utility][marker][ Provider diagnostics and replay ......................... ][ Runtime ]
                 [ RT-104  ][ 2 / 8 tasks ][ 1 active session .............. ]
```

The title spans the secondary identity/progress/summary tracks, while trailing metadata occupies one
bounded trailing track. On the secondary line, key, progress, and state summary align vertically
across rows so the eye can compare them without re-parsing every item.

A suitable nested information-rail grid is conceptually:

```css
grid-template-columns:
  max-content /* key */
  max-content /* progress */
  minmax(0, 1fr) /* state summary / flexible title span */
  max-content; /* bounded trailing metadata */
```

Exact widths/gaps remain token-driven, but semantic fields MUST keep their scan column across sibling
rows. Optional values do not cause later columns to drift left.

Stable alignment does not justify excessive whitespace. Scan columns SHOULD use the smallest
practical width and semantic gap that preserve vertical comparability and minimize eye travel.
These are visual alignment tracks, not a requirement to turn the list into a DataTable.

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
2 / 8 tasks · 1 active session
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

The row interaction surface, divider, hover, and focus treatment span the available list
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

## 9. Section headers and vertical rhythm

Current sections are full-width list sections, not Cards.

A section header contains:

- disclosure chevron in the shared gutter;
- section label starting at the shared content axis;
- count.

Semantic tone may use restrained color/surface treatment, but it MUST NOT insert a new leading column
that moves the section label away from the Spec-key/title axis.

Use semantic color sparingly. The section may use a subtle surface or divider treatment, but do not
turn every status section into a strongly colored block.

Spacing ownership belongs to the section/list pattern:

- rows do not invent outer margins per state;
- row-to-row separation uses the row rhythm owned by the list;
- separation between status sections MUST use a larger semantic spacing token than separation between
  rows within one section;
- the visual gap after/before a section header must make the section boundary clearly stronger than a
  normal row boundary.

Normative relationship:

```text
sectionGap > rowGap
```

Use design-system spacing tokens rather than scattering literal pixel values.

## 10. Current versus Archive

### Current

Steering semantics dominate.

Render the backend-supplied Current sections; defaults are Requires attention / Active / Ready / Draft.

### Archive

Historical browsing dominates. Archive uses `ArchiveSpecListRowModel`; it does not reuse
`CurrentSpecListRowModel.stateSummary` or map historical completion to `quiet`.

The Archive mapper uses deterministic history precedence:

1. if authoritative `completedAt` exists, emit
   `{ kind: 'completed', completedAt }`;
2. otherwise, if authoritative `archivedAt` exists, emit
   `{ kind: 'archived', archivedAt }`;
3. otherwise, if the item belongs to the Archive collection, emit `{ kind: 'archived' }`.

Archive membership by itself is evidence only of Archive membership. It MUST NOT be converted to
`kind: 'completed'`, and the mapper MUST NOT synthesize a timestamp from the current time,
`updatedAt`, last activity, or another unrelated field.

When both lifecycle timestamps exist, completion wins because it describes the stronger historical
lifecycle fact while Archive membership remains a collection/storage distinction. An archived item
without an authoritative lifecycle timestamp renders neutral historical copy such as `Archived`
without a date.

Default:

```text
Archive

Search specs…

Spec Z
12 / 12 tasks · Completed Sep 24

Spec Y
...
```

Do not force archived Specs into Current Overview presentation sections based on
stale historical signals.

Search/filter becomes more important in Archive because the collection grows monotonically.

## 11. Payload-backed fixtures

Fixtures SHOULD retain rich source projection data where useful, but each story must assert or expose
the bounded presentation model produced for its collection: `CurrentSpecListRowModel` for Current
steering stories and `ArchiveSpecListRowModel` for Archive stories.

### SS-01 — attention

Source may contain Task-specific evidence, but row projection is aggregate:

```text
Requires attention  1

UI-1234  Deterministic admission
5 / 8 tasks · Owner decision required
```

No `TASK-03` appears in the canonical row.

### SS-02 — concurrent attention + ready + active

Source may contain several signals:

```text
attention: TASK-03 requires review
ready: TASK-05 ready
active: Reviewer on TASK-02/TASK-03
```

The backend supplies `requires-attention` as the section, an attention summary, and one materially
useful concurrent-work aggregate. The mapper preserves these decisions; it does not classify raw
signals. Current authoritative work occupies the qualifier slot rather than merely-ready work.

Rendered row remains bounded:

```text
Requires attention  1

UI-1234  Deterministic admission
5 / 9 tasks · Review required · 1 session active
```

This is representable as `stateSummary: { kind: 'attention', reason: 'review', count: 1 }` plus one
`{ executionCount: 1 }` qualifier. The ready signal remains preserved in the source projection and becomes explicit after entering the
Specification. The overview does not concatenate it into a fourth fragment or imply that it is the
dominant state.

### SS-03 — aggregate attention

```text
UI-1234  Deterministic admission
5 / 9 tasks · 3 tasks require review
```

### SS-04 — Spec-level attention

`stateSummary: { kind: 'attention', reason: 'approval' }`

```text
UI-1235  Authorization policy
3 / 7 tasks · Specification approval required
```

### SS-05 — Ready

```text
Ready  1

UI-1236  Localization preferences
0 / 5 tasks · Ready to start
```

### SS-06 — Active batch

```text
Active  1

RT-104  Provider diagnostics and replay
2 / 8 tasks · 1 active session
```

Do not choose a representative Task.

### SS-07 — Draft

```text
Draft  1

UI-1237  Navigation cleanup
4 / 7 tasks · In preparation
```

Draft means the Specification is still being prepared. Available remediation alone does not prove
human attention or active execution; the backend supplies classification from authoritative facts.

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

The localized date label is derived from the semantic history field; Archive does not fake a Current
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

### SS-11 — archived source without lifecycle timestamp

Source:

```ts
{
  id: 'spec-x',
  title: 'Legacy imported specification'
}
```

Archive membership maps to:

```ts
{
  id: 'spec-x',
  title: 'Legacy imported specification',
  history: { kind: 'archived' }
}
```

Rendered row:

```text
Legacy imported specification
Archived
```

No date is synthesized from the current time, `updatedAt`, last activity, or another unrelated
field.

## 12. Hover, focus, disclosure, and optional future selection

The whole row has one hover/focus treatment.

Hover and keyboard focus MUST use coherent rounded geometry from shared design-system radius
tokens. Resting rows keep subtle dividers; do not add another separator system or underline the
title on whole-row hover. Explicit PR links retain their independent link affordance.

Current Specs Overview does **not** expose Spec multi-select or bulk-Spec actions. Its row gutter is
empty while section headers use that same gutter for disclosure.

If a future product variant gains an actual selection capability and authoritative bulk actions, its
selection control occupies the existing fixed gutter and must not shift title alignment. The generic
DOM guidance below remains conditional on such a product contract.

Section disclosure is a real local interaction, not decorative iconography:

- every rendered section starts expanded on first mount;
- when Search is empty, the gutter chevron is a semantic button that toggles only that section's rows;
- in normal disclosure mode, the button exposes `aria-expanded` and an accessible name such as
  "Collapse Requires attention section" / "Expand Requires attention section";
- in normal disclosure mode, native button keyboard behavior applies, including Enter/Space
  activation and visible focus;
- collapsed/expanded state is local presentation state, is not encoded in the URL or persisted to
  project settings, and is preserved only while the Specs Overview remains mounted;
- collapsing a section does not change its count, ordering, underlying projection, or workflow state;
- the Search-specific forced-expanded mode below temporarily overrides toggling without mutating the
  saved normal disclosure state.

A small disclosure chevron (and any future selection control) may have a larger invisible hit target,
but the visible gutter width stays stable.

### Search, section counts, and disclosure

Search narrows the selected collection and must never leave a matching result hidden only because the
user previously collapsed its Current section.

For Current:

- `SpecListSectionModel.count` is the number of rows matching the current collection/filter in that
  section; collapse state never changes the count;
- when Search is empty, disclosure follows the normal toggle behavior above;
- a **non-empty Search query** activates filtered-disclosure behavior;
- while that query is non-empty, sections with zero matches are omitted and every section containing at
  least one match is **forced expanded** so no matching result can be hidden;
- while forced expansion is active, the visible disclosure control remains present for spatial
  consistency but is non-toggleable: expose `aria-expanded="true"` and `aria-disabled="true"`,
  and provide an accessible name that explains the temporary state, for example
  "Requires attention section expanded while search is active";
- pointer activation, Enter, and Space on that temporarily disabled disclosure control MUST NOT change
  row visibility or mutate any disclosure state;
- the empty -> non-empty query transition snapshots the user's current local disclosure state without
  overwriting it;
- activating the disabled control while Search is non-empty MUST NOT mutate that pre-search snapshot;
- changing one non-empty query to another recomputes visible rows/counts and forced expansion, but
  does not mutate the pre-search snapshot;
- clearing Search back to an empty query removes the temporary disabled state and restores the exact
  expanded/collapsed choices captured on the empty -> non-empty transition while the screen remains
  mounted;
- a no-match result is a filtered empty state, not an empty Current collection.

Archive has no Current semantic sections/disclosure. Search simply filters bounded
`ArchiveSpecListRowModel` rows; no-match Archive search is likewise distinct from an empty Archive
collection.

Nested PR control focus/hover, when present, must be visually distinct from the row target without
turning ordinary metadata text into buttons.

## 13. Data loading / events

Use one collection projection for the selected Current/Archive collection.

One feature-owned filtered view MUST feed rendered rows, section counts, and the no-results state.
Do not implement independent Search matching rules in the screen and collection renderer.

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

- section heading: clear but not oversized;
- identity/title: primary text;
- key: secondary/metadata treatment, visible but quieter than title;
- state summary: secondary text with restrained semantic tone where useful;
- progress/trailing metadata: muted/secondary;
- dividers subtle;
- attention carries the strongest semantic tone;
- active uses a restrained running/activity tone;
- Ready uses restrained success tone; Draft uses neutral tone and preparation prose;
- section semantics cannot rely on color alone;
- no decorative different strong background per section.

## 16. Containment rules

- no Card per Spec;
- no Card around each section;
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
spec-steering/ready-and-draft
spec-steering/batch-active
spec-steering/draft
spec-steering/archive-row
spec-steering/archive-completed-and-archived
spec-steering/archive-without-lifecycle-timestamp
spec-steering/long-title
spec-steering/max-trailing-metadata
spec-steering/multiple-pull-requests
spec-steering/ultra-wide
spec-steering/compact-wrap
spec-steering/narrow
spec-steering/search-matching-collapsed-group
spec-steering/search-no-matches
spec-steering/loading
spec-steering/empty-current
```

The concurrent-signals story must prove that a rich source projection still renders a bounded
secondary line rather than exposing all source details. The search/disclosure story starts with a
collapsed section, activates Search for a matching row, proves forced expansion, proves that the visible
disclosure control exposes `aria-expanded="true"` + `aria-disabled="true"` and cannot collapse the
matching result by pointer, Enter, or Space, changes to another non-empty query without mutating the
snapshot, then clears Search and proves exact restoration of the pre-search local disclosure state.
Archive stories must prove both that `completedAt` wins when both authoritative lifecycle timestamps
exist and that Archive membership without either timestamp maps to neutral `Archived` with no
synthesized date.

## 18. Acceptance criteria

1. A Spec appears once in the canonical Current queue.
2. Requires attention means human intervention is actually needed.
3. Default section order is `requires-attention > active > ready > draft`, backend-owned and configuration-driven, not derived from row signals in React.
4. The entire Spec row has one stable destination: the Specification.
5. Ordinary status/summary prose inside a row is non-interactive and is not styled as a link.
6. Only explicitly allowed external/contextual controls such as a linked PR may coexist with the row target, using sibling interactive elements rather than invalid nested controls.
7. Section headers and rows share one outer utility/marker/content grid: disclosure uses the utility
   track, restrained section colour may use the fixed marker track, and labels/row identity share one
   content axis. Current Specs Overview exposes no row-selection checkbox.
8. All Current rows preserve one primary-line + secondary-line skeleton and stable semantic scan
   columns across states; key, progress, summary, and bounded trailing metadata do not drift because
   another row has different content.
9. The secondary line is bounded to progress + dominant aggregate summary + at most one explicit
   concurrent qualifier; it does not render Task IDs or raw signal lists.
10. Current and Archive rows consume their strict bounded presentation models rather than raw
    `signals[]` / `currentExecutions[]` or one generic metadata bag.
11. One linked PR is an explicit link with a provided href; multiple PRs render as non-interactive
    aggregate metadata, and visible tags are capped at two.
12. Ultra-wide layout uses a full-width row surface with one bounded information rail, preventing a large dead zone between title and trailing metadata.
13. Section spacing is visually stronger than row spacing: `sectionGap > rowGap`.
14. Section chevrons are real disclosure buttons: with empty Search they toggle local state normally;
    with non-empty Search, matching sections are forced expanded and their visible disclosure controls
    are accessibly disabled/non-toggleable without mutating the saved normal disclosure state.
15. Search counts only filtered visible rows, omits zero-match sections, and restores the exact
    pre-search disclosure snapshot after Search clears.
16. Batch execution remains batch-shaped and never invents a representative Task.
17. Archive uses its historical bounded row model rather than Current steering state; authoritative
    `completedAt` takes precedence over `archivedAt`, Archive membership alone never implies
    completion, and an archived item with no authoritative lifecycle timestamp renders without a
    synthesized date.
18. Rows remain compact, cardless, scannable, and resilient at Wide, Compact, Narrow, long-title, and
    dense-metadata fixtures.
