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
shapes and refusals. Composed stories: Storybook `SpecFlow/Screens/Documentation reader`
(`features/docs/reader/DocsReader.stories.tsx`, the search stories included) and
`SpecFlow/Shared/WorkspacePicker` (`features/docs/workspace-picker/WorkspacePicker.stories.tsx`,
with the Specification switcher side by side, EN and PL). The owner decisions and the open items
are recorded at the end.

## Purpose and ownership

The reader lets a person **find and read the project documentation as it is in one workspace**
(the main project folder or a linked worktree, see [vocabulary](../../shared/vocabulary.md#git-and-workspace-vocabulary)).
It is read-only. It does not edit, does not answer questions with AI, and is not the Specification
Documents screen: those are Specification documents, a different corpus with its own screen.

## User questions and first scan

1. **Which workspace's documentation am I reading?** — the workspace picker at the top of the
   tree pane, shown only when the project has more than one workspace (with one there is nothing to
   tell apart). It names the workspace on one line, with "Local changes" beside the name when the
   workspace has uncommitted changes, then one line with its kind and bound Specification
   ("Worktree · Single sign-on…", "Project folder · this Session's workspace").
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
  anatomy from the navigation (the shared context switcher, see
  [Workspace picker and Specification switcher](#workspace-picker-and-specification-switcher)) — a
  subtle surface with the quiet label "Workspace", the name on one line with its status, the kind ·
  bound Specification line and the chevrons; a popover listbox of every workspace from the shared
  workspace list (the same source as Create Specification's worktree choice). No search field and
  no "browse all": a project has a handful of workspaces.
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
- **The address holds the search (decided, owner 2026-11-14).** The reader's address MUST hold the
  search as `?q=<text>&proposals=1`:
  - written with replace once typing pauses (the checkbox at once), so typing adds no history
    entries;
  - opening a result is a push that keeps `q` on the entry it leaves, so Back and Forward restore
    the text, the filter, the results and the tree pane's scroll position (kept in memory per
    history entry);
  - a reload, Copy link or a resize keeps the search;
  - `q` does not depend on the workspace: picking another workspace keeps it and searches again
    there.
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

- **Tree pane:** workspace picker (more than one workspace), the sticky search field (Documents
  tree filter field, see
  [Sticky field and the software keyboard](#sticky-field-and-the-software-keyboard)), then the
  tree or the results. Folders first, then documents; a folder's hub (README) leads its documents,
  the rest by title. A document row shows its **title** (wrapping, not truncated; full path in the tooltip and in
  Properties); folders show their folder name. The opened document is `aria-current`; its ancestors
  open on entry. A proposals prefix is labelled once, on the folder that owns it
  ("Proposals", tree state label), not on every row. Draft status is not shown in the tree.
- **Search results** replace the tree while the field has text (debounced as you type; Escape or
  the clear button returns to the tree with its selection). A status row (the count and the
  proposals checkbox) and its quiet lines lead the list; each row is one document (title, at most
  `parent › leaf` of its best section, a plain excerpt with the matched words marked). Choosing a
  row opens the article at that section. Every registered workspace has hybrid search (a new
  worktree starts from a copy of the project folder's index and re-embeds only what changed). The
  search mode stays quiet: no mode, model or endpoint diagnostics. The exact rules are in
  [Search](#search).
- **Skipped documents:** a document that fails validation is skipped, never the whole workspace.
  The tree and search show the valid documents; under the workspace picker one quiet attention line
  says "1 document is skipped: it has errors" with its path and error, or "N documents are skipped"
  as a collapsed disclosure listing each path (full, wrapping) and its error. A link to a skipped
  document is inert and gives the error. When every document is skipped, the workspace is not
  shown as empty: the article area (Narrow: under the picker) says that documentation files exist
  but none passed validation, above the same disclosure of the skipped files.
- **Proposals in search:** left out by default; the status row's "Include proposals (N)" checkbox
  includes them, and included rows carry the "Proposal" badge
  ([Proposals filter](#proposals-filter)).
- **Article** (the Documents preview): Properties row (path, type, status, summary, id), the
  Markdown body (`MarkdownDocument`, frontmatter never rendered), and **Related** (frontmatter
  `related` as links, at the end). From a 840 px panel the Properties and the **Contents** sit in the
  sticky column beside the text; narrower panels show Properties above the text and a Contents icon
  at the right of the header, just before the `···` menu (as in the Documents preview), that opens
  the Contents sheet. Fenced `mermaid` blocks are drawn as diagrams, as in the Documents preview:
  fitted to the column down to 10 px text (a small one at its natural size), with zoom, pan and full
  screen; full screen keeps the same 10 px minimum and one finger pans the diagram there (see the
  design-system note "MarkdownDocument diagrams"). Header: the document title; overflow **Copy link**
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

## Search

Search finds documents of the workspace being read. The ranking is the Runtime's
([`search`](../../../reference/cli/nevo-specflow-docs.md#search)); the reader only presents it.

### What uncommitted changes mean for reading and search

Reading (tree and article) and word search read the working tree on every request: an untracked
document, an edit and a deletion under `docs.root` show in the tree, the article and the search on
the next request (verified on the dogfood project folder, 2026-11-14). Hybrid search pairs each
section with its vector by content hash and never ranks a stale vector: a small gap is embedded
before the search answers, within the [answer budget](#implementation-notes); a larger gap, or one
that does not fit the budget, answers with word matches only (`lexical`, reason `index-building`)
while a background refresh catches up.

So **uncommitted changes are always reflected** in reading and search. Local changes are an
informational status, never a warning, and the UI never says the index may be out of date because
files are uncommitted. A **detached checkout** has no `dirty` flag in the workspace list, so no
status shows for it, although reading and search still use its working tree.

### First scan of a result

1. **Which document?** The title.
2. **Which part of it?** The section path, only when it adds something to the title.
3. **Why does it match?** A plain-text excerpt with the matched words marked.
4. **Can I rely on it?** The Proposal badge.

### Result anatomy

- **One row per document.** The row is a button that opens the document at its best section; the
  open document's row is `aria-current` (`surface-selected`).
- **Title:** primary information (`title-sm`), at most two lines.
- **Proposal badge:** a neutral compact `Badge` reading "Proposal" ("Propozycja"), at the end of the
  title's first line. It is text, never colour alone.
- **Section path:** secondary information (`body-sm`, muted), on one line, and MUST be **at most
  `parent › leaf`**.
  - A leading heading equal to the title (compared without case or extra spaces) is dropped first.
    Only that duplicate is dropped: a proposal titled "Provider error and limit evidence" keeps
    "Claude-family errors › Captured: seven-day rate-limit rejection".
  - The parent is shown only when it fits whole beside the leaf (measured in the row's font), never
    with an ellipsis. Only the leaf may end in an ellipsis. Until the row is measured only the leaf
    shows.
  - The full path is in the row's title attribute, and the open article shows the section.
  - When nothing is left after dropping the duplicate, the row has no path line.
- **Excerpt:** supporting text (`body-sm`, muted), at most two lines: the answer's `snippet`, which
  the Runtime makes (exact rules: [`search` Excerpts](../../../reference/cli/nevo-specflow-docs.md#search)):
  - **one contiguous fragment** around the best match: a run of sentences from one paragraph, one
    list item, or one table row in readable form (`first cell — cell; cell`, the header row
    dropped). It MUST NOT glue together unrelated cells, list items or paragraphs. With no matched
    word it is the section's longest prose fragment;
  - **prose first:** when a prose sentence and a code sentence (mainly code spans, paths or
    identifiers, or a code line) both match, the prose sentence wins; a code fragment is used only
    when no prose sentence matches;
  - **plain text:** no Markdown syntax;
  - **window:** the excerpt starts at the matching sentence's start when that is at most 40
    characters before the first match, otherwise at "… " (an ellipsis and a space) followed by a
    whole word, at most 40 characters before it, so the match is on the first line at 390 px; never
    a glued "…Engine". A sentence end needs no trailing ellipsis; a trailing "…" marks only text
    cut inside a sentence. At most 280 characters;
  - **marks:** the answer's `snippetMatches` (the first occurrence of each query word, at most
    three), in `content-primary` at medium weight, with no background and no accent colour. Titles
    and paths are never marked. A malformed range loses its mark, never text. A result without
    `wordMatch` has no marks (the API answers no ranges for it), so the "no word match" line is
    never contradicted by a marked word: the marks' prefix rule (`taski` / `taskami`) is looser
    than the word ranking's exact words.
- **Containment:** rows are separated by a `divider` line. There is no card and no permanent
  background. Hover, focus and the open document keep the row's interaction background. No row has
  an icon. Accent colour is used only for the focus ring and the checked checkbox.

### Status row and quiet lines

The status row (at least one target tall) holds the count and the proposals checkbox; quiet lines
(`body-sm`, `content-secondary`) sit under it.

- **Count:** the rows in the list: **"10 results" ("10 wyników")**, with i18n plural keys ("1
  wynik", "3 wyniki", "5 wyników"). It never implies a total, which the API does not know, so the
  API needs no "truncated" flag. No count shows with no results or while the answer is delayed.
- **Word-only answers by reason:**

  | Reason                 | Line                                                                                                                                                                                                 |
  | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `index-building`       | "Word matches only for now: the search index is being built (n%)." ("Na razie tylko dopasowania słów: indeks wyszukiwania jest budowany (n%)."); without the percentage when the progress is unknown |
  | `endpoint-unreachable` | "Word matches only: search by meaning is unavailable." ("Tylko dopasowania słów: wyszukiwanie znaczeniowe jest niedostępne.")                                                                        |
  | `index-unavailable`    | "Word matches only: the search index is unavailable." ("Tylko dopasowania słów: indeks wyszukiwania jest niedostępny.")                                                                              |
  | `semantic-disabled`    | silent (configuration)                                                                                                                                                                               |
  | `no-endpoint`          | silent (configuration)                                                                                                                                                                               |

- **When no result contains the query's words:** hybrid search always returns its best candidates,
  so a query that matches nothing (`zzzqqq`) still lists documents. The UI tells this case apart
  with the server's `wordMatch`, not with the marks (a word can match only in a heading, which the
  excerpt drops, or only in the frontmatter, where a hit has no sections):
  - only in `hybrid` mode, and only when **no result has `wordMatch`**, one quiet line says "No word
    matches. Below are results of search by meaning." ("Nie znaleziono dopasowań słów. Poniżej
    wyniki wyszukiwania znaczeniowego."). It states only where the results come from, not that they
    are similar in meaning: their relevance is unconfirmed;
  - in word-only (`lexical`) mode every result matched words, so the line never shows;
  - the rows stay; an excerpt may have no marks while its document still matched words elsewhere.

### Proposals filter

- **Label:** "Include proposals (N)" ("Uwzględnij propozycje (N)"); the verb is required. Without
  the number while its answer loads: "Include proposals" ("Uwzględnij propozycje"). The accessible
  name is the label.
- **N** is how many proposals are among the top results: those the answer left out while the
  checkbox is off, and those among the results while it is on.
- **Shown** while proposals are included or some are left out; it keeps its place and focus while
  the answer to its own change loads (a change is ignored until then). A first search shows it only
  once its answer is there.
- **Hint:** the info button ("What are proposals?", reachable by keyboard and touch), 12 px from the
  checkbox so their hit areas do not overlap, opens a popover:
  - EN: "Proposals are ideas and plans in folders marked as proposals; they are not current rules.
    The number says how many proposals are among the top results."
  - PL: "Propozycje to pomysły i plany z folderów oznaczonych jako propozycje, a nie obowiązujące
    zasady. Liczba mówi, ile propozycji jest wśród najlepszych wyników."
- This wording does not depend on a relevance cutoff.

### Empty states

They apply when the answer has no results (word-only search, or a future cutoff):

- **No match:** "No matching documents", the hint "Try other words, or browse the tree.", and Clear
  search.
- **Only proposals match:** "Nothing in the current documentation matches. N proposals do." The
  checkbox stays on the status row. PL uses plural keys: "Pasuje 1 propozycja", "Pasują 2
  propozycje", "Pasuje 5 propozycji".
- With no match and no proposals the checkbox is hidden.
- Neither empty state has a decorative icon (the inline `EmptyState`).

### Waiting for an answer

A search can wait when hybrid search first embeds the sections that lack a vector. The Runtime
bounds that wait (the [answer budget](#implementation-notes)), and the reader's request waits
longer than the budget, so a first search after edits answers word-only instead of failing.

| Elapsed since the request | Status row and results                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–400 ms                  | Nothing changes: no spinner, no skeleton, so fast answers never flash. The previous count and rows stay.                                                                                                                                                                                                                                                              |
| 400 ms – 2 s              | The count disappears; a shown checkbox keeps its place without a number. A changed query keeps the previous rows in place, **dimmed (50%) and inert** (`aria-busy`), so the list does not jump; a first search (no rows yet) shows the skeleton rows.                                                                                                                 |
| over 2 s                  | One quiet line: "Preparing search by meaning…" ("Przygotowuję wyszukiwanie znaczeniowe…"), honest for both slow causes (the probe and the embedding). No spinner and no percentage (the request reports no progress). Not shown when the workspace's last answer was word-only by configuration (`semantic-disabled`, `no-endpoint`): nothing is being prepared then. |
| answer                    | The new count, lines and rows replace everything at once.                                                                                                                                                                                                                                                                                                             |
| failure or timeout        | "Search is unavailable right now." with Retry; the dimmed rows are removed.                                                                                                                                                                                                                                                                                           |

Typing more cancels the pending request and restarts the timeline. An earlier answer is never shown
under another workspace.

### Announcements

One `role="status"` region announces once per settled answer: the count (or "No matching
documents") **together with** the reason line and the "no word match" line, in one message. It never
announces per keystroke. While the answer loads it says nothing for the first 2 s, then once
"Preparing search by meaning" (only when that line shows); a failure is announced once.

### Sticky field and the software keyboard

**The sticky set is the search field only**, on the pane's `surface-raised` with a plain `divider`
line under it (no shadow, no stuck detection), at every width. The app header is already fixed. The
picker, the status row and the quiet lines scroll with the results. At 390x844 (app header 57 px,
sticky field 53 px) this leaves about 734 px for results with the keyboard closed, and about 398 px
with a 336 px keyboard open; a sticky status row would take about 44 px more.

- Focusing the field on Narrow scrolls the pane so that the field is at the top, so the picker
  leaves the view while typing. This is intended: typing needs the results, not the workspace.
- The software keyboard closes without clearing the search when the user:
  - presses Enter (Search), on a touch-primary pointer only and never while confirming an IME
    composition;
  - starts a touch drag outside the field's block, which scrolls the results;
  - taps a result.

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
- **local changes:** an amber (`attention`) dot and "Local changes" ("Zmiany lokalne") in
  `content-secondary`. Informational only: the picker is not styled as a warning. This amber for an
  informational state is an **owner decision** (2026-11-14) that overrides the general rule of
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

- Order: way back to the Session (when present), workspace picker, fallback or skipped line, search
  field, its clear button, then the tree, or while searching the proposals checkbox, its hint
  button and the results; then the article. Escape in the field (with text) clears the search,
  keeps focus in the field and returns to the tree. Enter in the field closes the software keyboard
  on a touch-primary (coarse) pointer only, never while an IME composition is being confirmed; with
  a hardware keyboard it does nothing.
- The tree is **one Tab stop** (roving tabindex): the open document when it is visible, otherwise the
  first row. Up/Down move between visible rows; Home/End go to the first/last; Right expands a
  collapsed folder, or on an expanded folder moves to its first child; Left collapses an expanded
  folder, or moves to the parent folder; Enter/Space open a document or toggle a folder. Folders carry
  `aria-expanded`, the open document `aria-current`. This is required for v1, not deferred.
- Search results are ordinary buttons in Tab order; while the next answer is awaited the earlier
  rows are inert (`aria-busy`). One hidden `role="status"` region announces the search (see
  [Waiting for an answer](#waiting-for-an-answer) and [Announcements](#announcements)).
- Touch targets: the proposals checkbox, its hint button and the field's clear button use the
  design system's hit area (`--target-size`: 24 px on fine pointers, 44 px on coarse); a result
  row and the status row are at least one target tall, so no hit area reaches into the field.
- Opening a section moves focus to its heading; the Contents sheet returns focus to its opener.
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

- `MarkdownDocument.renderImage` renders every image as inert alt text; `renderLink` decides every
  link by the reader's link policy.
- Section jumps use the existing `sourceLines` and the article's section lines; no heading ids are
  needed.
- `MarkdownDocument.diagrams` draws Mermaid fences (the Documents preview turns it on too).
- The stacked header Back below the first article is named `backToParent(<previous title>)`
  ("Back to UI interaction model"); the first screen's Back is "Back to documentation".
- The Properties row and the Contents column/sheet are the shared `shared/document-reading`
  components that the Documents preview also uses.
- The workspace picker and the Specification switcher share `shared/context-switcher`
  (`ContextSwitcherTrigger`, `ContextSwitcherOption`, `ContextSwitcherStatus` on the design
  system's `StatusIndicator`); the measured name cut and the result path's fit use
  `shared/text-measure`.
- The search field is the shared `shared/document-tree` `TreeSearchField`; the Proposal badge is
  `Badge` (compact); the empty states are the inline `EmptyState` without an icon. The match mark
  style (`content-primary`, medium weight, no fill) is feature-local: it is not a design-system
  recipe until another surface needs one.

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
- **Search in the address.** The reader's layout route validates `?q=&proposals=1` (a trimmed
  text of at most 500 characters, `proposals` only as `1`, anything else dropped), and every
  navigation inside the reader passes it on. The field writes its text once typing pauses, and the
  checkbox at once, as a replace that keeps the entry's identity (its reading position and stack
  screen stay); the address answering the field's own write never resets what was typed since.
  Back, Forward, a link and a reload set the field from the address. The tree pane's scroll is
  kept in memory per history entry, like reading positions. Copy link carries the search.
- **Answer budget.** The Runtime's search answers within `DOCS_SEARCH_ANSWER_BUDGET_MS` (7 s,
  `@nevo/specflow-contracts/docs`): its read-time refresh (probe and embedding) ends 4 s after the
  start so the query embedding still fits, and a refresh cut by that deadline leaves the gap to the
  background refresh and answers word-only (`index-building`). The reader's `docs.search` request
  waits `docsSearchTimeoutMs` (12 s: the budget plus 5 s for the corpus load and the transport)
  instead of the HTTP client's 10 s default. The exact rules are in "Index freshness" of the
  [API reference](../../../reference/api/workspace-docs.md).
- **Waiting timeline.** The stages (quiet under 400 ms, delayed, preparing from 2 s) run from the
  request (`useSearchWaiting`), and typing more restarts them. The last settled answer is held with
  its workspace and filter for the wait of the next one, and is never shown under another
  workspace.
- **Sticky field.** The tree pane's scroller content sets its inset as one variable
  (`--tree-pane-inset`); the sticky search block covers that inset with negative margins and
  padding, so nothing scrolled underneath shows beside it and the field sits where it would without
  the block. No new design-system token was needed.
- **Name cut.** The trigger's middle cut measures the name in its rendered font on a canvas
  (`shared/text-measure`), again on resize and once web fonts are ready; until the box has a width
  (a closed drawer) the whole name shows, clipped by CSS, and counts as not truncated.
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
- **Search results refinement (decided, owner 2026-11-14).** Accepted after an independent UX
  review and the owner's review of the mobile search in the real app; implemented as described in
  [Search](#search) and
  [Workspace picker and Specification switcher](#workspace-picker-and-specification-switcher):
  1. **Count:** "10 results" ("10 wyników"): it fits beside the checkbox at 390 px and claims no
     total.
  2. **Reason lines:** the `endpoint-unreachable` and `index-unavailable` lines ship with the
     `index-building` one.
  3. **Sticky surface:** no new token; the sticky field uses the existing `surface-raised`, and a
     design-system token is added only if the real pane shows a seam.
  4. **Search in the address:** `?q=<text>&proposals=1`
     ([Entry and navigation](#entry-and-navigation)).
  5. **Relevance cutoff:** a separate decision, outside this feature (see [Open](#open)).
  6. **Local changes in amber:** the informational `attention` tone for the "Local changes" status
     ([Workspace picker and Specification switcher](#workspace-picker-and-specification-switcher)).

  Rejected while designing:
  - a tinted background on matches: too loud with common words;
  - marking titles;
  - a breadcrumb that repeats the title;
  - joining table cells and list items with " · ";
  - "Proposals (N)" without a verb;
  - "Top 10 documents" (implies a ranking claim the UI cannot back);
  - local changes as a segment of the description line;
  - a sticky status row;
  - deciding the "no word match" line from the marks (a heading-only or frontmatter-only match has
    no marks).

## Open

- **Real-phone check (required before the search is accepted on phones):** the sticky search MUST
  be verified on a real phone (iOS Safari and Android Chrome) with the keyboard open, with
  `interactive-widget=resizes-content` in the viewport meta and `dvh` units, so that the sticky
  field stays above the keyboard. iOS Safari ignores `interactive-widget`, so only this check
  settles it.
- **Relevance cutoff (separate decision, tracked in issue #156):** a minimum vector similarity for
  hybrid results, also applied to `proposalsLeftOut`, or any ranking change, needs its own product
  rationale, calibration and tests. The search works without it: the "no word match" line covers
  the nonsense-query case. A cutoff calibrated on this corpus may hide valid matches by meaning in
  other corpora or models.
- **Light theme:** the palette is dark only; the amber status dot and the marks need checking once a
  light theme exists.
- **Configurable endpoint concurrency:** a running background index job counts as occupying the
  embedding endpoint, so searches meanwhile answer word-only; an `ai.embeddings` setting for
  endpoints that serve requests concurrently is the planned follow-up ("Index freshness" in the
  [API reference](../../../reference/api/workspace-docs.md)).
