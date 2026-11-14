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
  - presenting documentation search results, proposals or blocked links
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
4. **Can I rely on it?** — a quiet note on a **proposal** (a document under a `proposals` prefix of
   `docs.yaml`: an idea or plan, not a current rule); status and type stay in Properties.
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
- **The address always names the document being read (decision D-B).** Every opened document
  (tree, result, link, Related, a successor), at every width, is a route push, so the same link
  behaves the same on Wide and Narrow, browser Back and Forward follow the history, a reload or a
  resize opens the document the address names, and Copy link copies it. Choosing the document and
  section already shown (on split layouts the root index of the workspace's own address too) opens
  nothing and adds no history entry. Back and Forward return to each article at its reading
  position, kept in memory per history entry for the browser tab, also after leaving the reader and
  coming back.
- **Back on Wide and Compact:** browser Back returns to the previous document; there is no
  in-reader Back control, because the tree and the results stay visible beside the article.
- **Back on Narrow:** the article is a pushed Secondary stack screen over the tree. Opening from
  the tree or the results starts a new stack. A link of an article changes the address and
  **pushes another article screen**; its header Back is browser Back, named for the previous
  article ("Back to <title>"), and returns to it at its reading position. The first screen's Back
  returns to the documentation: it steps back to the tree's entry when that is the previous entry,
  and otherwise (an address opened directly, a reload or a resize after a hop) replaces the address
  with the tree's, so it never adds a history entry; after a reload on a hop, browser Back from the
  documentation then reaches the previous article. Browser Back and Forward move the stack the
  same way. After a reload or a resize the stack is rebuilt minimally: the tree, then the
  address's article. Back keeps the route, the search text and results, the tree expansion, the
  selection and the pane's scroll (the Documents rule). The stack exists only while the layout is
  stacked: it closes when the workspace becomes wide enough to split, and it closes when the reader
  is left or the workspace is switched (the same document reopens in the new workspace when it
  exists). Each stacked header names its own document.

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
  open on entry. A proposals prefix is labelled once, on the folder that owns it
  ("Proposals", tree state label), not on every row. Draft status is not shown in the tree.
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
  document is inert and gives the error. When every document is skipped, the workspace is not
  shown as empty: the article area (Narrow: under the picker) says that documentation files exist
  but none passed validation, above the same disclosure of the skipped files.
- **Proposals in search:** left out by default. On the count line, one checkbox "Include proposals
  (N)" (N: the proposals the answer left out, or those it included once checked; no number while the
  answer loads) that keeps its place and focus while the answer loads, shown while proposals are
  included or some are left out. Beside it an info button ("What are proposals?", reachable by
  keyboard and touch) opens a popover: "Proposals are ideas and plans in folders marked as
  proposals; they are not current rules." With no other match the empty state says that N proposals
  match (the same checkbox includes them). Included rows carry the "Proposal" label.
- **Article** (the Documents preview): Properties row (path, type, status, summary, id), the
  Markdown body (`MarkdownDocument`, frontmatter never rendered), and **Related** (frontmatter
  `related` as links, at the end). From a 840 px panel the Properties and the **Contents** sit in the
  sticky column beside the text; narrower panels show Properties above the text and a Contents icon
  in the header that opens the Contents sheet. Header: the document title; overflow **Copy link**
  (workstation-local, it contains the workspace id) and **Copy path** (portable). A proposal starts
  with a quiet note: "This is a proposal, not a current rule. Search leaves proposals out unless
  you include them."
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

| State                                 | Tree pane                                                     | Article area                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Loading                               | workspace row, field, skeleton rows                           | document skeleton when a document is requested                                                                  |
| Documentation not configured          | workspace picker only                                         | "No project documentation": where documents are read from (`docs.root`)                                         |
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
  summary, proposal flag. One corpus revision for the whole tree. The skipped documents:
  path and error each.
- Article: the entry plus `related` (resolved to titles, inactive ones flagged), the body without
  frontmatter, and the sections (section id, heading path, body line) so section jumps use the
  rendered source lines. Inactive ids answer "superseded" with the successor id when known.
- Search: mode and the `index-building` reason with progress, results
  with frontmatter and sections (id, heading path, line, excerpt), and the number of matching
  proposals left out.

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
- **Document not available (D-E).** One state for every `404` of an article (removed while
  reading or an unknown address): "This document is no longer available in this workspace" with
  the document id. There is no "opened from the reader" heuristic.
