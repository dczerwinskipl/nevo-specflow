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
  content kinds, the target read-only previews in a Session, and the deferred layout decisions.
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
  workspace (`fit="available"`): Wide 25 / 75, Compact 1/3 / 2/3, with the tree capped at 360 px
  (`primaryMaxPx`) so the document gets the rest on wide screens. The tree MUST be permanently
  visible whenever the workspace splits (>= 840 px); it MUST NOT be a drawer or toggle there.
- **Contents and properties (preview only).** A markdown preview with at least two headings (h1-h4) offers
  its contents. When the document panel is at least 840 px wide (a 1400 px window and wider) (measured on the panel, so the text keeps
  at least 528 px, about 62 characters or more) the text keeps its 760 px measure at most and a sticky column
  beside it holds the properties and the contents, the current heading marked while reading; the column
  is 27% of the panel between 232 and 320 px and its rows are one line with the full title on hover. The
  contents are a compact tree of the headings in the file tree's family: one row height, one indent step per
  real heading level (a flat list when all headings share a level), normal weight, no icons or numbering; the
  current section is a quiet tint with an accent bar and follows the reading position; choosing a heading
  scrolls to it smoothly (at once with reduced motion). In a
  narrower panel there is no column and no box in the text: a contents icon (`list`) follows the tab strip or the narrow
  switcher in the header, always right after them and not beside the actions, and opens the contents as a bottom sheet, and the same entry is the first item of
  the Display group of the `...` menu. The icon is region navigation, not a header action, so it costs no
  direct slot. The sheet is titled Contents only (the tab already names the document). Choosing a heading
  closes the sheet, scrolls to the heading and focuses it; closing without a
  choice returns focus to the icon. The properties are one collapsed plain row (a thin rule, no frame) in the text and in the column, with a 44 px hit area on touch. Editing, plain text
  and documents with fewer than two headings have no contents. A permanent contents bar was considered
  and rejected in review.
- **Source editor.** Line numbers are a quiet band of their own beside the text, and the current line is marked
  from that band to the end of the line. While the source editor is shown, the Display group of the `...`
  menu has a checked **Wrap lines**: on unless the reader turned it off, kept in this browser separately for a
  narrow panel (below 840 px) and a wide one; turning it off lets long lines scroll sideways.
- **Narrow.** The workspace stacks: tree, then the document with Back to the tree. Tabs are not
  shown; the document header carries the `name (N)` switcher. Back only returns to the tree and
  MUST NOT close tabs or change the route. The region has no close of its own while stacked (it would repeat
  Back); the split layouts keep it as "close every tab". The stacked screen follows the active tab, so a tab switch
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
  screen, switching specification, a tree operation, closing every tab (_Close all documents_ in the document's `...` menu — the split tab rail has
  no region-level close) or unloading
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

## Session (target, not implemented)

Today a Session reaches documents only through Context's Documents row, which opens the
Specification's Documents screen with the Session as the way back. The following is the intended
behavior once a Session can preview files in its own Secondary:

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

The kinds are `documentContentKinds` in `features/documents/content-kinds`; the first kind that
matches a document wins, plain text being the fallback.

- **Markdown.** Views preview and edit; opens in preview. Edit/Preview is one icon action that names
  the action (pencil in preview, eye in edit), always direct, except while editing with unsaved
  changes, when Save takes the narrow header's single slot and the mode action is direct only on
  wide headers. Markdown the Runtime reports as not editable has only the preview and offers
  Download in the menu.
- **Plain text** (any text that is not markdown). One editable source view: no preview, no mode
  action, no properties. Text that cannot be changed here is a read-only source view with Download
  in the menu.
- **Save and Discard** (markdown and plain text) exist only while the draft differs. Save is the
  `primary` action, always direct, and shows Saving while it commits.
- **Image.** One view, fitted to the area. The `display` group has a checked **Actual size** item
  (100 %); Download is the promoted (`primary`) header action. Never dirty.
- **File** (binary, or text above the read limit). The body explains the file and carries a
  Download button; the header keeps Download in the menu only (`direct: 'never'`), so the two never
  differ in weight.
- **Source editor preferences.** **Wrap lines** in the `display` group while the source editor is
  shown (see Documents above).
- **Editor look.** Editable source MUST look like an editor: monospace, a line-number gutter sized
  to its digit count (at least 2 digits on Narrow), current-line highlight. There is no "Editing"
  badge.
- **Narrow, editing.** Save replaces the mode toggle in the single direct slot; Preview is in the
  menu.

## Tablet and fold

Estimate, not measured in the final mock: with a tree of 240 px the split keeps at least 60
characters per line down to a workspace of about 770 px.

**Decision.** The split threshold of this screen stays the shell's global 840 px; below it the
screen stacks as Narrow. A lower threshold (about 770 px) is deferred and would require changing
the shell (`supportsWorkspaceSplit`). The mock's `Split770` and `Split800` frames are comparison
frames only.

## Decisions and deferrals

- Tab width follows [Item tabs](../../../design-system/implementation/react/item-tabs.md): content
  width clamped to 64-240 px, compressed to no less than 120 px before tabs overflow.
- The 44 px close hit area on coarse pointers applies to the `header` density; the split rail's
  close is always visible.
- Deferred: split view (editor beside preview, any kind); a code kind (editable source by
  property); image zoom (zoom steps, pinch, `+`/`-`); a transient preview tab; a separate editor
  layout (tree and tabbed area as peers, outside Primary/Secondary); Session file previews (above),
  including Back behavior in a Session with open tabs.
- Verify the tree/document geometry on the real `AppWorkspace` at tablet widths: the Storybook mock
  composes the layout by hand, so it does not prove scroll, borders, region widths or breakpoints.
