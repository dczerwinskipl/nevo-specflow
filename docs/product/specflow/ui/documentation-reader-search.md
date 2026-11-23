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

Each document appears once as a button opening its best section. The selected document uses `aria-current` / `surface-selected`.

- **Title:** `title-sm`, up to two lines; neutral, textual Proposal badge at the end of line one.
- **Section path:** muted `body-sm`, at most `parent › leaf` on one line. Drop only a leading heading identical to the title (ignoring case/extra spaces). Show the parent only if it fits in full; only the leaf may truncate. Before measurement show leaf alone. Hide the line when no path remains; expose the complete path in the row title.

#### Excerpts and matching

- **Source:** Runtime `snippet`, one contiguous plain-text fragment from a paragraph, list item or table row, up to two `body-sm` lines. Never join unrelated fragments. For table rows omit header and render cell names readably.
- **Selection:** prefer prose over code when both match; otherwise the matching sentence, or longest section prose without word matches.
- **Window:** up to 280 characters, start at sentence boundary if within 40 characters before the match; otherwise begin `… ` at a whole word no more than 40 characters before it. Trailing ellipsis only for truncation mid-sentence.
- **Marks:** at most three `snippetMatches` (first query-word occurrences), medium `content-primary` weight without background. Never mark titles/paths. Ignore malformed ranges, not text. No `wordMatch` means no marks, even for prefix-like forms (ranking requires exact words).

#### Row containment

Use dividers, not cards/icons/permanent row backgrounds. Hover, focus and current selection use interaction backgrounds; accent only for focus and checkbox.

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
