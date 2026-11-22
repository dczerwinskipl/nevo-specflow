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

- **Tree pane:** workspace picker (more than one workspace), the sticky search field (the shared tree pane search bar and geometry of Documents, see [Tree pane](../../../design-system/implementation/react/component-guidelines.md#tree-pane) and [Sticky field and the software keyboard](documentation-reader-search.md#sticky-field-and-the-software-keyboard)), then the tree or the results.
   - Folders first, then documents; a folder's hub (README) leads its documents, the rest by title.
   - A document row shows its **title** (wrapping, not truncated; full path in the tooltip and in Properties); folders show their folder name.
   - The opened document is `aria-current`; its ancestors open on entry.
   - A proposals prefix is labelled once, on the folder that owns it ("Proposals", tree state label), not on every row.
   - Draft status is not shown in the tree.
- **Search results** replace the tree while the field has text (debounced as you type; Escape or the clear button returns to the tree with its selection).
   - A status row (the count and the proposals checkbox) and its quiet lines lead the list; each row is one document (title, at most `parent › leaf` of its best section, a plain excerpt with the matched words marked).
   - Choosing a row opens the article at that section.
   - Every registered workspace has hybrid search (a new worktree starts from a copy of the project folder's index and re-embeds only what changed).
   - The search mode stays quiet: no mode, model or endpoint diagnostics.
   - The exact rules are in [Search](documentation-reader-search.md#search).
- **Skipped documents:** a document that fails validation is skipped, never the whole workspace.
   - The tree and search show the valid documents; under the workspace picker one quiet attention line says "1 document is skipped: it has errors" with its path and error, or "N documents are skipped" as a collapsed disclosure listing each path (full, wrapping) and its error.
   - A link to a skipped document is inert and gives the error.
   - When every document is skipped, the workspace is not shown as empty: the article area (Narrow: under the picker) says that documentation files exist but none passed validation, above the same disclosure of the skipped files.
- **Proposals in search:** left out by default; the status row's "Include proposals (N)" checkbox
  includes them, and included rows carry the "Proposal" badge
  ([Proposals filter](documentation-reader-search.md#proposals-filter)).

### Article and reading pane

- **Article** (the Documents preview): Properties row (path, type, status, summary, id), the Markdown body (`MarkdownDocument`, frontmatter never rendered), and **Related** (frontmatter `related` as links, at the end).
   - From a 840 px panel the Properties and the **Contents** sit in the sticky column beside the text; narrower panels show Properties above the text and a Contents icon at the right of the header, just before the `···` menu (as in the Documents preview), that opens the Contents sheet.
   - Fenced `mermaid` blocks are drawn as diagrams, as in the Documents preview: fitted to the column down to 10 px text (a small one at its natural size), with zoom, pan and full screen; full screen keeps the same 10 px minimum and one finger pans the diagram there (see the design-system note "MarkdownDocument diagrams").
   - Header: the document title; overflow **Copy link** (workstation-local, it contains the workspace id) and **Copy path** (portable).
   - A proposal starts with a quiet note: "This is a proposal, not a current rule.
   - Search leaves proposals out unless you include them."

### Default index and initial article

- **First article (split layouts).** When the route names no document, the article area shows the
  documentation's **root index** (`<docs.root>/README.md`) as an ordinary article, and the tree marks
  it current. The route stays `/workspaces/:workspaceId/docs`: the address means "this workspace's
  documentation" and stays the same when the index file is renamed or later gains another title;
  choosing the index in the tree, a link or Copy link uses its document route as for any document.
  There is no "choose a document" state and no list of starting points to choose from.
- **No root index (split layouts).** One plain sentence in the article area: "This is the project
  documentation of <workspace>; open a document in the list or search it." Nothing else.
- **Narrow:** the tree stays the first screen; the root index is not pushed over it (it is the first
  document of the tree's root level, one tap away). A route with a document still opens that article.
- **No Close on split layouts.** The article area always holds a document (the index by default), so
  a Close would only return to the index; leaving a document is choosing another one or browser Back.
  Narrow keeps its header Back.

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
