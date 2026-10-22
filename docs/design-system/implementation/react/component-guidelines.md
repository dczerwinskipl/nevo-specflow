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

## Ownership boundary

- `packages/nevo-ui/` owns domain-agnostic components, design tokens, app-shell mechanics, and
  workspace/floating behavior that can be reused by another application.
- `packages/specflow-ui/` owns SpecFlow brand composition, routing, product screens, copy, and
  product-specific interaction decisions.
- `examples/` owns independent consumers. Examples MAY use Nevo UI but MUST NOT depend on
  SpecFlow UI.
- Routing libraries and product data models MUST NOT leak into Nevo UI component APIs.

## File size

An inspection trigger, not an extraction rule. A large cohesive component can be fine;
split when it mixes independent concerns, tangles orchestration with presentation, or
is hard to test because of unrelated effects.

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
- [ ] File size used only as an inspection trigger?
- [ ] Visual components free of data/routing concerns?
- [ ] Hooks split by behavior, no catch-alls?
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
`SelectableCard` component: the consumer owns semantics, layout and content.

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

`SelectItem` stays a single-line option by default. Two optional slots extend it without a local
fork: `description` (secondary line, `body-sm` + `content-secondary`, wraps) and `meta` (trailing,
right-aligned text or `Badge`). Both are linked to the option through `aria-describedby`; only the
main label (`children`, single-line, truncated) is the option's accessible name and the value shown
in the trigger, so the trigger always stays one line and never contains description or meta.

- Branch-like values compose the label as `Icon name="branch"` (`size="sm"`) + `Typography
as="span" variant="code-md"`; `textValue` carries the plain name.
  In the Create workspace section this composition is the single `BranchRef` piece
  (`specflow-ui/src/shared/git/BranchRef.tsx`, a product component, not part of the design system) used by summary rows, switch descriptions, notes and
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
action is unavailable. `tone` is `info` (muted icon) or `attention` (status colour); the icon is
decorative. It has no live-region role: wrap it in one or use `Alert` when it must be announced.
No Figma projection in v1.

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

| Export                                             | Apply to                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `treeRootClassName`                                | the top-level list (no indent)                                                                                                                                                                                                                         |
| `treeBranchClassName`                              | the container of an expanded folder's children (indents by `--spacing-tree-indent`, one glyph slot)                                                                                                                                                    |
| `treeNodeClassName`                                | each node (row + optional nested branch or hint)                                                                                                                                                                                                       |
| `treeRowClassName`                                 | the row line of a node (item + sibling trailing action); names the `tree-row` group and container                                                                                                                                                      |
| `treeItemClassName`                                | the interactive folder row (`button`): one compact control height, hover, `aria-current` selection, global focus ring, disabled, block-axis hit area                                                                                                   |
| `treeLeafItemClassName`                            | the interactive leaf item: no glyph slot, its icon aligns with the sibling folders' icons                                                                                                                                                              |
| `treeGlyphSlotClassName`                           | the disclosure chevron slot of folders (leaves do not render it)                                                                                                                                                                                       |
| `treeItemLabelClassName`                           | the name; wraps long names                                                                                                                                                                                                                             |
| `treeItemLabelTruncateClassName`                   | the name on one line with an ellipsis (keep the full name reachable elsewhere, for example a tooltip shown only when clipped)                                                                                                                          |
| `treeRowActionClassName`                           | the trailing action trigger of a row (`IconButton size="sm"`, sibling of the item): revealed on hover, focus-within, open menu and the selected row on fine pointers, always visible on touch; its slot is always laid out, so the label never reflows |
| `treeRequiredLabelClassName`, `...MarkerClassName` | a quiet muted "Required" text inside the item before the row action; below `@3xs` row width the text is visually hidden and the workflow icon stands in. It never reorders rows and never selects one                                                  |
| `treeHintClassName`                                | a quiet inline hint under an opened empty folder (muted, aligned to the folder name column by `--spacing-tree-name-offset`, no icon, not focusable, not a tree item); the product removes it when the folder gets content                              |

Geometry tokens are derived, not hand-tuned: `--spacing-tree-row-height` is one compact control
height (`--spacing-control-height-compact`); `--spacing-tree-gap` spaces glyph, icon and name;
`--spacing-tree-indent` is one `icon-md` glyph slot, so the third level keeps most of the width;
`--spacing-tree-leaf-offset` = `icon-md` + one gap, used by leaves so their icon aligns with sibling
folder icons.

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

## Dialog footers

`DialogFooter` and `AlertDialogFooter` own the responsive action layout; consumers must not override
it. Put actions in DOM/focus order Cancel → secondary → primary/destructive. Below `sm` the footer
stacks full-width actions with the primary/destructive action on top; from `sm` it is a right-aligned
row that wraps (`sm:flex-wrap`) instead of clipping, which keeps 200% zoom readable. Use
`AlertDialog` with a `destructive` action for irreversible or discarding confirmations.

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
  `forms/shared/optionRecipes.ts` (wrapping `description`, trailing `meta`, check on the selected
  option). Combobox option labels wrap (`optionLabelWrappingClassName`) so the distinguishing tail of long
  values such as branch names is never cut; `Select` keeps the single-line ellipsised label. The list is at
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

## Scrolling regions

Every scrolling region uses the DS `ScrollArea` (thin scrollbar, edge indicators); never hide scrollbars and
do not nest scrollers. `DrawerBody` is a `ScrollArea` (padding on its content wrapper; the viewport is one
keyboard-focusable Tab stop so content without focusable children stays scrollable). A list that already
contains focusable items (for example a navigation `nav`) wraps its list in `ScrollArea` with
`className="min-h-0 flex-1"` and `tabIndex={-1}` and no `aria-label`, so it adds no Tab stop and no extra
`region` landmark. The AppShell drawer renders the product navigation directly in `DrawerContent` (no `DrawerBody`), so the
product navigation list is the single scroller in both the persistent aside and the drawer.
