# Overview: workflow state, grouping and attention

Analysis for the control-center Overview after merging the feature head 84c78b36 (production T11).
Mock: `SpecFlow/Screens/Specification control center (mock)`, screenshots `ovw2-*.png`.

## 1. What the code and accepted contracts already decide

| Concern | Where it lives today | Accepted rule |
| --- | --- | --- |
| **Workflow state** (authoritative) | Engine runs + action projection (`inspectActions`, `WorkflowRunPosition`, `StartBlocker`, gates) | The UI never derives behaviour from labels; actions come from the projection. |
| **Attention** (human intervention) | Engine `deriveAttention` (`workflow/attention/model.ts`, `operations/attention.ts`), reasons `owner-action`, `human-step`, `model-missing`, `provider-not-chosen`, `session-unavailable`, `archetype-missing`, `tasks-stuck`, `task-escalated`; plus broken Tasks and Session attention, merged in the Runtime (`features/tasks/workspace/engine-contribution.ts`) into the Overview's **Requires attention** | ADR 0019 + kernel: attention is **derived, never stored**, at most one item per subject, none for a subject that is active, not started or terminal, **none for a Task that is not `ready`**, and **a Task never gets attention just because it is ready** (owner starts Tasks; F12 "Run selected Tasks"). Overview order: Requires attention first ([Specification Overview](../../../product/specflow/ui/specification-overview.md)). |
| **Grouping** (presentation) | Engine `laneOf` → `TaskLane` (`needs-approval`, `in-progress`, `ready`, `waiting`, `blocked`, `done`, `ended`, `held`, `cancelled`, `broken`); Runtime `GROUPS` constant maps lanes to the Overview's groups (Needs approval … On hold or cancelled) sent as data | "Task groups are configured by the project and supplied by the backend in display order"; "do not apply the Specifications list's Requires attention / Active / Ready / Draft taxonomy to Tasks" (Specification screen open items). |

## 2. Contradictions in my previous mocks (actual)

1. **Ready-to-start Tasks as attention** (`Start Design` row): contradicts ADR 0019 / kernel ("no attention just because ready"). Removed.
2. **Draft approval as attention** (`Approve` row): not an Engine attention reason; drafts are not `ready`. Removed from Requires attention; drafts stay visible in their group (Needs approval). Whether approval *should* become attention is an open product decision (below).
3. **"Cannot start: context missing" on a not-started Task as attention**: a start blocker of a not-started Task is not Engine attention (nothing is derived for not-started subjects). Removed; the Task page/row shows the blocker.
4. **"Active tasks" built from hard-coded state filters** (`status === 'ready' && kind === 'active'`): bypassed the configured grouping. Replaced by a summary of the configured groups.

## 3. Presentation-only issues (fixed in the mock)

- Long titles vs action buttons on Narrow: the action moves under the title and reason.
- Group count orphaned on Narrow: folded into the row text.
- Tasks page checkboxes implied a working bulk action: removed until F12 defines "Run selected tasks" (today Execute opens a "not implemented" dialog). Selection never bypasses workflow transitions when it returns: it starts each Task through `startTaskExecution`.
- Attention on the Tasks page: the row keeps its group and shows "Requires attention · <reason>" (attention is a flag, not a state).

## 4. The model the mock now follows

```text
Workflow state (Engine, authoritative) ──► lanes (Engine classification of state)
                                         ──► grouping config (presentation: groups over lanes) ──► Tasks page groups, Overview group summary
                                         ──► attention projection (Engine-derived items + broken + Sessions) ──► Requires attention, row flag
```

- Overview: **Requires attention** (attention projection, actions from the projection) → **Tasks** (one row per non-empty group of the configured grouping: count + a few titles; a Task already in Requires attention is counted, not named) → Sessions, Documents.
- Tasks page: groups from the same grouping config; attention as a row marker.
- Now: Specification-level state and progress.

## 5. Backend changes this implies (propose; not implemented)

1. **Grouping as data.** Move the Runtime `GROUPS` constant into a default grouping configuration (project-level, overridable), mapping lanes — later workflow positions (step ids/kinds per Task Type) — to named, ordered groups. The Runtime keeps delivering groups as data; the UI renders them.
2. **Lanes stay a state classification**, without attention meaning. `needs-approval` is preparation status, not attention; keep the name or rename to `draft` to avoid the overlap.
3. **Attention per Task as a flag on the Task read** (from the existing `deriveAttention` + broken), so the Tasks page can mark rows; the Overview list stays the aggregated items.
4. **Human-readable attention reasons** (today the Runtime sends `"<step>: <reason code>"`): a step title and a localized reason, plus the projection's action for the item (e.g. start the next step).

## 6. Unresolved product decisions (not invented in the mock)

1. Is **draft approval** attention (owner action that blocks the Specification), or only the Needs approval group? Today: group only.
2. Is a **start blocker** of an approved, not-started Task (missing context, definition changed) attention? Today: not (kernel rule); shown on the row.
3. Should **`tasks-stuck`** name the Tasks that keep the Specification from progressing (drafts, on hold) in Now?
4. Which groups the Overview's Tasks summary shows (all non-empty groups, or only non-terminal ones with Done / On hold folded into one line).
5. Whether "Run selected tasks" (F12) returns to the Tasks page, and its parallelism (open in plan 06).
6. Configurable grouping scope: per project, per Specification archetype, or per Task Type.
