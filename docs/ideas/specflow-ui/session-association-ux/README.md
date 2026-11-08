---
id: ideas.specflow-ui.session-association-ux
type: product
title: Session association UX — Session lists, post-delete destination, Context and workspace status (D10)
status: current
scope: specflow
areas: [ui, ai]
tags: [sessions, associations, session-list, navigation, context, workspace, archive, delete]
read_when:
  - implementing the Specification Sessions list or its paging
  - changing where the UI goes after a Session is deleted, or what /sessions/new does
  - mapping the Session association read onto the Session Context Specification and Tasks sections
  - presenting Session status in the Specification workspace when it disagrees with the Engine attempt
summary: >
  Accepted UX contract (owner decisions 2026-11-08) for the D10 items of the stage 3 Session
  association design. Standalone Sessions are removed from the UI (every new Session starts from a
  Specification; /sessions/new redirects to the Specifications list; existing standalone Sessions stay
  reachable by direct link). Defines the Specification Sessions list paged from the Session list read
  with current/archive collections, post-delete destinations derived from the association, Context
  Specification/Related Tasks sections fed by the association read (never current execution), the
  workspace Sessions section, New Session gating and Session-owned status that never takes Engine
  attempt facts.
related:
  - ideas.specflow-runtime.session-association
  - ideas.specflow-ui.full-session-screen-structure
  - ideas.specflow-ui.session-actions-ux
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-ui.screens.specification-workspace
  - ideas.specflow-ui.screens.new-session
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.interaction-model
  - product.specflow.ui.data-loading-and-integration
  - reference.api.sessions
---

# Session association UX (stage 3, D10)

**Status:** accepted by the owner on 2026-11-08 (section 1) and implemented with T10 of PR #126. On
landing, the behaviour moves into its owning contracts (section 9) and this file keeps the rationale,
like the [Session actions decision record](../session-actions-ux/README.md).

