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

- **Layout:** tree is Primary, document Secondary (`AppWorkspace fit="available"`). Wide 25/75, Compact 1/3–2/3; tree max 360 px. At workspace width 840 px or more it is permanently visible, never a drawer.

### Contents and properties

Only Markdown **preview** with at least two H1–H4 headings has Contents.

- **Wide panel (≥840 px):** text max 760 px; reserve at least 528 px for prose. Sticky Properties/Contents column uses 27% (232–320 px), one-line items with full-title tooltip.
- **Contents navigation:** one indentation level per actual heading depth; no icons/numbers. Indicate current heading by tint/accent bar and follow reading position. Click scrolls smoothly, or instantly with reduced-motion preference.
- **Narrower panel:** Contents icon next to tab/switcher opens a bottom sheet, also available first in Display menu. It is navigation, not a direct action slot. Choosing focuses the heading; dismissing restores icon focus.
- **Properties:** collapsed, unframed row with touch target 44 px. No Contents while editing, in plain text or with fewer than two headings.

### Source editor

- Show separate line-number gutter and current-line highlight. Display menu offers **Wrap lines**, persisted per browser separately for narrow (<840 px) and wide layouts; disabling permits horizontal scroll.
- **Narrow:** stack tree → document. Header Back returns to tree **without closing tabs or changing route**. Replace tab strip with `name (N)` switcher; switching active tab does not recreate the stacked screen. No redundant region Close.
- **Split:** region Close means close all tabs.

### Tab lifecycle

- Opening a new file adds a tab; opening an existing file activates it. No preview tabs.
- Tabs belong to one Specification visit and are not persisted. Drafts remain in the visit-scoped store while switching tabs.

### URL and tab identity

- Active document is `documents/$documentId`; other tabs are not encoded in the URL. Deep link/reload opens exactly its one tab.
- Opening a new tab pushes history; switching tabs or closing active tab replaces it. After close, select right neighbor, else left; closing last shows tree. Back to a closed tab's URL reopens that tab.
- Preserve route state needed to return to Session or Specification Overview.

### Preserving drafts

- Switching tabs **never** triggers leave confirmation or loses drafts.
- Closing a dirty tab asks **Save / Discard / Cancel**; closing all/leaving/switching Specification/unloading asks once for all drafts (**Save all / Discard all / Cancel**). Failed Save all lists remaining unsaved documents.
- Missing document tabs retain last known name and any draft. Rename/move retains ID, tab and draft; confirmed deletion closes tabs/drops drafts without a second prompt.
- New empty file opens in Edit, import's first file in Preview, new folder opens no tab.

## Session (target, not implemented)

Sessions currently open the Specification's Documents screen from Context, preserving a way back. Session-local file preview tabs are **not implemented**; see [open Full Session work](../../../ideas/specflow-ui/full-session-screen-structure.md#4-file-detail-tabs).

## Content kinds

Each kind declares its views and actions to the host; the rules for descriptors, promotion and the
`...` menu are in the design-system document.

The kinds are `documentContentKinds` in `features/documents/content-kinds`; the first kind that
matches a document wins, plain text being the fallback.

### Markdown and source text

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

### Images and binary previews

- **Image.** One view, fitted to the area. The `display` group has a checked **Actual size** item
  (100 %); Download is the promoted (`primary`) header action. Never dirty.
- **File** (binary, or text above the read limit). The body explains the file and carries a
  Download button; the header keeps Download in the menu only (`direct: 'never'`), so the two never
  differ in weight.

### Source editor options

- **Source editor preferences.** **Wrap lines** in the `display` group while the source editor is
  shown (see Documents above).
- **Editor look.** Editable source MUST look like an editor: monospace, a line-number gutter sized
  to its digit count (at least 2 digits on Narrow), current-line highlight. There is no "Editing"
  badge.
- **Narrow, editing.** Save replaces the mode toggle in the single direct slot; Preview is in the
  menu.

## Tablet and fold

Use the shell's 840 px split threshold; smaller workspaces stack. The screen does not independently alter `AppWorkspace` breakpoints.

## Decisions and deferrals

- Tab width follows [Item tabs](../../../design-system/implementation/react/item-tabs.md): 64–240 px, compressed to at least 120 px before overflow.
- Coarse-pointer close targets are 44 px in header density; split-rail Close remains visible.
- Unimplemented split-editor, zoom, code-kind and transient preview concepts belong in [UI open areas](../../../ideas/specflow-ui/full-session-screen-structure.md), not this current interaction contract.

## Document tab behavior and refusal states

### 5.1 Read-only on open

#### Read-only policy

- A document is read-only when `editable` is false or a Specification-wide write capability is
  unavailable (the contract has no per-document write action yet). The reason is chosen in this order: `archived`,
  `git-policy-invalid`, `branch-protected`, `branch-not-allowed`, `commit-blocked`, `not-editable`.
