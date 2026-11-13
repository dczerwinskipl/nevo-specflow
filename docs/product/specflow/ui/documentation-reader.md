---
id: product.specflow.ui.documentation-reader
type: product
title: Documentation reader (UI)
status: current
scope: specflow
areas: [ui, docs]
tags: [documentation, reader, workspace, worktree, search]
read_when:
  - designing or implementing the read-only reader of the project documentation in the UI
  - choosing how a workspace is chosen or switched for documentation
  - presenting documentation search results, non-authoritative documents or blocked links
summary: >
  Screen contract of the read-only reader of the project documentation (docs.root) of one
  registered workspace: entry points, current workspace and picker, tree, search results, the
  article with contents, links and images, states and recovery, Wide/Compact/Narrow, and the facts
  the reader reads from the Runtime. Implemented in features/docs (Storybook SpecFlow/Screens/Documentation reader).
related:
  - reference.api.workspace-docs
  - product.specflow.ui.interaction-model
  - product.specflow.ui.documents-editor-mode
  - product.shared.vocabulary
  - design-system.principles.layout-and-containment
  - design-system.principles.information-hierarchy
---

# Documentation reader (UI)

Implemented in `packages/specflow-ui/src/features/docs` (routes, tree pane, article, Narrow stack,
the Specification and Session entries) on the routes of
[the workspace documentation API](../../../reference/api/workspace-docs.md), which owns the exact
shapes and refusals. Composed stories: Storybook `SpecFlow/Screens/Documentation reader`. The owner
decisions are recorded at the end.

## Purpose and ownership

