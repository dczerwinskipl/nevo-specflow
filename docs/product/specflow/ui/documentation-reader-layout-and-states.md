---
id: product.specflow.ui.documentation-reader-layout-and-states
type: product
title: Documentation reader layout, rendering and failure states
status: current
scope: specflow
areas: [ui, docs]
read_when:
  - changing reader responsive layout or article rendering
  - handling unavailable documents, corpus changes or keyboard accessibility
summary: >-
  Reader two-pane composition, article rendering, loading/error states, Runtime availability and accessibility requirements.
related:
  - product.specflow.ui.documentation-reader
  - product.specflow.ui.documentation-reader-navigation
  - product.specflow.ui.documentation-reader-search
  - architecture.runtime.workspace-documentation-corpus
---

# Documentation reader layout and states

## Composition

The [Documents](documents-editor-mode.md) geometry: `AppWorkspace fit="available"`, tree pane as
Primary capped at 360 px, article as Secondary; no tabs (one read-only article; history is the
browser's). No card around the prose, no third workspace pane.

```text
Wide / Compact                                   Narrow
[Documentation          ][ Title          … x ]  [≡ Documentation        ]   [← Title  ☰  … ]
[Workspace name      ⇕  ][ Properties | text  ]  [Workspace name      ⇕ ]   [ Properties    ]
[🔍 Search documentation ][ (contents column    ]  [🔍 Search              ]   [ text          ]
[tree | results          ][  from 840 px panel) ]  [tree | results        ]   [ Related       ]
```

### Tree and search pane

- **Composition:** optional workspace picker, sticky shared search field, then tree or results ([tree recipe](../../../design-system/implementation/react/component-guidelines.md#tree-pane)).
- **Tree order:** folders before documents; folder README hub first, then document titles. Titles wrap; full path in tooltip/Properties. Current document is `aria-current` and its ancestor folders expand.
- **Labels:** mark a proposal prefix once on its folder, not on every file. Do not show Draft status in tree.
- **Search:** debounced text replaces tree with results; Escape/Clear restores tree selection. Status/count/filter precede one row per matching document, with best section and excerpt. Hide model/endpoint diagnostics; behavior is in [Search](documentation-reader-search.md#search).
- **Index:** every registered workspace supports hybrid search; new worktrees seed Project Home's index and refresh changed chunks.
- **Skipped documents:** invalid files do not hide valid ones. Show a quiet count under the picker, with each path/error in a disclosure. A skipped link is inert and explains why. When all are skipped, state that files exist but none passed validation, rather than showing an empty corpus.
- **Proposals:** excluded by default; `Include proposals (N)` reveals them with Proposal badges.

### Article and reading pane

- **Content:** shared Documents preview: Properties (path, type, status, summary, ID), `MarkdownDocument` body without frontmatter, then Related links.
- **Contents:** at panel width 840 px or more, sticky Contents/Properties column beside text. Below that, Properties precede text and a Contents sheet opens from the header.
- **Diagrams:** Mermaid fences use the shared renderer with zoom/pan/full screen and minimum 10 px readable text; one-finger pan in full screen.
- **Actions:** document title in header; menu has **Copy link** (workspace-specific URL) and **Copy path** (portable).
- **Proposals:** quiet notice identifies non-current guidance and reminds readers that search excludes proposals by default.

### Default index and initial article

- **Split view:** route without document shows `<docs.root>/README.md` as an ordinary article and marks it selected. Keep the workspace URL; opening/copying the README's own link uses its document route.
- **No index:** show only an instruction to browse/search that workspace.
- **Narrow:** begin at tree; index remains one tap away. A document URL opens the article directly.
- **Back:** split view has no Close for the article; choose another or use browser Back. Narrow uses header Back.

## States

| State                                 | Tree pane                                                     | Article area                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Loading                               | workspace row, field, skeleton rows                           | document skeleton when a document is requested                                                                  |
| Documentation not configured          | workspace picker only                                         | "No project documentation": where documents are read from (`docs.root`)                                         |
| Not served (demo data, no project)    | workspace picker only                                         | "Project documentation is not available in the demo": why, and no Try again (asking again cannot change it)     |
| No documents                          | workspace picker only                                         | "No documents yet"                                                                                              |
| Every document skipped                | workspace picker only                                         | attention Alert "Documentation files exist, but none passed validation" and the skipped files with their errors |
| Linked or remembered workspace gone   | quiet fallback line under the picker                          | normal (the project folder's documentation)                                                                     |
| Workspace unavailable (explicit pick) | workspace picker only                                         | attention Alert with the folder: choose another workspace or Try again                                          |
| Document not available                | normal (refreshed when the corpus changed)                    | "This document is no longer available in this workspace" and the document id                                    |
| Superseded document link              | normal                                                        | "This document was superseded" and Open <successor> when known                                                  |
| Some documents skipped                | the skipped line under the workspace row, then field and tree | normal                                                                                                          |
| No access (`docs.view` missing)       | whole surface                                                 | "No access to the project documentation"; ask a project administrator                                           |

On Narrow the tree-pane-only states show their message under the workspace picker. Freshness: the
reader compares the corpus revision of the tree, article and search; on a difference it refreshes all
three together without a banner, and never shows an article beside a tree of another revision
(both areas load until they agree); a document gone in the new revision shows "Document not
available". One neutral message serves every missing document (removed while reading, or an
address to an unknown id, which may exist only in another workspace): the reader does not guess
the cause (decision D-E).

### First run without documentation

When the selected workspace has no documentation root, the inline empty state MUST give an
external next action: create the configured folder (`docs/` by default) and add Markdown documents
with Nevo documentation metadata, or point `docs.root` in `.nevo/config.yaml` at an existing
documentation folder. It MUST offer **Refresh** to re-read that workspace after the files are added.
The reader stays read-only; Refresh does not create folders or documents. An existing but empty
corpus and a corpus whose files all failed validation keep their distinct states and recovery.

## Keyboard and accessibility

- Order: way back to the Session (when present), workspace picker, fallback or skipped line, search
  field, its clear button, then the tree, or while searching the proposals checkbox, its hint
  button and the results; then the article. Escape in the field (with text) clears the search,
  keeps focus in the field and returns to the tree. Enter in the field closes the software keyboard
  on a touch-primary (coarse) pointer only, never while an IME composition is being confirmed; with
  a hardware keyboard it does nothing.

### Keyboard and focus

- The tree is **one Tab stop** (roving tabindex): the open document when it is visible, otherwise the
  first row. Up/Down move between visible rows; Home/End go to the first/last; Right expands a
  collapsed folder, or on an expanded folder moves to its first child; Left collapses an expanded
  folder, or moves to the parent folder; Enter/Space open a document or toggle a folder. Folders carry
  `aria-expanded`, the open document `aria-current`. This is required for v1, not deferred.
- Search results are ordinary buttons in Tab order; while the next answer is awaited the earlier
  rows are inert (`aria-busy`). One hidden `role="status"` region announces the search (see
  [Waiting for an answer](documentation-reader-search.md#waiting-for-an-answer) and [Announcements](documentation-reader-search.md#announcements)).
- Touch targets: the proposals checkbox, its hint button and the field's clear button use the
  design system's hit area (`--target-size`: 24 px on fine pointers, 44 px on coarse); a result
  row and the status row are at least one target tall, so no hit area reaches into the field.
- Opening a section moves focus to its heading; the Contents sheet returns focus to its opener.

### Picker interaction

- The workspace picker is a button opening a listbox; Up/Down/Home/End move between options,
  Enter picks, Escape closes and returns focus to the picker (the Specification switcher's keyboard).
  Its tooltip opens on mouse hover and keyboard focus, never on focus moved there by a drawer or
  the closing popover.
- Inert references are buttons; their popover is reachable by keyboard and touch.
- State labels are text, never colour alone.

## Facts the reader needs from the Runtime

Integration readiness: **ready** — the shared workspace list (`GET /api/workspaces`) and the
[workspace documentation routes](../../../reference/api/workspace-docs.md) (tree, article, search).

- Workspaces (the shared workspace API that also serves Create Specification): id, name, kind,
  display folder, available + reason, whether it is the Runtime's checkout, bound Specification
  titles, dirty flag (the "Local changes" status; a detached checkout has none). No Git branch is
  required. The project folder is identified
  (the default and the fallback). The tab's current workspace is UI state, not a Runtime fact.
- Tree entry: document id, title, type, status (current documents only), path under `docs.root`,
  summary, proposal flag. One corpus revision for the whole tree. The skipped documents:
  path and error each.
- Article: the entry plus `related` (resolved to titles, inactive ones flagged), the body without
  frontmatter, and the sections (section id, heading path, body line) so section jumps use the
  rendered source lines. Inactive ids answer "superseded" with the successor id when known.
- Search: mode and the word-only reason (with progress for `index-building`), results with
  frontmatter, `wordMatch` and sections (id, heading path, line, plain excerpt and its
  `snippetMatches`), and the number of matching proposals left out. The UI never tokenizes the
  query itself: the marks come from `snippetMatches`, the "no word match" line from `wordMatch`.
- A bounded wait: the Runtime answers a search within its answer budget (word-only,
  `index-building`, when the embedding of missing sections would exceed it), and the reader waits
  longer than that budget for the answer ("Index freshness" in the
  [API reference](../../../reference/api/workspace-docs.md)).

## Design-system dependencies

### Markdown rendering

- `MarkdownDocument.renderImage` renders every image as inert alt text; `renderLink` decides every
  link by the reader's link policy.
- Section jumps use the existing `sourceLines` and the article's section lines; no heading ids are
  needed.
- `MarkdownDocument.diagrams` draws Mermaid fences (the Documents preview turns it on too).
- The stacked header Back below the first article is named `backToParent(<previous title>)`
  ("Back to UI interaction model"); the first screen's Back is "Back to Documentation" (the
  `navigation.backTo` family). The stacked article shows no Close beside its Back.
- The article body and the Documents preview share one content edge
  (`documentPanelPaddingClassName`); the Properties disclosure hangs its padding outside it, so its
  chevron starts where the text starts.

### Shared reading components

- The Properties row and the Contents column/sheet are the shared `shared/document-reading`
  components that the Documents preview also uses.
- The workspace picker and the Specification switcher share `shared/context-switcher`
  (`ContextSwitcherTrigger`, `ContextSwitcherOption`, `ContextSwitcherStatus` on the design
  system's `StatusIndicator`); the measured name cut and the result path's fit use
  `shared/text-measure`.
- The search field is the shared `shared/document-tree` `TreeSearchField` in `TreeSearchBar`; the
  Proposal badge is `Badge` (compact); the empty states are `TreeSearchEmpty`; the pane stack uses
  `treePane.ts`. The match mark
  style (`content-primary`, medium weight, no fill) is feature-local: it is not a design-system
  recipe until another surface needs one.
