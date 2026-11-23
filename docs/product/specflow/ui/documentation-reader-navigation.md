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

Access requires project-scoped `docs.view`, checked by Runtime on every read; navigation visibility is not authorization.

- `/docs` redirects to `/workspaces/:workspaceId/docs` using the tab's current workspace. Article URL: `/workspaces/:workspaceId/docs/:documentId#sectionId`. `documentId` is the document frontmatter `id`, not a checkout-local path. No chooser screen.

### Reader entry points

- **Global:** Documentation under Specifications in primary navigation opens `/docs` without selecting a Specification.
- **Specification:** Overview shows Documentation after Tasks and Documents, with the bound workspace as subtitle.
- **Session:** Context's Documentation entry opens its workspace, with a named Back link. Inside a Specification it sits below Documents; standalone Sessions show it first in Work.
- Internal document links also open the reader.

### Current workspace

Store one workspace selection per **browser tab** (session storage, survives reload). New tabs start in Project Home.

- **Set by:** entering a Specification (bound workspace), explicit picker choice or workspace-qualified document link.
- **Retain:** leaving a Specification does not reset it; another Specification or explicit selection changes it.
- **Unavailable:** fall back to Project Home and show a quiet explanation under the picker, identifying an unregistered or temporarily unavailable workspace.
- **Display:** selection appears only in the reader's workspace picker, not the global navigation.

A Session entry selects that Session's workspace and provides a contextual Back label; the picker says `this Session's workspace`.

### Switching workspaces

Keep search text and requested `documentId`, then resolve both in the destination corpus. If absent, show a missing-document message and that workspace's root index (or no-index state). Never display content cached from the previous workspace under the new one.

### Document route

- **History:** opening a different document/section pushes a route at every width. Opening the current address does nothing. Copy link, reload, Back/Forward and resize all resolve from URL.
- **Reading position:** remember scroll per history entry in the tab, including after leaving and returning.
- **Search URL:** `?q=<text>&proposals=1`. Debounced typing and checkbox changes **replace**, not push. Result navigation pushes while preserving search on its previous history entry. Back restores query, filter, results and tree scroll; switching workspace reruns the same query.

### Browser and stack Back

- **Wide/Compact:** use browser Back; tree/results remain beside article, so no internal Back.
- **Narrow:** documents form a pushed Secondary stack over the tree. Article links push another article; Back names the previous title and restores scroll. The first article's Back returns to tree.
- **Direct link/reload/resize:** reconstruct the minimal tree + article stack. Returning to tree may replace URL instead of adding history; browser Back still reaches earlier articles.
- Keep search, expansion, selection and scroll. Close the stack on split layout, reader exit or workspace switch; reopen the addressed document in its new workspace when present.

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
