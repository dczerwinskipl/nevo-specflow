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
  - design-system.implementation.react.workspace-dynamic-split
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

- **Placement.** The strip MUST be the content of a region header, left of the header actions. It
  MUST NOT add a second row under the header. `density` sets the root height: `header` (default)
  fills the 56 px workspace header (`h-14`; the stacked/narrow switcher headers and mocks that are
  not on a split rail); `rail` is every split Secondary's editor-tab rail (Session and Documents
  alike, owner decision 2026-11-03: one look for all desktop tab strips), the full 36 px `--spacing-tab-rail` (see [Secondary navigation](secondary-navigation.md),
  "Root tabs and local navigation"), which draws its own bottom divider, so its host row has no
  border or padding. In `header` tabs are one control high (36 px), anchored to the bottom edge
  with 2 px between them; the active tab's underline sits on the header border. The strip never
  adds height of its own to match another region.
- **Tab look (`header`).** Square tabs, no rounded "card" top and no fill when
  selected: the active tab is the 2 px `action-primary` underline plus `content-primary` text,
  12 px / 600 labels. Inactive tabs are plain `content-secondary` text (muted while loading or
  missing) with no underline and show `surface-hover` only on hover. A fill — on every tab, or
  only on the active one — read as a row of separate buttons and competed with the underline.
  Labels never wrap.
- **Tab look (`rail`, editor tabs).** Owner decision 2026-11-03, after "tiny and cramped … should
  look like typical IDE tabs": tabs touch (no gap), full rail height, `body-md` labels (14 px /
  400, active included, so activation never changes the width), a 1 px `border-subtle` separator
  on every tab's end edge, and **no icons** (a tab is its name). The strip is darker than the panel
  (`--color-tab-strip`, the canvas at 60 %): inactive tabs sit on it with the strip's bottom
  divider and `surface-hover` on hover; the **active tab takes the panel's own surface** (no fill,
  no bottom border), so it reads as the top of the content below, under a 1 px **neutral** top
  border of the separators' colour — no primary accent line — plus `content-primary` text. The
  strip continues past the last tab with the same fill and divider (`RailTail`, exported with
  `ItemTabs`) and carries the `Opened (N)` trigger and any rail controls of the host. A dirty item
  shows its dot in the glyph slot, which is reserved for it. A rail has no region-level close:
  each tab closes itself (Documents offers _Close all documents_ in the document's `...` menu). The earlier "underline only, no card" rule remains `header`'s; these tabs are square and
  touching, so they are not the separate rounded cards that rule rejected.
- **Width (content width, both densities).** A tab is as wide as its own content: the start padding
  (`pl-2.5` in `header`, `pl-3` in `rail`), the glyph (16 px, or 14 px in `rail`, + 8 px gap)
  when the item has an icon or a loading/missing state, the label measured in the rendered font (a
  hidden, clipped measuring layer, re-measured when labels change and when web fonts are ready;
  estimated at 6.4 px a character in `header` and 7.4 in `rail` only where nothing is laid out), and
  the end slot — 32 px reserved for the `x` on a closable tab, so label and `x` keep fixed
  positions, or a symmetric 10 px (`header`) / 12 px (`rail`) on a non-closable one. The numbers are
  `itemTabMetrics(density)` in `itemTabsLayout.ts`, coupled to the tab classes. Clamped to 64-240 px. When the content widths do not fit,
  the widest tabs first shrink to one common cap, never below 120 px (their labels truncate in the
  middle, the full label stays the tab's accessible name and tooltip; with no icons there is no
  earlier compaction step); only when even that does not fit do the trailing tabs go to the
  `Opened (N)` menu, the active one always staying visible
  (`fitItemTabs`). Decision (owner, 2026-11): content width replaces the earlier fixed 140-180 px
  for **both** hosts — Documents' `DocumentTabStrip` (file names) and the Secondary rail — because a
  fixed width wasted space on short names (`Kontekst`) and cut long file names early; one policy
  keeps the strips consistent. Documents' short file names now get narrower tabs and long ones up to
  240 px.
- **Switcher.** Below `switcherBelow` (default 480 px of strip width in `header`, 292 px in
  `rail` = two compressed tabs plus the overflow trigger) the strip MUST become one button
  `name (N)` opening the same menu (`variant="auto"`).
- **Overflow trigger.** Shows the chevron and the count; its accessible name is the full
  `labels.openedMenu(N)` text (the visible count is `aria-hidden`, so the visible text is never
  outside the name — WCAG 2.5.3).
- **Tab anatomy.** Icon, label, close `x` at the label's right edge. The unsaved state is a badge on
  the icon, visible on every pointer and in the switcher; it MUST NOT share the close slot. `loading`
  shows a spinner, `missing` a warning icon and muted label; neither changes tab geometry.
- **Close.** The `x` is shown on hover, focus and on the active tab, always on coarse pointers, with
  a 44 px hit area there. It is outside the tablist and not in the tab order.
- **Menu.** `Opened (N)` lists every item with description and dirty badge. Every row has the same
  compact height: the label and the description each take one line and truncate, the description at
  its start so the file name stays visible; the row's tooltip and accessible text carry the full
  description. Each item row is
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

Headless state: `{ items, activeId, open, activate, close, requestClose, closeAll, replace }`.

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
- `replace(id, item)` gives an open item a new identity in place (same position, still active when
  it was active), for example after the host's resource got a new id. An id that is not open is
  ignored; when the new id is already open the old entry is dropped instead of duplicated.
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
- **Height.** `ItemTabs` sets its own height (its `density` slot minus the divider), so a host
  renders it inside `WorkspaceHeader.identityContent` without sizing it.

## Gaps to close in nevo-ui

The complete menu (`menu="complete"`) and `aria-pressed` for icon toggles exist on `WorkspaceHeader`, and
Secondary stack screens pass `menu` through their definition; see
`design-system.implementation.react.secondary-navigation`, section Header actions.

1. `ItemTabs` duplicates the workspace header height. A header content slot that stretches to the
   header height would remove that coupling.
2. The Content tabs host pattern above has its first concrete consumer specified in
   [Workspace dynamic split and Secondary root tabs](workspace-dynamic-split.md): Secondary root
   tabs reuse `useOpenedItems`/`ItemTabs` directly, with one addition this document does not yet
   have — an optional non-closable (`closable: false`) item, needed for a pinned root tab. That
   document's §9 tracks the `useOpenedItems` extension as its first implementation gap.
