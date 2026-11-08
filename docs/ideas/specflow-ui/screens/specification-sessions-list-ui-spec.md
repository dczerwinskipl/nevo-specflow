---
id: ideas.specflow-ui.screens.specification-sessions-list
type: product
title: Specification Sessions list UI spec
status: draft
scope: specflow
areas:
  - ui
  - ai
tags:
  - sessions
  - session-list
  - paging
  - archive
  - associations
read_when:
  - implementing or reviewing the Sessions list of a Specification (/specs/:specId/sessions)
  - changing its rows, current/archive collections, paging or refusal states
summary: >
  Screen contract of a Specification's Sessions list: rows of the Sessions associated with the
  Specification read from the paged Session list API, Current/Archive collections, explicit
  Show more paging that tolerates short and empty pages, states, gating of New session and
  refresh-on-action freshness.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.screens.specification-workspace
  - ideas.specflow-ui.screens.new-session
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-ui.session-association-ux
  - reference.api.sessions
  - product.specflow.ui.ai-session-ux
---

# Specification Sessions list UI spec

**Status.** Accepted by the owner on 2026-11-08 (Session association UX, U4) and implemented in
PR #126 (`features/sessions/list/SpecificationSessionsList.tsx`). Rationale and rejected
alternatives: [Session association UX](../session-association-ux/README.md).

## 1. Purpose and source

`/specs/:specId/sessions`, inside the Specification (Workspace mode), lists every Session associated
with the Specification. It reads `GET /api/sessions?specId=`
([Sessions API](../../../reference/api/sessions.md#session-list)). The workspace Sessions section
stays the source of the navigator preview and Continue session only; this screen never renders that
section's rows. Standalone Sessions are listed nowhere in the UI.

## 2. Header

Header action **Nowa sesja** (`sessions.list.newSession`, _New session_) opens
`/specs/:specId/sessions/new`; gated by the workspace `actions.startSession`
([New Session UI spec](new-session-ui-spec.md), scenario (h1)).

## 3. Rows

`InformationList` of `OperationalRow`; the primary text opens `/sessions/:sessionId`. Order: newest
created first (the list read's order). No provider/model, no ids.

| Slot         | Content                                                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| primary      | `title`, else `sessions.untitled` **Sesja bez nazwy** / _Untitled session_ (also used by the navigator preview and Continue session)                                                                                                                 |
| supporting   | Session status from readiness only: `requiresAttention` → **Wymaga uwagi** (attention), `busy` → **Aktywna** (info, spinner `aria-hidden`), `unavailable` → **Stan sesji nieznany** (muted), `ready` → nothing. No archived label under **Archiwum** |
| compactFacts | associated Task count `sessions.list.taskCount_*` (**1 zadanie**, **3 zadania**, **5 zadań**), accessible name `sessions.list.associatedTasks_*` (**Powiązana z {{count}} zadaniem**); then the relative `updatedAt`                                 |

## 4. Collections

A `SegmentedControl` (`sessions.list.collection` **Kolekcja sesji**) with **Bieżące** / **Archiwum**
maps to `archived=exclude` / `archived=only`. Default **Bieżące**, so archived Sessions are hidden by
default. Route state: search param `sessionCollection=current|archive` (`collection` already means
the Specification's collection).

## 5. Paging

An explicit `Button variant="secondary"` **Pokaż więcej** / _Show more_ (`sessions.list.loadMore`)
under the list; pending **Wczytywanie…** (`sessions.list.loadingMore`, `aria-disabled`, guarded
handler). A page may hold fewer items than requested, or none, while `nextCursor` is present:

- One load (the first load or one press) follows `nextCursor` until at least one new row arrives or
  the cursor ends, at most 4 requests.
- **Rows arrived:** appended below without scrolling; focus stays on the button, or moves to the
  first appended row when the list has ended (the button unmounts); polite status
  `sessions.list.loaded_*` **Wczytano {{count}} sesji**.
- **4 requests, no rows, cursor remains:** the button stays with one muted line under it,
  `sessions.list.noneInScanned` **Nie znaleziono więcej sesji w tej partii. Możesz szukać dalej.**
- **No cursor:** the button disappears. When a press ends the list without new rows, focus moves to
  the list heading so it is not lost with the button. The empty state shows only with no rows
  **and** no cursor.
- **Failed request:** loaded rows stay, one line `sessions.list.loadMoreFailed` **Nie udało się
  wczytać kolejnych sesji.**, and the button retries the same cursor.
- **Invalidation** resets the list to the first page; appended pages are dropped.

Infinite scroll is not used: the end of the list must stay reachable for keyboard users.

## 6. States

| State           | Content                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| loading         | row skeletons; header and collection control already shown                                                      |
| empty, Bieżące  | **Ta specyfikacja nie ma jeszcze sesji.** (`sessions.list.emptySpecification`) plus **Nowa sesja** when offered |
| empty, Archiwum | **Brak zarchiwizowanych sesji** (`sessions.list.emptyArchive`), no action                                       |
| failed          | **Nie udało się wczytać sesji.** (`sessions.list.failed`) plus `common.retry`                                   |
| 403             | **Nie masz dostępu do sesji tej specyfikacji.** (`sessions.list.forbiddenSpecification`)                        |
| Sessions off    | the workspace reports `sessions_disabled`: Sessions are turned off, not a failed read                           |

## 7. Freshness

Refresh-on-action: the UI invalidates this list and the workspace query on its own Session create,
rename, archive, unarchive and delete (the workspace `revision` does not cover Sessions). Rows are
not live. A refetch keeps the understood screen (no skeleton).

## 8. Acceptance

1. Archive a Session of S: it leaves **Bieżące** and appears under **Archiwum** without an archived
   label; unarchive returns it.
2. 2 000 Sessions of S visible only in sparse rows: one press makes at most 4 requests; with no rows
   it shows **Nie znaleziono więcej sesji w tej partii…** and the button; the empty state never shows
   while a cursor remains.
3. A viewer at S sees no **Nowa sesja**; a developer at S with no usable provider sees it.
