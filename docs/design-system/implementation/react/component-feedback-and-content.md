---
id: design-system.implementation.react.component-feedback-and-content
type: engineering
title: Feedback and document content components
status: current
scope: nevo-ui
read_when:
  - implementing or reviewing initial content appearance, status glyphs, progress position, notices, empty states and Markdown document rendering
summary: >-
  Component contracts for initial content appearance, status glyphs, progress position, notices, empty states and Markdown document rendering.
related:
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.system-boundary
---

# Feedback and document content components

General component ownership, accessibility and authoring rules remain in
[React component guidelines](component-guidelines.md). This document owns the component patterns below.

## Initial content appearance

`useInitialAppearance(identity, loading, ready)` is a product-neutral behavior hook exported by
`@nevo/ui`. Attach its returned ref to the stable region div. `loading` means an initial placeholder
is actually displayed; `ready` means matching usable content (including an authoritative empty state),
never a blocking error. After a committed placeholder, the first ready result receives a 150ms
opacity-only appearance using normal duration and standard easing tokens. Cached entry renders
immediately. Ordinary refreshes do not replay it. Resource identity resets the local tracking.

The hook suppresses the appearance inside an actively transitioning workspace layer, using the
existing workspace motion phase. Reduced motion disables the animation through CSS, including a
preference change while mounted; actions and correctness never depend on animation completion.
It owns no fetching, navigation, exit animation or retained interactive snapshot.
The hook toggles the `initial-content-appearance` class on the region imperatively instead of
deriving it from React state: it is a one-shot trigger that must not re-render the region or replay
on refreshes, which is a deliberate exception to the state-driven styling rule. Behaviour is covered
by `useInitialAppearance.test.ts` (identity reset, cached entry, refetch without replay, workspace
motion suppression) and the `Initial appearance contract` stories.

`Skeleton` disables its pulse for reduced motion. For a paused request, products pass
`animated={false}` (static placeholder) instead of overriding the animation inline; loading
announcements belong to the region rather than to individual bars.
`MarkdownDocument` keeps renderer component types stable across unchanged rendering options, so
ordinary query refreshes preserve its existing reading DOM.

## Description list

`DescriptionList` (`dl`) shows the facts of one thing as `Item` groups of one `Term` and one
`Detail`. `layout="aligned"` (default) puts all terms in one column so every detail starts at the
same edge; `layout="inline"` makes each pair one wrapping line for a few facts in a narrow region.
`Detail` takes `emphasis` (`primary` for a value the reader chose or must notice, `secondary` for a
default) and an optional `note` (a quiet caveat under the value). Terms and details wrap anywhere, so
long paths and branch names never overflow at 320 px. It is not a table and not a list of entities
(use `InformationList`). No Figma projection in v1 (like `Combobox`).

## Inline note

`InlineNote` is a short explanatory sentence with a leading icon and no container, the quiet
counterpart of `Alert`: a fact or caveat that belongs to the content next to it, or the reason an
action is unavailable. `tone` is `info` (muted icon), `attention` (status colour) or `danger` (a failure or a missing
required thing: status-danger colour, circle-alert icon); the icon is decorative and the text
carries the meaning. It has no live-region role: wrap it in one or use `Alert` when it must be announced.
No Figma projection in v1.

## Status glyphs

A status shows a registry glyph, its tone and a label; the label carries the meaning and the glyph
is decorative. The glyph is chosen by the presented status, never by where it appears, so one status
looks the same in every list, header and dialog. Not started and Ready use the `StatusIndicator` dot,
Waiting `clock`, In progress `loader` (it spins except under `prefers-reduced-motion`), **On hold
`circle-pause` (neutral)**, Requires attention `triangle-alert`, Done `circle-check`, Cancelled
`close`, Failed or broken `circle-alert` (danger); a disabled capability has no glyph and a muted
label. There is no Blocked glyph yet: keep the existing presentation until a Blocked state is
designed, and add its glyph to the registry then, not ahead of it.

