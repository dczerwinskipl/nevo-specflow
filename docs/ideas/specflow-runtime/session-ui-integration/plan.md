---
id: ideas.specflow-runtime.session-ui-integration.plan
type: engineering
title: Managed Session UI integration and Session actions task plan
status: draft
scope: specflow
areas: [ai, runtime, server, security, ui, testing]
tags: [sessions, telemetry, interactions, work, session-actions, planning, implementation]
read_when:
  - implementing or reviewing the feat/session-ui-integration pull request
  - deciding Session rename, archive or delete semantics
summary: >
  Ordered, dependency-complete task plan for wiring the managed Session screen to the real
  Session API (telemetry, reconcile, multi-select questions, Antigravity icon) and for adding
  Work counts/digest, command response schemas and Session rename/archive/delete end to end,
  with the owner decisions that still block parts of it.
related:
  - reference.api.sessions
  - reference.api.session-telemetry
  - architecture.ai.session-storage-and-lifecycle
  - architecture.runtime.authorization
  - ideas.specflow-runtime.session-v10-backend-readiness
  - ideas.specflow-ui.components.session-chat-v10-design
---

# Managed Session UI integration and Session actions

Branch `feat/session-ui-integration`. **One PR** for every task below, including prerequisites in
other packages (`@nevo/http-client`, contracts, Runtime, docs). No side PRs.

Authoritative contracts: [Sessions API](../../../reference/api/sessions.md),
[Session telemetry API](../../../reference/api/session-telemetry.md),
[storage and lifecycle](../../../architecture/ai/session-storage-and-lifecycle.md),
[authorization](../../../architecture/runtime/auth/authorization.md). This plan does not copy their
schemas; it states what each task must add or consume.

Out of scope: Session-Spec association, Session list/catalogue, demo-mode managed Sessions,
planned-area tabs, attachments, the naming signal, Tasks/Attention Context sections, and
`TurnSummary.usage`/`error` presentation (no reviewed UX contract places them; the Work inspector
and Work block specs show neither).

## Readiness summary

| Task                                        | Kind        | Profile        | Depends on | Readiness                          |
| ------------------------------------------- | ----------- | -------------- | ---------- | ---------------------------------- |
| T1 HTTP client response metadata            | general     | implementer    | -          | ready                              |
| T2 Telemetry consumption                    | ui          | implementer-ui | T1         | ready, refresh control waits on D1 |
| T3 Command response schemas                 | integration | implementer    | -          | ready                              |
| T4 Reconcile unknown Turn                   | ui          | implementer-ui | T3         | dependent on D2 (placement/copy)   |
| T5 Multi-select questions                   | ui          | implementer-ui | -          | ready                              |
| T6 Antigravity provider icon                | ui          | implementer-ui | -          | ready                              |
| T7 Work counts (backend + UI)               | integration | implementer    | -          | ready, backfill per D3             |
| T8 Work digest (backend + UI)               | integration | implementer    | T7         | blocked on D4                      |
| T9 Session management contract + docs       | backend     | implementer    | T3         | blocked on D5-D9                   |
| T10 Rename/archive/delete Runtime           | backend     | implementer    | T9         | dependent on T9                    |
| T11 Session actions UI                      | ui          | implementer-ui | T9, T10    | dependent on T9/T10 and D10 (UX)   |
| T12 Docs reconciliation + cross-boundary QA | general     | implementer    | all        | last                               |

Parallel lanes after T1/T3: {T2}, {T4}, {T5, T6}, {T7 then T8}, {T9 then T10 then T11}.
T2, T4, T5 and T11 all touch `ManagedSession.tsx`; sequence their merges into the branch in the
order T5, T2, T4, T11 and rebase each on the previous one (no two tasks own the same behavior).

## Verification rule (all tasks)

On Windows run only the targeted test files plus package typecheck/lint, for example
`pnpm --filter @nevo/specflow-ui exec vitest run src/features/sessions/managed/InteractionPrompt.test.tsx`,
`pnpm --filter @nevo/specflow-ui typecheck`, `pnpm --filter @nevo/specflow-ui lint`.
Full package suites (`pnpm --filter <pkg> test`) and the full `specflow-ui` Storybook corpus run on
Linux CI for the PR; report CI results, do not retry long local runs. No automated test uses a real
provider account. Stories follow the play-function rules in `engineering.shared.testing`.

