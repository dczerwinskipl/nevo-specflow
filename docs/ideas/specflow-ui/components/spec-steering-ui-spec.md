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
└── SpecListGroup
    ├── SpecListGroupHeader
    └── SpecListRow
```

Use Nevo UI Typography, interaction/focus primitives, StatusIndicator/Badge sparingly, Separator,
Tabs or SegmentedControl for Active/Archive, EmptyState, and Skeleton.

Do not create a generic DashboardCard abstraction.

The group header and every row share one **fixed selection/disclosure gutter** and one **content
start**. The gutter is owned by the list pattern, not by callers.

Conceptually:

```text
[ gutter ] [ content ------------------------------------------------------ ]

[   v    ] [ status marker ] Requires attention  3
[   □    ] UI-1234  Deterministic admission...              PR #27  Auth
[   □    ] UI-1235  Runtime authorization...                        Runtime
```

The group label and row identity text start on the same vertical axis. A chevron or checkbox MUST NOT
shift that axis.

Implementations SHOULD realize this with one shared layout contract, for example a two-column grid:

```css
grid-template-columns: var(--spec-list-gutter) minmax(0, 1fr);
```

The exact token/value for the gutter belongs to the owning implementation/design-system scale, but
group and row MUST use the same value. Do not recreate the gutter independently in each state.

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
  currentExecutions[]
}
```

That rich projection MUST NOT be passed directly to `SpecListRow`.

A feature-owned mapper converts it to a bounded presentation model before rendering. The visual row
does not receive raw `signals[]`, raw `currentExecutions[]`, Task IDs, or arbitrary arrays of
metadata.

Reference presentation contract:

```ts
type SpecListGroupKind = 'attention' | 'ready' | 'working' | 'quiet';

type SpecListStateSummary =
  | { kind: 'attention'; reason: 'agent-input' | 'owner-decision' | 'review'; count?: number }
  | { kind: 'ready'; readyCount: number }
  | { kind: 'working'; role?: string; taskCount?: number }
  | { kind: 'quiet' };

type SpecListTagTuple = readonly [] | readonly [string] | readonly [string, string];

interface SpecListRowModel {
  id: string;
  key?: string;
  title: string;
  progress?: {
    completed: number;
    total: number;
  };
  stateSummary: SpecListStateSummary;
  trailing?: {
    pullRequest?: {
      number: number;
      label?: string;
    };
    tags?: SpecListTagTuple;
  };
}

interface SpecListGroupModel {
  kind: SpecListGroupKind;
  label: string;
  count: number;
  items: readonly SpecListRowModel[];
}
```

The type names are illustrative, but the constraints are normative:

- row input is a bounded presentation model, not the raw overview projection;
- the secondary summary contains only aggregate/high-level state;
- tags are capped at two visible values;
- one PR summary may be visible; several PRs collapse to one compact aggregate representation rather
  than multiple chips;
- Task IDs and per-Task signal labels are forbidden in the canonical Specs list row;
- arbitrary `string[]` metadata bags are forbidden because they make visual budget unenforceable.

If product requirements later need another summary fact, extend the presentation contract
deliberately rather than exposing the raw source arrays.

## 4. Primary queue ordering and grouping

One Spec appears in **one canonical Active queue position**.

The semantic groups are:

```text
requires attention
ready
working
quiet / other active
```

For the current Specs Overview, use grouped sections. A future flat queue is a separate design
decision and must not be introduced as an implementation convenience.

An "issue" is not automatically its own human-attention category. If the issue requires owner
intervention, it contributes an attention summary. If the agent/system can remediate it without the
human, keep it in working/quiet with an appropriate aggregate reason.

Within Requires attention, an active Session interaction waiting for the human is normally the
strongest signal. Beyond that, the application/read model should provide semantic priority rather
than the frontend reverse-engineering urgency from raw statuses.

Do not duplicate one Spec into Attention + Ready + Working rows.

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

Forbidden examples in the canonical list:

```text
Owner decision required      // underlined/clickable prose
TASK-03 requires review      // task-level deep link inside row
Agent asks for input         // second competing row navigation target
+2 more                      // expandable signal navigation
```

The row summary may say what is happening, but opening the responsible Task/Session happens after
entering the Specification, where that context can be explained properly.

## 6. Row anatomy and information budget

Every active Spec row uses the same two-level skeleton.

Wide example:

```text
[□] UI-1234  Deterministic admission and execution boundaries     PR #27  Auth
             5 / 9 tasks · Owner decision required
```

Another state:

```text
[□] RT-104   Provider diagnostics and replay                      Runtime
             2 / 8 tasks · Reviewer working on 3 tasks
```

Hierarchy:

1. primary line: optional human-readable key + title + compact trailing metadata;
2. secondary line: task progress + one concise aggregate state summary;
3. no third signal/detail line in the normal list row.

The secondary line has a strict budget:

- task progress when known;
- one aggregate state summary;
- at most one additional aggregate qualifier only when omitting it would materially change the
  user's interpretation.

As a default, render no more than **2–3 high-level semantic fragments total** on the secondary line.
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

## 7. Horizontal composition and ultra-wide behavior

The row interaction surface, divider, hover, focus, and selection treatment span the available list
width. The **information rail inside the row** does not have to stretch title and trailing metadata
to opposite edges of an ultra-wide workspace.

Do not use an unbounded `1fr auto` arrangement that leaves a very large dead zone between title and
trailing metadata.

Use one of these equivalent constraints:

- cap the information rail with a rational design-system/product max width while the row surface
  remains full width; or
- use a grid/flex strategy where trailing metadata stays adjacent to the title region and remaining
  workspace width becomes neutral trailing space.

