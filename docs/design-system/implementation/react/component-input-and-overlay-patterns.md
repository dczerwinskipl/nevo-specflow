---
id: design-system.implementation.react.component-input-and-overlay-patterns
type: engineering
title: Input selection and overlay patterns
status: current
scope: nevo-ui
read_when:
  - implementing or reviewing choice surfaces, Select and Combobox, option pickers, context switchers, menu notes, Dialog footers, keyboard avoidance and Drawer sheets
summary: >-
  Component contracts for choice surfaces, Select and Combobox, option pickers, context switchers, menu notes, Dialog footers, keyboard avoidance and Drawer sheets.
related:
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.system-boundary
---

# Input selection and overlay patterns

General component ownership, accessibility and authoring rules remain in
[React component guidelines](component-guidelines.md). This document owns the component patterns below.

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

## Option picker

`OptionPicker` chooses one option from a list the owner cannot bound in advance and owns the rule of
"Select vs Combobox" below: up to eight options a closed `Select`, more a searchable `Combobox`, with
the same item anatomy (`description`, `meta`, `unavailable`) either way. The owner passes
`labels` (`showOptions`, `noResults`, `loading`) so the design system holds no product copy; inside a
`Field` both controls are labelled by `Field.Label`. SpecFlow wraps it once as
`shared/controls/LocalizedOptionPicker` (texts from `common.options.*`).

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
[Documentation reader](../../../product/specflow/ui/documentation-reader-navigation.md#workspace-picker-and-specification-switcher)).
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

## Select vs Combobox

`Select` (Radix) is a closed, known, short set picked from a list: model, effort, status. It has no text
entry; its type-ahead is first-letter only. `Combobox` (`react-aria-components`) is a text input with a
filtered list.

The Combobox's portalled list participates in the surrounding modal's interaction stack. Its options
remain clickable/tappable inside a Dialog, and Escape closes the list before the enclosing Dialog.

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
