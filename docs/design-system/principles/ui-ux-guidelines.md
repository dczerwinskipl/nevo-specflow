---
id: design-system.principles.ui-ux-guidelines
type: engineering
title: UI/UX engineering guidelines
status: draft
read_when:
  - implementing or reviewing a UI screen or component
  - choosing typography, color, or spacing
  - designing progressive disclosure or an inspector
  - doing visual verification before marking UI work done
summary: >
  Portable engineering rules for building UI: validate the composed screen, semantic
  typography/color/spacing tokens, information hierarchy, progressive disclosure, and
  mandatory visual self-review. Product-specific UX (AI sessions, SpecFlow UI screens) is
  under product/specflow/ui/.
related:
  - design-system.principles.information-row-hierarchy
  - design-system.principles.layout-and-containment
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.tailwind.styling-guidelines
  - design-system.implementation.storybook.guidelines
  - product.specflow.ui.interaction-model
---

# UI/UX engineering guidelines

`status: draft` — technology-agnostic guidance on building UI well. What a particular Nevo SpecFlow surface should _show and do_ — personas, screen contracts, AI-session behaviour
— lives under [`../../product/specflow/ui/`](../../product/specflow/ui/) and
[`../../product/specflow/cli/`](../../product/specflow/cli/).

## Core design rules

- **Validate the composed screen, not the component in isolation.** A component that
  looks right in Storybook can still be wrong in the real screen. Check it in context.
- **Design around the user's questions.** Every surface answers a small set of "what do
  I need to know / do here" questions. Content that answers none of them is noise.
- **Visual weight is cumulative.** Borders, shadows, bold text, colour, and spacing each
  add weight; if everything is emphasised, nothing is.
- **Design the host surface first.** Embedded content (a card, an inspector panel)
  respects the host's hierarchy — it does not compete with it.
- **Available space is not an information budget.** Fill space with breathing room, not
  with more data because it fits.

## Information hierarchy

Primary / secondary / tertiary must be distinguishable at a glance. Repetition reduces
emphasis — the tenth identical badge carries less signal than the first, so compress
repeated content rather than repeating a heavy treatment.

Design the hierarchy from the user's **first scan**, not from the shape of the backend model or from
how much horizontal space is available. Before composing a screen, write down the small ordered set
of questions the user should answer without opening deeper detail. For each question, decide:

1. whether it is primary, secondary, tertiary, or deliberately hidden behind inspection;
2. where it belongs in the reading/scan order;
3. how much information it is allowed to consume;
4. whether it changes normal visual emphasis when it requires immediate human attention.

A useful design sequence is:

```text
user question
  -> priority
  -> placement in scan/reading order
  -> visual weight
  -> information budget
  -> deeper detail target when needed
```

Semantic importance and permanent visual weight are not the same thing. A fact can be important to
the domain while still being quiet in the normal view. Conversely, an exceptional condition that
requires the user now may temporarily become the strongest region without changing the underlying
information architecture.

Do not infer hierarchy from DTO field order, object nesting, the number of available fields, or a
generic dashboard convention. When product semantics do not establish which information should win
the first scan, the decision belongs to the owning product/UX contract rather than implementation.

## Stable composition and repeated structures

Repeated informational/operational items use the canonical
`design-system.principles.information-row-hierarchy` pattern for primary/secondary/supporting
information and interaction treatment.

Collection-level scan columns, utility gutters, grouped-list geometry, containment, and responsive
collapse are governed by `design-system.principles.layout-and-containment`.

Product UX owns which facts occupy those semantic slots. A different entity type is not, by itself, a
reason to invent a different visual grammar.

## Typography

Use **semantic typography tokens** (role-named: heading, body, label, metadata,
narrative), never raw font sizes scattered through components. Readability before
density. Narrative prose and dense metadata (counts, timestamps, ids) get visibly
different treatments.

## Colour

- Neutral foundation; colour carries **meaning**, not decoration.
- **Type uses shape; state uses colour.** Do not encode a category purely as a colour.
- Map states to a small semantic vocabulary (e.g. success / warning / error / info /
  neutral) and to a consistent tone, rather than picking ad-hoc colours per component.

## Spacing and grouping

Use a small semantic spacing scale. Prefer grouping by whitespace and hierarchy before
reaching for borders and boxes.

Detailed Card, surface, nesting, row/list, and borderless-first rules live in
[Layout and containment guidelines](layout-and-containment.md).

## Progressive disclosure

