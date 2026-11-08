---
id: ideas.specflow-ui.session-actions-ux
type: product
title: Session telemetry refresh, unknown-Turn reconcile and Session actions — UX contract
status: current
scope: specflow
areas: [ui, ai, runtime]
tags: [sessions, telemetry, reconcile, recovery, rename, archive, delete, session-actions]
read_when:
  - implementing the telemetry refresh control in Session details (plan T2)
  - implementing reconcile of a Turn whose outcome is unknown (plan T4)
  - implementing Rename, Archive, Unarchive or Delete in the Session header (plan T11)
summary: >
  UX contract for plan decisions D1, D2 and D10 of the Managed Session UI integration:
  where the provider-limits refresh appears and how its queued/running/429 states read; how a
  user with Manage settles an unknown Turn from Primary; and the archived read-only Session,
  Unarchive, Delete confirmation and post-delete navigation. Accepted by the owner on 2026-11-08; Rename stays allowed on an archived Session.
related:
  - ideas.specflow-runtime.session-ui-integration.plan
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.full-session-screen-structure
  - ideas.specflow-ui.components.session-composer-design
  - product.specflow.ui.documents-archetypes
  - reference.api.session-telemetry
  - reference.api.sessions
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.layout-and-containment
---

# Session refresh, reconcile and Session actions — UX contract

**Status: accepted by the owner on 2026-11-08** (plan, "Owner decisions", D1/D2/D10), with every
**Recommended** option; Rename stays allowed on an archived Session. The **Alternative** options are
kept only as rationale. With the implementation, move the accepted behaviour into the
owning contracts (`full-session-screen-structure.md` §7.2/§17/§23, `session-chat-v10-design.md`)
and keep this file only as rationale. Revised after independent review (accept with changes).

Ground rules reused from accepted contracts, not restated per item:

- Workspace V2 / Chat V10: Primary owns anything the user must act on now; Context does not
  duplicate Primary controls (structure §7.2); one owner per fact (Chat V10 §3.1).
- Unavailable choices are **omitted**, not shown disabled, when the user cannot act on them. This
  follows the precedent of Composer decision 4 (`session-composer-design.md`, about provider
  modes), applied here by analogy, not as its contract. A read-only reason is **one quiet line on
  open**, not a disabled control with a hover tooltip (Documents D7, `documents-archetypes-ui.md`).
- Pending command: the pressed control shows its `…ing` label and is `aria-disabled` (keeps focus)
  with a guarded handler that ignores presses; nevo-ui `Button` has no `busy` prop. No optimistic
  success (Documents D8, `DocumentOperationDialogs`, `SessionRecoveryNotice`).
- Async notes: `InlineNote` has no live region, so the implementation wraps it. Info and attention
  notes use `role="status"`; only danger and unconfirmed-request notes (and dialog refusals in
  `Alert`) use `role="alert"`.
- Retrying after an unconfirmed request reuses the same `requestId` (existing
  `managedSession.commandFailed` rule); a body-less command (Delete) is simply repeated. Live state
  comes from SSE, never from local patching.
- Copy: Polish product UI, keys added to both `pl.json` and `en.json`. Keys below are proposals.

No Storybook mock is produced for this proposal: every region reuses an existing component in an
existing slot, except the deleted-Session view (§3.6), which reuses the not-found layout. T2/T4/T11
stories (already required by the plan) are the rendered validation.

## 1. Telemetry refresh control (D1)

User question served: "Are these limit numbers current, and can I get a current reading before I
start expensive work?" Only account `limits` are admitted by the Runtime scheduler (telemetry API,
"Explicit refresh"); usage, cost and context arrive with Turns and have no refresh.

### 1.1 Placement and visibility — Recommended

- One **`Button variant="ghost" size="sm" leadingIcon="refresh"`**, trailing in the heading row of
  the **"Limity dostawcy"** section of `SessionTelemetrySection` (same `flex items-baseline` row
  pattern the usage heading already uses). Visible label `Odśwież`; accessible name
  `Odśwież limity dostawcy` (the visible label relies on the section heading).
- Rendered **only when** `limits.refreshable === true` **and** `session.capabilities.manage`.
  Otherwise omitted (no disabled button). No refresh anywhere else, no global/section-wide
  Refresh (the API forbids a generic Refresh while live).
- `limits` `unavailable` with reason `NOT_AUTHORIZED`: the limits section renders nothing — no
  heading, no zero, no "unknown", no control — even if other readings exist.