## Stage 1 - UI against the existing API

### T1 HTTP client response metadata (prerequisite of T2)

- **Goal:** a feature API can read a response's `ETag`/status and send `If-None-Match`, and treat
  `304` as a non-error result. Today `HttpRequestClient.get` returns only the body
  (`packages/http-client/src/types.ts`), and `shared/operations/operationsApi.ts` sends
  `If-None-Match` but never receives an ETag, so it cannot really revalidate.
- **Files:** `packages/http-client/src/{types,client}.ts` (+ tests); `packages/specflow-ui/src/api/transport.ts`
  if the transport must forward the metadata.
- **Shape:** an additive call returning `{status, data?, headers}` (lower-cased, only the headers
  the caller asks for, or a small fixed set), keeping Axios hidden. Do not change existing calls.
- **Tests:** `client.test.ts`: 200 with ETag, 304 with matching tag, header absent.
- **Optional, same task:** make `operationsApi.list` return the received ETag (it currently cannot);
  only if the change is one line, otherwise leave it.

### T2 Telemetry from the real API

- **Goal:** the Session details section shows real telemetry in production and stays live.
- **Files:** `managed/api.ts` (add `telemetry(sessionId, etag?)` and `refreshTelemetry(sessionId, input)`),
  a new small telemetry hook/store beside `context/SessionTelemetrySection.tsx`, `feed.ts`
  (route SSE `kind:'telemetry'` to a telemetry listener, the same way `workListeners` are notified),
  `ManagedSession.tsx` (put `telemetry` into `contextValue`), `context/sessionContextTypes.ts`,
  `context/SessionTelemetrySection.tsx`, `context/sessionContextFixtures.ts`, stories.
- **Contract:** `GET /api/sessions/:id/telemetry` validated with `sessionValidators.telemetry`,
  revalidated with the received ETag (304 keeps the held snapshot); refetch on SSE `telemetry`
  when `changes.telemetryRevision` exceeds the held revision, and after resync/reconnect snapshot.
  `POST .../telemetry/refresh` with `{requestId, groups}` validated with
  `sessionValidators.refreshTelemetryReceipt`; 429 uses `ApiError.retryAfterMs` to disable the
  control until it passes; 403 and 422 `CAPABILITY_UNSUPPORTED` are definite refusals.
  Limits masked `unavailable`/`NOT_AUTHORIZED` render as nothing (never as zero or "unknown");
  the refresh control appears only for groups whose reading is `refreshable` and only when
  `session.capabilities.manage`. Show `migration.status === 'failed'` only if D1 says so.
- **Delete the mirror:** remove the local interfaces in `context/sessionTelemetry.ts`; import
  `TelemetrySnapshot`, `TelemetryReading`, `TelemetryLimitWindow`, `TelemetryContextUsage`,
  `RefreshTelemetryReceipt` from `@nevo/specflow-contracts/sessions`. Adapt rendering to the real
  shapes (discriminated `Reading`, `LimitWindow` union, at-least-one `ContextUsage`, `migration`,
  refresh state). Keep `isTelemetryVisible` (now over contract types). Move the four fixture
  snapshots to a `sessionTelemetry.stories-support.ts` typed as `TelemetrySnapshot` and assert each
  passes `validateTelemetrySnapshot` in a test, so fixtures cannot drift from the contract again.
- **Tests:** API unit tests (200/304/invalid body, refresh 202/429/403); hook test for
  SSE-driven refetch and revision ordering (a stale response never overwrites a newer one);
  `SessionTelemetrySection.test.tsx` for NOT_AUTHORIZED limits and non-refreshable groups;
  fixture validity test. Stories: full, partial Antigravity, unavailable, stale, refreshing.
- **Verify:** targeted vitest for the touched files, `specflow-ui` typecheck/lint.

### T3 Command response schemas (prerequisite of T4, T9)

- **Goal:** every Session command response is a closed contract schema, validated by the UI.
- **Files:** `packages/specflow-contracts/src/sessions/{commands,validation}.ts` (+ tests);
  `specflow-runtime/.../http/routes.ts` (`schema.response` for 201/202/200); `managed/api.ts`.
