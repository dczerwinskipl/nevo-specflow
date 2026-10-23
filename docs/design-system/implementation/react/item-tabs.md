---
id: design-system.implementation.react.item-tabs
type: engineering
title: Item tabs and content tabs host
status: draft
scope: nevo-ui
read_when:
  - opening several documents, previews or files as tabs in a workspace region
  - using or changing ItemTabs or useOpenedItems
  - defining what a tab's content shows and which header actions it offers
summary: >
  Product-neutral contract of the ItemTabs strip and the useOpenedItems state, and the Content tabs
  host pattern in which a blind host renders content that declares its own views and actions.
related:
  - design-system.implementation.react.secondary-navigation
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.layout-and-containment
  - design-system.implementation.react.component-authoring-contract
  - product.specflow.ui.documents-editor-mode
---

# Item tabs and content tabs host

`ItemTabs` and `useOpenedItems` live in `@nevo/ui` (`components/navigation/ItemTabs/`). They know
ids, labels and states only. Product terms, file types and editors MUST NOT enter them. Runnable
examples: Storybook `SpecFlow/Screens/Editor mode (mock)` and the `ItemTabs` stories.

## ItemTabs

A controlled strip of opened items (`items`, `activeId`, `onActivate`, `onClose`, `scope`). The host
owns state, guards and the tab panel; the strip renders no panel.

- **Placement.** The strip MUST be the content of a region header (`h-14`), left of the header
  actions. It MUST NOT add a second row under the header. Tabs fill the header height; the active
  tab's underline sits on the header border.
- **Width.** A tab is 140-180 px. If `N x 140` fits, all tabs are visible; otherwise
  `floor((width - 52) / 140)` tabs are visible, the active one always among them, and the rest go to
  the `Opened (N)` menu. Labels truncate in the middle so the extension stays visible; the tooltip
  and the menu row show the full description (path).
- **Switcher.** Below `switcherBelow` (default 480 px of strip width) the strip MUST become one
  button `name (N)` opening the same menu (`variant="auto"`).
- **Tab anatomy.** Icon, label, close `x` at the label's right edge. The unsaved state is a badge on
  the icon, visible on every pointer and in the switcher; it MUST NOT share the close slot. `loading`
  shows a spinner, `missing` a warning icon and muted label; neither changes tab geometry.
- **Close.** The `x` is shown on hover, focus and on the active tab, always on coarse pointers, with
  a 44 px hit area there. It is outside the tablist and not in the tab order.
- **Menu.** `Opened (N)` lists every item with description and dirty badge. Each item row is
  followed by a `Close <label>` menu item, shown when its row is highlighted and always available to
  assistive technology; the `x` in a row is a pointer shortcut only. The same menu serves the
  switcher, so closing never depends on a keyboard.
- **Focus after close.** After a close from a tab, the menu or the keyboard, focus MUST move to the
  neighbouring tab (right, else left) and MUST NOT return to a trigger that may have unmounted. This
  holds for every close path in the `Opened` menu (the `Close` item, the row's `x` and `Delete`).
  When the guard is asynchronous, focus moves only after the item was actually removed; when the
  guard refuses, the item stays open and focus is not moved. Closing the last item leaves focus to
  the host.
- **No preview tab.** Every open creates a tab; opening an open item activates it.
- **Keyboard.** `activation="manual"` (default): arrows, Home and End move focus, Enter/Space
  activates. `Delete` on a tab or menu row closes it; middle-click closes a tab. The strip MUST NOT
  bind Ctrl+W (the browser owns it).
- **A11y.** `tablist`/`tab` with roving tabindex; one tab panel per active item, referenced through
  `getItemTabId` / `getItemTabPanelId`. Dirty, loading, missing and current are announced, and statuses combine: an item that is both
  missing and dirty is announced as both ("not found, unsaved changes").
- **Copy.** All strings are replaceable through `labels`.

## useOpenedItems

Headless state: `{ items, activeId, open, activate, close, requestClose, closeAll }`.

- `open` MUST activate an item whose `id` is already open instead of adding another.
- Closing the active item activates its right neighbour, else the left one; closing the last leaves
  `activeId` null.
- `requestClose` MUST consult the async `canClose(id)` guard and resolve `true` only when the item
  was actually closed. It resolves `false` when the guard refuses, the item is not open, the state
  was reset meanwhile or the hook unmounted. Concurrent requests for the same item share one guard
  call and one result. The hook does not swallow errors: if `canClose` rejects, `requestClose`
  rejects, the item stays open and the hook clears its pending state, so the next request works. The
  host MUST handle the rejection, treat it as a refusal and tell the user. The host MUST route every
  close trigger (`x`, Delete, middle-click, menu) through `requestClose`. `close` and `closeAll` do
  not ask.
- A change of `scope` resets to the initial values and starts a new state generation. A guard that
  was pending in an earlier generation MUST NOT close anything, even if the scope later returns to
  the same value.

## Content tabs host (pattern, not implemented in nevo-ui)

A **host** composes `useOpenedItems`, `ItemTabs` and a header action slot, and renders the active
item. The host MUST be content-blind: it receives from each item `label`, `description`, `dirty`,
`state`, `render()` and `actions()` and MUST NOT import code specific to a kind of content. Each
product supplies a provider; other hosts (read-only previews, diffs) bring their own.

A **content descriptor** declares `views`, `defaultView`, optional `viewMinWidth` per view (measured
on the content area, not the viewport) and `actions(view, context)`.

- **Views.** A view switch exists only where views differ. The chosen view is per tab. A view whose
  `viewMinWidth` is not met MUST fall back to its nearest narrower view.
- **Action shape.** `{ id, label, icon, group: 'display' | 'actions', promoted?, checked?, tone?,
disabled?, shortcut?, onPress }`.
- **Complete menu.** The `...` menu MUST list every action of the active tab: `display` group
  (options and toggles) above `actions`. A promoted action is a shortcut to the same action (same
  `id` and label); the duplicate is intended. A shortcut hint appears only where the key works.
- **Icon = action.** An icon names the action it performs, never the current state. State is shown
  in the menu's trailing slot (`checked`) and, for icon toggles, through `aria-pressed`.
- **Promotion.** Direct header actions follow the header action budget of the workspace header. The
  action that persists changes while there are unsaved changes wins first; then lower `promoted`;
  the rest stay menu-only. The header MUST NOT change geometry when state changes.
- **Height.** `ItemTabs` sets its own height (the workspace header slot minus its divider), so a
  host renders it inside `WorkspaceHeader.identityContent` without sizing it.

## Gaps to close in nevo-ui

The complete menu (`menu="complete"`) and `aria-pressed` for icon toggles exist on `WorkspaceHeader`; see
`design-system.implementation.react.secondary-navigation`, section Header actions.

Still open: the complete menu is not supported by `HeaderOutlet` and `CompactScreenActions` (runtime
Secondary stack screens) until the narrow integration; pass `menu` through the screen definition then.

1. `ItemTabs` duplicates the workspace header height. A header content slot that stretches to the
   header height would remove that coupling.