Deeper levels increase **specificity**, not just volume. Give each level an information
budget and keep to it. Hidden detail must be **discoverable** — an obvious affordance to
go deeper. Do not promote inspection-only data (raw payloads, internal ids) to a
summary level. (The specific level model for SpecFlow UI's AI Work view is in
[`product/specflow/ui/ai-session-ux.md`](../../product/specflow/ui/ai-session-ux.md).)

## Interaction hierarchy

One obvious primary interaction per surface. Icon semantics must be consistent and
learnable. A small icon still needs a comfortably large hit target.

For surface-level actions, prefer one visible primary action when the header has useful space and move
secondary actions into overflow. Constrained headers may move all actions into overflow rather than
compressing the title or creating several equally strong buttons.

Selection should normally change **action emphasis, not layout geometry**. If a collection reserves a
selection gutter or an action region, keep those anchors stable while selection changes which actions
are enabled or promoted. A selected-count label may remain absent at zero and appear only when it
communicates useful state.

A decision action may appear both as a convenient surface/header action and again at the natural end
of a deliberate evidence-reading flow when both affordances invoke the same authoritative command
and share pending/disabled state. Do not duplicate ordinary actions merely to fill space.

## Loading and live state

Give immediate feedback on an action. A "busy" indicator is shown only when something is
actually in progress, not as decoration. Distinguish a **settled** view from one that is
**still updating**.

## Responsive hierarchy

The hierarchy is the same across breakpoints; what changes is density and whether a
level is inline or behind a tap. Reducing density on small screens must not drop the
primary answer.

## Mandatory visual verification

Rendered inspection is part of the definition of done for UI work. Passing tests and correct source
code are not evidence that a composed screen looks correct.

Before marking any UI task done:

1. Render every affected story/screen without a backend where deterministic fixtures can represent
   the state.
2. Run the relevant component, interaction, and accessibility tests.
3. Inspect every responsive layout mode affected by the change. At minimum check:
   - a representative desktop / Wide viewport;
   - a Compact viewport around the relevant workspace breakpoint when the surface participates in
     responsive workspace composition;
   - mobile at approximately 375 px;
   - approximately 320 px when controls, labels, metadata, or multi-column content make overflow
     plausible.
4. Use realistic fixtures, including long titles/labels and dense/repeated content where those cases
   are possible. Conveniently short placeholder text is not sufficient visual coverage. For repeated
   operational collections, include at least one stress fixture that mixes very short rows with
   intentionally extreme but valid keys, titles, counts, summaries, and trailing metadata. Verify
   that the collection remains vertically scannable rather than merely avoiding overflow.
5. Inspect the composed application, not only an isolated Storybook story, when correctness depends
   on App Shell / AppWorkspace composition, viewport height, scrolling, routing, sticky/fixed
   regions, or Primary/Secondary behavior.
6. When exact colours, spacing, dimensions, overflow, or animation matter, inspect **computed
   styles** and rendered element dimensions. Do not claim visual correctness from class names alone.

During each rendered pass actively check:

- **spacing and containment** — no accidental double padding, unexplained empty regions, overly
  dense groups, inconsistent rhythm, unnecessary nested surfaces, or large unused areas caused by a
  layout that merely technically fits;
- **viewport use** — surfaces that are intended to fill the available application height do so, and
  content does not stop at intrinsic height or become vertically clipped by mistake;
- **overflow and text resilience** — no horizontal page overflow, clipped text, controls whose
  labels escape their bounds, badges/metadata leaving containers, flex/grid children widening the
  viewport, or destructive wrapping under realistic long content;
- **responsive hierarchy** — Wide, Compact, and Narrow preserve the same primary answer and required
  actions; Narrow does not retain desktop-only assumptions, and Back/Close affordances remain
  available where the interaction model requires them;
- **visual hierarchy** — primary content and actions are obvious, secondary actions are quieter,
  metadata is distinguishable from narrative content, and repeated status/borders/cards/colour do
  not add visual noise;
- **important states** — inspect the meaningful states defined by the owning screen/component
  contract, including loading, empty, unavailable/error, dense content, and exceptional attention
  states when applicable.

Visual review is iterative: **implement -> render -> inspect -> fix -> render again**. Fix visual
problems that are reasonably within the task instead of only documenting them. The final rendered
inspection must happen after the last UI/CSS change.

When reporting verification, name the rendered surfaces and the actual viewport widths inspected
rather than saying only that "desktop and mobile were checked".

## Anti-patterns

Raw font-size/colour values in components; borders substituting for hierarchy; promoting
technical inspection data to the summary level; treating "fits on screen" as "belongs on
screen"; state-specific bespoke row geometry; arbitrary fixed column splits for optional metadata;
premature wrapping that leaves useful width empty; verifying UI from source instead of a rendered
surface.