- **Shape:** `CreateSessionResult {sessionId}`, `StartTurnResult {turnId}`,
  `CancelTurnResult {turnId}`, `RespondInteractionResult {turnId, interactionId}`,
  `ReconcileTurnResult {turnId, outcome, reconciled}` (outcome typed by `TurnOutcomeSchema` -
  verify the Runtime never returns another value first; `coordinator.reconcile` types it as `string`).
  Add matching `sessionValidators` entries; `api.create/start/cancel/respond/reconcile` pass
  `isValid`. An invalid 2xx body is an outcome-unknown error for start (keep the retained pending
  command), not a success.
- **Tests:** contract schema tests (reject extra keys), `sessions.http.test.ts` asserting the
  response shapes, `api` unit test for an invalid body.

### T4 Reconcile a Turn whose outcome is unknown

- **Goal:** a user with Manage can ask Runtime to settle an `unknown` Turn using its positive
  evidence path, and sees an honest result when no evidence exists.
- **Files:** `managed/api.ts` (`reconcile(sessionId, turnId, requestId)`), `feed.ts`
  (command with a retained `requestId` like cancel), `ManagedSession.tsx` / Composer region,
  i18n `en.json`/`pl.json`, stories.
- **Behavior:** offered only while `snapshot.activeTurn.state === 'unknown'` and
  `capabilities.manage` (never from message text). 200 means the Turn settled; the SSE turn change
  updates the screen, do not patch state locally. 409 `SESSION_RECOVERY_REQUIRED` means "no
  evidence yet": keep the Turn unknown and the action available. Do not combine with resend; never
  replay the prompt. Placement and copy per D2.
- **Tests:** feed test (request id reused on retry after network failure, 409 keeps state);
  story for unknown Turn, evidence missing, and settled.

### T5 Questions with `maxSelections > 1`

- **Goal:** remove the "unsupported question" fallback (`InteractionPrompt.tsx:18`) and answer
  multi-select questions. Real source: Claude `multiSelect` maps to `maxSelections = options.length`
  (`providers/claude/requests.ts`); Codex and MCP use 1.
- **Files:** `InteractionPrompt.tsx` (+ test, stories), the `onRespond` wiring in
  `ManagedSession.tsx` (today `optionIds: optionId ? [optionId] : []`).
- **Behavior:** `maxSelections` absent or 1 keeps today's one-click option buttons. Greater than 1:
  a `Checkbox` group (per `design-system-component-composition-gaps.md`, "multi-choice question ->
  Checkbox") plus one Submit; selection count capped at `maxSelections` (further boxes disabled,
  with a count hint); optional text included when `allowText`; Submit disabled when nothing is
  selected and no text. Change `onRespond` to `{optionIds, text?}`. Option IDs are sent in the
  declared order, never duplicated.
- **Tests:** `InteractionPrompt.test.tsx`: cap enforcement, text + options, single-select
  unchanged; story with keyboard play function.

### T6 Antigravity provider icon

- **Evidence:** provider marks are vendored from LobeHub lobe-icons at a pinned revision
  (`shared/provider-icons/README.md`, MIT `LICENSE`). lobe-icons `master` contains
  `packages/static-svg/icons/antigravity-color.svg` and `antigravity.svg` (checked 2026-11-08).
- **Goal:** `SessionProviderIcon` maps `providerId: 'antigravity'` to that asset.
- **Files:** `shared/provider-icons/antigravity-color.svg` (or mono `antigravity.svg` as an alpha
  mask, chosen like Claude/Codex by whether the artwork is multi-colour), `README.md` (exact pinned
  revision URL for the new file; if the revision differs from the existing pin, list it per file),
  `SessionProviderIcon.tsx`, a story/visual check at 16px and `xl`.
- **Rule:** copy the file byte-for-byte from the pinned revision; do not draw or modify it. If the
  file cannot be fetched at a pinned revision, keep the neutral fallback and report it.

## Stage 2 - backend plus UI wiring

### T7 Work counts

- **Goal:** `WorkPage.counts` exists in the contract and Runtime, and the UI-local
  `WithWorkCounts` disappears.
- **Contract:** `WorkCountsSchema {total, inProgress, byKind: {commentary, reasoning, interaction,
tool}}` (safe nonnegative integers, closed), `WorkPage.counts` optional. Document it in
  sessions.md by turning "Proposed Work aggregate counts" into the contract (keep the rule: UI hides
  the row when absent and never derives it from `items.length`).