- Whenever the control is shown, the section renders its heading even without rows. This covers
  `unavailable` with any reason other than `NOT_AUTHORIZED` (e.g. Codex before its first account
  read) **and** `available`/`partial` with zero windows. Today `formatLimitWindows` returns nothing
  for both, which would also remove the control; T2 must keep the section for them. The body is one
  note (§1.2). This is the one case where a section shows without values, because the user can act
  on it (structure §7.6: a known subject whose data is missing is said out loud).
  `isTelemetryVisible` must count it as visible.
- Archived Session: unchanged (refresh is read-only, plan D6).

Alternative: a text `Link`-style action under the last limit row ("Odśwież limity"). Rejected as
default because it moves with the number of windows and is easy to miss below a long section.

### 1.2 States

| State (source)                                                                          | Control                                                                        | Other feedback                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| idle, rows present                                                                      | enabled `Odśwież`                                                              | —                                                                                                                                                                                |
| idle, no rows (not read yet / zero windows)                                             | enabled `Odśwież`                                                              | `InlineNote` info (`role="status"`): `Limity nie zostały jeszcze odczytane.`                                                                                                     |
| POST in flight, or `refresh.state` `queued`/`running` with `limits` in `refresh.groups` | `aria-disabled`, guarded handler, keeps focus, label `Odświeżanie…`            | none extra; the label is the single indicator. The current `refreshing` text next to "Zużycie sesji" is removed: no other group is refreshable, so that branch is dead.          |
| completed (SSE `telemetry` → newer revision)                                            | back to idle                                                                   | values replace in place; the `Nieaktualne` badge clears by data. No toast.                                                                                                       |
| `REFRESH_FAILED`, status `available`/`partial` (previous values kept)                   | idle                                                                           | `InlineNote` attention (`role="status"`) under the rows: `Nie udało się odświeżyć limitów. Pokazano ostatni odczyt.`                                                             |
| `REFRESH_FAILED`, status `unavailable` (nothing to show)                                | idle                                                                           | `InlineNote` attention (`role="status"`): `Nie udało się odczytać limitów.`                                                                                                      |
| 429 (`ApiError.retryAfterMs`) or GET `refresh.retryAfterSeconds`                        | `aria-disabled` with guarded handler until the time passes, then enabled again | `InlineNote` info (`role="status"`): `Limity odświeżono przed chwilą. Odświeżenie będzie znów możliwe za moment.` (no live countdown)                                            |
| 403 or 422 `CAPABILITY_UNSUPPORTED`                                                     | removed for this mount (definite refusal); focus moves to the section heading  | `InlineNote` info (`role="status"`) until the next snapshot: `Odświeżanie limitów jest niedostępne.` The "Limity dostawcy" heading gets `tabIndex={-1}` so it can receive focus. |
| network/503 (receipt not confirmed)                                                     | idle; next press reuses the same `requestId`                                   | `InlineNote` danger (`role="alert"`): `Nie potwierdzono odświeżenia. Spróbuj ponownie.`                                                                                          |

### 1.3 Migration status — Recommended: not shown

`migration` is an operational diagnostic with no user action; its user-visible consequence
(`BASELINE_MISSING`, partial coverage) already renders as absent/partial readings. Alternative:
for `migration.status === 'failed'` only, one `InlineNote` info in "Zużycie sesji":
`Historyczne zużycie jest niepełne.`

Proposed keys (`sessions.context.sessionDetails.*`): `refreshLimits`, `refreshLimitsLabel`,
`refreshingLimits`, `limitsNotRead`, `refreshFailed`, `limitsReadFailed`, `refreshCooldown`,
`refreshUnavailable`, `refreshUnconfirmed`; remove `refreshing`. EN: "Refresh" / "Refresh provider
limits" / "Refreshing…" / "Limits have not been read yet." / "Could not refresh limits. Showing
the last reading." / "Could not read limits." / "Limits were just refreshed. You can refresh again
shortly." / "Refreshing limits is unavailable." / "The refresh was not confirmed. Try again."

## 2. Reconcile a Turn whose outcome is unknown (D2)

User question served: "Did my last request finish, and can I continue?" Today an `unknown` Turn
shows the Runtime's English label with a spinner in the Work block and the header says
"Dostawca sesji jest niedostępny" (readiness `unavailable`): both misstate it as running or as a
provider outage. Recovery-required belongs in Primary (structure §17, State F).

