---
id: product.specflow.ui.documentation-reader-navigation
type: product
title: Documentation reader navigation and workspace selection
status: current
scope: specflow
areas: [ui, docs]
read_when:
  - implementing reader routes, Back or workspace switcher
  - reviewing navigation from Specification or Session into Documentation
summary: >-
  Route/Back semantics, workspace and Specification picker, links and image navigation, cross-screen entry intent and history behavior.
related:
  - product.specflow.ui.documentation-reader
  - product.specflow.ui.documentation-reader-search
  - product.specflow.ui.documentation-reader-layout-and-states
  - architecture.runtime.workspace-documentation-corpus
---

# Documentation reader navigation

## Entry and navigation

- Access is the project-scoped `docs.view` capability, checked by the Runtime on every read; the
  navigation row is not an access boundary.
- Routes: `/docs` opens the reader on the **current workspace** (below) and replaces itself with
  `/workspaces/:workspaceId/docs`; `/workspaces/:workspaceId/docs/:documentId` adds an article, with
  an optional `#sectionId` (the section ids of
  [`docs search`](../../../reference/cli/nevo-specflow-docs.md)). `documentId` is the document's
  frontmatter `id`, so the same document keeps its id in every workspace. There is no chooser page.

### Reader entry points

- **Contextual entries (always):** the Specification Overview's compact **Documentation** row (the
  workspace bound to the Specification as its second line, after Tasks and Documents, never above
  Tasks: the Overview has no workspace facts section to join), the Session Context's Documentation row,
  and internal links between documents.
- **Global entry:** a permanent **Documentation** row under Specifications in the navigation,
  opening `/docs`. It is not a new navigation level and shows no Specification section.

### Current workspace

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
  - **not shown** outside the reader : inside a Specification the navigation already
    names the Specification, whose workspace this is; elsewhere the value matters only to the
    reader, where the picker shows it.