- **Runtime:** maintain the aggregate transactionally in the Turn record at Work open and Work state
  change (`persistence/facts.ts`, next to the existing `actionCount` maintenance), and project it
  in the `work` read (`persistence/reads.ts`). `inProgress` counts state `active` only. No read-time
  scan. Turns created before this change: per D3.
- **UI:** `managed/api.ts` returns `WorkPage`; `workCounts.ts` keeps only `ToolActivityKind`/digest
  types (until T8) and re-exports nothing that shadows contracts; fixtures typed as `WorkPage`.
- **Tests:** reducer/facts unit test for counts across open/complete/fail/interrupt and restart
  recovery closing open Work; `store.test.ts` read; `sessions.http.test.ts` response validates;
  `WorkInspector.test.tsx` row shown with counts, hidden without.

### T8 Work digest (blocked on D4)

- **Goal:** the Turn's Work block shows the by-kind "done"/"failed" line from real data and
  `WithWorkDigest` disappears.
- **Why blocked:** canonical facts carry no tool sub-kind (`providers/facts.ts` `action-open` has
  only `title`), and the readiness audit names "canonical operation classification" as its own
  Work-inspection delivery. Implementing the digest means a provider-driver protocol extension
  (`reference.protocols.session-provider-driver`) with a per-provider mapping for Claude, Codex,
  Antigravity and the mock, and a decision on where the digest lives.
- **If D4 = implement now:** add an optional, closed `operation` classification to `action-open`
  facts, mapped only from native tool identity (unmapped -> `other`; `test` only when the native
  tool itself identifies a test run, never inferred from a command string); maintain per-Turn
  done/failed counts with T7's aggregate; expose per D4 (recommended: `ConversationEntry.digest`
  optional on the Turn's latest `work-summary` entry, revised when it changes, which is what the
  chat can read from the tail without extra requests). Tests: mapping tables per provider, revision
  bump emits a bounded `conversation` change, `workDigest.test.ts` against contract types.
- **If D4 = defer:** leave `WorkDigest` local and documented as proposed; no change in this PR.

### T9 Session management contract and docs (blocked on D5-D9)

- **Goal:** one authoritative, reviewed contract for Rename, Archive (and Unarchive) and Delete
  before any implementation.
- **Files:** `docs/reference/api/sessions.md` (routes table, commands, errors, events, and remove
  "no deletion endpoint"), `docs/architecture/ai/session-storage-and-lifecycle.md` (retention,
  idempotency keys "for the Session lifetime", delete transaction), `docs/architecture/runtime/auth/authorization.md`
  (session capability list: today stale, also missing `execute-write` and `view-provider-limits`),
  contracts `commands.ts`, `model.ts`, `capabilities.ts`, `validation.ts` (+ tests).
- **Recommended shape (subject to the decisions):**
  - `POST /api/sessions/:id/rename {requestId, title}` -> `200 {session: SessionInfo}`; title
    trimmed, 1..256 characters; Manage.
  - `POST /api/sessions/:id/archive {requestId}` and `/unarchive {requestId}` -> `200 {session}`;
    Manage; `SessionInfo.archivedAt?: string`.
  - `DELETE /api/sessions/:id` -> `204`; new `session.delete` capability.
  - New 409 code `SESSION_ARCHIVED` (start/respond on an archived Session); `TURN_CONFLICT` for
    archive/delete with a nonterminal or `unknown` Turn.
  - `SessionInfo.capabilities` gains `delete: boolean` (optional, additive) so the UI can enable
    the menu item from the effective projection.
  - Body limit 64 KiB; requestId idempotency `(actor, command, sessionId, requestId)` as for cancel.
- **Tests:** contract schema tests for every new type and the extended `SessionInfo`/error codes.

### T10 Rename, archive, delete in Runtime

- **Goal:** the T9 contract works end to end with durable idempotency and live updates.
- **Files:** `http/routes.ts` (thin routes), `lifecycle/coordinator.ts` (operations), a new
  persistence module beside `telemetry.ts` (for example `persistence/session-management.ts`) instead
  of growing `worker.ts` (1091 lines), `persistence/protocol.ts` ops, `http/projection.ts`
  (capability projection), `server/app.ts` role policy (`session.delete` per D8).