**Inputs:** [stage 3 design](../../specflow-runtime/session-association/README.md) §1, §7.4–7.5 and
§11; [Full Session structure](../full-session-screen-structure.md) §7.2, §7.6, §22.1;
[Chat V10](../components/session-chat-v10-design.md) §3.1 (one owner per fact);
[navigation and route model](../navigation-and-route-model.md) §3–5, §10;
[New Session UI spec](../screens/new-session-ui-spec.md);
[AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-association-vs-current-execution);
the App Shell geometry decision record `product.specflow.ui.shell-geometry` (PR #124; open findings
"Session loses the Specification context", "same Session three times", "Sessions list shows developer
text / New conversation").

**Ground rules applied:** an association is context, never current execution (N2, I4), so copy says
"powiązana" and never "pracuje nad"; unavailable actions are omitted, not disabled
([decision record](../session-actions-ux/README.md#ground-rules-applied)); each fact has one owner; no
client cache of a "last opened Specification".

## 1. Owner decisions (2026-11-08)

| #   | Decision                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | **Standalone Sessions are removed from the UI for now.** Every new Session starts from a Specification. The API (`POST /api/sessions`, `GET /api/sessions`) stays. No standalone list, no navigator row; [navigation model §3](../navigation-and-route-model.md#3-global-entry-and-navigation) stays as accepted |
| U2  | Existing standalone Sessions stay reachable by direct link only (accepted limit)                                                                                                                                                                                                                                 |
| U3  | Delete destination follows the association; everything that is not an available Specification goes to `/`. A Session of a removed Specification is in no list (accepted limit)                                                                                                                                   |
| U4  | The Specification Sessions list reads the paged Session list read, with current/archive collections                                                                                                                                                                                                              |
| U5  | Associated Tasks fill **Powiązane zadania**; an associated Session never has scope `task` (edits stage 3 §11 and T10)                                                                                                                                                                                            |
| U6  | `actions.startSession` reason precedence and start-route refusal states                                                                                                                                                                                                                                          |

Dropped proposals: a global navigator entry and a `/sessions` list of Sessions without a
Specification (and its Focused-mode assignment); the project-level Session capability projection
(nothing in the accepted scope needs it: every remaining entry is gated by the Specification's
`actions.startSession`).

## 2. Standalone Sessions in the UI (U1, U2)

- **Removed entry:** the Specifications list header action **Utwórz sesję**
  (`SpecsOverviewHeader.tsx`, action `create-session`, key `specifications.createSession`) and every
  other UI link to `/sessions/new`.
- **`/sessions/new` opened directly** (bookmark, old link): redirects with `replace` to `/` (the
  Specifications list), no toast. The `ManagedSessionStart` wrapper goes; the shared
  `SessionStartScreen` and the managed start source stay, because the project-mode Specification New
  Session (stage 3 §11) uses them with the Specification pinned.
- **Existing standalone Session** opened by link: the Session screen works as today; Context shows no
  Specification section and no note; the navigator shows no Specification section.
- **Session not-found view** (§22.1, deleted elsewhere or unknown id): its one secondary action becomes
  `managedSession.notFound.action` = **Przejdź do specyfikacji** / _Go to specifications_ → `/`.

## 3. Specification Sessions list and the workspace Sessions section

### Specification Sessions list (`/specs/:specId/sessions`) (U4)

The screen reads `GET /api/sessions?specId=` ([Sessions API](../../../reference/api/sessions.md)),
inside the Specification (Workspace mode). The workspace Sessions section stays the source of the
navigator preview and Continue session only.

- Header action **Nowa sesja** (`sessions.list.newSession`, _New session_) replaces
  `specification.newConversation` **Nowa rozmowa**; gating in section 5.
- `specification.sessionsFutureNotice` (developer text) is removed.

**Rows:** `InformationList` of `OperationalRow` (today's `SessionsView`); the primary text opens
`/sessions/:sessionId`. Order: newest created first (the list read's order). No provider/model, no ids.

| Slot         | Content                                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| primary      | `title`, else `sessions.untitled` = **Sesja bez nazwy** / _Untitled session_ (also used by the navigator preview and Continue session; the Session header keeps its `managedSession.title` fallback)                                                                                                           |
| supporting   | Session status (section 6): `requiresAttention` → **Wymaga uwagi** (attention tone), `busy` → **Aktywna** (info, spinner icon `aria-hidden`), `unavailable` → `sessions.list.statusUnknown` **Stan sesji nieznany** / _Session state unknown_ (muted), `ready` → nothing. Under **Archiwum** no archived label |
| compactFacts | associated Task count `sessions.list.taskCount_*` (**1 zadanie**, **3 zadania**, **5 zadań** / _1 task_, _3 tasks_), accessible name `sessions.list.associatedTasks_*` (**Powiązana z {{count}} zadaniem** / **…zadaniami**; _Associated with {{count}} task(s)_); then the relative `updatedAt`               |

**Collections (D6):** the Specifications list's pattern. A `SegmentedControl`
(`sessions.list.collection` **Kolekcja sesji** / _Session collection_) with **Bieżące** / **Archiwum**
(`sessions.list.current`, `sessions.list.archive`; _Current_ / _Archive_) maps to `archived=exclude` /
`archived=only`. Default **Bieżące**, so archived Sessions are hidden by default. Route state: search
param `sessionCollection=current|archive` (`collection` already means the Specification's collection).

**Paging:** an explicit button under the list, `Button variant="secondary"` **Pokaż więcej** / _Show
more_ (`sessions.list.loadMore`), pending **Wczytywanie…** (`sessions.list.loadingMore`,
`aria-disabled`, guarded handler; the `OlderHistoryButton` pattern). A page may hold fewer items than
requested, or none, while `nextCursor` is present, so:

- One load (the first load or one press) follows `nextCursor` until at least one new row arrives or
  the cursor ends, at most 4 requests.
- **Rows arrived:** appended below without scrolling; focus stays on the button; polite status
  `sessions.list.loaded_*` **Wczytano {{count}} sesji** / _Loaded {{count}} sessions_.
- **4 requests, no rows, cursor remains:** the button stays with one muted line under it,
  `sessions.list.noneInScanned` **Nie znaleziono więcej sesji w tej partii. Możesz szukać dalej.** /
  _No more sessions in this batch. You can keep looking._
- **No cursor:** the button disappears. The empty state shows only with no rows **and** no cursor.
- **Failed request:** loaded rows stay, one line `sessions.list.loadMoreFailed` **Nie udało się
  wczytać kolejnych sesji.** / _Couldn't load more sessions._, and the button retries the same cursor.
- **Invalidation** resets the list to the first page; appended pages are dropped.

**States:**

| State           | Content                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loading         | row skeletons; header and collection control already shown                                                                                                  |
| empty, Bieżące  | **Ta specyfikacja nie ma jeszcze sesji.** / _This specification has no sessions yet._ (`sessions.list.emptySpecification`) plus **Nowa sesja** when offered |
| empty, Archiwum | **Brak zarchiwizowanych sesji** / _No archived sessions_ (`sessions.list.emptyArchive`), no action                                                          |
| failed          | **Nie udało się wczytać sesji.** / _Couldn't load sessions._ (`sessions.list.failed`) plus `common.retry`                                                   |
| 403             | **Nie masz dostępu do sesji tej specyfikacji.** / _You don't have access to this specification's sessions._ (`sessions.list.forbiddenSpecification`)        |

**Freshness:** refresh-on-action. The UI invalidates the list and the workspace query on its own
Session create, rename, archive, unarchive and delete (stage 3 §7.5: the workspace `revision` does not
cover Sessions). Rows are not live. A refetch keeps the understood screen (no skeleton).

**Rejected:** rendering the section's rows and switching to the list read beyond `hasMore` (two
sources for one list, no archive); a "show archived" switch mixing both (breaks the current/archive
model); infinite scroll (end of list unreachable for keyboard users).

### Workspace section (D12)

- The section is `list({specId, archived: 'exclude'})` in creation order, newest first, at most 100
  rows, `hasMore` when more exist (stage 3 §7.5). Only `recommendedSessionId` follows attention →
  active → most recent `updatedAt`.
- **Navigator:** on `/specs/:specId/**` and on a Session whose association is `available`, S's section
  shows with **Sesje** active on the Session; while the association loads, and for `standalone`,
  `forbidden`, `missing` or `unavailable`, no Specification section shows. Preview: the first three
  `active`/`attention` rows, attention first, as today.
- **Navigator count (interim):** **{{count}} aktywne** only when `hasMore` is false and no row has
  status `unknown`. Otherwise no count, and the existing status line under the Specification section,
  `applicationNavigation.partialActivity` **Aktywność jest częściowo dostępna**, says so
  (`features/sessions/navigation/summary.ts`, state `partial`). The "same Session in navigator,
  Requires attention and Continue session" redundancy is a separate information-model scope.
- **Continue session** is one fully clickable row (shell geometry), title or **Sesja bez nazwy**.
- **Wszystkie sesje** (navigator, Continue session) opens the Specification Sessions list.

## 4. Post-delete and post-archive destination (U3)

**Delete:** the destination follows the association read already on the Session screen when the
delete succeeds:

| Association at delete                                         | Destination (`replace`, toast **Sesja została usunięta.**, focus on the page heading) |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `specification`, Specification `available`                    | `/specs/:specId/sessions`, `collection=archive` when the Specification is archived    |
| `standalone`, `forbidden`, `missing`, `unavailable`, not read | `/` (Specifications list)                                                             |

Accepted limit: a Session whose Specification was removed (`missing`, D5) is in no list; it stays
reachable by URL and from Engine audit links. This replaces `/sessions/new` in
[§22.1](../full-session-screen-structure.md#221-session-actions-and-archived-session-owner-accepted-2026-11-08);
the alternative rejected there ("only honest destination while scope is unknown") no longer applies.

**Archive:** stay on the Session, unchanged (archived bar with **Przywróć**). Only the dialog copy
changes, because a list now exists: `managedSession.sessionActions.archiveDescription` = **Sesja
zostanie przeniesiona do archiwum sesji. Nie będzie można w niej wysyłać wiadomości; historia, praca i
zużycie pozostaną dostępne. Możesz ją w każdej chwili przywrócić.** / _The session will be moved to
the session archive. No messages can be sent in it; its history, work and usage stay available. You
can restore it at any time._

## 5. New Session from a Specification (U6)

Entry points: the Specification Sessions list header, its empty state, and Continue session's start
action. All open `/specs/:specId/sessions/new` (the New Session start form with the Specification
pinned, posting to the composed create).

**Reason precedence** (one reason, first match wins; edit of stage 3 §7.5): `sessions_disabled` →
`forbidden` → `no_provider`.

| `actions.startSession`             | Entry points                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| available                          | shown                                                                                             |
| `no_provider`                      | shown; the start form states **No executor is available right now** (New Session spec, state (e)) |
| `forbidden` or `sessions_disabled` | omitted                                                                                           |
| Specification `missing` (removed)  | omitted everywhere; the Session Context offers no start in that Specification                     |

**Start route opened directly:** while the workspace read loads or fails, the start form renders as
today. With `forbidden` it is replaced by **Nie możesz rozpoczynać sesji w tej specyfikacji.** / _You
can't start sessions in this specification._ (`sessionStart.forbiddenSpecification`), with
`sessions_disabled` by **Sesje są wyłączone w tym projekcie.** / _Sessions are turned off in this
project._ (`sessionStart.sessionsDisabled`); both offer **Wróć do specyfikacji** / _Back to
specification_ (`sessionStart.backToSpecification`). A 403 from the composed create still shows in the
form as today.

## 6. Session status when readiness and the Engine attempt disagree

Session rows, the navigator preview, Continue session and the Session header show **only
Session-derived readiness** (stage 3 §7.5 mapping). Engine attempt and require-attention facts stay on
their own subjects: the Task row's state and the Specification's Requires attention item for that
Task. Neither re-colours the Session.

| Disagreement                                         | Session shows                   | Engine fact shows on                               |
| ---------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| attempt running with this Session, readiness `ready` | no status (quiet)               | Task row: its own Engine state                     |
| attempt requires review, Session `ready`             | no status                       | Requires attention: the Task item, not the Session |
| attempt finished, Session `busy`                     | **Aktywna**                     | Task row: its finished state                       |
| readiness `unavailable`                              | **Stan sesji nieznany** (muted) | unchanged                                          |

Associated Tasks are context: rows and Context say **powiązana** / **Powiązane zadania**; no surface
writes "pracuje nad", "wykonuje" or shows a Task as current execution from the association.

**Out of scope:** the Task screen's Sessions section (`features/tasks/workspace/TaskWorkspaceSessions.tsx`)
shows Engine attempt executions, not associations, and stays as it is; no `taskId`-filtered list is
added in stage 3 (D9).

**Rejected:** promoting a Session to attention when an Engine item names it as executor (the registry
stores neither execution nor attention, I4; the need would show twice; executor identity can be
stale).

## 7. Session Context: Specification and Tasks from the association read (U5)

The association read replaces the client-side context for every Session (stage 3 §11). Sections keep
the fixed order of [§7.2](../full-session-screen-structure.md#72-proposed-structural-order).

An associated Session has scope `specification` with or without Tasks; its associated Tasks fill
**Powiązane zadania** (Related Tasks). **Aktualne wykonanie** (Current execution) is omitted, because
the association is not execution (N2) and no Engine execution fact is read in stage 3.
**Uwaga / dalsze działania** (Attention) is omitted too: its Session-owned fact (a pending
interaction) is owned by Primary, and Spec/Task attention is not part of the read.

| Association read                    | Specification section                                                                                                                                                                                                                               | Powiązane zadania                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loading                             | nothing (deviation from the §7.6 skeleton: a standalone Session would show a skeleton that then vanishes)                                                                                                                                           | nothing                                                                                                                                                                                                                                                              |
| `standalone`                        | omitted; no note                                                                                                                                                                                                                                    | omitted                                                                                                                                                                                                                                                              |
| `available`, current                | Specification row (key, title) plus Documents row                                                                                                                                                                                                   | one row per `available` Task (key or id, title); none omits the section                                                                                                                                                                                              |
| `available`, `collection: archived` | same; row supporting text `sessions.context.specification.archived` **W archiwum** / _Archived_; links carry `collection=archive`                                                                                                                   | as above                                                                                                                                                                                                                                                             |
| `forbidden`                         | info note `sessions.context.availability.specificationForbidden` **Nie masz uprawnień do wyświetlenia specyfikacji powiązanej z tą sesją.** / _You don't have permission to view the specification associated with this session._; no Documents row | omitted (the read returns no Tasks)                                                                                                                                                                                                                                  |
| `missing`                           | danger note `specificationMissingNamed` with the id; copy changed to **Nie znaleziono specyfikacji {{key}}, z którą powiązana jest ta sesja.** / _Can't find specification {{key}} associated with this session._ (`specificationMissing` likewise) | omitted (one cause, one note)                                                                                                                                                                                                                                        |
| `unavailable`                       | attention note `specificationUnreadable` **Nie udało się wczytać specyfikacji tej sesji.**                                                                                                                                                          | omitted                                                                                                                                                                                                                                                              |
| some Tasks `missing`                | per the Specification's state                                                                                                                                                                                                                       | found Tasks plus attention note `sessions.context.availability.relatedTasksMissing` **Nie znaleziono {{count}} z {{total}} powiązanych zadań.** / _{{count}} of {{total}} associated tasks can't be found._ (deviation: §7.6 has only "Couldn't load related Tasks") |
| Tasks `unavailable`                 | per the Specification's state                                                                                                                                                                                                                       | attention note `relatedTasksUnreadable` **Nie udało się wczytać powiązanych zadań.**                                                                                                                                                                                 |
| read failed (HTTP)                  | panel note `scopeUnreadable` **Nie udało się wczytać powiązań tej sesji.**                                                                                                                                                                          | omitted                                                                                                                                                                                                                                                              |

`scopeNotProvided` is no longer shown (every Runtime mode serves the read). A Session started from a
Specification is seeded from the composed create response, so first paint and reload agree.

## 8. Data, integration readiness and acceptance

| Data group                                             | Source                                                                           | Readiness               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------- |
| Specification Sessions list                            | `GET /api/sessions?specId=` ([Sessions API](../../../reference/api/sessions.md)) | integration needed (T7) |
| association for Context, navigator, delete destination | `GET /api/sessions/:sessionId/association`                                       | integration needed (T6) |
| workspace section, `startSession`                      | Specification Workspace API (T8)                                                 | integration needed      |

No new backend capability is needed.

Acceptance scenarios:

1. The Specifications list has no **Utwórz sesję**; opening `/sessions/new` lands on `/`.
2. An existing standalone Session opened by link works; Context and navigator show no Specification.
3. S's Sessions list: archive a Session, it leaves **Bieżące** and appears under **Archiwum** without an
   archived label; unarchive returns it.
4. 2 000 Sessions of S visible only in sparse rows: one press makes at most 4 requests; with no rows it
   shows **Nie znaleziono więcej sesji w tej partii…** and the button; the empty state never shows while
   a cursor remains.
5. Delete a Session of S: S's Sessions list. Delete a standalone one or one with `forbidden`: `/`. Back
   reopens none. The not-found view's **Przejdź do specyfikacji** goes to `/`.
6. Reload a Session of S whose Task was removed: Specification row, **Nie znaleziono 1 z 2 powiązanych
   zadań.**, no Current execution or Attention section.
7. A project viewer without `spec.view` at S opens a Session of S: info note, no Documents row, no
   navigator Specification section.
8. An Engine attempt runs with Session X while X is `ready`: X shows no status anywhere; the Task row
   shows its own state.
9. A viewer at S sees no **Nowa sesja**; a developer at S with no usable provider sees it and the start
   form explains; a viewer opening the start URL sees the refusal state.
10. S has 100 Sessions and `hasMore`: no navigator count, the partial-activity line shows.

## 9. Owning homes and edits on landing

- U1, U2 (`/sessions/new` redirect, no standalone entry): [navigation and route model](../navigation-and-route-model.md)
  §7 ("Starting a new Session": every UI start is from a Specification), the
  [New Session UI spec](../screens/new-session-ui-spec.md) state (h) (no UI entry; route redirects).
- U3, the not-found action and the archive copy:
  [Full Session structure](../full-session-screen-structure.md) §22.1 (Delete destination, Deleted
  elsewhere or unknown id, Archive dialog).
- U4: a Specification Sessions list screen spec under `screens/` (rows, collections, paging).
- U5 and the two Context deviations (no skeleton while the association loads; the
  `relatedTasksMissing` note): Full Session structure §7.6, the
  [Full Session UI spec](../screens/full-session-ui-spec.md), and stage 3 §11 and T10 (applied there).
- U6: stage 3 §7.5 (reason precedence) and the New Session UI spec (start-route refusal states).
- Status ownership (section 6):
  [AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-association-vs-current-execution).
- New keys go to both `pl.json` and `en.json`; this file gives both texts.

No mock: every region reuses an existing component (`SegmentedControl`, `InformationList`/
`OperationalRow`, `InlineNote`, `Button`); no design-system change.
