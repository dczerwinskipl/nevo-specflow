---
id: ideas.specflow-runtime.work-history-server-filter
type: engineering
title: Server-side filter and search for Session Work history
status: draft
scope: specflow
areas: [runtime, server, ui]
tags: [sessions, work-inspector, paging, search]
read_when:
  - planning filter or search over a Turn's Work history in the Runtime
  - changing Work history paging, cursors or the Work Inspector's empty states
summary: >
  Follow-up to PR #112 finding N09: move the Work Inspector's kind filter and search to the
  Runtime so a filtered page holds matches from the whole Turn and "no matches" is definitive.
  Open owner decisions on search semantics and scan cost.
related:
  - reference.api.sessions
  - ideas.specflow-ui.components.session-work-inspector
---

# Server-side filter and search for Session Work history

Status: proposed follow-up (owner, 2026-11-05). Not scheduled. PR #112 ships the client-side
bound instead (Option B): automatic loading of older Work stops after three consecutive pages
that do not grow the visible list, and the Inspector offers "Search older history" / "Load older
history"; while older history remains, an empty filtered list says "no matches in the loaded
entries", not a definitive "no matches".

## Problem

The Work Inspector filters (by Work kind) and searches only the pages already loaded. With a
filter that matches nothing loaded so far, the user cannot tell whether the Turn has a match
without loading older pages one by one, and "no matches" is only true once everything is loaded.

## Today

- Client only. `WorkFilterState {kind, search}` in the per-Turn view store; kinds `commentary`,
  `reasoning`, `tool`, `interaction`; search is a single trimmed, lower-cased substring of the
  item's title preview (at most 2048 characters), no diacritic folding, no tokenising.
- Matches keep their Commentary chapter; Commentary is shown only when it matches itself.
- Actions has no filter or search.
- Runtime: `GET …/turns/:turnId/work` accepts only `{before, limit}`; pages of at most 40 items
  within a 256 KiB budget; an HMAC-signed cursor; SQLite with `kind` and `title` only inside the
  row's JSON. The API reference forbids scanning older rows to fill a page.

## Proposal (Option A)

- Contract: optional `kind` and `q` on the Work route. The cursor signs a fingerprint of the
  normalized filter; a cursor used with another filter is `SESSION_CURSOR_INVALID`.
- Paging under a filter (A1): the Runtime scans back through the Turn until it has a page of
  matches plus one, so `hasOlder` means "at least one more match exists". This amends the
  "no scan to fill a page" rule for filtered reads only; the scan is bounded by the Turn's size.
- Chapter context: each match carries the id of its nearest earlier Commentary, so the client can
  keep grouping matches under their chapter without loading the Commentary in between.
- Kinds present in the whole Turn: the page (or the proposed `counts` projection) lists them, so
  the kind menu no longer grows as pages load.
- Store: an additive expression index on `(turn, kind, ordinal)` for the kind filter. Search is a
  scan of the Turn's rows with a registered matching function that reproduces the chosen
  semantics exactly (SQLite `LIKE` folds ASCII case only).
- UI: an unfiltered paged state plus one filtered paged state that resets on a filter change
  (never one store per keystroke); the filter in the query key; debounced search; reset to the
  newest entry on a filter change; states "searching…" and a definitive "No matches in this
  Turn". The client-side bound from PR #112 stays as a safety net.
- Docs: the API reference's Work route, paging rules and cursor fields; the Work Inspector spec's
  derived-view section.

Rough size: 15–18 files across contracts, Runtime persistence and routes, UI, i18n and docs.

## Owner decisions before implementation

1. Search semantics: the title preview only or full content (much more expensive); diacritic
   folding for Polish ("zrodlo" vs "źródło"); one substring or all tokens; minimum query length
   and debounce.
2. Whether "no matches" must be definitive for the whole Turn (requires this proposal) or the
   bounded wording from PR #112 is enough.
3. Whether the kind menu offers kinds from the whole Turn.
4. Whether a filtered read may scan the whole Turn on the single store Worker (A1), or uses a
   fixed scan budget per request (A2), which can return empty pages and keeps relying on the
   client-side bound.