The reader lets a person **find and read the project documentation as it is in one workspace**
(the main project folder or a linked worktree, see [vocabulary](../../shared/vocabulary.md#git-and-workspace-vocabulary)).
It is read-only. It does not edit, does not answer questions with AI, and is not the Specification
Documents screen: those are Specification documents, a different corpus with its own screen.

## User questions and first scan

1. **Which workspace's documentation am I reading?** — the workspace picker at the top of the
   tree pane, shown only when the project has more than one workspace (with one there is nothing to
   tell apart). It names the workspace, then a wrapping line with its kind and bound Specification
   ("Worktree · Single sign-on…", "Project folder · this Session's workspace"), and "Uncommitted
   changes are included" when it is dirty.
2. **Where is the document I need?** — the tree of current documents, or search (primary).
3. **What does it say?** — the article (primary once open).
4. **Can I rely on it?** — a quiet Non-authoritative note for documents under a non-authoritative
   prefix; status and type stay in Properties.
5. **Where next?** — internal links, the contents, and Related at the end of the article.

Exceptional conditions replace the article area only (the tree pane keeps its geometry and the
workspace picker), except No access, which replaces the whole surface. Skipped documents never replace anything: they are listed quietly under the workspace picker.

## Entry and navigation

- Access is the project-scoped `docs.view` capability, checked by the Runtime on every read; the
  navigation row is not an access boundary.
- Routes: `/docs` opens the reader on the **current workspace** (below) and replaces itself with
  `/workspaces/:workspaceId/docs`; `/workspaces/:workspaceId/docs/:documentId` adds an article, with
  an optional `#sectionId` (the section ids of
  [`docs search`](../../../reference/cli/nevo-specflow-docs.md)). `documentId` is the document's
  frontmatter `id`, so the same document keeps its id in every workspace. There is no chooser page.
- **Contextual entries (always):** the Specification Overview's compact **Documentation** row (the
  workspace bound to the Specification as its second line, after Tasks and Documents, never above
  Tasks: the Overview has no workspace facts section to join), the Session Context's Documentation row,
  and internal links between documents.
- **Global entry:** a permanent **Documentation** row under Specifications in the navigation,
  opening `/docs` (decision D1). It is not a new navigation level and shows no Specification section.
- **Current workspace (tab context).** One value per browser tab, the default of the reader:
  - **set by** entering a Specification (its bound workspace), an explicit pick in the picker, and
    opening a `/workspaces/:workspaceId/docs…` link (an explicit address is an explicit choice);
  - **kept** when leaving the Specification: the usual path is Specification → Documentation, and a
    reset would make the navigation's Documentation row always open the project folder, the opposite
    of what the user was just working on. It changes only with the next Specification or pick;
  - **starts** as the project folder in a new tab;
  - **remembered** for the tab across reloads (session storage), not across tabs: two tabs may work
    in two worktrees, and a value shared between them would switch one under the other;
  - **falls back** to the project folder with a quiet line under the picker when the remembered or
    linked workspace is no longer registered ("The workspace you were reading is no longer registered,
    so this is the documentation of <project folder>") or its folder is unavailable ("<name> is
    unavailable right now, so this is the documentation of <project folder>");
  - **not shown** outside the reader (decision D3, decided): inside a Specification the navigation already
    names the Specification, whose workspace this is; elsewhere the value matters only to the
    reader, where the picker shows it.
- **Workspace picker** (tree pane, only with more than one workspace): the Specification switcher's
  anatomy from the navigation — a subtle surface with the quiet label "Workspace", the name (wrapping),
  the kind · bound Specification line and the chevrons; a popover listbox of every workspace from the
  shared workspace list (the same source as Create Specification's worktree choice): name, kind ·
  bound Specification, Selected and a check on the current one, and an unavailable workspace disabled
  with its reason. No search field and no "browse all": a project has a handful of workspaces.
- **Session entry:** a Session's Context entry opens the reader on the Session's workspace, the
  Runtime's own checkout (the project folder) where every Session runs (decision D2), and so sets the
  tab's current workspace. The tree pane starts with a way back that names the Session ("Back to
  <Session title>"), and the picker says "this Session's workspace". In the Session Context the entry
  is one row ("Documentation", "This Session's workspace") of the Specification section, under
  Documents; a Session without a Specification shows it as the first row of Work.
- **Picking another workspace** navigates to the same `documentId` and keeps the search text; both
  are looked up again in the new workspace. If the document is not there, the pane says
  "<title> is not in <workspace>" and the article area shows that workspace's root index (or the
  no-index sentence). Nothing from the previous workspace is shown under the
  new one.
- **Back on Wide and Compact:** every opened document (tree, result or link) is a route push, so
  browser Back returns to the previous document; there is no in-reader Back control, because the
  tree and the results stay visible beside the article.
- **Back on Narrow:** the article is a pushed Secondary stack screen. Opening from the tree or the
  results starts a new stack. An internal link **pushes another article screen**, so the header Back
  returns to the previous article at its reading position; only the first screen's Back returns to
  the documentation (it steps back to the tree's entry, or replaces a directly opened address with
  the tree's). A link hop does not change
  the address: the address names the first article of the stack (decision D-B). Back keeps the route, the search text and results, the tree expansion, the
  selection and the pane's scroll (the Documents rule). Rationale: on Narrow the article is the
  whole screen, so a link hop must be undoable in place, as on any phone reader; on split layouts
  the browser history already does this and a second Back would duplicate it. The stack exists only
  while the layout is stacked: it closes when the workspace becomes wide enough to split, and it
  closes when the reader is left or the workspace is switched (the same document reopens in the new
  workspace when it exists). Each stacked header names its own document.

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

- **Tree pane:** workspace picker (more than one workspace), search field (Documents tree filter field), then the tree or the
  results. Folders first, then documents; a folder's hub (README) leads its documents, the rest by
  title. A document row shows its **title** (wrapping, not truncated; full path in the tooltip and in
  Properties); folders show their folder name. The opened document is `aria-current`; its ancestors
  open on entry. A non-authoritative prefix is labelled once, on the folder that owns it
  (`Non-authoritative`, tree state label), not on every row. Draft status is not shown in the tree.
- **Search results** replace the tree while the field has text (debounced as you type; Escape or
  the clear button returns to the tree with its selection). Each row: title (two lines at most),
  the best section's heading path, and its excerpt (two lines, muted). A count line leads the list.
  Choosing a row opens the article at that section. Every registered workspace has hybrid search
  (a new worktree starts from a copy of the project folder's index and re-embeds only what changed).
  The search mode stays quiet: the only visible mode line is "Word matches only for now: the search
  index is being built (n%)" while an index is being built. No mode, model or endpoint diagnostics.
- **Skipped documents:** a document that fails validation is skipped, never the whole workspace.
  The tree and search show the valid documents; under the workspace picker one quiet attention line
  says "1 document is skipped: it has errors" with its path and error, or "N documents are skipped"
  as a collapsed disclosure listing each path (full, wrapping) and its error. A link to a skipped
  document is inert and gives the error.
- **Non-authoritative in search:** left out by default. On the count line, one switch "Include N
  non-authoritative" ("Leave out non-authoritative" once included) that keeps its place and focus
  while the answer loads; with no other match the empty state says that N non-authoritative documents
  match (the same switch shows them). Included rows carry the Non-authoritative label.
- **Article** (the Documents preview): Properties row (path, type, status, summary, id), the
  Markdown body (`MarkdownDocument`, frontmatter never rendered), and **Related** (frontmatter
  `related` as links, at the end). From a 840 px panel the Properties and the **Contents** sit in the
  sticky column beside the text; narrower panels show Properties above the text and a Contents icon
  in the header that opens the Contents sheet. Header: the document title; overflow **Copy link**
  (workstation-local, it contains the workspace id) and **Copy path** (portable). A non-authoritative
  document starts with a quiet note: proposals and drafts, not agreed documentation, left out of
  default search.
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

## Links and images

| Reference in the Markdown                          | Shown as                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Current document in this workspace (relative path) | link opening it in the reader (with its `#section`)                                         |
| `#section` in the same document                    | link scrolling to the section                                                               |
| `http(s):`, `mailto:`                              | external link, new tab, `noopener noreferrer`                                               |
| Superseded/deprecated document                     | inert text; on demand "Superseded document" and a link to the successor when known          |
| File or folder outside `docs.root`                 | inert text; on demand "Link not opened": outside the documentation, and the repository path |
| Folder inside `docs.root`, non-Markdown file       | inert text; on demand "Link not opened": a folder / not a Markdown document, and the path   |
| Skipped document                                   | inert text; on demand "Link not opened" with the document's error and path                  |
| Missing document                                   | inert text; on demand "Link not opened" with the reason and the target                      |
| Unsafe scheme (`file:`, `javascript:`, `data:`…)   | inert text; on demand "Link not opened": an unsafe link, without the target                 |
| Image (any source)                                 | inert alt text with an image glyph; on demand "Image not shown" and the source              |

Inert references are focusable text with a dotted underline that opens a small popover (keyboard
and touch), never a dead link and never a silent drop. An unsafe address is never repeated: the
Markdown renderer may already have emptied it, and showing it would only invite copying it. A
`#id` that names no section of the article (a GFM footnote, `user-content-fn-1`) scrolls to the
element with that id in the article, if there is one.

## States

| State                                 | Tree pane                                                     | Article area                                                                        |
| ------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Loading                               | workspace row, field, skeleton rows                           | document skeleton when a document is requested                                      |
| Documentation not configured          | workspace picker only                                         | "No project documentation": where documents are read from (`docs.root`)             |
| No documents                          | workspace picker only                                         | "No documents yet"                                                                  |
| Linked or remembered workspace gone   | quiet fallback line under the picker                          | normal (the project folder's documentation)                                         |
| Workspace unavailable (explicit pick) | workspace picker only                                         | attention Alert with the folder: choose another workspace or Try again              |
| Unknown document                      | normal                                                        | "Document not found" in <workspace>; may exist only in another workspace            |
| Document removed while reading        | refreshed tree                                                | "This document is no longer in the workspace"; the tree shows the current documents |
| Superseded document link              | normal                                                        | "This document was superseded" and Open <successor> when known                      |
| Some documents skipped                | the skipped line under the workspace row, then field and tree | normal                                                                              |
| No access (`docs.view` missing)       | whole surface                                                 | "No access to the project documentation"; ask a project administrator               |

On Narrow the tree-pane-only states show their message under the workspace picker. Freshness: the
reader compares the corpus revision of the tree, article and search; on a difference it refreshes all
three together without a banner; a document gone in the new revision shows "removed".

## Keyboard and accessibility

- Order: way back to the Session (when present), workspace picker, fallback or skipped line, search field, tree or
  results, article. Escape in the field clears the search and returns to the tree.
- The tree is **one Tab stop** (roving tabindex): the open document when it is visible, otherwise the
  first row. Up/Down move between visible rows; Home/End go to the first/last; Right expands a
  collapsed folder, or on an expanded folder moves to its first child; Left collapses an expanded
  folder, or moves to the parent folder; Enter/Space open a document or toggle a folder. Folders carry
  `aria-expanded`, the open document `aria-current`. This is required for v1, not deferred.
- Search results are ordinary buttons in Tab order.
- Opening a section moves focus to its heading; the Contents sheet returns focus to its opener.
- The workspace picker is a button opening a listbox; Up/Down/Home/End move between options,
  Enter picks, Escape closes and returns focus to the picker (the Specification switcher's keyboard).
- Inert references are buttons; their popover is reachable by keyboard and touch.
- State labels are text, never colour alone.

## Facts the reader needs from the Runtime

Integration readiness: **ready** — the shared workspace list (`GET /api/workspaces`) and the
[workspace documentation routes](../../../reference/api/workspace-docs.md) (tree, article, search).

- Workspaces (the shared workspace API that also serves Create Specification): id, name, kind,
  display folder, available + reason, whether it is the Runtime's checkout, bound Specification
  titles, dirty flag (informative). No Git branch is required. The project folder is identified
  (the default and the fallback). The tab's current workspace is UI state, not a Runtime fact.
- Tree entry: document id, title, type, status (current documents only), path under `docs.root`,
  summary, non-authoritative flag. One corpus revision for the whole tree. The skipped documents:
  path and error each.
- Article: the entry plus `related` (resolved to titles, inactive ones flagged), the body without
  frontmatter, and the sections (section id, heading path, body line) so section jumps use the
  rendered source lines. Inactive ids answer "superseded" with the successor id when known.
- Search: mode and the `index-building` reason with progress, results
  with frontmatter and sections (id, heading path, line, excerpt), and the number of matching
  non-authoritative documents left out.

## Design-system dependencies

- `MarkdownDocument.renderImage` renders every image as inert alt text; `renderLink` decides every
  link by the reader's link policy.
- Section jumps use the existing `sourceLines` and the article's section lines; no heading ids are
  needed.
- The stacked header Back below the first article is named `backToParent(<previous title>)`
  ("Back to UI interaction model"); the first screen's Back is "Back to documentation".
- The Properties row and the Contents column/sheet are the shared `shared/document-reading`
  components that the Documents preview also uses.

## Implementation notes

- **Entry intent (D-D).** A pick or a Session entry travels as router location state of that one
  navigation and is consumed once the tab's store holds it (the entry is replaced without it), so a
  reload or Back to the entry does not replay an explicit pick: a remembered workspace that became
  unavailable then falls back quietly instead of showing the Alert. The Session's way back stays in
  the reader's location state while documents are opened.
- **Document removed while reading (D-E)** is told from **Unknown document** by how it was opened: a
  document opened from the reader (tree, results, a link, the root index) existed when it was
  opened, so its later `404` reads "no longer in the workspace"; an address opened directly reads
  "Document not found". Later work: decide it from the corpus revisions (the document was in the
  tree of the revision before the refusal's).
- **Narrow (D-B).** The address names the first article of the stack; a link hop pushes a screen
  without changing the address, so a reload shows the first article. Widening closes the stack and
  shows the address's article. The first screen's Back steps back in history when the article was
  opened from the reader (the entry before it is the tree's), and replaces a directly opened address
  with the tree's. Rare case: after a resize from Wide, the entry before a stacked article may be the
  previous article, so that Back shows it.
- **Leaving the reader.** The reader decides nothing (no redirect, no consumed entry) once the
  location names another screen, so navigation and browser Back leave it for good.
- **Specification entry (D-A).** A compact Documentation row with the bound workspace's name, in the
  Overview's related slot (after Tasks and Documents); entering any Specification route makes its
  bound workspace the tab's current one, at every width (the sync is mounted with the shell, not
  with the navigation Drawer).
- **Session entry (D-C).** One row of the Session Context's Specification section (the first row of
  Work without a Specification); the Session's title travels with the entry and names the way back.
- **One label.** The navigation row, the Specification row and the Session Context row all read
  "Documentation"; the second line names the workspace or says "This Session's workspace".
- **Fallback.** A redirect to the project folder drops the entry's intent, so the quiet "no longer
  registered" or "unavailable" line stays.

## Owner decisions

Resolved (owner, 2026-11-11): every workspace gets hybrid search; invalid documents are skipped, not
fail-closed; access is project-scoped `docs.view`; the workspace list is the shared workspace API with
bound Specification titles; no chooser page: `/docs` opens the current workspace, normally the
project folder, and the workspace picker in the tree pane follows the Specification switcher.

- **D1 — global navigation row (decided, owner 2026-11-12).** A permanent Documentation row under
  Specifications; the contextual entries (the Specification Overview's Documentation row, Session
  Context, links between documents) stay as well. Rejected: contextual entries only, which left the reader unreachable from
  a fresh start.
- **D2 — Session entry (decided).** Opens the Session's workspace, the Runtime's own checkout, and
  sets the tab's current workspace; the picker stays available.
- **D3 — current workspace outside the reader (decided, owner 2026-11-12: not shown).** The tab
  context is the smallest version that meets the need: the reader's default follows the last entered
  Specification or explicit pick, with no app-wide state of its own, and it is shown only in the
  reader's picker. Rejected: the workspace name as trailing text on the navigation's Documentation
  row (a permanent truncated technical name, the only workspace fact in the navigation, repeating what
  the Specification section implies), and a full app-wide workspace context (no other screen reads a
  workspace that is not its Specification's).

Proposed, pending owner confirmation (coordinator, 2026-11-13, after the implementation review):

- **D-A — Specification entry.** A compact Documentation row on the Specification Overview after
  Tasks and Documents (the Overview has no workspace facts section to join), never above Tasks.
- **D-B — Narrow link hops.** A hop pushes an article screen without changing the address; the
  address names the first article of the stack.
- **D-C — Session Context entry.** A row of the Specification section (the first row of Work
  without one), not a section of its own.
- **D-D — Entry intent.** A pick or a Session entry is the intent of one navigation and is consumed
  once read, so a reload or Back never replays an explicit pick (a remembered workspace that became
  unavailable falls back quietly instead of showing the Alert).
- **D-E — Removed versus unknown document.** Decided by how the document was opened (from the
  reader or by an address); deciding it from corpus revisions is later work.