- The first line of the document content is an `InlineNote` (info): `Read-only: <reason>` plus the remedy
  for that reason. It is in the document flow, not sticky, not a box. The Edit action is not
  offered; Show path and Close tab stay.
- The same workspace renders in the demo and in a project Runtime; only the documents adapter differs.
- The same Specification-wide reason appears once above the tree (3.1, item 2); the per-document
  `not-editable` reason appears only in the tab.

### 5.2 Save

- Save is promoted only while dirty (today). While the request runs: label `Saving…`, disabled, the
  Discard action disabled, the editor stays editable (edits after the request are a new draft), the tab
  keeps its dirty mark. The live region announces "Saving…" once if the save takes longer than one
  second.
- Success: the save is acknowledged once the content is on disk (its commit is the Engine's, queued
  or made by the commit policy); the dirty mark clears and the live region announces "Saved". The commit
  state is not shown in this release. The document heading shows the new derived title; the tab label (file name)
  does not change.

#### Save refusals and conflict resolution

- Refusals keep the draft and show an Alert (role `alert`) at the top of the document; focus stays in
  the editor. After DOCUMENT_REVISION_CONFLICT **Save is unavailable until the user chooses Copy my
  version or Load the version on disk** (saving again would only repeat the conflict); after Copy my
  version the editor reloads the disk version as the base and keeps the user's text on the clipboard, so
  the user merges by hand and Save returns. For the other refusals Save stays available unless the reason
  makes it pointless:

| Error                                                     | Alert title                                   | Body / actions                                                                                                                                                                             |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DOCUMENT_REVISION_CONFLICT`                              | Not saved: <file> changed on disk             | The file was changed outside this editor after you opened it. Nothing was overwritten and your changes are still here. **Copy my version**, **Load the version on disk** (asks to discard) |
| `BRANCH_PROTECTED`, `GIT_POLICY_INVALID`, `SPEC_ARCHIVED` | Not saved: <reason>                           | Remedy line. The tab switches to read-only (5.1) but keeps the draft until the user closes or discards it.                                                                                 |
| `COMMIT_BLOCKED`                                          | Not saved: Git cannot take a commit right now | Remedy line; **Try again**.                                                                                                                                                                |
| `SPEC_BUSY`                                               | Not saved: another change is in progress      | **Try again**.                                                                                                                                                                             |
| `DOCUMENT_RECOVERY_REQUIRED`                              | The save did not finish                       | "Finish the save before editing further." **Resume** (same operation id). Editing is locked until resumed.                                                                                 |
| `DOCUMENT_FILE_MISSING`                                   | Not saved: the file is missing                | The tab becomes the missing state (5.5) and keeps the draft.                                                                                                                               |

- Close tab / leave with a draft after a refusal uses the existing Unsaved changes dialog.

### 5.3 Image and binary

- **Image** (`kind: image`): the image from `raw` (`<img src>`, never inline SVG markup) fitted to the area;
  a checked **Actual size** item in the Display group (fitted when unchecked), and **Download**
  (`download` icon), the promoted action of an image tab, marked `primary: true`. No Edit, no Save,
  never dirty.
- **Binary** (`kind: binary`): left-aligned on the reading measure: "This file cannot be shown here.
  Download it to open it in another program.", a description list (Path, Type or No type, Size,
  Format = `mediaType`) and **Download** (secondary text button in the body only; the header action is
  `direct: 'never'`, so it appears in the "..." menu and the two Downloads never differ in weight). No
  centred empty-area composition.
- Text that is viewable but not editable (`kind: text`, `editable: false`) opens in the source/preview view
  with the `not-editable` read-only line.
- Text above the JSON read limit (`DOCUMENT_TOO_LARGE`): the binary composition with the line "This file
  is too large to show here."

### 5.4 Tab labels and ids

- Label = **file name** (today's rule, `documentTabs.ts`); the derived title is the document's
  heading and is added to the tooltip. Description (tooltip, Opened menu, narrow switcher list) = path.
- After a rename or move the label follows the new name in place; the tab does not move.
- An id change (classify; rename or move of an unclassified file, whose id derives from its path) keeps
  the tab, its draft and position, and **replaces** the route with the new id.

### 5.5 Missing (dangling) tab

- Opened from a dangling row, or when a document disappears (existing missing state). The tab shows the
  ItemTabs `missing` state with the file name as label.
- Content: attention Alert "<file> is missing", body "The specification lists <file> as a <type> document,
  but the file is not in the folder. It may have been moved or deleted outside SpecFlow." and "To keep it,
  restore the file (for example with Git) and refresh.", action **Remove registration** (opens the
  confirmation, 3.6). A kept draft adds today's missing-hint line.