- **Workspace picker** (tree pane, only with more than one workspace): the Specification switcher's
  anatomy from the navigation (the shared context switcher, see
  [Workspace picker and Specification switcher](#workspace-picker-and-specification-switcher)) — a
  subtle surface with the quiet label "Workspace", the name on one line with its status, the kind ·
  bound Specification line and the chevrons; a popover listbox of every workspace from the shared
  workspace list (the same source as Create Specification's worktree choice). No search field and
  no "browse all": a project has a handful of workspaces.
- **Session entry:** a Session's Context entry opens the reader on the Session's workspace, the
  Runtime's own checkout (the project folder) where every Session runs, and so sets the
  tab's current workspace. The tree pane starts with a way back that names the Session ("Back to
  <Session title>"), and the picker says "this Session's workspace". In the Session Context the entry
  is one row ("Documentation", "This Session's workspace") of the Specification section, under
  Documents; a Session without a Specification shows it as the first row of Work.

### Switching workspaces

- **Picking another workspace** navigates to the same `documentId` and keeps the search text; both
  are looked up again in the new workspace. If the document is not there, the pane says
  "<title> is not in <workspace>" and the article area shows that workspace's root index (or the
  no-index sentence). Nothing from the previous workspace is shown under the
  new one.

### Document route

- **The address always names the document being read.** Every opened document (tree, result, link, Related, a successor), at every width, is a route push, so the same link behaves the same on Wide and Narrow, browser Back and Forward follow the history, a reload or a resize opens the document the address names, and Copy link copies it.
   - Choosing the document and section already shown (on split layouts the root index of the workspace's own address too) opens nothing and adds no history entry.
   - Back and Forward return to each article at its reading position, kept in memory per history entry for the browser tab, also after leaving the reader and coming back.
- **The address holds the search .** The reader's address MUST hold the
  search as `?q=<text>&proposals=1`:
  - written with replace once typing pauses (the checkbox at once), so typing adds no history
    entries;
  - opening a result is a push that keeps `q` on the entry it leaves, so Back and Forward restore
    the text, the filter, the results and the tree pane's scroll position (kept in memory per
    history entry);
  - a reload, Copy link or a resize keeps the search;
  - `q` does not depend on the workspace: picking another workspace keeps it and searches again
    there.

### Browser and stack Back

- **Back on Wide and Compact:** browser Back returns to the previous document; there is no
  in-reader Back control, because the tree and the results stay visible beside the article.
- **Back on Narrow:** the article is a pushed Secondary stack screen over the tree.
   - Opening from the tree or the results starts a new stack.
   - A link of an article changes the address and **pushes another article screen**; its header Back is browser Back, named for the previous article ("Back to <title>"), and returns to it at its reading position.
   - The first screen's Back returns to the documentation: it steps back to the tree's entry when that is the previous entry, and otherwise (an address opened directly, a reload or a resize after a hop) replaces the address with the tree's, so it never adds a history entry; after a reload on a hop, browser Back from the documentation then reaches the previous article.
   - Browser Back and Forward move the stack the same way.
   - After a reload or a resize the stack is rebuilt minimally: the tree, then the address's article.
   - Back keeps the route, the search text and results, the tree expansion, the selection and the pane's scroll (the Documents rule).
   - The stack exists only while the layout is stacked: it closes when the workspace becomes wide enough to split, and it closes when the reader is left or the workspace is switched (the same document reopens in the new workspace when it exists).
   - Each stacked header names its own document.

## Workspace picker and Specification switcher

**One shared layout, kind-specific metadata.** Both switchers use the shared context switcher's
geometry, and each passes only the facts of its own kind:

| Slot                               | Workspace picker                                               | Specification switcher |
| ---------------------------------- | -------------------------------------------------------------- | ---------------------- |
| Label (`body-sm`, muted)           | Workspace / Obszar roboczy                                     | Current specification  |
| Name (`title-sm`, one line)        | workspace name                                                 | Specification title    |
| Status (trailing on the name line) | local changes, or unavailable                                  | none                   |
| Detail line (one line)             | kind · bound Specification titles · "this Session's workspace" | key                    |

**Name:** one line.


### Name truncation

- **Identifier-like names** (no whitespace: workspace and branch names) truncate **in the middle**
  and keep their distinguishing end: the last segment after a separator (`-`, `_`, `/`, `.`), with
  the one before it when the last is shorter than 6 characters, at most 16 characters. Worktrees
  often differ only at the end (`…-review-mobile` and `…-review-desktop`, `…-docs` and `…-docs-v2`),
  and an end ellipsis would make them look the same. The cut is measured and exact, between
  grapheme clusters.
- **Prose names** (with whitespace: a Specification title) truncate at the end.

The full name is reachable:

- in a tooltip on hover and keyboard focus, **only when the name is truncated** (the workspace
  picker's tooltip also names the folder);
- in full, wrapping, in the popover's options, which is the touch path;
- for a Specification, also on the Overview's page title, which wraps.

**Status** is its own slot, never a segment of the detail line:

- a small status dot (`StatusIndicator`) and short text after the name, which never truncates (the
  name truncates first);

### Workspace status

- **local changes:** an amber (`attention`) dot and "Local changes" ("Zmiany lokalne") in
  `content-secondary`. Informational only: the picker is not styled as a warning. This amber for an
  informational state is an explicit documented exception to the general rule of
  `design-system.principles.ui-ux-guidelines` (colour carries a semantic state tone) for this
  status. Amber means only local changes here: unavailability uses `danger` everywhere;
- **unavailable** (an explicit pick): a `danger` dot and the reason, for example "Folder
  unavailable" ("Katalog niedostępny"). It wins over local changes.

**Detail line** order: kind first, then the variable-length segments (bound Specification titles,
"this Session's workspace"), so the kind never truncates.

**Heights:** 72 px with a detail line (the workspace picker, and the Specification switcher with a
key) and 56 px without one.

| Workspace                      | Name line status     | Detail line (EN / PL)                                                                   |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------- |
| Project folder, clean          | none                 | Project folder / Katalog projektu                                                       |
| Project folder, local changes  | ● Local changes      | Project folder / Katalog projektu                                                       |
| Project folder, from a Session | ● Local changes      | Project folder · this Session's workspace / Katalog projektu · obszar roboczy tej sesji |
| Worktree                       | ● Local changes      | Worktree · bound Specification titles / Worktree · tytuły specyfikacji                  |
| Unavailable (an explicit pick) | ● Folder unavailable | Worktree / Worktree                                                                     |

**Popover options:**

- the name wraps in full, and the detail line wraps ("this Session's workspace" is on the trigger
  only);
- the same status slot as the trigger, on its own line, with the **short** status only;
- what local changes mean is said **once**, as a muted footer under the list, shown when a listed
  workspace has local changes: "Local changes: reading and search include uncommitted changes, new
  files too" ("Zmiany lokalne: czytanie i wyszukiwanie uwzględniają niezatwierdzone zmiany, także
  nowe pliki"). A tooltip does not exist on touch, and repeating the sentence on every option would
  make the list long;
- unavailable shows the `danger` dot and its reason, and the option stays focusable but cannot be
  chosen;
- the folder is in the option's tooltip;
- Selected with a check.

On Narrow the Specification switcher sits in the drawer. Its full title stays reachable: the popover
options wrap full titles, and the Specification Overview's page title wraps.

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

## Routing and runtime behavior


### Navigation intent

- **Entry intent.** A pick or a Session entry travels as router location state of that one
  navigation and is consumed once the tab's store holds it (the entry is replaced without it), so a
  reload or Back to the entry does not replay an explicit pick: a remembered workspace that became
  unavailable then falls back quietly instead of showing the Alert. The Session's way back stays in
  the reader's location state while documents are opened.
- **Document not available.** One state for every `404` of an article (removed while
  reading or an unknown address): "This document is no longer available in this workspace" with
  the document id. There is no "opened from the reader" heuristic.

### Corpus consistency

- **One corpus on screen.** Every answer reconciles its workspace's other cached answers with its
  revision (the outdated ones are refetched), but the query cache keeps serving an outdated answer
  while it refetches. So the article renders only when its revision equals the tree's (the tree
  resolves its links); otherwise the article area shows its loading state. While the tree itself is
  being refetched because the shown article answered another revision, the tree pane shows its
  loading rows instead of the older tree. No HTTP validators (ETag, If-Match) are involved.
- **Always URL.** Every opened document is a route push whose location state says how it was opened (`openedFrom`: the history entry it was opened from, whether that entry named a document, and whether a link of an article opened it).
   - Reading positions are kept in memory by history entry for the tab (the latest 200 entries), on every layout.
   - Opening the document and section the address already shows (or the root index on a split layout's workspace address) does nothing.
   - On Narrow the stack is a projection of the address (`useNarrowArticleStack`): an address one entry below the top pops it, an entry a link opened from the top is pushed (the link, or Forward), anything else opens a new stack with that article alone (the tree, the results, a reload, a resize from a split layout).
   - Only the reader moves the stack: a stacked screen's leave guard turns the header Back into browser Back below the first screen and, on the first screen, into a step back to the tree's entry when that is the previous entry, else a replace with the tree's address.

### Search URL state

- **Search in the address.** The reader's layout route validates `?q=&proposals=1` (a trimmed text of at most 500 characters, `proposals` only as `1`, anything else dropped), and every navigation inside the reader passes it on.
   - The field writes its text once typing pauses, and the checkbox at once, as a replace that keeps the entry's identity (its reading position and stack screen stay); the address answering the field's own write never resets what was typed since.
   - Back, Forward, a link and a reload set the field from the address.
   - The tree pane's scroll is kept in memory per history entry, like reading positions.
   - Copy link carries the search.

### Search request budget

- **Answer budget.** The Runtime's search answers within `DOCS_SEARCH_ANSWER_BUDGET_MS` (7 s,
  `@nevo/specflow-contracts/docs`): its read-time refresh (probe and embedding) ends 4 s after the
  start so the query embedding still fits, and a refresh cut by that deadline leaves the gap to the
  background refresh and answers word-only (`index-building`). The reader's `docs.search` request
  waits `docsSearchTimeoutMs` (12 s: the budget plus 5 s for the corpus load and the transport)
  instead of the HTTP client's 10 s default. The refresh and concurrency policy is described in the
  [workspace documentation corpus](../../../architecture/runtime/workspace-documentation-corpus.md#semantic-refresh-and-concurrency-policy).

### Search waiting states

- **Waiting timeline.** The stages (quiet under 400 ms, delayed, preparing from 2 s) run from the
  request (`useSearchWaiting`), and typing more restarts them. The last settled answer is held with
  its workspace and filter for the wait of the next one, and is never shown under another
  workspace.
- **Sticky field.** The scroller content has the vertical inset only and every block its own 8 px inline inset, so the sticky bar spans the pane without negative margins.
   - The bar's sentinel sits at the top of the tree block; its view timeline drives the docked surface (Nevo UI `.workspace-docked-sticky`, transparent at rest).
   - Without scroll-driven animations the material stays on and `useStuck` observes the sentinel in the pane's scroll viewport for the divider: an observer answers after the measured frame is painted, so the material is never tied to it.
   - No new design-system token was needed.

### Truncation implementation

- **Name cut.** The trigger's middle cut measures the name in its rendered font on a canvas
  (`shared/text-measure`), again on resize and once web fonts are ready; until the box has a width
  (a closed drawer) the whole name shows, clipped by CSS, and counts as not truncated.
- **Leaving the reader.** The reader decides nothing (no redirect, no consumed entry) once the
  location names another screen, so navigation and browser Back leave it for good.
- **Specification entry.** A compact Documentation row with the bound workspace's name, in the
  Overview's related slot (after Tasks and Documents); entering any Specification route makes its
  bound workspace the tab's current one, at every width (the sync is mounted with the shell, not
  with the navigation Drawer).
- **Session entry.** One row of the Session Context's Specification section (the first row of
  Work without a Specification); the Session's title travels with the entry and names the way back.
- **One label.** The navigation row, the Specification row and the Session Context row all read
  "Documentation"; the second line names the workspace or says "This Session's workspace".
- **Fallback.** A redirect to the project folder drops the entry's intent, so the quiet "no longer
  registered" or "unavailable" line stays.
