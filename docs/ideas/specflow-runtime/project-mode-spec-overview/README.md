---
id: ideas.specflow-runtime.project-mode-spec-overview
type: architecture
title: Project-mode Specification Overview — gap analysis and minimal-complete scope (PR #126)
status: current
scope: specflow
areas: [runtime, server, ui]
tags: [specification, workspace, overview, tasks, activity, sessions, documents, planning]
read_when:
  - making the Specification Overview work against a real project Runtime (not --demo)
  - changing which workspace sections are not_implemented, empty or available in project mode
  - changing the Overview visibility rules that depend on preparationState / isEmpty
summary: >
  Why the project-mode Specification Overview shows only "Niedostępne na tym serwerze" (main pane and
  Activity history) although Documents and Sessions are real, what the Engine already provides, and
  the decided minimal-complete scope for PR #126: a Tasks contribution from the verified manifest,
  a real (partial) activity contribution, an overview-derived summary, Overview visibility rules
  decoupled from "no Tasks", the preparation call-to-action wired to New Session, contract changes,
  task breakdown, verification and the owner decisions of 2026-11-08 (Tasks EmptyState, partial activity).
related:
  - reference.api.specification-workspace
  - ideas.specflow-ui.screens.specification-workspace
  - ideas.specflow-runtime.session-association
  - ideas.specflow-ui.session-association-ux
  - reference.api.specs-overview
  - reference.api.specification-documents
  - architecture.runtime.task-read-composition
---

# Project-mode Specification Overview (PR #126)

**Status:** decided by the owner on 2026-11-08 ([Owner decisions](#owner-decisions-2026-11-08));
**ready for implementation** in PR #126 on the merged #124 geometry. No product code was changed by
this analysis. Rendered evidence: `C:/Users/domin/nevo-verify/project-overview/HANDOVER.md`
(`v3-*` screenshots for the accepted Tasks empty state; the scratch story used to render them has
been deleted).

## Owner decisions (2026-11-08)

| #   | Decision                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | The Tasks section stays with its **Zadania** header; with no Tasks it shows the product's standard section-sized empty state (icon, title, description), not a single muted line. Exact component, copy and sizing in P6                   |
| D2  | **A**: partial real activity (Specification created, Session started). The Activity history Secondary opens by default only when a Session event exists, never for the created event alone; otherwise it is closed and available on demand |
| D3  | The preparation block's button opens New Session (`/specs/:specId/sessions/new`), gated by `actions.startSession`; the legacy conversation dialog path is removed                                                                          |
| D4  | Button label **Rozpocznij sesję** / _Start session_                                                                                                                                                                                        |
| D5  | Demo `activity` unchanged                                                                                                                                                                                                                  |
| D6  | `summary` is derived from the overview document (bounded, plain text; P1)                                                                                                                                                                  |
| -   | Rebase order: PR #124 first (done; merged into this branch at `088c2edc`)                                                                                                                                                                  |

## 1. Problem (observed facts)

Real Runtime, `nevo-specflow start` (screenshot `C:/Users/domin/nevo-verify/stage3/01-spec-workspace-sessions.png`,
reproduced as story `Current`): the Overview shows the title, then only **Niedostępne na tym
serwerze** in the main pane and in Activity history. Sessions and Documents exist but are invisible.

| #   | Fact                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `preparationState` is `empty` whenever the manifest `tasks` array is empty. Nothing on `main` writes Tasks (the manifest `tasks` is `unknown[]` with no schema; the workflow kernel with a Task resource lives only on `feat/workflow-kernel`, not merged). So **every** project Specification is `empty`. | `features/specs/workspace/engine-repository.ts`, `specflow-engine/src/specs/model.ts` (`tasks: readonly unknown[]`)                      |
| F2  | The UI gates almost everything on `isEmpty` (= `preparationState === 'empty'`): the description/main-document preview (`SpecificationSummarySection`), Documents summary (`documentsUiModule`), Continue session (`sessionsUiModule`). With F1 all three are hidden in project mode.                       | `features/specs/workspace/sections/SpecificationSummarySection.tsx`, `features/documents/uiModule.tsx`, `features/sessions/uiModule.tsx` |
| F3  | The Tasks section is `unavailable/not_implemented` in project mode (no `tasks` contribution is composed), and the Tasks work section is visible exactly when Tasks are unavailable, so it renders `FeatureUnavailable` — the main-pane "Niedostępne".                                                      | `features/specs/workspace/read-workspace.ts` (`missing`), `server/app.ts` (contributions), `features/tasks/uiModule.tsx`                 |
| F4  | `activity` is `not_implemented` in the Engine repository; `ActivityHistory` renders `FeatureUnavailable` for it — the Secondary "Niedostępne".                                                                                                                                                             | `features/specs/workspace/engine-repository.ts`, `features/specs/workspace/activity/ActivityHistory.tsx`                                 |
| F5  | The preparation call-to-action (`PreparationSection`) needs `onNewConversation`, which **no route passes** (since PR #39), so it never renders in the real app in either mode; it targets the legacy `NewConversationModal`, not New Session.                                                              | `features/specs/routes.tsx` (`SpecificationRouteScreen`), `features/specs/workspace/SpecificationWorkspace.tsx` (`canStartConversation`) |
| F6  | `specification.summary` is `''` in project mode, so even with F2 fixed the description is only a bare **Więcej** toggle.                                                                                                                                                                                   | `features/specs/workspace/engine-repository.ts` ("The Engine reads no summary text")                                                     |
| F7  | The navigator item **Zadania** links to `#tasks-heading` on the Overview; when the Tasks section is not rendered the link has no target.                                                                                                                                                                   | `app/navigation/productNavigationModel.ts`                                                                                               |
| F8  | The UI renders `ActivityEvent.time` as given; the mapper passes raw `occurredAt` (ISO). Fixtures use preformatted text ("5 min temu"), so real timestamps were never rendered.                                                                                                                             | `features/specs/read-model/mapWorkspaceResponse.ts`, `test-support/specs/workspace/fixtures.ts`                                          |
| F9  | Repository and Changes are `not_implemented` and already hidden (`hasGit === false`), not shown as "Niedostępne". No change needed.                                                                                                                                                                        | `features/specs/read-model/mapWorkspaceResponse.ts` (`hasGit`), `features/git/uiModule.tsx`                                              |

The draft UI contract already asks for the opposite of F2: "Before Tasks exist, expose a readable
Specification-content target and the normal Session entry … An empty Specification must explain the
preparation path" ([Specification UI spec §10](../../specflow-ui/screens/specification-workspace-ui-spec.md#create-prepare-and-refine-a-specification)).

## 2. Gap table

| Section / element        | Demo source                                                                    | Project mode today                                      | Engine / Runtime data available on `main`                                                                                                   | Proposal                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity, title, key     | catalogue                                                                      | available (manifest)                                    | manifest                                                                                                                                    | unchanged                                                                                                                                                                                                                                                                                                                    |
| `summary` (description)  | `= title` (stripped by UI, so none)                                            | `''`                                                    | overview document via `readCanonicalSpecDocument(engine, specId, 'overview')`                                                               | **P1**: first plain-text paragraph of a bounded overview prefix read within the same canonical read; `''` on any overview problem (rules in P1)                                                                                                                                                                              |
| `preparationState`       | `empty` = 0 Tasks (seeded) / no files (created); `preparing` = files, no Tasks | `empty` always (F1)                                     | manifest `tasks`                                                                                                                            | unchanged semantics (`empty` = verified manifest has no Tasks); the UI stops using it as "hide everything" (**P4**)                                                                                                                                                                                                          |
| `tasks`                  | catalogue groups                                                               | `unavailable/not_implemented` → main-pane "Niedostępne" | manifest `tasks`: `[]` is a verified fact; non-empty has no verified schema                                                                 | **P2**: project contribution — `tasks: []` → `available {groups: [], completed: 0, total: 0, attention: []}`; non-empty → keep `not_implemented`. Same rule as Specs Overview `progress` (`manifest-facts.ts`). Temporary: moves to the kernel Task source (`.execution/tasks/<id>.yaml`) when `feat/workflow-kernel` merges |
| `documents`              | demo directories                                                               | available (Engine)                                      | manifest registry                                                                                                                           | unchanged backend; UI shows it regardless of Tasks (**P4**)                                                                                                                                                                                                                                                                  |
| `sessions` + recommended | catalogue                                                                      | available (association registry, PR #126)               | association registry                                                                                                                        | unchanged backend; Continue session shown regardless of Tasks (**P4**)                                                                                                                                                                                                                                                       |
| `actions.startSession`   | demo route                                                                     | real (`spec.start-session` + `session.create`)          | —                                                                                                                                           | also gates the preparation call-to-action (**P5**)                                                                                                                                                                                                                                                                           |
| `activity`               | `available, items: []` (an empty success with no source)                       | `unavailable/not_implemented` → Secondary "Niedostępne" | manifest `created` (date only); associated Sessions' `createdAt` + title from the Session store (already read by the sessions contribution) | **P3** (decision D2): contribution with two real event kinds — "Utworzono specyfikację" (`info`, from `created`) and "Rozpoczęto sesję" (`session`, per associated non-archived Session, `targetId = relatedSessionId = sessionId`; partial: 100-Session cap)                                                                |
| `attention`              | catalogue signals                                                              | `[]` (spec), sessions `[]`                              | Session readiness (already shown as Session status)                                                                                         | unchanged (Session attention stays Session status; no Engine attention exists)                                                                                                                                                                                                                                               |
| `repository`, `changes`  | `not_implemented`                                                              | `not_implemented`, hidden                               | branch from HEAD, uncommitted ledger exist but no route/UX for project Repository/Changes                                                   | out of scope; stays hidden                                                                                                                                                                                                                                                                                                   |
| `executeTasks`           | `not_implemented`                                                              | `not_implemented`                                       | none (no Tasks)                                                                                                                             | unchanged; no Task rows means no execute control                                                                                                                                                                                                                                                                             |

## 3. Recommended minimal-complete scope (this PR)

Goal: on a real Runtime the Overview shows everything that exists and an honest empty state for
everything that is genuinely empty; "Niedostępne na tym serwerze" remains only for a section whose
source does not exist on this Runtime (non-empty unverified Tasks, which `main` cannot produce).

**Geometry baseline.** PR #124 is merged into `main` and into this branch (decided order: #124
first). Its App Shell decisions of 2026-11-07 apply: Activity history lives in the Overview
Secondary; an empty history neither opens nor reserves the Secondary; it is available on demand
through the header History toggle (`useActivityHistoryPanel`, default taken once at mount from
`activityEvents.length > 0`); Continue session is one fully clickable row; the Overview shows two
columns (work: preparation, Tasks; context: Continue session, Documents) from 1408 px of content
width (`OVERVIEW_TWO_COLUMN_MIN_WIDTH`), so at 1920 with the Secondary closed. The preparation block
belongs to the work column.

### Backend (`packages/specflow-runtime`)

- **P1 Summary.** `createEngineWorkspaceRepository` sets `specification.summary` from the overview
  document of the **same** canonical read that already supplies the manifest: no second registry
  resolve, no full-file read and no content hash per GET. Rules:
  - bounded prefix read of the overview file (at most 32 KB, within a 16–64 KB budget) inside the
    existing `runReadRequest` scope of the workspace read; this needs a small Engine read helper
    beside `readCanonicalSpecSources` (owner: Engine canonical source);
  - Markdown to plain text: drop YAML front matter, the first H1, HTML (tags and comments), images,
    fenced and indented code, tables and headings; links keep their text; emphasis, inline-code and
    list markers are removed; whitespace collapsed; the first non-empty paragraph, truncated at a
    word boundary to 600 characters;
  - `''` for: no overview registered, `document_missing`, `SPEC_SOURCE_INVALID`, a registry race
    (`SPEC_CONFLICT`) or any other read error of the overview. The workspace response never fails
    because of the summary;
  - the workspace `revision` stays the manifest `sourceRevision`; it does **not** change when only
    the overview changes. Clients already refetch after their own document writes; this is
    documented, not fixed.
- **P2 Tasks contribution (temporary source).** A project `tasks` contribution composed in
  `server/app.ts` next to `documents` (owner: Tasks feature): verified manifest `tasks: []` →
  `available {groups: [], completed: 0, total: 0, attention: []}`; non-empty → `not_implemented`.
  This is **deliberately temporary**: on `feat/workflow-kernel` Tasks live in
  `.execution/tasks/<id>.yaml` and the manifest `tasks` stays `[]`. When the kernel merges, both the
  Tasks contribution and `preparationState` move to the kernel Task source and the manifest rule is
  deleted. The API doc says so explicitly.
- **P3 Activity contribution (D2).** Move `activity` from `SpecificationReadModel.sections` to
  `WorkspaceContributions` (like `tasks`/`documents`). Events:
  - **Session started**: one per associated, non-archived Session from the Session list the sessions
    contribution already reads (`createdAt`, title), `kind: 'session'` with
    `targetId = relatedSessionId = sessionId`. Required: `features/specs/workspace/authorize-projection.ts`
    drops a `session` activity item unless its `targetId` is set and allowed. The list is bounded by
    the section's 100 Sessions, so the history is partial by construction (documented);
  - **Specification created**: `kind: 'info'`, emitted only when manifest `created` matches
    `^\d{4}-\d{2}-\d{2}$`, carried as that date string;
  - order: newest first; a date-only value sorts as the start of that calendar day (compared as
    `YYYY-MM-DDT00:00:00Z` against the ISO date-times), so same-day Session events sort above it; at
    most 50 items;
  - Sessions disabled or unreadable → only the Specification event; the section stays `available`
    (the Sessions section already reports the outage).

### UI (`packages/specflow-ui`)

- **P4 Visibility rules decoupled from "no Tasks".** Description/main-document preview, Documents
  summary and Continue session render whenever their data exists; `isEmpty` only selects the
  preparation block and the empty Tasks state.
- **P5 Preparation block.** Shown when there are no Tasks and no recommended Session. With
  `startSessionOffered(data.startSession)` it carries the button that opens
  `/specs/:specId/sessions/new` (`actions.openNewSession`), a fourth New Session entry point beside
  the three in the [New Session UI spec](../../specflow-ui/screens/new-session-ui-spec.md). With
  `sessions_disabled` or `forbidden` it still renders the heading and an explanation of the
  preparation path (§10: an empty Specification must explain it) without a button; new copy, e.g.
  "Zadania przygotowuje agent w sesji. Sesje są wyłączone na tym serwerze." and, for `forbidden`,
  "Nie masz uprawnień do rozpoczęcia sesji dla tej specyfikacji."
  The legacy dialog path is removed. Callers confirmed on the branch tip: the only production caller
  of `runtime.startConversation` is `features/specs/workspace/sections/PreparationSection.tsx`;
  `NewConversationModal`, `openConversationDialog` (`features/specs/workspace/useSpecificationDialogs.ts`)
  and `onNewConversation`/`canStartConversation` (`features/specs/workspace/SpecificationWorkspace.tsx`,
  `features/specs/SpecificationSurface.tsx`, `features/specs/workspace/WorkspaceContext.tsx`) have no
  other production callers. Tests/stories to update: `SpecificationWorkspace.test.tsx`,
  `SpecificationWorkspace.stories.tsx`; `features/sessions/managed/ManagedSession.states.stories.tsx`
  matches the text search and must be checked during removal.
- **P6 Tasks empty state (D1, decided).** Change `isVisible` of `specflow.tasks.task-groups`
  (`features/tasks/uiModule.tsx`, today `!isEmpty || forbidden || unavailable`) so the section is
  also visible when `tasks` is `available` with zero Tasks. `TasksSection` keeps its
  `WorkspaceSection.Header` (**Zadania**, icon `list-checks`) without a count or execute control, and
  below it renders `EmptyState` from `@nevo/ui` with `variant="default"` (the design system's "empty
  block inside a page": bordered, `min-h-40`, glyph size `lg`, centred; not `pane`, which is
  page-sized), `icon="list-checks"`, no `actions` (the preparation block or Continue session owns the
  next step), no `className` overrides. Copy (new keys, `specification` namespace):

  | Key                                   | pl                                                                               | en                                                             |
  | ------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
  | `specification.tasksEmptyTitle`       | Nie ma jeszcze zadań                                                             | No tasks yet                                                   |
  | `specification.tasksEmptyDescription` | Zadania pojawią się tutaj, gdy specyfikacja zostanie przygotowana do realizacji. | Tasks appear here once the specification is prepared for work. |

  The **Zadania** navigator target (`#tasks-heading`, F7) stays on the header. Rendered in
  `v3-*-{1440,1920,390}.png`: one column at 1440 and 390, the work column of the two-column layout at 1920.

- **P7 Activity time and Secondary opening.** The mapper keeps `occurredAt`; rendering formats ISO
  date-times with the existing relative-time helper (`shared/operations/panel/relativeTime.ts`) and
  a date-only `created` as a calendar date **without time-zone conversion** (parse the three
  numbers, never `new Date('YYYY-MM-DD')`), e.g. "8 lis 2026". Under #124's rule that the Secondary
  opens by default only with entries, the "Specification created" event does **not** count as a
  meaningful entry: the Secondary opens by default only when at least one Session (later Task or
  document) event exists; with only the created event it stays closed and opens on demand. Implementation: `SpecificationWorkspace.tsx` passes `hasEntries` as "some event other than the Specification-created one" instead of `data.activityEvents.length > 0`.

Demo parity: the same UI rules apply to demo data unchanged. Demo `activity` stays `available, []`
(D5).

Non-goals: real Tasks (workflow kernel), Repository/Changes, Engine attention, document-edit or
commit events in activity, Task-context Session start, overview-change freshness of `revision`.

## 4. Contract changes

- [Specification Workspace API](../../../reference/api/specification-workspace.md), "Data source":
  project mode — `tasks` is `available` and empty when the verified manifest has no Tasks
  (`not_implemented` otherwise), **marked as a temporary source replaced by the kernel Task source**;
  `activity` is `available`, partial history with exactly two event kinds (Specification created,
  Session started; Session events bounded by the 100-Session section cap; `targetId` =
  `relatedSessionId`); `summary` is the overview's first paragraph as plain text or `''`, and an
  overview change does not change `revision`. `WorkspaceContributions` gains `activity`. No schema
  change in `@nevo/specflow-contracts`; `occurredAt` documented as ISO date-time or `YYYY-MM-DD`.
- [Specification UI spec](../../specflow-ui/screens/specification-workspace-ui-spec.md) §10/§11:
  record P4–P7 (sections independent of Tasks; preparation block including the no-start copy; empty
  Tasks state; the created event does not open the Secondary).
- [New Session UI spec](../../specflow-ui/screens/new-session-ui-spec.md): add the preparation block
  as an entry point following `actions.startSession`.
- `pl.json`/`en.json`: keys `specification.tasksEmptyTitle` / `specification.tasksEmptyDescription` (P6), the two activity titles, the no-start
  preparation copy and the button label (D4).

## 5. Task breakdown

| #   | Task                                                                                                                                                                              | Surface | Tests                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | P1 bounded overview summary in the same canonical read (Engine helper + `features/specs/workspace/engine-repository.ts`)                                                          | backend | unit: Markdown stripping (front matter, H1, HTML, links, images, code, emphasis), 600-char bound, file larger than the prefix, missing/invalid overview and registry race → `''`; no extra registry read |
| T2  | P2 temporary Tasks contribution + composition in `server/app.ts`                                                                                                                  | backend | unit: `[]` → available empty; non-empty → `not_implemented`; project-mode workspace endpoint integration test                                                                                            |
| T3  | P3 activity contribution (move `activity` to contributions; created + Session started)                                                                                            | backend | unit: date-only validation, ordering against ISO, bound, Sessions disabled; **viewer test**: a caller without `session.view` on one Session sees the other events but not that one                       |
| T4  | Docs: workspace API, UI spec, New Session spec (section 4)                                                                                                                        | docs    | `pnpm docs:check`                                                                                                                                                                                        |
| T5  | P4 + P5 Overview rules, preparation block (button / no-start copy), removal of the dialog path after re-confirming callers                                                        | ui      | empty spec, no Session → button (offered) / explanation only (`sessions_disabled`, `forbidden`); with Session → Continue session, no block; description and Documents with 0 Tasks                       |
| T6  | P6 `features/tasks/uiModule.tsx` `isVisible` change + `TasksSection` `EmptyState` (`variant="default"`, `list-checks`, keys of P6); P7 time formatting and Secondary-opening rule | ui      | module visibility test; component test; formatter test for ISO and date-only (no shift in UTC−/UTC+ zones); created-only history keeps the Secondary closed                                              |
| T7  | Stories: replace `ProjectModeNotAvailableYet` with project-mode contract stories (no Session / with Session / Sessions disabled)                                                  | ui      | Storybook play functions; Chromatic                                                                                                                                                                      |
| T8  | Verification on a real Runtime                                                                                                                                                    | verify  | see below                                                                                                                                                                                                |

Order: T1–T3 independent; T5–T6 depend on T2 (T3 for the timeline) on the #124 geometry; T7 after
T5–T6; T4 with the code; T8 last. Targeted test files on Windows, full suites on CI.

**Verification (T8):** `nevo-specflow start` against a project (not `--demo`), screenshots at 1440 and
390 (deviceScaleFactor 2) of: (a) a freshly created Specification with no Session — description,
preparation block opening New Session, empty Tasks state, Documents, Secondary closed, the History
toggle shows "Utworzono specyfikację"; (b) after starting a Session — Continue session row, no block,
Secondary open with the Session event; (c) Sessions disabled — preparation explanation without a
button, no Continue session; (d) **Zadania** in the navigator focuses the Tasks section. Acceptance:
no "Niedostępne na tym serwerze" anywhere on the Overview in (a)–(d).

## 6. Decisions

All decided on 2026-11-08, see [Owner decisions](#owner-decisions-2026-11-08). No open decision
blocks implementation.