- **Rename/archive/unarchive:** one transaction updates the Session record, the idempotency record
  and emits `session` change (`emit(..., 'session', {session})`); SSE subscribers see it live.
  Archive checks "no nonterminal Turn" inside the same transaction as the write (no race with start).
  Start/respond/telemetry refresh admission checks archive per D6.
- **Delete:** per D7. Recommended: reject while any Turn is nonterminal/unknown or an Engine effect
  candidate exists for the Session; otherwise one transaction removes every Session-owned row
  (sessions, provider_contexts, turns, entries, work, actions, contents/chunks/content_revisions,
  text_keys, interactions, requests scoped to the Session, facts/usage rows of its invocations,
  usage_session, events, telemetry_* rows), then closes that Session's SSE subscribers without
  payload. Engine records are not touched. Before writing it, add a characterization test listing
  every table and its Session ownership, so a future table cannot be silently left behind
  (the test fails if `sqlite_master` has a table the delete map does not classify).
- **Tests:** `store.test.ts` (rename/archive idempotent replay, conflict on different input,
  archive with active Turn -> 409, delete leaves no row for the Session and keeps others'),
  `coordinator.test.ts` (start after archive rejected; delete with `unknown` Turn rejected),
  `test/sessions/sessions.http.test.ts` (routes, 403 without capability, 404 after delete,
  SSE `session` change), `test/sessions/stream.http.test.ts` (stream closed on delete).
  These Runtime suites are slow on Windows: run only the touched files locally.

### T11 Session actions UI

- **Goal:** the header ⋯ actions call the real commands; today they are visual-only
  (`sessionActions/useSessionActions.tsx`).
- **Files:** `managed/api.ts`, `sessionActions/useSessionActions.tsx`,
  `sessionActions/SessionActionDialogs.tsx`, `routes.tsx` (wire handlers, navigation after delete),
  `ManagedSession.tsx`, i18n, stories, tests.
- **Behavior:** handlers become async; dialogs stay open with a pending state until the command
  returns and show the API error inline on failure (no optimistic close). Rename keeps the current
  optimistic title only until the `session` change arrives; on failure the old title returns.
  Items are enabled from `session.capabilities.manage` / `.delete`, not from handler presence.
  Archived state, Unarchive entry point and post-delete navigation per D10.
- **Tests:** `useSessionActions` test (pending, error, success, capability-disabled), route test
  for post-delete navigation, stories for each dialog state.

### T12 Docs reconciliation and cross-boundary verification

- Update `session-v10-backend-readiness.md` (counts and, if done, digest and deletion now exist),
  `session-chat-v10-design.md` §3.1 (digest no longer "proposed" if T8 lands),
  remove stale "PR #107 not merged" comments, and run `pnpm docs:check`.
- One end-to-end scenario per stage on the mock provider through the HTTP test harness
  (create -> turn -> telemetry GET/304 -> rename -> archive -> start rejected -> unarchive ->
  delete -> 404). Full suites and Storybook on Linux CI.

## Owner decisions (2026-11-08)

- D1, D2, D10: no direct acceptance. A UX contract (ux-designer profile) covers the telemetry refresh
  control, reconcile placement/copy, the archived state with Unarchive, and post-delete navigation.
  The owner accepts it before T2's refresh control, T4 and T11 UI are implemented.
- D3: accepted default (omit `counts` for Turns created before the change, no backfill).
- D4: **implement in this PR.** Classify only from the provider's own tool identity, fall back to
  `other`, attach to the Turn's latest `work-summary` entry.
- D5, D6, D7: accepted as recommended (`archivedAt`, read-only, 409 `TURN_CONFLICT` with an active or
  unknown Turn, no auto-cancel, Unarchive in scope).
- D8, D9: accepted as recommended (hard delete of Runtime rows, rejected while a Turn is unsettled,
  Engine records and provider transcripts untouched, repeat delete 404, `DELETE` 204, new
  `session.delete` capability for developer and admin).

## Decisions needed from owner

Each has a recommended default; tasks marked blocked start once it is confirmed.

- **D1 Telemetry refresh and migration UI.** No UX contract places a refresh control
  (`full-session-screen-structure.md` §23 leaves cost/usage/limit presentation undecided) and the
  API doc forbids a generic Refresh while live. Recommend: a small text action "Odśwież limity" in
  the limits group only (the only group the scheduler admits), shown when that reading is
  `refreshable` and the user has Manage; no global refresh; `migration` not shown in the product.
- **D2 Reconcile placement and copy.** No reviewed UX covers it. Recommend: an attention Alert in
  the Composer overlay ("Nie wiadomo, czy tura się zakończyła") with one "Sprawdź wynik" button;
  after 409 the text says Runtime has no evidence yet and the button stays.
- **D3 Work counts for existing Turns.** Recommend: omit `counts` for Turns created before the
  schema change (no backfill scan, field is optional, UI hides the row) instead of a migration.
- **D4 Work digest.** Requires a new canonical tool classification across all providers and a
  location choice; readiness doc assigns this to a separate Work-inspection delivery. Recommend:
  defer T8 from this PR (ship counts only). If kept: classification only from native tool identity,
  `other` fallback, on the Turn's latest `work-summary` entry.
- **D5 Archive semantics.** Recommend: `archivedAt` field on `SessionInfo`; archived is read-only
  (start/respond -> 409 `SESSION_ARCHIVED`, `capabilities.start` false); reads, content, history,
  telemetry GET and SSE keep working.
- **D6 Archive with an active Turn.** Recommend: reject with 409 `TURN_CONFLICT` (also for
  `unknown`), no implicit cancel; the user cancels first. Consequently no pending interaction can
  exist on an archived Session. Telemetry refresh on an archived Session: allowed (read-only).
- **D7 Unarchive.** The shipped copy promises "restore from the archive later". Recommend:
  `POST .../unarchive` in this PR, Manage, idempotent.
- **D8 Delete semantics.** Recommend: hard delete of all Session-owned Runtime rows; reject while
  any Turn is nonterminal/unknown or Engine evidence is unsettled ("never delete unsettled Engine
  evidence"); Engine workspace-execution records are kept (they reference the Session id as audit);
  native provider transcripts (Claude/Codex/Antigravity local stores) are not deleted, only the
  locator; tasks/spec references to the id then resolve as unavailable; repeat delete -> 404
  `SESSION_NOT_FOUND` (no tombstone; the UI treats 404 after its own delete as done); body-less
  `DELETE` because idempotency records are deleted with the Session.
- **D9 Delete authorization.** Recommend: new `session.delete` capability (precedent:
  `spec.close-specification`), granted to `developer` and `admin`; Rename/Archive use
  `session.manage`.
- **D10 UX after archive/delete.** No list exists, so "disappears from lists" has no visible effect.
  Recommend: archived Session shows a header status "Zarchiwizowana", the Composer is replaced by
  a note with "Przywróć", and the ⋯ menu offers Restore instead of Archive; after delete navigate
  to `/sessions/new` with a toast. Needs UX sign-off (ux-designer) before T11.
- **Minor, default applies unless overridden:** a question with options and no `maxSelections`
  stays single-select in the UI (Runtime accepts any count); rename title must be nonblank (no
  "clear title"); a later naming signal must never overwrite a user rename.

## Existing documentation that contradicts this scope

- `reference.api.sessions`: "No ... deletion ... endpoint"; status draft.
- `architecture.ai.session-storage-and-lifecycle`: "Keep accepted keys for the Session lifetime;
  no DELETE/purge API is part of the foundation"; no cascade delete.
- `ideas.specflow-runtime.session-v10-backend-readiness`: deletion/retention and operation
  classification/aggregates are listed as separate later backend deliveries; deletion requires
  active/unknown execution and reference/retention rules first.
- `architecture.runtime.authorization`: lists only `session.view/create/manage` (code also has
  `execute-write`, `view-provider-limits`).
- `ideas.specflow-ui.components.session-chat-v10-design` §3.1: digest location undecided
  (entry vs `TurnSummary`).
- `ideas.specflow-ui.full-session-screen-structure` §23: exact cost/usage/limit presentation not
  decided; no reviewed UX for reconcile, archived state or post-delete navigation.
- `managed/context/sessionTelemetry.ts` header and `sessionContextTypes.ts` still say the
  telemetry contract is unmerged; the UI archive copy promises lists and restore that do not exist.
