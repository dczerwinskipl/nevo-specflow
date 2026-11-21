---
id: design-system.implementation.react.component-guidelines
type: engineering
title: React component guidelines
status: current
read_when:
  - creating or restructuring a React component or module
  - deciding whether a helper component gets its own file
  - placing state or writing a hook
  - reviewing a React change
summary: >
  Small focused components, composition over configuration, split by responsibility not
  ceremony, feature-local vertical ownership, hooks by behavior, and where state lives.
related:
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.ui-ux-guidelines
  - design-system.implementation.tailwind.styling-guidelines
  - design-system.principles.system-boundary
  - engineering.shared.testing
---

# React component guidelines

These rules govern reusable components in `packages/nevo-ui/` and product UI composition in
`packages/specflow-ui/`. They describe responsibilities, not a mandatory directory tree.

## Core principles

- **Prefer small, focused components.** One primary concept per module.
- **Composition over configuration.** A component with a dozen boolean props that
  reshape it is usually two or three components.
- **Split by responsibility, not architectural ceremony.** Don't add `-Container`,
  `-View`, `-Wrapper` layers that only forward props.

## Module organization

- **Default:** one primary concept per file.
- A small helper component **may stay in the parent file** when it is only used there,
  has no independent state/lifecycle, and is short.
- A component **gets its own module** when it is reused, has meaningful state or
  effects, or is independently testable.
- **Feature-local vertical ownership:** keep a feature's components, hooks, view-models
  and tests together under `features/<domain>/`. Promote code upward to a shared
  location only when reuse is real, not anticipated.