### 2.1 Placement — Recommended

An **attention `Alert`** in the Composer overlay stack, in the slot already used by
`savedRequestUnreadable`/`commandFailed` (above the Composer, below a pending interaction), shown
only while `snapshot.activeTurn?.state === 'unknown'`. It is the **single owner** of the fact:

- the Turn's Work block shows **no live line and no spinner** for `unknown`;
- the header subtitle shows `Wynik tury nieznany` (precedence in §3.4);
- the Composer stays visible and disabled per `capabilities.start`; Stop is not offered
  (cancel is refused for `unknown`). Context does not repeat the action.

Alternative: the action in Context "Attention / next actions" (§7.2). Rejected: on Narrow it is
hidden behind Context, and §17 puts recovery in Primary.

### 2.2 Copy and states

Title `Nie wiadomo, jak zakończyła się ostatnia tura`. Body `SpecFlow nie otrzymał potwierdzenia
wyniku od dostawcy. Polecenie mogło zostać wykonane — nie zostanie wysłane ponownie.`

| State                                           | Presentation                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unknown, Manage                                 | `Button size="sm"` `Sprawdź wynik` in the Alert (`SessionRecoveryNotice` pattern).                                                                                                                                                                                          |
| unknown, no Manage                              | No button; extra line `Wynik może sprawdzić osoba zarządzająca tą sesją.`                                                                                                                                                                                                   |
| pending                                         | Button `aria-disabled` with guarded handler, label `Sprawdzanie…`.                                                                                                                                                                                                          |
| 409 `SESSION_RECOVERY_REQUIRED` (still unknown) | Alert stays; `role="status"` line `Dostawca nie ma jeszcze dowodu wyniku. Tura pozostaje nierozstrzygnięta — spróbuj ponownie później.`; button enabled (a new press is a new `requestId`).                                                                                 |
| network failure (unconfirmed)                   | `role="alert"` line `Nie potwierdzono sprawdzenia. Spróbuj ponownie.`; next press reuses the `requestId`.                                                                                                                                                                   |
| resolved (200, then SSE turn change)            | Alert unmounts with the `unknown` state; the Turn's outcome renders through the existing Work block/outcome row (Chat V10 §3.1). One polite `useNotify` toast `Ustalono wynik tury.` only when the user's own reconcile returned `reconciled === true`; no toast otherwise. |

Never combined with resend; never patches state from the 200 body.

Proposed keys (`managedSession.reconcile.*`): `title`, `body`, `action`, `checking`,
`noManage`, `noEvidence`, `unconfirmed`, `resolved`, plus `managedSession.turnUnknown` for the
subtitle. EN: "It is not known how the last Turn ended" / "SpecFlow did not receive the outcome
from the provider. The request may have run — it will not be sent again." / "Check outcome" /
"Checking…" / "Someone who manages this session can check the outcome." / "The provider has no
evidence of the outcome yet. The Turn stays unresolved — try again later." / "The check was not
confirmed. Try again." / "Turn outcome established." / "Turn outcome unknown".

## 3. Session actions: Rename, Archive, Unarchive, Delete (D10)

All four live in the header `⋯` menu (`WorkspaceHeaderAction`, `direct: 'never'`, existing
`useSessionActions`), Delete last with `tone: 'danger'`.

### 3.1 Capability gating — Recommended

- Rename, Archive, Unarchive: present only with `capabilities.manage`; Delete only with
  `capabilities.delete`. Absent capability → item **omitted** (not disabled). No items → no menu.
- Archive and Unarchive are mutually exclusive by `session.archivedAt`.
- Rename on an archived Session: **Recommended** allowed (Manage; it is metadata, not
  conversation). Owner alternative: omit Rename while archived and have Runtime refuse it with
  409 `SESSION_ARCHIVED`. T9 records the choice.
