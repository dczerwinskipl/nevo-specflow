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
`SelectableCard` component: the consumer owns semantics, layout and content. SpecFlow UI composes the
single-choice case once in `features/specs/creation/options/ChoiceTile.tsx` (`ChoiceTileGroup` + `ChoiceTile`: native
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

`SelectItem` stays a single-line option by default. Two optional slots extend it without a local
fork: `description` (secondary line, `body-sm` + `content-secondary`, wraps) and `meta` (trailing,
right-aligned text or `Badge`). Both are linked to the option through `aria-describedby`; only the
main label (`children`, single-line, truncated) is the option's accessible name and the value shown
in the trigger, so the trigger always stays one line and never contains description or meta.

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
| `treeTrailingLabelClassName`                       | a quiet trailing label of the item (for example its type) before the row action, shown in full or not at all: below `@xs` row width (20rem) it is visually hidden, never shortened, and it stays in the accessible name                                |
| `treeStateLabelClassName`, `treeAttention...`      | a trailing state label that never hides (the name truncates instead); the attention forms tone the label and the leading glyph (`treeAttentionGlyphClassName`), never colour alone                                                                     |
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
