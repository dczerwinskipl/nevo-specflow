---
id: product.specflow.ui.documentation-reader-search
type: product
title: Documentation reader search experience
status: current
scope: specflow
areas: [ui, docs]
read_when:
  - changing documentation search UI, query URL or proposal filter
  - reviewing result ranking explanations, empty states and mobile search field
summary: >-
  Workspace-scoped search query, ranking presentation, proposal filtering, no-word-match disclosure, empty and loading states and accessibility.
related:
  - product.specflow.ui.documentation-reader
  - product.specflow.ui.documentation-reader-navigation
  - product.specflow.ui.documentation-reader-layout-and-states
  - reference.cli.nevo-specflow-docs
---

# Documentation reader search

## Search

Search finds documents of the workspace being read. The ranking is the Runtime's
([`search`](../../../reference/cli/nevo-specflow-docs.md#search)); the reader only presents it.

### What uncommitted changes mean for reading and search

Reading (tree and article) and word search read the working tree on every request: an untracked
document, an edit and a deletion under `docs.root` show in the tree, the article and the search on
the next request. Hybrid search pairs each
section with its vector by content hash and never ranks a stale vector: a small gap is embedded
before the search answers, within the [answer budget](documentation-reader-navigation.md#routing-and-runtime-behavior); a larger gap, or one
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

#### Result row structure

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

#### Excerpts and matching

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

#### Row containment

- **Containment:** rows are separated by a `divider` line. There is no card and no permanent
  background. Hover, focus and the open document keep the row's interaction background. No row has
  an icon. Accent colour is used only for the focus ring and the checked checkbox.

### Status row and quiet lines

The status row (at least one target tall) holds the count and the proposals checkbox; quiet lines
(`body-sm`, `content-secondary`) sit under it.

- **Count:** the rows in the list: **"10 results" ("10 wyników")**, with i18n plural keys ("1
  wynik", "3 wyniki", "5 wyników"). It never implies a total, which the API does not know, so the
  API needs no "truncated" flag. No count shows with no results or while the answer is delayed.

#### Lexical fallback

- **Word-only answers by reason:**

  | Reason                 | Line                                                                                                                                                                                                 |
  | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `index-building`       | "Word matches only for now: the search index is being built (n%)." ("Na razie tylko dopasowania słów: indeks wyszukiwania jest budowany (n%)."); without the percentage when the progress is unknown |
  | `endpoint-unreachable` | "Word matches only: search by meaning is unavailable." ("Tylko dopasowania słów: wyszukiwanie znaczeniowe jest niedostępne.")                                                                        |
  | `index-unavailable`    | "Word matches only: the search index is unavailable." ("Tylko dopasowania słów: indeks wyszukiwania jest niedostępny.")                                                                              |
  | `semantic-disabled`    | silent (configuration)                                                                                                                                                                               |
  | `no-endpoint`          | silent (configuration)                                                                                                                                                                               |

#### Semantic-only matches

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

They apply when the answer has no results (word-only search, or a configured relevance cutoff):

- **No match:** "No matching documents", the hint "Try other words, or browse the tree.", and Clear
  search.
- **Only proposals match:** "Nothing in the current documentation matches. N proposals do." The
  checkbox stays on the status row. PL uses plural keys: "Pasuje 1 propozycja", "Pasują 2
  propozycje", "Pasuje 5 propozycji".
- With no match and no proposals the checkbox is hidden.
- Neither empty state has a decorative icon: both are the tree pane's shared empty search result
  (`TreeSearchEmpty`, the same as Documents' "No matching files"), its text on the pane's 16 px text
  column.

### Waiting for an answer

A search can wait when hybrid search first embeds the sections that lack a vector. The Runtime
bounds that wait (the [answer budget](documentation-reader-navigation.md#routing-and-runtime-behavior)), and the reader's request waits
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

- **The sticky set is the search field only** : the shared `TreeSearchBar` across the pane's full width, transparent at rest and, once docked, on the opaque docked material of the workspace with the `divider` line under it (so nothing scrolled underneath shows through), no shadow, at every width.
- The scroll position itself switches it at the dock point (a scroll-driven animation); browsers without scroll-driven animations keep the material at all times and show the divider from `useStuck` (see [Tree pane](../../../design-system/implementation/react/component-guidelines.md#tree-pane)).
- The app header is already fixed.
- The picker, the status row and the quiet lines scroll with the results.
- At 390x844 (app header 57 px, sticky bar 45 px) this leaves about 742 px for results with the keyboard closed, and about 406 px with a 336 px keyboard open; a sticky status row would take about 44 px more.

- Focusing the field on Narrow scrolls the pane so that the field is at the top, so the picker
  leaves the view while typing. This is intended: typing needs the results, not the workspace.
- The software keyboard closes without clearing the search when the user:
  - presses Enter (Search), on a touch-primary pointer only and never while confirming an IME
    composition;
  - starts a touch drag outside the field's block, which scrolls the results;
  - taps a result.
