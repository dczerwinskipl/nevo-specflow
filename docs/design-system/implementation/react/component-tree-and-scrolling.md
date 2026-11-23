---
id: design-system.implementation.react.component-tree-and-scrolling
type: engineering
title: Tree panes and scrolling regions
status: current
scope: nevo-ui
read_when:
  - implementing or reviewing tree recipes, shared document-tree panes, docked search, empty search results and scrolling-region semantics
summary: >-
  Component contracts for tree recipes, shared document-tree panes, docked search, empty search results and scrolling-region semantics.
related:
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.system-boundary
---

# Tree panes and scrolling regions

General component ownership, accessibility and authoring rules remain in
[React component guidelines](component-guidelines.md). This document owns the component patterns below.

## Tree

Nevo UI has no generic `TreeView` component. A product that renders a hierarchy (for example a
document tree) keeps its data, expansion state, actions, ARIA and ordering, and takes the compact
row geometry from `treeRecipes` (`Nevo UI/Foundations/TreeGuide`). The tree has no guide lines:
hierarchy is carried by one small indent step and the chevron + folder icon + name alignment.
In SpecFlow UI the document trees (the Documents explorer, the documentation reader) render through
one product composition, `src/shared/document-tree` (`TreeLevel`, `TreeFolderRow`,
`TreeDocumentRow`, `TreeSearchField`, `useRovingTree`, and the pane parts of [Tree pane](#tree-pane)). The screens differ only in the row slots:
`menu` (row actions), `editor` (inline rename or create entry), `state` (trailing state label, with
an attention form), `details` and `spokenDetail` (tooltip lines and the text read with the name),
`glyph` (the document's icon), `wrap` (a wrapping instead of a single-line name), and the focus
wiring (`buttonRef`, `focus`). `flat` (a top level without folders) and `lead` (the document that
leads its level above the folders) are structural rules of the tree, not per-screen geometry: any
tree that has that structure gets the same geometry. The screen root provides the `TooltipProvider`.

| Export                                             | Apply to                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `treeRootClassName`                                | the top-level list (no indent)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `treeBranchClassName`                              | the container of an expanded folder's children (indents by `--spacing-tree-indent`, one glyph slot)                                                                                                                                                                                                                                                                                                                                                                                   |
| `treeNodeClassName`                                | each node (row + optional nested branch or hint)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `treeRowClassName`                                 | the row line of a node (item + sibling trailing action); names the `tree-row` group and container                                                                                                                                                                                                                                                                                                                                                                                     |
| `treeItemClassName`                                | the interactive folder row (`button`): one compact control height, hover, `aria-current` selection, global focus ring, disabled, block-axis hit area                                                                                                                                                                                                                                                                                                                                  |
| `treeLeafItemClassName`                            | the interactive leaf item: no glyph slot, its icon aligns with the sibling folders' icons                                                                                                                                                                                                                                                                                                                                                                                             |
| `treeStaticItemClassName`                          | a row item that opens nothing (a `div`, not a disabled button): the item's line, gap and padding without hover, selection or hit area                                                                                                                                                                                                                                                                                                                                                 |
| `treeGlyphSlotClassName`                           | the disclosure chevron slot of folders (leaves do not render it)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `treeItemLabelClassName`                           | the name; wraps long names                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `treeItemLabelTruncateClassName`                   | the name on one line with an ellipsis (keep the full name reachable elsewhere, for example a tooltip shown only when clipped)                                                                                                                                                                                                                                                                                                                                                         |
| `treeRowActionClassName`                           | the trailing action trigger of a row (`IconButton size="sm"`, sibling of the item): revealed on hover, focus-within, open menu and the selected row on fine pointers, always visible on touch; its slot is always laid out, so the label never reflows                                                                                                                                                                                                                                |
| `treeRequiredLabelClassName`, `...MarkerClassName` | a quiet muted "Required" text inside the item before the row action; below `@3xs` row width the text is visually hidden and the workflow icon stands in. It never reorders rows and never selects one                                                                                                                                                                                                                                                                                 |
| `treeStateLabelClassName`, `treeAttention...`      | a trailing state label that never hides (the name truncates instead): muted by default for a standing fact ("Required", "Always first"), `treeSecondaryStateLabelClassName` for a relation to the work at hand ("needed to finish this step"), the attention forms tone the label and the leading glyph (`treeAttentionGlyphClassName`), or, when only the label is in attention (a gate that refuses the action now), the label carries its own `triangle-alert`; never colour alone |
| `treeHintClassName`                                | a quiet inline hint under an opened empty folder (muted, aligned to the folder name column by `--spacing-tree-name-offset`, no icon, not focusable, not a tree item); the product removes it when the folder gets content                                                                                                                                                                                                                                                             |

Geometry tokens are derived, not hand-tuned: `--spacing-tree-row-height` is one compact control
height (`--spacing-control-height-compact`); `--spacing-tree-gap` spaces glyph, icon and name;
`--spacing-tree-indent` is one `icon-md` glyph slot, so the third level keeps most of the width;
`--spacing-tree-leaf-offset` = `icon-md` + one gap, used by leaves so their icon aligns with sibling
folder icons; `--spacing-tree-line-inset` is the item's block padding that centres one `icon-md` line
in the row, so glyph, icon and the first line of a wrapping name (`treeItemLabelClassName`) share a
centre.

Target size follows the hit-area policy: the visual row stays compact on every pointer and the item
expands its hit area on the block axis (`hitAreaBlockClassName`), the row action through
`IconButton`'s own hit area (24px, 44px on coarse pointers). On coarse pointers neighbouring hit areas
overlap by a few pixels and the later DOM sibling wins; never grow the row to the touch size.

Ordering is a product concern but follows the explorer convention: folders before files, then
case-insensitive, numeric-aware, locale-aware alphabetical order within each group at every level,
including the root. Importance (for example a workflow-required document) is a quiet marker on the row
and must never promote the row. Selection (`aria-current`) means the opened item only: no row is
selected when nothing is open, and during loading the row of the new target is selected, never a
previous or default one. Products must not add local opacity, outline or selected classes to tree
rows; use `aria-current` for the open document instead of `aria-pressed`.

## Tree pane

The Primary tree pane of Documents (a Specification's files) and of Documentation (the reader) are
two areas of one product (owner, 2026-11-15). They keep their own functions (file filter by name
and type versus hybrid search with proposals; `DocumentsExplorer` and `DocsTreePane` stay separate,
and so do their filtering and search logic), but take one geometry, one search container and one
empty search result from `src/shared/document-tree`. Do not restyle these parts per screen.

**Pane stack (`treePane.ts`).** The scroller content is `treePaneContentClassName`: the pane's
vertical inset only (`py-2`), the blocks 12 px apart (`gap-3`), no margins (`mb-*`) and no negative
margins. Every block carries the 8 px inline inset itself (`treePaneBlockClassName`); a text block
on the text column uses `treePaneTextClassName` (16 px); a full-width block (the search bar) has
neither. The blocks, in order: back link, context line or workspace picker, notices and attention
blocks (Close refusals, expected types, skipped documents), the tree block. The tree block
(`treeBlockClassName`, positioned, `gap-1`) holds section heading, search bar, filter or search
status, notes and the list, the results or the empty result. A block or part that renders nothing
renders no element, so it costs no gap; a hidden live region (`sr-only`) is out of the flow.

**Text column.** Two inline edges, measured from the pane's inner edge: the search field's border at
12 px, and the text column at 16 px, where the rows' content (the icon of a document, a flat name),
the tree's notes, the status lines, the result titles and the empty result start.

**Search container (`TreeSearchBar`).** The field row of both panes: `TreeSearchField` (`flex-1`)
plus an optional trailing control (the Documents type filter), `role="search"`, `px-3 py-1` across
the pane's full width, a transparent bottom border that keeps its height. Not sticky (Documents) it
has no surface of its own. Sticky is opt-in (`sticky` with `scrollRoot`, the `ScrollArea` viewport
element; Documentation): the bar is the first child of the tree block, transparent at rest, and
docked it shows the opaque docked material of the workspace with the `divider` under it, so nothing
scrolled underneath shows through. Stuck band: 4 + 36 + 4 px + 1 px divider.

**Docked surface (Nevo UI `.workspace-docked-sticky`).** The bar renders an absolutely positioned
1 px sentinel (`.workspace-docked-sentinel`) at the top of the positioned tree block (outside the
flow, no gap), where the bar sits at rest; the tree block is the timeline scope
(`.workspace-docked-scope`). Two paths:

- **Scroll-driven (progressive enhancement, `@supports (animation-timeline: view())`).** The
  sentinel's view timeline drives one `::before` layer of the bar (the docked material with the
  divider drawn over the bar's bottom border): its opacity goes from 0 to 1 over `exit 0%` to
  `exit 100%`, the one pixel of scroll in which the sentinel leaves the scrollport's top, which is
  the dock point. No script and no observer runs; the opacity animation is composited, in step with
  the scroll. Measured in Chromium 158 (Playwright) on the painted frames (screencast pixels): one-step
  jumps of 147 px from a task and from `requestAnimationFrame`, a wheel fling and the field's focus
  scroll show no docked frame without the material or the divider and no material at rest, except
  the first frame after a jump to the top set inside `requestAnimationFrame` (after the frame's
  animation update), which still shows the material for that one frame. Main-thread sampling of
  slow scroll, wheel, touch and wheel flings at 6000-8000 px/s, Back restores by
  `usePaneScrollMemory` and resizes shows no transparent docked frame and no docked frame without
  the divider.
- **Fallback (no scroll-driven animations).** The bar keeps the docked material at all times, and
  `useStuck` (an `IntersectionObserver` on the sentinel, rooted at the scroll viewport, `rootMargin`
  top `-8px`, the position also read once before paint) sets the divider. It runs only where the
  timeline is unsupported. The material is never tied to the observer: an observer answers only
  after the frame it measured is painted, and frame sampling showed one transparent frame on a jump
  and on a Back restore, and up to three across a resize, when it was. At rest the material differs
  from the pane surface only by the pane's faint top-left gradient. Browsers on this path (MDN
  browser-compat-data, 2026-11-15: `animation-timeline` and `timeline-scope` from Chrome and Edge
  115-116, Safari 26, Firefox 159): Firefox before 159, Safari before 26, Chromium before 116.
  Checked: Firefox 159 (Playwright) takes the scroll-driven path; the fallback was inspected in
  Chromium with the timeline forced off (rest and docked at 390).

**Empty search result (`TreeSearchEmpty`).** One variant for a search or filter that leaves nothing
in a tree pane: `EmptyState variant="inline"`, no icon, its text on the text column (block inset
plus the empty state's own `px-2`), a `body-md` medium title, a `body-sm` secondary description and
one `Button variant="secondary" size="sm"` that removes what hides the rows. Texts and the action
stay per screen (Documents: "No matching files", "Change the search or the chosen types.", Clear
filters; Documentation: "No matching documents", its hint or the proposals line, Clear search). The
bordered `default` and the `pane` variants stay for empty areas (for example the document area),
not for search results.

**Message hierarchy of the tree block.** A tree block can show its primary content and several
messages at once (in Documents: the empty result, "The filters hide 1 missing file.", "1 entry in
the folder could not be read." and "Only the first entries are listed."). Each message is a
status, an attention note or a quiet note; with the primary content they always come in this order:

1. **Status** of the search or filter, right under the search bar: the count and Clear filters
   (Documents), the count, the proposals checkbox and the search's lines (Documentation). Quiet
   (`body-sm`, muted or secondary), no icon.
2. **Attention notes**, before the primary: what the list hides or could not show that the reader
   may need to act on. `InlineNote tone="attention"` (attention icon, secondary text) on the text
   column. In Documents: the filters hide a missing file (a missing file is itself an attention
   row), then the entries the Runtime could not read (a read failure; not a Close refusal, so it
   stays out of the Close Alert). They come before the list so a long list never hides them, and
   they stay in the same place whether the result is a list or empty.
3. **Primary**: the list, the results, or the empty result in their place (`TreeSearchEmpty`, whose
   `body-md` title outweighs every note).
4. **Quiet notes**, after the primary: a known limit that needs no action, `InlineNote` (`info`
   tone, muted icon) on the text column. In Documents: the listing limit, where the list is cut.

Pane-level blocks (Close refusals as an attention `Alert`, the read-only line, expected types,
skipped documents, the reader's picker notices) keep their places in the pane stack above the tree
block; a filter never hides them. A screen does not add a fourth tone or its own note styling.

Measured in Storybook (CSS px at 390 with a coarse pointer; the 1440 values are the same):

| Element             | Documents                                                 | Documentation                                |
| ------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Search bar          | `TreeSearchBar`, 45 high, field border at 12, not sticky  | `TreeSearchBar sticky`, 45 high, field at 12 |
| Empty search result | `TreeSearchEmpty`, 100 high, title at 16                  | `TreeSearchEmpty`, 100 high, title at 16     |
| Notes               | attention and quiet `InlineNote`, icon on the text column | status lines on the text column              |

The standalone `Link` layout box (44 px on coarse pointers, see [Target size](component-guidelines.md#target-size)) is
unchanged: a proposal to shrink it to its content height was deferred by the owner (2026-11-15),
and the Documents body back link belongs to the navigation work, not to this rule.

## Scrolling regions

Every scrolling region uses the DS `ScrollArea` (thin scrollbar, edge indicators); never hide scrollbars and
do not nest scrollers. A native scroller that cannot be a `ScrollArea` (for example one whose element the
product measures and pins itself) adds the `scrollbar-subtle` class so it gets the same scrollbar instead of
the platform default. `DrawerBody` is a `ScrollArea` (padding on its content wrapper; the viewport is one
keyboard-focusable Tab stop so content without focusable children stays scrollable). A list that already
contains focusable items (for example a navigation `nav`) wraps its list in `ScrollArea` with
`className="min-h-0 flex-1"` and `tabIndex={-1}` and no `aria-label`, so it adds no Tab stop and no extra
`region` landmark. The AppShell drawer renders the product navigation directly in `DrawerContent` (no `DrawerBody`), so the
product navigation list is the single scroller in both the persistent aside and the drawer.