- **One corpus on screen.** Every answer reconciles its workspace's other cached answers with its
  revision (the outdated ones are refetched), but the query cache keeps serving an outdated answer
  while it refetches. So the article renders only when its revision equals the tree's (the tree
  resolves its links); otherwise the article area shows its loading state. While the tree itself is
  being refetched because the shown article answered another revision, the tree pane shows its
  loading rows instead of the older tree. No HTTP validators (ETag, If-Match) are involved.
- **Always URL (D-B).** Every opened document is a route push whose location state says how it was
  opened (`openedFrom`: the history entry it was opened from, whether that entry named a document,
  and whether a link of an article opened it). Reading positions are kept in memory by history
  entry for the tab (the latest 200 entries), on every layout. Opening the document and section
  the address already shows (or the root index on a split layout's workspace address) does nothing. On Narrow the stack is a projection of the address
  (`useNarrowArticleStack`): an address one entry below the top pops it, an entry a link opened
  from the top is pushed (the link, or Forward), anything else opens a new stack with that article
  alone (the tree, the results, a reload, a resize from a split layout). Only the reader moves the
  stack: a stacked screen's leave guard turns the header Back into browser Back below the first
  screen and, on the first screen, into a step back to the tree's entry when that is the previous
  entry, else a replace with the tree's address.
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
- **D-A — Specification entry (decided, owner 2026-11-13).** A compact Documentation row on the
  Specification Overview after Tasks and Documents (the Overview has no workspace facts section to
  join), never above Tasks.
- **D-B — the address always names the document (decided, owner 2026-11-13).** Every navigation to
  another document, at every width, changes the address and pushes a history entry; on Narrow a
  link also pushes an article screen, whose Back is browser Back. It replaces the proposal that a
  Narrow link hop keeps the address of the stack's first article, rejected because the address
  named one article while the user read another and a reload brought back the first.
- **D-C — Session Context entry (decided, owner 2026-11-13).** A row of the Specification section
  (the first row of Work without one), not a section of its own.
- **D-D — Entry intent (decided, owner 2026-11-13).** A pick or a Session entry is the intent of one
  navigation and is consumed once read, so a reload or Back never replays an explicit pick (a
  remembered workspace that became unavailable falls back quietly instead of showing the Alert).
- **D-E — a missing document (decided, owner 2026-11-13).** One neutral message, "This document is
  no longer available in this workspace" (Polish "Ten dokument nie jest już dostępny w tym obszarze
  roboczym"), whatever the cause; the reader does not tell "removed while reading" from "not
  found".
- **Proposals (decided, owner 2026-11-13).** "Proposal" is the one name, in every surface, for a
  document under a `proposals` prefix; the search control is a checkbox with a hint that says what
  a proposal is (Polish "Propozycje", "Uwzględnij propozycje (N)"; the article note "To propozycja,
  a nie obowiązująca zasada.").

## Search results refinement (proposal, awaiting owner acceptance)

**Status: proposal (2026-11-14, revised after an independent UX review and the owner's review of
the mock), not accepted and not implemented.** Until the owner accepts it, the sections above stay
in force. It refines the search after the owner's review of the mobile search in the real app (the
project folder `repo` with local changes and the worktree `test-dogfooding-docs`). It is not a
redesign: routes, ranking, the tree and the article are unchanged. Mock: Storybook
`SpecFlow/Screens/Documentation search results (mock)`, built from live answers of this
repository's documentation, with the shipped components ("Before") beside the proposal ("After")
and a trigger board of the Specification switcher beside the workspace picker (PL and EN).

### What uncommitted changes mean for reading and search (verified)

Verified in the code and with a controlled live experiment on the dogfood project folder
(2026-11-14):

- an untracked document added under `docs/` appeared in the tree, the article and the search on the
  next request;
- an edit replaced the old word in all three;
- deleting the file removed it.

Reading (tree and article) and word search read the working tree on every request. Hybrid search
pairs each section with its vector by content hash and never ranks a stale vector:

- a search that finds up to 16 sections without a vector embeds them before it answers (the first
  search after the edit took about 16 s; later ones 0.2–1.6 s);
- a larger gap answers with word matches only (`lexical`, reason `index-building`) while a
  background refresh catches up.

So **uncommitted changes are always reflected** in reading and search. Local changes are therefore
an informational status, never a warning. The only state where search does not reflect meaning is
word-only search, reported by the search's mode and reason:

- `index-building`: the existing line "Word matches only for now: the search index is being built
  (n%)";
- `endpoint-unreachable`, seen once in the experiment when the embedding endpoint answered too
  slowly: currently silent; a quiet line is recommended as a separate change.

The UI never says the index may be out of date because files are uncommitted, and it does not use
that phrase at all: the search never serves stale vectors.

### First scan of a result

1. **Which document?** The title.
2. **Which part of it?** The section path, only when it adds something to the title.
3. **Why does it match?** A plain-text excerpt with the matched words marked.
4. **Can I rely on it?** The Proposal badge.

### Result anatomy

- **One row per document** (unchanged). The row is a button that opens the document at its best
  section.
- **Title:** primary information (`title-sm`), at most two lines.
- **Proposal badge:** a neutral compact `Badge` reading "Proposal" ("Propozycja"), on the title's
  first line at the end. It replaces the muted state label. It is text, never colour alone.
- **Section path:** secondary information (`body-sm`, muted), on one line, and **at most
  `parent › leaf`**.
  - A leading heading equal to the title (compared without case or extra spaces) is dropped first.
    Only that duplicate is dropped: a proposal titled "Provider error and limit evidence" keeps
    "Claude-family errors › Captured: seven-day rate-limit rejection".
  - The parent is shown only when it fits whole beside the leaf, never with an ellipsis. Only the
    leaf may end in an ellipsis. On "AI session UX" at 390 px the row reads "Session status
    ownership (accepted 2026-11-08)".
  - The full path is in the row's title attribute, and the open article shows the section.
  - When nothing is left after dropping the duplicate, the row has no path line.
- **Excerpt:** supporting text (`body-sm`, muted), at most two lines.
  - It is **one contiguous fragment** around the best match:
    - a run of sentences from one paragraph;
    - or one list item;
    - or one table row in readable form ("Cancellation, error, step limit… — allow termination;
      disable continuation…").
  - It never glues together unrelated cells, list items or paragraphs. With no matched word, it is
    the section's longest prose fragment.
  - Plain text: no Markdown syntax.
  - The window starts at most 40 characters before the first match, so the match is on the first
    line at 390 px.
  - A sentence end needs no ellipsis; an ellipsis marks only text cut inside a sentence.
  - **Marks:** the first occurrence of each query term, at most three marks per excerpt, in
    `content-primary` at medium weight, with no background and no accent colour. Titles and paths
    are never marked.
- **Containment:** rows are separated by a `divider` line. There is no card and no permanent radius
  or background. Hover, focus and the open document (`aria-current`, `surface-selected`) keep the
  row's interaction background.
  - No row has an icon.
  - Accent colour is used only for the focus ring and the checked checkbox.
- **Rhythm (measured at 390 px):** a row is 50–68 px without a path line and 84 px with one, against
  88 px today. Seven results are fully visible above the fold instead of six.

### Count wording

The count line counts the rows in the list: **"10 results" ("10 wyników")**, with i18n plural keys
("1 wynik", "3 wyniki", "5 wyników"). It never implies a total, which the API does not know. It is
true whether or not the limit capped the list, so the API needs no "truncated" flag for it.

- No results: no count is shown, and the live region says "No matching documents".
- While the answer loads: no count is shown, and the live region says "Searching the documentation".

### Proposals filter wording

- **Label:** "Include proposals (N)" ("Uwzględnij propozycje (N)"). The verb is required.
  - Without the number while the answer loads: "Include proposals" ("Uwzględnij propozycje"). The
    checkbox keeps its place and focus.
  - The accessible name is the label.
- **N** is how many proposals are among the top results: the proposals the answer left out while
  the checkbox is off, and the proposals among the results while it is on.
- **Hint** (the existing info button and popover):
  - EN: "Proposals are ideas and plans in folders marked as proposals; they are not current rules.
    The number says how many proposals are among the top results."
  - PL: "Propozycje to pomysły i plany z folderów oznaczonych jako propozycje, a nie obowiązujące
    zasady. Liczba mówi, ile propozycji jest wśród najlepszych wyników."
- This wording does not depend on a relevance cutoff.

### When no result contains the query's words

Hybrid search always returns its best candidates, so a query that matches nothing (`zzzqqq`) still
lists 10 documents. **Without any cutoff**, the UI tells this case apart with the match ranges:

- when no excerpt has a mark, one quiet line under the status row says "No result contains the
  words you searched for; these documents are related by meaning." ("Żaden wynik nie zawiera
  szukanych słów; to dokumenty o podobnym znaczeniu.");
- the rows stay, without marks.

**Empty states** apply when the answer has no results (word-only search, or a future cutoff):

- **No match:** "No matching documents", the hint "Try other words, or browse the tree.", and Clear
  search.
- **Only proposals match:** "Nothing in the current documentation matches. N proposals do." The
  checkbox stays on the status row, aligned to the start of the row.
- Neither empty state has a decorative icon.

### Workspace picker and Specification switcher (shared context switcher)

**One shared layout, kind-specific metadata.** Both switchers keep the shared context switcher's
geometry, but each passes only the facts of its own kind:

| Slot                               | Workspace picker                                               | Specification switcher |
| ---------------------------------- | -------------------------------------------------------------- | ---------------------- |
| Label (`body-sm`, muted)           | Workspace / Obszar roboczy                                     | Current specification  |
| Name (`title-sm`, one line)        | workspace name                                                 | Specification title    |
| Status (trailing on the name line) | local changes, or unavailable                                  | none                   |
| Detail line (one line)             | kind · bound Specification titles · "this Session's workspace" | key                    |

**Name:** one line with an ellipsis. The full name is reachable:

- in a tooltip on hover and keyboard focus;
- in full, wrapping, in the popover's options, which is the touch path;
- for a Specification, also on the Overview's page title, which wraps.

**Status** is its own slot, never a segment of the description:

- a small status dot and short text after the name, which never truncates (the name truncates
  first);
- **local changes:** an amber (`attention`) dot and "Local changes" ("Zmiany lokalne") in
  `content-secondary`. Informational only: the picker is not styled as a warning;
- **unavailable** (an explicit pick): a `danger` dot and the reason, for example "Folder
  unavailable" ("Katalog niedostępny").

**Detail line** order: kind first, then the variable-length segments (bound Specification titles,
"this Session's workspace"), so the kind never truncates.

**Heights:** 72 px with a detail line (the workspace picker, and the Specification switcher with a
key) and 56 px without one. Today the picker is 88 px for the project folder with local changes and
144 px for a 98-character worktree name.

| Workspace                      | Name line status        | Detail line (EN / PL)                                                                   |
| ------------------------------ | ----------------------- | --------------------------------------------------------------------------------------- |
| Project folder, clean          | none                    | Project folder / Katalog projektu                                                       |
| Project folder, local changes  | ● Local changes         | Project folder / Katalog projektu                                                       |
| Project folder, from a Session | ● Local changes (dirty) | Project folder · this Session's workspace / Katalog projektu · obszar roboczy tej sesji |
| Worktree                       | ● Local changes (dirty) | Worktree · bound Specification titles / Worktree · tytuły specyfikacji                  |
| Unavailable (an explicit pick) | ● Folder unavailable    | Worktree / Worktree                                                                     |

**Popover options:**

- the name wraps in full;
- the detail line wraps;
- local changes add a muted line explaining the verified behaviour: "Local changes: reading and
  search include uncommitted files" ("Zmiany lokalne: czytanie i wyszukiwanie uwzględniają
  niezatwierdzone pliki"). A tooltip does not exist on touch;
- the unavailable reason goes on its own attention line;
- the folder is in the tooltip;
- Selected with a check, as today.

On Narrow the Specification switcher sits in the drawer. Its full title stays reachable: the popover
options wrap full titles, and the Specification Overview's page title wraps.

### Mobile sticky and keyboard behaviour

**Minimum sticky set: the search field only**, with a plain `divider` line under it. The app header
is already fixed. The picker, the status row and the quiet lines scroll with the results.

Remaining space for results at 390x844 (app header 57 px; sticky field 53 px):

| Case                                             | Space for results                                              |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Keyboard closed, scrolled, field only (proposed) | 734 px                                                         |
| Keyboard closed, field and status row (rejected) | about 690 px                                                   |
| Keyboard closed, shipped (nothing sticks)        | 787 px, but the field is gone                                  |
| Keyboard open (336 px), field only (proposed)    | about 398 px at most; 344 px with the status row still in view |
| Keyboard open, field and status row (rejected)   | about 354 px                                                   |

- Focusing the field on Narrow scrolls the pane so that the field is at the top, so the picker
  leaves the view while typing. This is intended: typing needs the results, not the workspace.
- The keyboard closes without clearing the search when the user:
  - presses Enter (Search);
  - starts scrolling the results;
  - taps a result.
- Wide and Compact use the same sticky field in the tree pane.

### Touch, focus and announcements

- **Touch targets:** the checkbox, its info button and the field's clear button use the design
  system's hit area (`hitAreaClassName`, `--target-size`: 24 px on fine pointers, 44 px on coarse).
  The status row is at least one target tall (`min-h-(--target-size)`), so no target reaches into
  the field. Mock: the coarse-pointer render with the hit areas outlined.
- **Focus order:**
  1. the way back to a Session, when present;
  2. the picker;
  3. the search field;
  4. its clear button;
  5. the proposals checkbox;
  6. the hint;
  7. the results.
- **Live region:** it announces once per settled answer, debounced like the search: the count, or
  "No matching documents", or the word-only line. It never announces per keystroke or while the
  answer loads (the loading text is set once when a search starts).

### Navigation, Back and the address (recommendation awaiting the owner; owner accepted the direction)

The reader's address holds the search as `?q=<text>&proposals=1`:

- written with replace, debounced like the search, so typing adds no history entries;
- opening a result is a push that keeps `q` on the entry it leaves, so Back and Forward restore the
  list, the filter and the scroll position (kept in memory per history entry);
- a reload, Copy link or a resize keeps the search;
- `q` does not depend on the workspace: picking another workspace keeps it and searches again
  there.

### Component and ownership map

| Region           | Decision                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switcher trigger | **Change the shared `ContextSwitcherTrigger`**, used by both switchers: a one-line name with the tooltip, an optional trailing `status` (tone `attention` or `danger`, text), and `segments` (one line joined by " · ") replacing the multi-line `details`. The Specification switcher's stories are updated in the same PR.        |
| Switcher option  | `ContextSwitcherOption` unchanged: full name, detail lines.                                                                                                                                                                                                                                                                         |
| Status dot       | the existing `StatusIndicator`.                                                                                                                                                                                                                                                                                                     |
| Result row       | an **extension of the feature's `DocsSearchResults`**: the section-path rule, the excerpt with marks, the `Badge`, divider rows.                                                                                                                                                                                                    |
| Match mark style | **feature-local** (`content-primary`, medium weight). It is not a design-system recipe until another surface needs one.                                                                                                                                                                                                             |
| Sticky field     | product composition: the existing `TreeSearchField` in a sticky block with a plain bottom border (`border-divider`) on an opaque pane surface. No shadow and no stuck detection. The design system has no opaque token equal to the translucent workspace material; the implementation picks the closest surface token or adds one. |
| Empty state      | the existing `EmptyState` (inline), without an icon.                                                                                                                                                                                                                                                                                |

Approximations in the mock:

- the compact trigger is a mock-local component;
- excerpts and marks are precomputed from the shipped snippets;
- the keyboard is a grey block;
- the scroll position is set after the first layout.

### Data the UI needs

**Presentation only (no API change):**

- dropping the duplicated leading heading and the parent/leaf rule;
- the count wording;
- the Proposal badge (from the tree's proposal flags, as today);
- the trigger layout and status (the workspace list already has `dirty` and availability);
- the sticky field;
- the search in the address.

**Contract changes needed by this change** (the excerpt slice). They go in the same feature PR: one
commit for the excerpt slice, with the reference document and OpenAPI updated together. The exact
shape belongs to the [workspace documentation search](../../../reference/api/workspace-docs.md):

1. **Plain-text excerpt:** one contiguous fragment as above (a sentence run of one paragraph, one
   list item, or one table row in readable form, with header names when they are known), with no
   Markdown syntax.
2. **Match ranges:** character ranges in the plain excerpt for the first occurrence of each query
   term (at most three), using the ranking's own normalisation (prefix matches included), and empty
   for a match by meaning only. The UI does not tokenise the query itself.
3. **Window near the match:** the excerpt starts at most 40 characters before its first match. The
   280-character maximum stays.

**Separate decision (proposed, not part of this change):** a relevance cutoff (a minimum vector
similarity for hybrid results, also applied to `proposalsLeftOut`), or any ranking change, needs its
own product rationale, calibration and tests. This proposal works without it: the "no word match"
line covers the nonsense-query case. Tuning risk: a cutoff calibrated on this corpus may hide valid
matches by meaning in other corpora or models.

Integration readiness: **dependent** on items 1–3 for the marks, the excerpts and the "no word
match" line. Everything else can ship on today's API.

### Open (noted, no work in this proposal)

- **F8, real-device keyboard:** check on iOS Safari and Android Chrome at implementation, using
  `interactive-widget=resizes-content` in the viewport meta and `dvh` units, so that the sticky
  field stays above the keyboard.
- **Light theme:** the palette is dark only; the amber status dot and the marks need checking once a
  light theme exists.
- **Endpoint-unreachable line:** a quiet word-only line for the `endpoint-unreachable` reason, as a
  separate change.

Rejected while designing:

- a tinted background on matches: too loud with common words;
- marking titles;
- a breadcrumb that repeats the title;
- joining table cells and list items with " · ";
- "Proposals (N)" without a verb;
- "Top 10 documents" (implies a ranking claim the UI cannot back);
- local changes as a segment of the description line;
- a sticky status row.