- **Folders follow the shape of the code** (owner, 2026-11-04). A component with its own
  sub-components, hooks and pure model is a folder package: the root component file that composes
  it, plus sub-folders named after real sub-concerns (for example `conversation/`, `composer/`,
  `model/`, or a component's private `parts/`). A folder never becomes a flat list of dozens of
  files; see [UI feature folders](../../../engineering/shared/code-organization.md#ui-feature-folders).
  Feature-level technical buckets (`hooks/`, `components/`, `utils/`) that separate code changing
  together are still not used.
- **One pattern, one implementation (DRY).** A structure that repeats with the same shape (JSX
  frames, state machines, query/command plumbing, paging, helpers) is extracted once into its
  owning slice, or into `shared/` when a second feature needs it, instead of being copied.

## Ownership boundary

- `packages/nevo-ui/` owns domain-agnostic components, design tokens, app-shell mechanics, and
  workspace/floating behavior that can be reused by another application.
- `packages/specflow-ui/` owns SpecFlow brand composition, routing, product screens, copy, and
  product-specific interaction decisions.
- `examples/` owns independent consumers. Examples MAY use Nevo UI but MUST NOT depend on
  SpecFlow UI.
- Routing libraries and product data models MUST NOT leak into Nevo UI component APIs.

## File size

Target (owner, 2026-11-04): a component or hook file stays within about **200-300 lines**. Above
300 lines the file is split along its real sub-concerns, unless it is one cohesive unit: a single
state machine, a pure policy or projection module, or a parser. That exception is stated in the
file's header comment. Comments do not count as a way out: review history and breadcrumbs are
removed (see [Comments](../../../engineering/shared/code-organization.md#comments-document-why-and-invariants)),
not kept to explain a long file. Stories and tests are scenario catalogues; split them only where
one file mixes unrelated scenario groups.

A split keeps cohesion. Split a component into sub-components that own their own markup and state,
pure model/helper modules, and hooks that pass the [Hooks](#hooks) rule. Moving half of a
component's body into a hook used only by that component is relocation, not decomposition, and is
not an acceptable way to meet the target.

## Visual vs orchestration

- **Visual components** take props and render. No data fetching, no routing knowledge.
- **Container components / feature hooks** own data access and orchestration, and keep
  it visible — don't bury a fetch three hooks deep.
- Presentation consumes authoritative UI-facing facts and callbacks. It does not manufacture
  domain/application state when input is missing or infer workflow, permission, readiness, or
  attention semantics from identifiers, localized labels, or arbitrary display strings.

## Hooks

Extract hooks **by behavior ownership** (`useSessionStream`, `useWorkTimeline`), not as
a `useEverything` catch-all. A hook that does five unrelated things is five hooks.

Each hook lives in its own file. A hook is extracted when it is reused, or when it owns one
behaviour (its effects and invariants) behind a **narrow interface**: a few inputs and a few
outputs. A single-consumer `useComponentXYZ` that takes the component's state and returns most of
its values and handlers is relocation: keep that code in the component, or split the component
itself.

## View models

Transform raw/protocol data into a UI-facing model at a boundary that follows the
feature's change boundary. Stories and components consume the canonical UI model, never
raw provider payloads.

Fixture data and production data should converge on that same presentation model/boundary where
practical. A production component must not silently manufacture or import fixture data as a fallback
for a missing application dependency.

## State and effects

- Place state at the lowest common owner of the components that need it; lift only when
  genuinely shared.
- Effects are for **synchronization with external systems**, not for deriving values
  that could be computed during render.

## Accessibility & responsive

Semantic elements and roles; keyboard operable; interactive targets meet the
[target size](#target-size) policy; layout holds at mobile and desktop widths.

When a row exposes a primary navigation or activation target together with independent controls,
do not create invalid nested interactive elements. Keep those controls as separate focusable targets,
and activating one must not also trigger the row's primary action. A non-interactive structural row
with sibling navigation/control targets is the normal composition; an equivalent implementation is
acceptable only when DOM semantics, focus behavior, and independent activation remain valid.

**Width-dependent structure.** Restyle for the available space with a CSS container query. When the
DOM structure or order itself has to change with the width (for example one reading column versus
two independent columns, each read in its own order), CSS cannot express it: use
`useContainerMinWidth(minWidth, { hysteresis })` from Nevo UI and render the arrangement from its
`matches`. It reads the width before the first paint and commits a crossing before the browser
paints it, so no frame shows the other arrangement, and it renders only on a crossing.

- Observe a zero-height, full-width sentinel, not the content whose height the arrangement changes
  (that raises "ResizeObserver loop completed with undelivered notifications").
- Give it an exit `hysteresis` (16 px covers a classic scrollbar) when the change could move the
  width back across the breakpoint.
- Hold back the parts whose place depends on `matches` until `measured`, so a wide screen does
  not mount them in the narrow arrangement first.
- Parts that stay keyed children of the same parent in both arrangements are moved, not
  remounted, and keep their state (a selection). Parts that change parent remount: their local
  state resets, and focus inside them is lost unless the product restores it. Keep their view state
  (an expanded list) outside them, give opener rows a stable `data-focus-key`, and restore focus to
  the same control only when that change removed it, never after the user moved focus away. The
  Secondary's own focus return uses the same key, within the opener's layer.

Never use the viewport width for this, and never use CSS `order` to make the visual order differ
from the reading order.

## Testing

Follow the [shared testing guidance](../../../engineering/shared/testing.md): focused unit,
hook, and component tests are co-located with their owner; Storybook stories sit beside the
component; only cross-module/integration/package-boundary tests belong in a package-level `test/`
tree. Use fast unit tests for pure view-model/hook logic, Storybook interaction tests for component
behavior and accessibility, and inspect computed styles when exact visuals matter.

## Review checklist

- [ ] One primary concept per module?
- [ ] Composition instead of a configuration-heavy component?
- [ ] Feature-local ownership, not premature sharing?
- [ ] Files within ~200-300 lines, or a stated cohesive exception?
- [ ] Repeated patterns implemented once (DRY)?
- [ ] Folder shape matches the code (sub-concern folders, no flat lists of dozens of files)?
- [ ] Visual components free of data/routing concerns?
- [ ] Hooks split by behavior, each in its own file, with a narrow interface; no relocation-only
      `useComponentXYZ`?
- [ ] State at the right owner; effects only for synchronization?
- [ ] Accessible and responsive?

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

## Choice surface

`choiceSurfaceClassName` is the only shared appearance for a selectable multi-line card (a command
`button`, an `aria-checked` radio, or a `label` containing one native radio). There is no
`SelectableCard` component: the consumer owns semantics, layout and content. SpecFlow UI composes the
single-choice case once in `shared/controls/ChoiceTile.tsx` (`ChoiceTileGroup` + `ChoiceTile`: native
radio in a `label`, title/description wired with `aria-labelledby`/`aria-describedby`, always-rendered
check, `disabled` for a skipped option and `blocked` for one whose reason must stay readable);
Create's workspace place and agent provider use it. A command tile that is a `button` (the Create method
choice) is not a radio and keeps the recipe directly.

- Display/layout is composition-owned. Use `choiceSurfaceTracksClassName` for the standard
  icon / text / trailing-check tracks (`var(--spacing-icon-md)` · `minmax(0,1fr)` ·
  `var(--spacing-icon-md)`). Always render the trailing slot and toggle the check with `invisible`, so
  selected and unselected cards keep the same geometry.
- Keyboard focus reuses the global focus ring (`focus-ring-within` for the label case); do not add
  local outline classes.
- Disabled is token-only: `bg-surface-subtle` + `border-border-subtle`, no hover and no opacity. The
  name and the unavailable reason keep readable text roles (reason in `text-content-secondary`; the
  name may step down to `text-content-secondary` and the icon to `text-content-muted`). Use native
  `disabled` (or `aria-disabled` plus prevented interaction).

## Select items

`SelectItem` and `ComboboxItem` use the full option width for a vertical stack: the main label,
optional `meta` (secondary text or a naturally sized `Badge`), then optional `description`
(`body-sm` + `content-secondary`, including an unavailable reason). Names, metadata and descriptions
wrap, including long unbroken values. Metadata and descriptions remain part of the option's
accessible description. Only the main label is the selected value: the closed Select trigger and
Combobox input stay single-line and never contain metadata or descriptions.

Selection is a visual state of the option: a subtle `surface-selected` background and a thin
`action-primary` accent at the left edge. Neither the accent nor selection changes content width,
padding or height. Options have no checkmark and reserve no checkmark gutter. Keyboard focus stays
visibly distinguishable from selection; the primitive's selected state and keyboard behavior remain
authoritative. This contract applies to Select and Combobox dropdown options, not radio cards.

- Branch-like values compose the label as `Icon name="branch"` (`size="sm"`) + `Typography
as="span" variant="code-md"`; `textValue` carries the plain name.
  In the Create workspace section this composition is the single `BranchRef` piece
  (`specflow-ui/src/features/specs/creation/workspace/BranchRef.tsx`, a product component, not part of the design system) used by summary rows, switch descriptions, notes and
  select items alike; do not restyle a branch locally or wrap it in parentheses.
- Native `disabled` is removed from keyboard navigation by Radix. When the user must reach and read
  why an option is not available, use `unavailable` (plus `description` as the reason): the item
  keeps focus, arrow-key and screen-reader reachability, sets `aria-disabled="true"`, and blocks
  selection on click, pointer-up, Enter and Space. Native `disabled` is for options that may be
  skipped.
- When a disabled or unavailable item has a `description` or `meta`, only the label and meta fade;
  the reason keeps `content-secondary` at full opacity.
- The listbox width equals the trigger width, so long descriptions wrap; do not widen the content
  locally. Persistent text outside the control remains the place for an overview of unavailable
  options.
- All option text stays inside the full-width stack; metadata never takes a separate column away
  from the label or reason. Select and Combobox share this layout rule.

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

## Shell footer

Every bar pinned to the bottom of the shell (the navigation's account row, a page's sticky footer
such as Create's) is one default control high plus `--spacing-shell-footer-padding` (10 px) above and
below: `--spacing-shell-footer` (56 px), under one `Separator`, so the bars of the navigation and the
workspace meet on one line. Use `h-shell-footer` / `min-h-shell-footer` with `py-shell-footer-padding`;
do not add local paddings. Keep the content on one line (a short hint, then the action); it may grow
only when a long hint wraps. The safe area is added below it, never inside.

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

## Option picker

`OptionPicker` chooses one option from a list the owner cannot bound in advance and owns the rule of
"Select vs Combobox" below: up to eight options a closed `Select`, more a searchable `Combobox`, with
the same item anatomy (`description`, `meta`, `unavailable`) either way. The owner passes
`labels` (`showOptions`, `noResults`, `loading`) so the design system holds no product copy; inside a
`Field` both controls are labelled by `Field.Label`. SpecFlow wraps it once as
`shared/controls/LocalizedOptionPicker` (texts from `common.options.*`).

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

The standalone `Link` layout box (44 px on coarse pointers, see [Target size](#target-size)) is
unchanged: a proposal to shrink it to its content height was deferred by the owner (2026-11-15),
and the Documents body back link belongs to the navigation work, not to this rule.

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

## Context switcher

A control that switches the context a screen works in (the current Specification in the
navigation, the workspace the documentation reader reads) uses `src/shared/context-switcher`:
`ContextSwitcherTrigger` (quiet label; the name on one line, identifier-like names cut in the
middle by measurement so their distinguishing end stays, prose cut at the end, with a tooltip only
when it is cut; an optional trailing `status`; one line of `segments` joined by " · "; up-down
glyph; 72 px with segments, 56 px without), `ContextSwitcherOption` (the name and segments
wrapping in full, the same `status` on its own line, "Selected" with a check, `unavailable` options
focusable but not chosen), `ContextSwitcherStatus` (a `StatusIndicator` dot and short text, tone
`attention` or `danger`; never a segment), `useListboxKeys` (ArrowUp/ArrowDown wrapping, Home, End)
and `contextSwitcherPopoverClassName` with `motion="navigation"` and `inert`/`aria-hidden` while
closed. Each switcher passes only the facts of its kind (see
[Documentation reader](../../../product/specflow/ui/documentation-reader.md#workspace-picker-and-specification-switcher)).
The screens differ only in what they add around the list (the switcher's search, states and footer).

## Dialog footers

`DialogFooter` and `AlertDialogFooter` own the responsive action layout; consumers must not override
it. Put actions in DOM/focus order Cancel → secondary → primary/destructive. Below `sm` the footer
stacks full-width actions with the primary/destructive action on top; from `sm` it is a right-aligned
row that wraps (`sm:flex-wrap`) instead of clipping, which keeps 200% zoom readable. Use
`AlertDialog` with a `destructive` action for irreversible or discarding confirmations.

## On-screen keyboard

Android Chrome (108+) and iOS Safari resize only the visual viewport when the keyboard opens, so a `fixed` overlay would stay behind it. `DialogContent`, `AlertDialogContent` and a `side="bottom"` `DrawerContent` track `window.visualViewport` (shared internal hook `useVisualViewportInset` / `useKeyboardAvoidance`, `rAF`-throttled, inert without `visualViewport`, on pinch-zoom and for insets under 80 px) and, only while a keyboard is open, apply inline styles: dialogs re-centre in the visible area (`top` = visual centre) and cap `max-height` to the visible height minus 2rem; a bottom sheet is lifted (`bottom` = keyboard inset, safe-area padding dropped) and capped to the visible height minus 3rem (still honouring its `size` cap). The body scrolls inside the capped surface so the action row stays visible, and the focused field is scrolled into view. With no keyboard nothing is applied, so desktop and the resting layout are unchanged. The move is not animated (so there is nothing to disable for `prefers-reduced-motion`). Side and top drawers are not adjusted.

## Drawer sides and sheets

`DrawerContent` takes `side: 'left' | 'right' | 'top' | 'bottom'` (default `'right'`; AppShell navigation uses `'left'`). All sides keep the Radix Dialog contract: focus trap, Esc, overlay click, `aria-modal`, focus return to the trigger, a required `DrawerTitle` as the accessible name and a named close action (`closeLabel`, 44 px hit area on coarse pointers through `IconButton`).

- **`left` / `right`** are side panels: full height, full width on phones, `28rem` from `sm`, `30rem` from `md`.
- **`bottom` / `top`** are sheets: they are content-sized up to `calc(100dvh - 3rem)` (a strip of the page stays visible), the `DrawerBody` scrolls inside, and the outer corners use `rounded-surface`. The edge padding honours `env(safe-area-inset-bottom)` (bottom) or `env(safe-area-inset-top)` (top; the close action is offset the same way). Full width on phones; from `md` the sheet is a centred `30rem` column (the side-panel width; the DS has no token for it) instead of stretching across a wide viewport. The slide animation comes from the corresponding edge and is disabled under `prefers-reduced-motion`, like the side panels. There is no drag grabber: the DS has no drag convention, so closing is Esc, overlay click or the close action.

Use a **bottom sheet** on phones for a short list, a picker or a document's contents / properties (touch rows of at least 44 px inside `DrawerBody`). Do not use it for primary navigation (that is the `left` drawer) or for long forms, which need a route or a Dialog. Use **top** for modal search or command surfaces that intentionally block background interaction; use a Toast or non-modal surface for notifications. Keep one sheet open at a time and do not stack sheets.

Two props shape a sheet without class overrides (`cn` is `clsx` without tailwind-merge, so conflicting utilities are resolved by CSS order, not className order; never reach for `!important`):

- `size?: 'default' | 'compact'` (top/bottom only, no effect on side panels): `default` caps the height at `calc(100dvh - 3rem)`, `compact` at `65dvh`. Use `compact` for a short list or picker where the page behind should stay recognisable; use `default` for long contents.
- `showClose={false}` removes the built-in close action and `DrawerHeader` stops reserving `3.5rem` on its right (`pr-14`), leaving a plain `px-5`. Use it when the header hosts its own action (a `Done` button, a search field) and give that surface its own `DrawerClose`. With the default `showClose` the header is unchanged.

Safe-area padding only has an effect when the application page declares `viewport-fit=cover`; without it `env(safe-area-inset-*)` is `0` and the sheet simply has no extra padding. The component does not set the viewport meta and makes no promise about notched devices; enabling `viewport-fit=cover` is an application decision.

Focus: Radix focuses the first tabbable element on open, which for a list sheet is the scrollable `DrawerBody`, showing a focus ring around the whole list. For list sheets the consumer can use `onOpenAutoFocus` to focus the active row, or a `DrawerTitle` with `tabIndex={-1}` and a ref. Call `event.preventDefault()` only when moving focus to a valid element inside the sheet; do not leave focus outside the modal. Use `onCloseAutoFocus` when focus should move to a page element after a selection instead of returning to the trigger.

Known limitation: the system back gesture / browser Back button does not close a sheet (or any Drawer); it navigates away. Closing on Back needs history integration owned by the application and is not part of this component yet.

## Popover width

`PopoverContent` clamps itself to the collision-aware available width
(`max-w-(--radix-popover-content-available-width)`, `collisionPadding` 8 by default, mirroring
`MenuContent`). Consumers still choose width and padding (`w-72 p-3`) and must not add viewport
clamps such as `max-w-[calc(100vw-2rem)]`.

## Target size

Every interactive target is at least `--spacing-target-min` (24px) on every pointer and at least
`--spacing-target-touch` (44px) on coarse pointers (`@media (pointer: coarse)`). The runtime value is
`--target-size` on `:root`. The floor is reached by **expanding the hit area, not the visual**:
control heights (`control-height-inline/compact/default`), icons and spacing are never enlarged for
touch. WCAG 2.2 AA 2.5.8 (24px) is the hard floor; 44px is the platform touch standard. The documented
exception is a link inside a sentence or paragraph.

| Recipe (`interactionRecipes`) | Use                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `hitAreaClassName`            | any control smaller than the floor: a `::after` of `max(100%, var(--target-size))` on both axes |
| `hitAreaBlockClassName`       | text-width labels: expands only the block axis (the label already spans the row)                |

Rules:

- The pseudo-element belongs to the control, so a click on it activates the control; layout and the
  visual size do not change. The recipe makes the element `relative`; do not add `absolute`/`fixed`
  to the same element (`cn` does not merge Tailwind conflicts).
- Already applied: `Checkbox`, `RadioGroupItem`, `Switch`, every `IconButton` size, the label of
  `SwitchField`/`CheckboxField`/`RadioGroupOption` (`SwitchField` label also spans the row), and
  `Link layout="standalone"`. `Link` defaults to `layout="inline"` (exempt, unchanged).
- An unavailable `SwitchField` (nothing to switch to) is `aria-disabled`, not `disabled`: it stays
  reachable, the label and the control are muted, and the description holds the reason at normal
  strength. Never fade the whole field with an opacity class; that also fades the reason. The owner
  ignores the toggle (`onCheckedChange`) while the switch is unavailable.
- Hit areas of neighbours can overlap when controls are closer than the target size; the later DOM
  sibling wins. Keep at least the 24px spacing between small targets or rely on the `::after` size
  staying within the row.
- Do not re-implement link-like controls with local classes; use `Link layout="standalone"`.
- Pseudo-elements are not projected to Figma (see the Figma projection guide); the hit area is a
  code-only affordance.

## Button label overflow

`Button` takes `labelOverflow?: 'wrap' | 'truncate' | 'nowrap'` (default `'wrap'`). One line is always
exactly the control height (md 36px, sm 32px), so single-line buttons are pixel-identical to before.

| Mode       | Behaviour                                                                                           | Use                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `wrap`     | label wraps, the button grows taller (`min-h` + derived vertical padding), `max-w-full`, icons stay | default; any user-visible or translated action label                   |
| `truncate` | one line, ellipsis, `min-w-0`                                                                       | dense rows only where the full text exists elsewhere (no auto tooltip) |
| `nowrap`   | one line that never shrinks (the previous behaviour)                                                | fixed-height toolbars where the caller guarantees width                |

There is no `loading` prop: swap the label and set `disabled` (the story keeps the height).
Icons beside a wrapping label are vertically centred and never shrink. `DialogFooter` and
`AlertDialogFooter` give their buttons `min-w-0` so a long label wraps inside the footer.

## Select vs Combobox

`Select` (Radix) is a closed, known, short set picked from a list: model, effort, status. It has no text
entry; its type-ahead is first-letter only. `Combobox` (`react-aria-components`) is a text input with a
filtered list.

`SelectTrigger`, `Combobox` and `OptionPicker` accept `invalidAppearance="message"` only when
the owner displays a persistent visible error. This keeps `aria-invalid` and error association,
uses a neutral resting border and the normal single focus border, and avoids stacking a red
border with a blue focus outline. The default `"border"` appearance is unchanged.

| Use        | When                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Select`   | at most 8 options, no lookup by typing                                                                                       |
| `Combobox` | more than 8 options, OR growing/async data (workspaces, branches, repositories, folders), OR the user knows the name to type |

Nothing converts automatically; existing `Select` consumers stay as they are. API:

```tsx
<Combobox
  value={id}
  onValueChange={setId}
  placeholder="..."
  invalid
  disabled
  filter={fn | false}
  loading
  inputValue
  onInputChange
  allowsCustomValue
  menuTrigger
  labels
>
  <ComboboxGroup label="..."> ... </ComboboxGroup>
  <ComboboxItem
    value="stable-id"
    textValue="plain text"
    description="..."
    meta={<Badge />}
    unavailable
  >
    label
  </ComboboxItem>
</Combobox>
```

- Inside `Field` it is labelled by the `Field.Label` (the label focuses the input). Outside, pass
  `aria-label`. The chevron button is named `labels.showOptions`; localise `labels` (`showOptions`,
  `noResults`, `loading`) in the product.
- The trigger reuses the `TextInput` control recipe, so it is visually the same 36px control; the
  value is one line with an ellipsis. Options share the `SelectItem` anatomy through
  `forms/shared/optionRecipes.ts` (wrapping label, then metadata and description; selected background
  and left accent with no reserved selection column). Both Select and Combobox option labels wrap
  so the distinguishing tail of long values such as branch names is never cut. The list is at
  least as wide as the input, grows to fit long values, flips above near the viewport bottom and never
  exceeds `100vw - 1rem`.
- The list opens on click or tap of the input, via the chevron, ArrowDown and typing. Pass `inputRef` to
  move focus to the input (no `querySelector`).
- Default filter: case-, diacritic- and Polish `ł`-insensitive "contains" (`defaultComboboxFilter`).
  For async/owner-filtered options pass `filter={false}`, control `inputValue`/`onInputChange` and `loading`.
- Keyboard (APG combobox): ArrowDown opens and moves, typing filters, Up/Down navigate, Enter selects,
  Escape closes and restores the selected label, Tab leaves without committing partial text; focus stays in
  the input (`aria-activedescendant`).
- `unavailable` options are `aria-disabled`, not selectable, with the reason in `description` at full
  contrast. Known divergence from `SelectItem`: they are skipped by arrow keys (react-aria `ListBox`
  cannot focus a disabled option); put persistent explanation outside the list too.
- Not done in v1: iOS focus-zoom (16px input) rule, virtualization (revisit above ~500 options), Figma
  projection.

## Menu notes and labels

- `MenuLabel` is a short truncating caption (uppercase `section-label`, about 21 characters at `w-56`).
  Entity or scope titles are truncated by contract; keep `OverflowMenu label` to about 20 characters or omit
  it. Never put a reason or sentence in it.
- A reason or hint for a menu (for example why actions are unavailable) uses `MenuNote`:
  non-interactive, wrapping, `body-sm` + `content-muted`. Render it after the last item and a
  `MenuSeparator`, with a required `id`, and pass the same id to `MenuContent aria-describedby`; it is
  announced when the menu opens and roving focus skips it. It renders inside a `role="group"` (not a bare
  `note` child of `role="menu"`). One note per menu (unique reasons, at most two lines).

  ```tsx
  <MenuContent aria-describedby="folder-note">
    <MenuItem disabled>Move folder</MenuItem>
    <MenuSeparator />
    <MenuNote id="folder-note">This folder is read-only in this workspace.</MenuNote>
  </MenuContent>
  ```

- Width: fixed-action menus use `w-56` (`MenuContent`); header and overflow menus use `w-auto` with the
  floating `min-w-48` and the available-width cap. Items stay single-line with an ellipsis; add an opt-in
  wrap variant only when a real action label clips at 320 or 200% zoom. Danger actions go last behind a
  `MenuSeparator`; an unavailable action is shown only together with a `MenuNote` that explains why.

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