A checklist of conditions (a workflow step's "Done when") uses `circle-check` (success) for a met
item and `circle` (muted, the label says "not yet") for an open one. An open item takes the attention
tone only where it refuses the action the person is about to take (for example the chosen result in
a Finish dialog).

## Progress position mode

`Progress variant="segmented"` counts completed parts out of `total`. With `position` instead of
`completed` it shows **where a step sits** among `total` workflow steps: one segment per step, and
it never claims progress (after a return to an earlier step the current segment moves back).

- `position` is `{ state: 'current', step }` (steps before it `content-secondary` at 60 %, the
  current one 40 px wide in `status-info`, the steps after it `surface-control`),
  `{ state: 'not-started' }` (all `surface-control`, the first outlined in info),
  `{ state: 'completed' }` (all `status-success`) or `{ state: 'abandoned', step }` (the steps up to
  the abandoning one `content-muted`, the rest `surface-control`). `step` is 1-based; a step outside
  `1…total` renders nothing rather than being clamped.
- Geometry: 20 px segments with 2 px gaps, `h-progress-track` (6 px) or `size="compact"` (4 px, for a
  track that is not the dominant progress on the screen, such as the step track on a wait step whose
  Task progress bar keeps the default size). The track is as wide as its segments up to 16rem and the
  container's width; past that the segments shrink, the current one staying the widest, and never
  below 4 px.
- No animation: a position change is a new fact, not a movement.
- Figma: the design component names the mode by its API, `variant=segmented-position`
  (`variant="segmented"` with `position`).
- Accessibility: the track is `role="img"` with no progressbar values. Its required `aria-label`
  names the position ("Step 4 of 7: Break the solution down"). A visible label beside it ("Step 4 of
  7 · next: Review the breakdown", `body-sm` secondary) is `aria-hidden` so it is not read twice.

## Accent block bleed

`AccentBlock` is a card inside the page's padding by default. `bleed` makes it a **flush band**: it
spans the `AppWorkspaceBody` padding to the sheet edges, and its inline padding is the page gutter,
so its text lines up with the page title and section headings (the 3 px bar plus the rest of the
gutter on the left, the gutter on the right); the tint, the bar and the vertical padding stay.
`bleed` always bleeds; `bleed="narrow"` bleeds only while the enclosing `AppContentContainer` (the
named `@container/app-content`) is narrower than 40rem and keeps the card above that, as a CSS
container query, never a viewport check. Use it where a nested card inside an edge-to-edge sheet
would be one frame too many (the Narrow Now band). The geometry comes from
`--app-body-padding-inline`, which `AppWorkspaceBody` sets for every `padding` preset (`0px` for
`none`); change a body's inline padding through that variable, never with a `px-*` class. The text
inset never drops below 12 px (the smallest body gutter): with no body padding, or without an
`AppWorkspaceBody` ancestor, the band does not bleed and its text keeps that inset rather than
touching the edge. The consumer removes its own divider after the band (the band's
edge separates it) and any second rule inside it.

## Empty state

`EmptyState` is the one empty screen of the system: whenever an area has nothing to show yet, use it
instead of a local line and buttons. Anatomy (centred): the picture (`icon`, decorative): a registry
glyph alone, without a tile or container, in `content-muted` at an illustration size of `Icon`
(`xl`, 80 px, in a `pane`; `lg`, 48 px, in the `default` block; `iconSize` overrides; both draw a
lighter stroke), or an element (a custom illustration) in its place; then a `title-md` title (a short
noun phrase, no full stop), a `body-md` description in `content-secondary` on a `max-w-sm` measure,
and the `actions` 24 px below.

- `variant="pane"`: the whole area is empty (a list with no rows, a document area with nothing open).
  No border; it takes the free block size of its host (`flex-1` + `min-h-full`, so the host is a flex
  column or has a definite height) and centres the group on both axes. Do not draw table or column
  headers above it: they describe rows that do not exist.
- `variant="default"`: an empty block inside a page that keeps its own quiet border (`min-h-40`).
- `variant="inline"`: the body of a page section that has no rows yet, under the section's own
  header (for example the Specification Overview's Tasks with no Tasks). No border and no minimum
  height: it has the inset and about the height of a list row (`px-2 py-2`), aligned to the start;
  a `body-md` medium title and a `body-sm` description in `content-secondary`. The glyph is
  optional and control-sized (`md`, `content-muted`, beside the text; `iconSize` does not apply);
  omit it when the section header already shows the section's icon, so the text starts at the rows'
  inset. Use it where the section header stays and a block-sized empty state would outweigh the
  neighbouring sections.
- `actions` takes nodes in order. At most **one primary** action (the filled default `Button`), first;
  every other action is `variant="secondary"`. A state that only offers a way out (clear the search,
  go back) has no primary. The component does not enforce this, because actions can be buttons or
  router links.

## Alert actions

`Alert` lays out its `actions` by its own width (a size container): below `@2xl` (42rem) they sit
under the text, wider they sit beside it; several actions keep the standard gap and wrap. Because
it measures itself, an `Alert` needs an inline size from its container (a block, grid cell or
stretched flex child); it is not usable as an auto-width flex item, which would collapse it.

## Document reading

A rendered document (the Documents preview, the documentation reader) is read through one product
composition, `src/shared/document-reading`. `DocumentReadingColumns` owns the geometry: the text at
its readable measure and, from `outlineColumnMinWidth` (840 px of panel), a sticky column of
`outlineColumnWidth(panelWidth)` beside it (`aside`: Properties and Contents) and optionally a
further column of the same width (`extraColumn`, the Documents guidance); the group is centred.
`useHeadingNavigation` owns moving to a heading (smooth unless motion is reduced, 16 px below the
top, focus without a ring after a pointer, a brief tint, the chosen heading current until the next
manual scroll) and the current section (`aria-current="location"` in Contents). `ContentsButton`
is the header control in its two modes (`sheet`: opens the Contents sheet; `toggle`: shows or
hides the column) with the "Contents" tooltip. Each screen keeps its own anchors and reading
positions; no screen passes geometry of its own.

## MarkdownDocument source lines

`<MarkdownDocument sourceLines source={...} />` (opt-in, default off, otherwise identical markup) adds
`data-source-line="<1-based start line>"` to every top-level block (`h1`-`h6`, `p`, `ul`/`ol`, `pre`,
`blockquote`, `hr`, and the wrapper of a `table`) and to every `li` at any depth. A product that keeps an
edit/preview scroll position by source line reads it from the DOM: pick the last element whose top is at or
above the viewport top, then offset within a multi-line block (code, list, table) proportionally to its
lines. Text without a map (plain `.txt`) falls back to a scroll proportion, clamped.

`MarkdownDocument` never widens its page. GFM tables and fenced code blocks each scroll horizontally in their
own `ScrollArea` (keyboard-focusable, named by `labels.table` / `labels.codeBlock`, `labelRole="group"` so
many of them do not become identical landmarks); the `sourceLines` attribute sits on that wrapper. Table
cells have a minimum width (so many columns scroll instead of crushing), a quiet header, zebra rows and keep
GFM column alignment; ordinary prose, inline code and bare URLs wrap; images are capped to the column.
Products pass localized `labels` (the defaults are English).

## MarkdownDocument diagrams

`<MarkdownDocument diagrams />` (opt-in, default off) draws a fenced block whose language is `mermaid` as a
diagram. Mermaid is loaded with a dynamic `import()` on the first diagram, so a page without one never
downloads it. It runs with `securityLevel: 'strict'`, no HTML labels, `startOnLoad: false` and suppressed
error rendering, and each drawing gets a fresh id. The `base` theme takes its colours and font from the
design-system tokens read when the diagram is drawn (`color-scheme` decides dark mode); shapes have no
shadows (Mermaid's drop-shadow filters are removed with CSS).

Size: a diagram opens readable first: fitted to the column but never below 10 px text (scale `10/14`, the
labels being 14 px); a diagram that fits keeps its natural size and is never enlarged. What does not fit
pans inside the block, which never widens the page; a tall diagram that fits the column is as tall as it
is, and the page scrolls through it. Fit returns to this opening view (there is no separate overview).
Zoom and pan are always available: the block's viewport is one keyboard
stop (`role="group"` named by `labels.diagram`; the picture inside is `role="img"` with the same name) where
`+`/`-` zoom, the arrows pan (an arrow that cannot move the drawing scrolls the page) and `0` returns to
the opening view; Ctrl/Cmd + wheel and pinch zoom about the pointer; a mouse or pen drag and two fingers
pan. Inline, plain wheel and one-finger touch scroll the page. The zoom runs from the opening scale to 4x
the natural size and the drawing never leaves its pan bounds. A quiet
control strip above the drawing (so it never covers it) holds Zoom out, Zoom in, Fit and Full screen
(32 px `IconButton`s with the 44 px touch target; icons `zoom-out`, `zoom-in`, `zoom-fit`, `fullscreen`).
Full screen opens the DS `Dialog` with a copy of the drawing under fresh SVG ids (Mermaid derives every id
and style selector from the root id, so the copy renames that prefix instead of drawing again: no id is on
the page twice and it opens at once). It opens fitted to the window, never enlarged and, as inline, never
below 10 px text (a large diagram pans instead of shrinking), with the same controls and gestures; there
is no page to scroll, so one finger pans the drawing too (`touch-action: none` on its viewport). Escape
closes it and focus returns to the button. The pure geometry (fit, clamp, zoom about a point, keys) lives
in `diagramView.ts`.

While a diagram is drawn the ordinary code block shows; when the source cannot be drawn the code block stays
with a quiet `labels.diagramFailed` note beneath it, never Mermaid's error graphic. Products pass localized
`diagram`, `diagramFailed`, `diagramZoomIn`, `diagramZoomOut`, `diagramReset`, `diagramFullScreen` and
`diagramClose` labels; `data-source-line` sits on the block. A changed source (the Documents live preview
while typing) is drawn only after it has been still for 500 ms; meanwhile the last good drawing stays,
with its zoom, pan and an open full screen, so typing neither redraws on every keystroke nor flashes the
failure note. Only a new source that cannot be drawn replaces it with the code and the note. Leave
`diagrams` off for streamed text (an agent message). The Documents preview and the documentation reader
turn it on.