- Never enabled from handler presence (today's `disabled: !onX` goes away).

### 3.2 Active or unknown Turn — Recommended: explain in the dialog

The Archive and Delete items stay in the menu. While `snapshot.activeTurn` exists (any
nonterminal state, including `unknown`), their dialog opens with the confirm button **disabled**
and one `InlineNote` attention (`role="status"`) above the footer:

- `active`/`waiting`/`cancelling`: `Trwa tura. Zatrzymaj ją lub poczekaj na jej zakończenie.`
- `waitingForUser`: `Tura czeka na Twoją odpowiedź. Odpowiedz lub zatrzymaj turę.`
- `unknown`: `Najpierw ustal wynik ostatniej tury.` (points at §2)

A 409 `TURN_CONFLICT` that wins a race shows the matching note in the open dialog. This prevents
the request instead of recovering from it, and the reason is readable on open (Documents D7).
Alternative: the menu item disabled with no visible reason — rejected (hover-only, discovered late).

### 3.3 Dialog pending and error states (all dialogs)

- Confirm reads `Zapisywanie…` / `Archiwizowanie…` / `Usuwanie…`, `aria-disabled` with a guarded
  handler; Cancel and Escape disabled while pending (dialog locked, as `DocumentOperationDialogs`
  `closeUnlessLocked`). The dialog closes only on success.
- Unconfirmed request (network/503): `Alert tone="attention" role="alert"` inside the dialog above
  the footer, `Nie potwierdzono operacji. Spróbuj ponownie.` The dialog **stays locked**: Cancel
  and Escape disabled and, for Rename, the title input disabled, until a retry is confirmed or
  definitely refused (as `DocumentOperationDialogs` locks on `unknown`: picker, Cancel and close).
  The confirm button becomes the retry. Rename/Archive retry reuses the `requestId`; Delete has no
  body and no `requestId`, so its retry is a repeated `DELETE`.
- Definite refusal (unlocks Cancel): 403 `Nie masz już uprawnień do tej operacji.`;
  `TURN_CONFLICT` per §3.2; Delete blocked by unsettled Engine evidence per §3.5.
- Rename: no optimistic title. The header shows the new title only after the command succeeds;
  on failure the old title stays. This supersedes plan T11's "optimistic title until the `session`
  change arrives". Validation stays as implemented (nonblank, ≤256).
- Focus after success: back to the header `⋯` trigger (the dialog's default return), except
  Delete (§3.5).

### 3.4 Archive and the archived Session

Corrected Archive dialog copy (no list exists, nothing "disappears"):
title `Zarchiwizować tę sesję?`, description `Sesja zostanie zarchiwizowana. Nie będzie można w
niej wysyłać wiadomości; historia, praca i zużycie pozostaną dostępne. Możesz ją w każdej chwili
przywrócić.` EN: "Archive this session?" / "The session will be archived. No messages can be sent
in it; its history, work and usage stay available. You can restore it at any time."

Archived presentation — **Recommended**:

- Header subtitle `Zarchiwizowana`. Subtitle precedence (one fact, first match wins): connection
  state when not connected (`Utracono połączenie`, `Ponowne łączenie…`) → `Zarchiwizowana` →
  `Wynik tury nieznany` → current activity / readiness label (today's rule). Subtitle, not the
  header `status` slot (plan D10 proposed a header status): `status` holds transient progress
  (provider-wait spinner, naming status), while archived is a lasting state of the same kind as
  readiness, which already lives in the subtitle; a badge would add a second signal next to the
  archived bar.
- The Composer is **replaced** in its overlay slot by a quiet bar of the same width:
  `InlineNote` info `Sesja jest zarchiwizowana. Nie można w niej wysyłać wiadomości.` plus, with
  Manage, `Button variant="secondary" size="sm"` `Przywróć` (Unarchive directly, no confirmation:
  reversible, non-destructive). Pending `Przywracanie…` (`aria-disabled`, guarded); failure as an
  `InlineNote` danger line (`role="alert"`) in the bar. On success the Composer returns (draft text
  kept while the screen stays mounted) and **focus moves to the Composer editor**.
- Menu: `Przywróć` (icon `undo`, the closest registered glyph) replaces `Archiwizuj`.
- Conversation, Work, Context and telemetry stay fully readable; no pending interaction can exist
  (plan D6).
- **409 `SESSION_ARCHIVED`** on send, interaction respond or a retained pending start (archived in
  another view): a definite refusal. Drop the retained command and its `requestId`; do not show
  the generic `commandFailed` retry copy. The composer draft is kept. The SSE `session` change
  brings the archived bar; until it arrives, show `role="status"` `Sesja została zarchiwizowana.`
  in the Composer overlay slot.

Alternative: keep the Composer disabled with the note above it. Rejected: a disabled input
invites typing and duplicates the reason.

### 3.5 Delete and post-delete navigation

Delete dialog (`AlertDialog`, destructive confirm `Usuń`): title `Usunąć tę sesję?`; description
names the Session title on its own line (as Documents delete shows the path) and states scope
honestly: `Tej operacji nie można cofnąć. Historia rozmowy, praca i zużycie tej sesji zostaną
trwale usunięte ze SpecFlow. Odwołania do tej sesji w specyfikacjach i zadaniach przestaną działać.
Pliki w repozytorium i lokalna historia dostawcy nie są usuwane.` EN: "This cannot be undone. The
session's conversation history, work and usage will be permanently deleted from SpecFlow.
References to this session in specifications and tasks will stop working. Repository files and the
provider's local history are not deleted." No type-to-confirm (consistent with Documents delete).

Refusal because the Session has unsettled Engine evidence (not visible in the snapshot, so it cannot
be prevented up front): definite refusal, `Alert tone="attention" role="alert"` in the dialog,
`Sesja ma nierozliczone operacje w repozytorium. Spróbuj ponownie później.`; confirm stays
enabled, Cancel unlocks. Error code from T9; named `SESSION_DELETE_BLOCKED` unless T9 decides
otherwise.

Success: 204, or 404 `SESSION_NOT_FOUND` for a `DELETE` this view sent (including a retry after
an unconfirmed attempt that had in fact succeeded, plan D8). **Recommended**: navigate with
`replace` to `/sessions/new` (so Back does not reopen a deleted Session), show the polite toast
`Sesja została usunięta.` via `useNotify`, and focus the page heading of the destination.
Alternative: navigate to the owning Specification when this visit knows it
(`startedSessionContext`); not default because the real route's scope is `unknown` (Session–Spec
association is out of scope).

### 3.6 Session deleted elsewhere

No Session-not-found state exists today. Another open view of a deleted Session gets a closed
stream and then 404 `SESSION_NOT_FOUND` on its next read. It replaces the Session screen with a
view built like `app/errors/NotFoundView.tsx` (`SpecFlowStandaloneShell` +
`StandaloneScreenHeader` + one secondary Button), with Session copy: title `Ta sesja została
usunięta lub nie istnieje`, description `Historia tej sesji nie jest już dostępna.`, button
`Nowa sesja` → `/sessions/new`. EN: "This session was deleted or does not exist" / "This
session's history is no longer available." / "New session". The same view serves a direct link to
an unknown Session id. A Composer draft in that view is lost (said by the description).

Proposed keys (`managedSession.sessionActions.*`): `unarchive`, `archivedNote`, `archivedSubtitle`,
`archivedElsewhere`, `renaming`, `archiving`, `unarchiving`, `deleting`, `turnActive`,
`turnWaitingForUser`, `turnUnknown`, `unconfirmed`, `forbidden`, `deleteBlocked`, `deleted`;
`managedSession.notFound.{title,description,action}`; rewrite `archiveDescription` and
`deleteDescription` in both locales.

## 4. Validation scenarios (stories in T2/T4/T11)

1. Limits: Codex refreshable + Manage (idle, running, 429, failed with values, failed without
   values, zero windows, 403 removes control and focuses the heading); Claude non-refreshable (no
   control); `NOT_AUTHORIZED` (no limits section); not-yet-read refreshable.
2. Unknown Turn: Manage, no Manage, checking, 409 still unknown, resolved to `failed` (toast only
   when `reconciled`); Narrow 390px shows the Alert above the Composer without opening Context.
3. Archive with active, `waitingForUser` and unknown Turn (disabled confirm + note); archived
   Session with and without Manage at Wide and 390px; Unarchive pending/failure and focus to the
   editor; send, respond and retained pending start refused with 409 `SESSION_ARCHIVED` (no retry
   copy, retained `requestId` dropped, archived bar after SSE).
4. Rename unconfirmed (input, Cancel and Escape locked; retry confirms). Delete pending,
   unconfirmed → retry → 404 treated as done, `SESSION_DELETE_BLOCKED`, success → `/sessions/new`
   with toast and heading focus; Back does not return. Deleted-elsewhere view.
5. Every menu combination: manage only, delete only, neither (no `⋯`).

## 5. Dependencies

- T9 contract: `archivedAt`, `capabilities.delete`, `TURN_CONFLICT` for archive/delete,
  `SESSION_ARCHIVED` for start/respond, the Delete refusal code for unsettled Engine evidence, and
  the Rename-on-archived choice (§3.1).
- T11 drops the optimistic rename title (§3.3).
- No new design-system component. Possible DS follow-up only: an `archive-restore` glyph.
