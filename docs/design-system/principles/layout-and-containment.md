---
id: design-system.principles.layout-and-containment
type: engineering
title: Layout and containment guidelines
status: draft
read_when:
  - deciding whether content needs a Card, border, alternate surface, or divider
  - composing a list, detail page, settings page, inspector, or dashboard
  - reviewing nested surfaces or visually heavy UI
summary: >
  Borderless-first rules for grouping and containment. Start with typography, spacing,
  alignment and separators; use Cards and stronger surfaces only when an independently
  meaningful object or exceptional interaction genuinely needs containment.
related:
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.system-boundary
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.tailwind.styling-guidelines
---

# Layout and containment guidelines

## Purpose

Containment has a visual cost.

A border, alternate background, radius, or shadow tells the user that an area is a separate object.
Using that treatment everywhere destroys hierarchy and produces card soup: many equally weighted
boxes that are harder to scan than the information itself.

> **No Card by default. Start with typography, spacing, alignment, and separators. Add a contained
> surface only when it has a clear semantic or interaction reason.**

Product screen specs may add stricter local rules, but should link here instead of copying this
document.

## 1. Homogeneity rule

If repeated items have the same simple structure, do not turn every item into a Card merely to show
that the items are separate.

Prefer:

```text
Item title
metadata
────────────────

Item title
metadata
────────────────

Item title
metadata
```

over:

```text
[ Card: item title + metadata ]
[ Card: item title + metadata ]
[ Card: item title + metadata ]
```

Use semantic lists, rows, whitespace, and dividers when needed. A grid does not automatically justify
Cards.

Containment becomes more plausible when repeated items contain substantially different media or
internal structures that would otherwise be difficult to parse, but mixed media alone is not an
automatic Card requirement.

## 2. Independence and actionability rule

Purely informational fragments normally do not need their own container.

Examples that normally stay borderless:

```text
Name
Jan Kowalski

Email
jan@example.com

Phone
+48 123 123 123
```

Use typography and spacing to express the relationship.

Containment is more justified when the region is an independently meaningful object with its own
identity, state, interaction, or actions.

The presence of a button alone does not force a Card. The question is whether the whole region should
be perceived and operated on as one independent object.

A purely informational region may still need containment when it is an exceptional, deliberately
prominent object, for example one important summary or attention block at the top of a screen.

## 3. Reading-flow rule

Linear reading surfaces should remain visually linear.

Detail pages, Settings, review screens, forms, documentation, and Task details should normally be:

```text
Heading
supporting text

Section
content

Section
content

Section
content
```

not:

```text
[ Card: Section ]
[ Card: Section ]
[ Card: Section ]
```

Cards interrupt vertical reading flow and add repeated visual boundaries.

Multi-column scanning layouts can justify stronger independent surfaces more often, but containment
must still be earned by the object rather than by the grid itself.

## 4. Simple-cluster rule

Do not create a Card merely to bind a small cluster such as:

```text
icon
title
description
```

Typography, alignment, and gap are enough to communicate that those elements belong together.

Complexity is a heuristic, not a numeric license to add a Card. A richer independent object may
benefit from containment, but every part must still earn its visual weight.

## 5. Borderless-first rule

Before adding stronger containment, escalate through the lightest grouping mechanism that works:

```text
1. typography hierarchy
2. whitespace / semantic spacing
3. alignment
4. divider
5. subtle alternate surface
6. border / contained surface
7. shadow
```

Stop as soon as the grouping is clear.

For major vertical sections, first try one clear section-scale whitespace gap. In current product
layouts this will often visually correspond to roughly 24–32 px, but implementations should use the
design system semantic spacing scale rather than scattering raw values.

A shadow is a strong depth cue and should not be used merely to make a section look designed.

## Host-surface rule

Do not wrap a page in another Card when its host already provides the page surface.

Normal:

```text
AppWorkspace
└── Project Settings content
```

Avoid:

```text
AppWorkspace
└── Card
    └── Project Settings content
```

The same rule applies to dialogs, inspectors, drawers, and floating windows: their host surface
already provides containment.

## Nested-containment rule

A contained surface should not normally contain another visually contained surface.

Avoid:

```text
Settings Card
└── Provider Card
    └── Model Card
```

Prefer:

```text
Settings

Providers
Provider row
Provider row

Models
Model row
Model row
```

Nested containment is allowed only when the child remains an independently meaningful object whose
boundary is important even inside the parent.

If removing the child border/background does not make the relationship ambiguous, remove it.

## When a Card or strong surface is appropriate

A Card or similarly contained surface is reasonable when at least one strong reason exists:

- the whole region is an independently selectable or navigable object;
- it has its own meaningful state and dedicated actions;
- it is a deliberately exceptional summary or attention block that must stand out from surrounding
  linear content;
- several heterogeneous internal regions need one shared boundary to be understood as one object;
- the object participates in a genuinely multi-directional scanning layout where independent
  boundaries materially improve scanning.

Even then, use the lightest surface treatment that communicates the boundary.

## Lists and rows

Homogeneous collections should default to list/row treatment.

Rows may use:

