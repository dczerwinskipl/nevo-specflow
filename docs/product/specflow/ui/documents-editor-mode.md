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
  MUST NOT close tabs.
- **Open rule.** Opening a file from the tree opens a new tab; opening an open file activates its
  tab. There is no preview tab.
- **Scope.** Open tabs live for the visit to one specification and are not persisted. Unsaved drafts
  stay in the visit-scoped draft store, so switching tabs MUST NOT lose edits.
- **URL.** The active tab is the route `documents/$documentId`; the set of other open tabs is not in
  the URL.
- **Unsaved changes.** Closing a tab with edits MUST ask (Save / Discard / Cancel) for that tab.
  Leaving the screen or switching specification MUST ask once, listing the unsaved documents.
  `DocumentRouteGuard` is single-document today and MUST be extended to this.
- **Missing document.** A tab whose document disappeared stays open, marked missing; a draft is not
  discarded silently.

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

- **Markdown.** Opens in preview. Edit/Preview is promoted (pencil in preview, eye in edit). Split
  (icon "open preview to the side") exists only when the document area is at least 1000 px; below
  that the view falls back to edit. Word wrap and line numbers are editor preferences in the
  `display` group, shared across tabs.
- **Code.** One view, editable by property; no mode toggle. Save is promoted only while dirty.
- **Image.** Opens as Fit. One promoted toggle, Fit <-> Actual size (100%). Zoom in/out and the
  current zoom (info row) are in `display`; zoom is per tab; pinch and `+`/`-` zoom on input
  devices.
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

## Follow-ups for the integration PR

- Complete menu (`menu: 'complete'`) with groups in `WorkspaceHeaderFrame`.
- `aria-pressed` on icon header actions.
- "Open preview to the side" icon in the `nevo-ui` Icon set.
- Close guard for several tabs (extend `DocumentRouteGuard`).
- Mapping of the active tab to the route `documents/$documentId`.
- Confirm the 44 px hit area.
