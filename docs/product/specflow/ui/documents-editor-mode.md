---
id: product.specflow.ui.documents-editor-mode
type: product
title: Documents editor mode
status: draft
read_when:
  - changing the Documents screen, its tree, tabs or editor
  - opening a document or file preview from a Session
  - deciding how several documents are open at once
summary: >
  Behavior of the Documents screen with several open documents (tree plus tabbed document area), the
  same tabs as read-only previews in a Session, and the open decisions around the layout.
related:
  - product.specflow.ui.interaction-model
  - design-system.implementation.react.item-tabs
  - design-system.implementation.react.secondary-navigation
  - product.specflow.ui.ai-session-ux
---

# Documents editor mode

The tab strip, open-item state and content-host rules are owned by
[Item tabs and content tabs host](../../../design-system/implementation/react/item-tabs.md). This
document owns only what they mean in the product. Approved mock: Storybook
`SpecFlow/Screens/Editor mode (mock)`.

## Documents

- **Layout.** The document tree is Primary and the document area is Secondary of the existing
  workspace (`fit="available"`): Wide 25 / 75, Compact 1/3 / 2/3. The tree MUST be permanently
  visible whenever the workspace splits (>= 840 px); it MUST NOT be a drawer or toggle there.
- **Narrow.** The workspace stacks: tree, then the document with Back to the tree. Tabs are not
  shown; the document header carries the `name (N)` switcher. Back only returns to the tree and
  MUST NOT close tabs or change the route. The stacked screen follows the active tab, so a tab switch
  while it is open does not close and reopen it.
- **Open rule.** Opening a file from the tree opens a new tab; opening an open file activates its
  tab. There is no preview tab.
- **Scope.** Open tabs live for the visit to one specification and are not persisted. Unsaved drafts
  stay in the visit-scoped draft store, so switching tabs MUST NOT lose edits.
- **URL.** The active tab is the route `documents/$documentId`; the set of other open tabs is not in
  the URL. The route is the single source of the active tab: a document in the URL (a deep link, a
  reload) opens exactly one tab. Switching to an open tab replaces the history entry; opening a new tab
  (from the tree, a new file, an import) pushes one. Both keep the location state, so the return link to a
  Session or the Specification overview survives tab changes. Closing the active tab moves to its right
  neighbour, else the left one, by replacing the entry; closing the last tab shows the document list. The browser Back button may return to the address of a tab that was closed: the route is the source of the active tab, so that address opens its tab again.
- **Unsaved changes.** Closing a tab with edits asks (Save / Discard / Cancel) for that tab, also for a tab
  that is not on screen; Discard removes its draft, so reopening shows the saved document. Leaving the
  screen, switching specification, a tree operation, closing every tab (the region's close) or unloading
  the page asks once, listing the unsaved documents (Save all / Discard all / Cancel). When Save all
  cannot save everything the dialog stays open and lists the documents that are still unsaved.
- **Switching tabs is not leaving.** Moving between open tabs changes the route
  `documents/$documentId` but stays on the Documents screen, so it MUST NOT trigger the leave guard
  or its Save / Discard / Cancel dialog. Drafts of the other tabs are kept. Only closing a tab, leaving
  the screen or switching specification asks.
- **Missing document.** A tab whose document disappeared stays open, marked missing, with its last known
  name; a draft is not discarded silently.
- **Tree operations.** Rename and move keep the tab (the document id is stable) and its draft; the tab name
  follows the tree. Deleting documents closes their tabs without a second question (the user confirmed
  the delete) and drops their drafts. A new empty file opens as a new tab in edit; an import opens its
  first file as a new tab in preview; a new folder opens nothing.

## Session

- The same tabs host read-only previews in the Session's Secondary region, next to the
  conversation. There is no tree and no editing.
- A tab opens only from an explicit user action on a link. The agent MUST NOT open, activate or
  replace a tab, change the scroll position or move focus. When a shown file changes, the tab shows
  a quiet "updated" marker and keeps the reading position.
- Closing the last tab, or closing Secondary, returns to the Context panel.
- "Open in Documents" is the only promotion to the full Documents screen (a Primary route).

## Content kinds

Each kind declares its views and actions to the host; the rules for descriptors, promotion and the
`...` menu are in the design-system document.

- **Plain text (`.txt`).** One editable view: it opens as the source, with no preview, no mode action and
  no properties. Save is promoted only while there are unsaved changes.
- **Markdown.** Opens in preview. Edit/Preview is promoted (pencil in preview, eye in edit). Split
  (icon `columns-2`, from the existing lucide set) exists only when the document area is at least 1000 px; below
  that the view falls back to edit. Word wrap and line numbers are editor preferences in the
  `display` group, shared across tabs.
- **Code.** One view, editable by property; no mode toggle. Save is promoted only while dirty.
- **Image.** Opens as Fit. One promoted toggle, Fit <-> Actual size (100%). Zoom in/out are in
  `display`, with the current zoom shown as a trailing value; zoom is per tab; pinch and `+`/`-`
  zoom on input devices.
- **Binary.** Download is promoted.
- **Editor look.** Editable source MUST look like an editor: monospace, a line-number gutter sized
  to its digit count (at least 2 digits on Narrow), current-line highlight. There is no "Editing"
  badge.
- **Narrow, editing.** Save replaces the mode toggle in the single direct slot; Preview is in the
  menu.

## Tablet and fold

Estimate, not measured in the final mock: with a tree of 240 px the split keeps at least 60
characters per line down to a workspace of about 770 px.

**Decision.** The split threshold of this screen stays the shell's global 840 px; below it the
screen stacks as Narrow. A lower threshold (about 770 px) is deferred to the integration PR and
requires changing the shell (`supportsWorkspaceSplit`). The mock's `Split770` and `Split800` frames
are comparison frames only.

## Decisions and deferrals

- The minimum tab width stays 140 px; exceptions may be raised in the integration PR.
- The 44 px close hit area on coarse pointers is to be confirmed in integration.
- Back behavior in a Session with open tabs is open.
- Split view for kinds other than markdown is deferred.
- A transient preview tab is deferred.
- A separate editor layout (tree and tabbed area as peers, outside Primary/Secondary) is deferred
  until after the integration.

## Follow-ups after the integration

Integrated for Markdown and plain text on the demo Runtime: the complete header menu and `aria-pressed`,
the guard for several tabs, the route as the active tab, the narrow switcher and tree operations.

- Split view (>= 1000 px) and the editor preferences (word wrap, line numbers) for markdown.
- Code, image and binary kinds (the registry in `features/documents/content-kinds` takes a descriptor each).
- Confirm the 44 px hit area.
- Verify the tree/document geometry on the real `AppWorkspace` at the tablet widths: the Storybook mock
  composes the layout by hand, so it does not prove scroll, borders, region widths or breakpoints.