- whitespace;
- a divider;
- hover/focus treatment;
- selected treatment;
- compact metadata;
- a trailing action or overflow menu.

Do not add a permanent border, radius, and alternate background to every row unless the row is truly
an independent contained object.

Selection and hover are interaction states, not reasons for permanent Card chrome.

### Scan-column rule

Dense operational lists should be designed for **vertical comparison**, not as a sequence of
independent mini-layouts. Before styling individual rows, identify the repeated semantic fields that
the eye is expected to compare and place them on stable horizontal scan columns.

A scan column is an alignment track, not necessarily a visible table column. It may be implemented
with CSS Grid, aligned flex regions, or another layout mechanism, but the visual contract is the
same: the same kind of information starts in the same place across sibling rows.

Stable alignment does not justify excessive whitespace. Scan columns SHOULD use the smallest
practical width and semantic gap that preserve vertical comparability and minimize eye travel.
Size bounded tracks against representative normal values, not a pathological longest value that
reserves unused space in every row. Keep lists list-shaped; alignment tracks do not require a table.

Prefer a column when users repeatedly compare the same attribute down the collection, for example:

- disclosure / selection / type affordance;
- stable key or short identity;
- primary title or label;
- progress or compact state summary;
- bounded trailing metadata or actions.

Do **not** create a column merely because horizontal space is available. Narrative or irregular
content belongs in the flexible content region instead of forcing every row into a spreadsheet.

For a dense list, define the collection's scan grammar explicitly. A common shape is:

```text
[ utility ] [ semantic marker ] [ identity / primary content ........ ] [ bounded trailing ]
[         ] [                 ] [ secondary summary / metadata ...... ]
```

The exact columns are product-specific, but these rules are general:

- the leading utility gutter is fixed and owned by the collection;
- repeated semantic columns keep the same start across sibling rows and states;
- the primary content column is flexible, normally equivalent to `minmax(0, 1fr)`;
- compact trailing columns size to bounded content instead of consuming an arbitrary percentage;
- semantically related trailing metadata stays near the content it qualifies rather than being
  pushed to the far edge of an ultra-wide surface;
- a missing value does not cause later columns to slide left if that would break vertical scanning;
- state changes content/emphasis inside the established tracks instead of inventing new columns;
- do not use `justify-content: space-between` or an unbounded `1fr auto` split when it creates a
  large dead zone between related values;
- do not use fixed 50/50-style splits unless the product genuinely contains two equally important
  reading regions.

A useful test is: **if the user traces one attribute vertically through three or more rows, that
attribute should normally have a stable scan column.**

### Grouped lists with disclosure

A grouped operational list is still one scanning system; it is not a stack of unrelated Accordion
cards.

The group header and its rows should share the same outer scan grid. Disclosure belongs in the
utility gutter. A semantic marker may have its own fixed marker column when that column is reserved
consistently, so adding colour/iconography to a header does not move the group label away from the
row content axis.

Example:

```text
[  ▾  ] [ ● ] Requires attention  3
[     ] [   ] UI-1234  Deterministic admission...
[     ] [   ] RT-1235  Runtime authorization...
```

If a product variant uses row selection, the checkbox occupies the existing utility track rather
than creating new indentation:

```text
[  ▾  ] [ ● ] Requires attention  3
[  □  ] [   ] UI-1234  Deterministic admission...
[  □  ] [   ] RT-1235  Runtime authorization...
```

Group-level colour is useful when it improves scanning, but keep row content comparatively neutral.
Do not repeat the same strong state colour in the header, every row, every badge, and every icon.

The group boundary should be stronger than an ordinary row boundary, while rows inside the group
remain visually regular.

### Responsive collapse of scan columns

Responsive design may merge columns, but it should not discard their semantic order.

Prefer this sequence:

1. keep the shared leading/content axis;
2. move low-priority trailing metadata into the secondary line;
3. merge secondary columns into a predictable compact line;
4. omit tertiary metadata only when the owning product contract permits it;
5. stack the primary title only when width pressure actually requires it.

Do not let each row choose a different wrapping strategy based on its current state. Compact and
Narrow layouts should remain recognizably the same collection grammar as Wide.

## State and colour

Containment and colour are separate decisions.

Do not make an ordinary section a coloured Card merely because it has a status.

Resolve:

```text
domain state
-> semantic tone
-> component treatment
```

and keep the rest of the surface neutral.

Use existing semantic components/tokens for warning, error, success, info, running, and neutral
states. Do not invent screen-specific colours to make boxes visually distinct.

## Review checklist

Before adding a Card, border, alternate background, radius, or shadow, ask:

1. Can typography and spacing communicate the grouping?
2. Are these repeated items homogeneous enough to be rows/list items?
3. Is this region independently meaningful, or is it just a section of the page?
4. Does the user read this surface linearly?
5. Is the proposed Card merely binding a title/description/icon cluster?
6. Is the host already a contained surface?
7. Would this create Card-inside-Card nesting?
8. Can a divider or subtle surface solve the problem with less visual weight?
9. Is the colour/state treatment semantic rather than decorative?
10. Does the composed screen still have a clear visual hierarchy when every repeated instance is present?

If the answer points to a lighter treatment, do not use a Card.
