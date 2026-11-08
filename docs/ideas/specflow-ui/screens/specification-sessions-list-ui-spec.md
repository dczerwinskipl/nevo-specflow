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
PR #126 (`features/sessions/list/SpecificationSessionsList.tsx`). The row amendment (provider
mark, model, effective status, inline facts; §3) was accepted by the owner on 2026-11-08 and is
implemented together with backend needs B1/B2 (§3.4). Rationale and rejected alternatives:
[Session association UX](../session-association-ux/README.md) and §9.

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
created first (the list read's order). No ids; the provider is shown by its mark and the model by
the agent fact. Accepted 2026-11-08 (row amendment: provider mark, model, effective status).

First scan, in order: which Session it is (title); whether it needs me or can run (status, only when
not quiet); when I last touched it (age); which agent I used (mark and model, a quiet recognition
aid); whether it is tied to Tasks (count, only when greater than zero). Mode, effort and cost are not
shown: cost is per-Session telemetry no row fetches; mode and effort stay in the Session's Context.

| Slot         | Content                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| leading      | `SessionProviderIcon` 16 px (Codex, Claude, Antigravity; any other `providerId` gets the existing `chat` glyph). Decorative (`aria-hidden`); every row has a mark, so the track is never empty                                                                                                              |
| primary      | `title`, else `sessions.untitled` **Sesja bez nazwy** / _Untitled session_ (also used by the navigator preview and Continue session)                                                                                                                                                                        |
| compactFacts | in this order, each omitted when absent: relative `updatedAt`; agent fact (3.1); associated Task count `sessions.list.taskCount_*` (**1 zadanie**, **3 zadania**, **5 zadań**), accessible name `sessions.list.associatedTasks_*` (**Powiązana z {{count}} zadaniem**), only when the association has Tasks |
| supporting   | Session status (3.3). No archived label under **Archiwum**                                                                                                                                                                                                                                                  |

### 3.1 Agent fact and leading mark

**Agent fact.** Visible text: `modelTitle`, else the raw `modelId`, else `providerTitle`, else
`providerId`. Accessible text `sessions.list.agent` **{{provider}}, model {{model}}**
(_{{provider}}, model {{model}}_), using `providerTitle` else `providerId`; the provider alone when
there is no model, so the provider shown only by the decorative mark reaches assistive technology.
Titles are shown as the provider names them; the list does not rename models.

**Leading mark.** Vertically centred on the whole row content (title, facts line and, at Narrow,
the status line) at every row height: a wrapped title or facts line keeps the mark on the row's
centre, with no line cap (rows run 2 lines at Wide and 2–4 lines at 390). The leading box is the
mark's line height (20 px) and centres itself in the row, instead of the default control-height box
anchored at the row top. `InformationList.Leading` sits above the stretched primary link (`z-10`);
in this non-selectable list the leading slot is `pointer-events-none`, so a click on the mark opens
the Session like the rest of the row.

### 3.2 Inline facts

Facts flow as one line separated by `·` at every width. Age leads, so the age starts at the same
place on every row whether or not it has Tasks; the agent and the task count are recognition aids,
not compared down the column; an absent fact takes no space.

| Width              | Row                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440, row ≥ 40 rem | title on one line (ellipsis); line 2 `5 minut temu · Opus 4.1 · 3 zadania · ⚠ Wymaga uwagi`, the status the last inline item after a separator; mark centred on both lines |
| 390, row < 40 rem  | title wrapping; facts `5 minut temu · Opus 4.1 · 3 zadania` wrapping; status on its own line; mark centred on all lines                                                    |

A wrapped line breaks between items, never inside the age or the task count, and no line starts
with a separator (each item carries its leading `·`; the one opening a line is clipped). The status
shares the facts' line box (icon and text centred on it), so it never sits above the facts.

**Component decision.** `OperationalRow` (product-shared, `shared/operational-list`) gains an
explicit prop, for example `factsLayout="inline"`, never inferred from the fact count. In inline
mode it accepts up to three facts, places the status as above, honours a per-fact `maxWidth` with
ellipsis (the agent fact: 16 rem, full name kept in its accessible text; age and task count never
truncate) and centres the leading mark on the row. The default tracked layout is unchanged for other
lists. The row centring is a Nevo UI prop, `InformationList.Leading align="row-center"` (a 20 px
box centred on the whole row; default `top`), with its own Nevo UI contract story and test; the rest
is a product-owned extension of `OperationalRow`.

### 3.3 Status: effective Session readiness only

`readiness` (effective, B2 in 3.4) alone decides presence, text and tone. The Runtime derives the
stored readiness from the active Turn (`waitingForUser` gives `requiresAttention`, `unknown` gives
`unavailable`, `active`, `waiting` and `cancelling` give `busy`, `terminal` gives `ready`), so
`activeTurn.state` adds no row state and is not read. Engine attempt facts never colour a row.

| `readiness`              | Status (pl / en)                                                                                                                                               | Tone and icon               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `ready`                  | none                                                                                                                                                           | none                        |
| `busy`                   | **Aktywna** / _Active_ (`sessions.list.statusActive`)                                                                                                          | info, spinner `aria-hidden` |
| `requiresAttention`      | **Wymaga uwagi** / _Requires attention_ (`sessions.list.statusAttention`)                                                                                      | attention, `triangle-alert` |
| `authenticationRequired` | **{{provider}}: wymagane ponowne logowanie** / _{{provider}}: sign-in required_ (`sessions.list.statusAuthentication`, new; `providerTitle` else `providerId`) | muted, no icon              |
| `unavailable`            | **Stan sesji nieznany** / _Session state unknown_ (`sessions.list.statusUnknown`)                                                                              | muted, no icon              |

`authenticationRequired` is muted: it is a provider-wide condition that repeats on every Session of
that provider and is resolved in the provider's CLI, not in the Session; attention tone would flood
the list. The copy names the provider because the sign-in belongs to it; the bare
`managedSession.authenticationRequired` (**Wymagane ponowne logowanie**) on a row would read as the
Session needing a login. Status is always text; colour and icon only repeat it. Owning status
contract:
[AI Session UX, Session status ownership](../../../product/specflow/ui/ai-session-ux.md#session-status-ownership-accepted-2026-11-08).

### 3.4 Backend needs (Runtime)

Both extend existing reads; no new endpoint and no UI-side join. Integration status: implemented
(the workspace rows also carry `modelId` and `updatedAt`, for Continue session's agent fact and
age). The exact schemas belong to the [Sessions API](../../../reference/api/sessions.md) and
the [Specification Workspace API](../../../reference/api/specification-workspace.md#project-sessions-section).

| Need                   | Required result                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 display titles      | `SessionListItem` gains optional `providerTitle` and `modelTitle`, resolved by the Runtime from its provider catalogue at read time (absent when the provider or model is no longer listed). The workspace Sessions section rows gain the same two fields plus `providerId`, for Continue session              |
| B2 effective readiness | The list read and the workspace Sessions section apply the same provider projection as the single-Session read, so `readiness` on a row is effective (`authenticationRequired` or `unavailable` when the provider is not available and no Turn is active). The workspace status projection maps it accordingly |

Evidence: the list read returns the stored readiness, which the worker sets only to `ready`, `busy`,
`requiresAttention` or `unavailable`; only the single-Session read applies the provider projection.
`GET /api/session-providers` requires the Create capability, so a viewer cannot name the agent from
it.

### 3.5 Consistency with the other Session rows

- **Continue session** uses the same row: age-first inline facts (age, then Tasks, replacing the
  previous Tasks-then-age order) in the same change as the list, without waiting for the backend;
  the mark and the agent fact once the workspace Sessions section carries B1's fields; the
  effective status with B2.
- **Navigator preview** is unchanged: its leading column is the active/attention marker and it lists
  only active and attention Sessions, so it gains neither mark nor model, and a muted
  `authenticationRequired` Session does not enter it.
- **Task Sessions section** lists Engine attempt executions, a different subject; unchanged.

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

4. A Claude Session whose `modelTitle` is **Opus 4.1**, at 1440: Claude mark centred on the row,
   line 2 **5 minut temu · Opus 4.1**; assistive technology reads the title, then **Claude, model
   Opus 4.1**.
5. Mixed list, one row with 3 Tasks and one without: both ages start under the title start; no gap.
6. A viewer (no Create capability) sees provider marks and model titles; the UI makes no
   `GET /api/session-providers` request for rows.
7. A provider no longer listed: `chat` glyph when the icon set lacks it, the raw `modelId` (else the
   `providerId`) as the agent fact.
8. Claude needs a sign-in, no Turn active: every Claude row shows **Claude: wymagane ponowne
   logowanie** (muted), the same as the Session screen; never quiet, never **Stan sesji nieznany**.
9. 390 px: title and facts wrap, status on its own line, the mark centred on the whole row, no
   horizontal overflow. A click on the mark opens the Session.
10. Continue session shows the same fact order and layout as its row in the list.

## 9. Rejected alternatives (row amendment, 2026-11-08)

- **Collection-owned fact columns** (age | model | Tasks | status tracks): better vertical comparison
  of models, but models are not compared down the list, rows without Tasks keep an empty track, and
  it needs collection-level geometry in `OperationalRow`.
- **Mark aligned to the title's first line**: the owner chose centring on the whole row.
- **UI-side join with `GET /api/session-providers`** for titles: viewers get 403 and would see raw
  ids.
- **Dropping `authenticationRequired` from rows** instead of B2: rows would stay quiet while the
  Session screen shows the sign-in problem.
- **Wymaga odpowiedzi** for `waitingForUser` and **Zatrzymywanie…** for `cancelling`: they would
  split the vocabulary the navigator preview and Continue session share; `cancelling` is transient.
