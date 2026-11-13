# Overview: workflow state, grouping and attention

Analysis for the control-center Overview, updated with the owner decisions of 2026-11-13 (1A–7A),
on feature head 13afabe3. Mock: `SpecFlow/Screens/Specification control center (mock)`; screenshots
`ovw2-*.png`. Contract: `docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md`.

## 1. Ownership (decided, 5A)

| Concern | Owner | Holds |
| --- | --- | --- |
| **Workflow state** | Engine (kernel) | Authoritative states, transitions, execution semantics. Exposes **neutral facts** per Task: preparation status, position (kind, step, attempt), run exists, terminal outcome, broken, dependency state, start blockers. |
| **Attention** | Attention projection (ADR 0019 + extension) | Which subjects need a person: reason, required actor, available action. Never inferred from a status or group name. |
| **Grouping** | Dashboard configuration (data) | Groups, labels, order, facts→group mapping, summary prominence, default collapse. Default is internal data; per project or per user later. |

Rules: a Task is in exactly one group and may independently require attention. Available actions
are not attention (ready-to-start offers Start, a draft offers Approve; neither is attention by
itself). No Task appears twice across Overview sections (Now's explanation excepted); the full
inventory lives on the Tasks page.

## 2. What contradicted this before

1. Ready-to-start and draft approval shown as attention (ADR 0019 / kernel: no attention just for
   being ready; drafts are not `ready`). Removed; draft rows are neutral.
2. "Active tasks" built from hard-coded state filters. Replaced by the configured grouping.
3. **T8a put presentation into the Engine:** `TaskLane` / `laneOf` (`workflow/operations/execution-read.ts`)
   mixes preparation status, position and a presentation classification; `TaskResource.lane` carries
   it into the contract and the Runtime derives the status line from it (`STATUS_OF_LANE`). The
   Runtime's `GROUPS` constant maps lanes to groups in code.
4. The Runtime sends raw reason codes (`"<step>: <reason>"`) in Requires attention.

## 3. Decisions applied in the mock

- **1A** `tasks-stuck` (Engine: no open Task can progress without the owner) → one
  Specification-level item, Task links, action **Review tasks**; no per-draft item. Mock state `stuck`.
- **2A** Start blockers of approved, not-started Tasks: classified (table in the contract). Mock:
  T-07 `context-unresolved` → attention with **Edit context**; T-03 waiting for T-02 → not attention,
  Waiting group, "Waiting for T-02" on the row. The actor is carried; shown only when it is not the
  viewer ("Needs the spec writer").
- **3A** Now: "It cannot continue now: T-04 is a draft, T-05 is on hold and no other task is open."
  with links; no action, no repeated attention entry.
- **4A/7A** "Tasks" summary: rows for Needs approval, In progress, Ready to start, Waiting,
  **On hold** (own row, not folded with terminal groups); Done and Cancelled as one compact link
  line; Tasks named in Requires attention are counted, not named.
- **5A** `dashboard-grouping.stories-support.ts`: neutral facts + declarative default config,
  first match wins, "Other" fallback; both the Overview summary and the Tasks page use it.
- **6A** No checkboxes or bulk actions; F12 deferred.

## 4. Where the default configuration lives (recommendation)

**Runtime presentation layer** (`specflow-runtime/src/features/tasks/workspace/`), not the UI:
the accepted contract already has the backend supply groups as data in display order; one
evaluation serves the Overview summary, the Tasks page and other clients (CLI, MCP); later project
or user overrides need Runtime-owned settings; the UI stays render-only. Not the Engine/kernel
(no presentation concepts there). Cost of the alternative (UI): duplicated mapping per client and
a break with the "groups supplied by the backend" rule.

## 5. Engine/Runtime changes requiring separate implementation work

1. Remove `TaskLane` / `laneOf` from the Engine (`execution-read.ts`, export in `workflow/index.ts`);
   expose neutral Task facts in the read model.
2. Contracts: replace `TaskResource.lane` / `TaskLaneSchema` with facts; Runtime `taskStatusOf` /
   `STATUS_OF_LANE` derive the status line from facts.
3. Dashboard default grouping config module in the Runtime presentation layer (validated at load),
   replacing `GROUPS` in `engine-contribution.ts`; groups sent as data with summary prominence.
4. Attention projection extension: start blockers of approved, not-started Tasks that need a person
   → items with reason (code + human text), required actor, action (command + label); dependency
   waiting and `context-awaited` stay non-attention.
5. Specification-level `tasks-stuck` item with affected Task ids (`attention.taskIds`, always set)
   through the Runtime attention list, action opening the Tasks page at those Tasks.
6. Human-readable attention reasons and a per-Task attention flag on the Task read.
7. Now explanation data: `tasks-stuck` Task ids with each Task's blocking fact.
8. Per-Specification Sessions read (this Specification's Sessions; recommended first).

## 6. Review refinements (2026-11-14)

- **P1 Ready to start contradicted the facts** (T-07 was there while its context blocker prevents
  starting). Config-only fix: "Ready to start" requires `startBlocked: false`; a new **Cannot
  start** group takes approved, not-started Tasks with a start blocker other than dependencies.
  Chosen over renaming to "Not started" because the label then matches what the person can do.
- **P2 "named in Requires attention" was false** in the stuck state. Group rows now read
  "1 task · T-04": Tasks referred to elsewhere appear by id only, others with id and title.
- **P2 stuck state repeated the diagnosis.** Now keeps the explanation and Task links; the attention
  item says the intervention: "Resolve 2 blocking tasks · Approve, resume or cancel them so the
  specification can finish", action **Review tasks**.
- **Review tasks (decided):** `/specs/:specId/tasks?blocking=specification`: one validated search
  value (routing contract: router-owned, validated search, absence = default), resolved against the
  current `tasks-stuck` ids, never an id list in the URL; normal grouping kept; a visible filter bar
  "Blocking specification · 2 tasks" with a clear button; section count "2 of 7 shown". Push on
  open, replace on clear.
- **Neutral facts stand alone:** the Task facts and attention stay in the Task read model for CLI,
  MCP and other consumers; groups are only an optional presentation.

Still open (small): whether Done/Cancelled compact links open the Tasks page expanded at that group
(assumed yes).