Conceptually:

```text
| full-width interactive row .................................................... |
| gutter | UI-1234 Title.................. PR #27 Auth | neutral remaining space   |
```

not:

```text
| gutter | UI-1234 Title.................... huge dead zone .............. PR #27 |
```

The exact max-width/token is an implementation/design-system decision, but visual verification on a
wide/ultra-wide viewport MUST prove that title and trailing metadata still read as one row.

## 8. Responsive behavior

Wide:

```text
[□] UI-1234  Deterministic admission and execution boundaries     PR #27  Auth
             5 / 9 tasks · Owner decision required
```

Compact:

```text
[□] UI-1234  Deterministic admission and execution boundaries
             5 / 9 tasks · Owner decision required · PR #27 · Auth
```

Narrow:

```text
[□] UI-1234
    Deterministic admission and execution boundaries
    5 / 9 tasks · Owner decision required
    PR #27 · Auth
```

Keep logically related content inline while useful width exists. Wrap because the viewport requires
it, not because a fixed split reserves empty space elsewhere.

Tertiary metadata may move below primary content or be omitted on Narrow, but the Spec identity and
aggregate state summary remain visible.

## 9. Group headers and vertical rhythm

Groups are full-width list sections, not Cards.

A group header contains:

- disclosure chevron in the shared gutter;
- optional semantic status marker;
- group label;
- count.

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

Group by attention / ready / working / quiet.

### Archive

Historical browsing dominates.

Default:

```text
Archive

Search specs…

Spec Z
12 / 12 tasks · Completed Sep 24

Spec Y
...
```

Do not force archived Specs into Requires attention / Ready / Working groups based on stale
historical signals.

Search/filter becomes more important in Archive because the collection grows monotonically.

## 11. Payload-backed fixtures

Fixtures SHOULD retain rich source projection data where useful, but each story must assert or expose
the bounded `SpecListRowModel` produced for rendering.

### SS-01 — attention

Source may contain Task-specific evidence, but row projection is aggregate:

```text
Requires attention  1

UI-1234  Deterministic admission
5 / 8 tasks · Owner decision required
```

No `TASK-03` appears in the canonical row.

### SS-02 — concurrent attention + ready + working

Source may contain several signals:

```text
attention: TASK-03 requires review
ready: TASK-05 ready
working: Reviewer on TASK-02/TASK-03
```

Rendered row remains bounded:

```text
Requires attention  1

UI-1234  Deterministic admission
5 / 9 tasks · 2 require attention
```

Do not concatenate all source signals.

### SS-03 — aggregate attention

```text
UI-1234  Deterministic admission
5 / 9 tasks · 3 tasks require review
```

### SS-04 — Spec-level attention

```text
UI-1235  Authorization policy
3 / 7 tasks · Specification approval required
```

### SS-05 — ready

```text
Ready  1

UI-1236  Localization preferences
0 / 5 tasks · Ready to start
```

### SS-06 — batch working

```text
In progress  1

RT-104  Provider diagnostics and replay
2 / 8 tasks · Reviewer working on 3 tasks
```

Do not choose a representative Task.

### SS-07 — issue/remediation without human attention

```text
Quiet  1

RT-105  Runtime recovery
4 / 7 tasks · Agent remediation available
```

If owner intervention is required, the projection belongs in Requires attention instead.

### SS-08 — quiet

```text
Quiet  1

UI-1237  Navigation cleanup
4 / 7 tasks · No immediate action
```

### SS-09 — archived

```text
Previous workflow hardening
12 / 12 tasks · Completed Sep 24
```

## 12. Hover, focus, selection, and bulk edit

The whole row has one hover/focus treatment.

When bulk selection is available, the checkbox occupies the same fixed gutter used by the group
disclosure control. Selection must not shift title alignment.

A small checkbox/chevron may have a larger invisible hit target, but the visible gutter width stays
stable.

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
- attention stronger than ready;
- working uses running/activity tone;
- quiet neutral;
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
spec-steering/ready
spec-steering/batch-working
spec-steering/remediation
spec-steering/quiet
spec-steering/archive-row
spec-steering/long-title
spec-steering/max-trailing-metadata
spec-steering/ultra-wide
spec-steering/compact-wrap
spec-steering/narrow
spec-steering/bulk-selection
spec-steering/loading
spec-steering/empty-active
```

The concurrent-signals story must prove that a rich source projection still renders a bounded
secondary line rather than exposing all source details.

## 18. Acceptance criteria

1. A Spec appears once in the canonical Active queue.
2. Requires attention means human intervention is actually needed.
3. Ready work remains separate from attention.
4. The entire Spec row has one stable destination: the Specification.
5. Ordinary status/summary prose inside a row is non-interactive and is not styled as a link.
6. Only explicitly allowed external/contextual controls such as a linked PR may be nested targets.
7. Group header text and row identity share the same content start; chevrons/checkboxes remain in one
   fixed gutter.
8. All active rows preserve one primary-line + secondary-line skeleton across states.
9. The secondary line is bounded to aggregate/high-level state and does not render Task IDs or raw
   signal lists.
10. The visual row consumes a strict presentation model rather than raw `signals[]` /
    `currentExecutions[]`.
11. Visible tags are capped at two and PR metadata is compact.
12. Ultra-wide layout does not create a large dead zone between title and trailing metadata.
13. Group spacing is visually stronger than row spacing: `groupGap > rowGap`.
14. Batch execution remains batch-shaped and never invents a representative Task.
15. Archive reads historically, not like stale Active steering.
16. Rows remain compact, cardless, scannable, and resilient at Wide, Compact, Narrow, long-title, and
    dense-metadata fixtures.
