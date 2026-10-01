---
id: ideas.specflow-ui.screens.specs-overview
type: product
title: Specs Overview UI spec
status: draft
scope: specflow
areas: [ui, product, specifications]
tags: [specs, overview, attention, readiness, execution]
read_when:
  - implementing or reviewing the Specs overview
  - defining cross-Spec human steering
summary: >
  Vertical UI specification for the Specs collection: attention, readiness, current work,
  navigation, data/API requirements, component usage, visual rules, and responsive behavior.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.spec-task-screen-structure
  - ideas.specflow-ui.information-navigation-inventory
  - product.specflow.ui.interaction-model
---

# Specs Overview UI spec

## 1. Purpose and ownership

Specs Overview is the human steering surface across Specifications.

It should answer:

1. What actually requires my intervention now?
2. What is ready if I choose to start/continue it?
3. What is currently being worked?
4. What else is active but calm?

"Requires attention" means progress is waiting on a human, not merely that an action exists.

The screen also owns the entry point for creating a new Specification.

It does not own Task evidence, Session transcript, or detailed workflow inspection.
## 2. User use cases

- Find a Specification with a human-required decision/interaction.
- Notice an active Session question/permission/confirmation that is waiting on me.
- Find ready work without confusing it with required attention.
- See current agent work, including batch execution, without inventing one representative Task.
- Open a Specification through a stable neutral row target.
- Use an explicit signal target when I intentionally want to jump to a concrete Task/issue.
- Switch between Active and Archive collection views.
- Create a Specification with only a title, optionally add initial description, and optionally
  continue directly into agent initialization.
## 3. Entry and navigation

Global navigation -> Specs.

The Specification row/identity always opens the Specification. Its destination does not change
because a different issue becomes highest priority.

A concrete signal may expose a separate explicit Task/issue target. An aggregate signal opens the
Specification attention context rather than guessing one Task.

Opening context is navigation only; no workflow mutation occurs.
## 4. Data source / read-model ownership

The overview should consume a backend/application projection designed for human steering.

Frontend may:

- group/sort already-semantic signals for presentation;
- remember local filters/view selection;
- derive purely visual counts from returned items.

Frontend must not infer:

- requires-attention from raw statuses;
- per-action readiness from task lifecycle strings;
- current execution from historical Session associations;
- a representative Task for batch execution.

## 5. API availability / migration status

| Need | New SpecFlow | Old repo evidence | Direction |
| --- | --- | --- | --- |
| Active/archive Spec collection | **missing** | **old-repo-available** via `GET /api/dashboard` | Preserve list identity/summary, replace legacy lifecycle ranking with new semantic steering projection. |
| Create Specification | **missing** | **old-repo-available** via `POST /api/specs` | Preserve scaffolding capability, not the old request shape: target UX requires title only, derives slug internally, uses deterministic workflow unconditionally, allows optional initial description/goal, and may continue into the shared Session-start interaction. |
| Task summary/progress | **missing** | **old-repo-available** in `/api/dashboard` and `GET /api/specs/:source/:slug/task-statuses` | Preserve useful task metadata, but do not treat legacy `ready`/status as complete new readiness model. |
| Human-attention projection | **missing** | partial/legacy workflow-action evidence | Add explicit server-owned attention signals. |
| Current single/batch execution | **missing** | partial Session/task association exists, but association is not authoritative execution | Add explicit current execution projection. |
| Live invalidation | **missing** | **old-repo-available** via `GET /api/events` specs-changed SSE | Reuse event-driven invalidation concept; exact new transport may differ. |

Creation and collection reads are separate application capabilities. Creating a Specification does not
require starting an agent Session; create-and-start composes Specification creation with the common
Session-start capability rather than inventing a separate AI transport.
## 6. Information hierarchy

Per Spec item:

1. identity/title — neutral Specification target;
2. strongest human-facing signal;
3. count/aggregate when several same-category signals exist;
4. at most one concise line of additional meaningful signals;
5. compact progress/current-work metadata.

Attention priority should favor facts that prove the human is blocking useful progress. A live
Session interaction waiting for response is normally stronger than a passive ready-to-start action.

Do not duplicate one Spec across several stacked list groups. Summary counters may overlap because
they are aggregates, not the canonical work queue.

Avoid miniature detail screens inside rows.
## 7. Pseudo-layout

~~~text
┌───────────────┬────────────────────────────────────────────────────────────┐
│ Nevo SpecFlow │ Specs                                      [+ New spec]    │
│               │ [ Active ] [ Archive ]                                     │
│ Specs         │                                                            │
│               │ Requires attention                                         │
│ Settings      │ Spec A                 Agent asks for input          >      │
│               │   TASK-03 review · +1 other signal                         │
│               │ ───────────────────────────────────────────────────────     │
│               │ Spec B                 Owner decision required       >      │
│               │                                                            │
│               │ Ready                                                      │
│               │ Spec C                 2 Tasks ready to start        >      │
│               │                                                            │
│               │ In progress / other active                                 │
│               │ Spec D                 Reviewer · 3 Tasks            >      │
└───────────────┴────────────────────────────────────────────────────────────┘
~~~

The same Spec appears once in the canonical list. Rows are borderless/list-first.
## 8. Screen anatomy

- Workspace header: Specs.
- Collection control: Active / Archive.
- compact Search Specs control when the collection is large enough that scanning/grouping alone is
  insufficient; Archive should expect this earlier than Active because it grows monotonically.
- Human-steering groups or equivalent flat list with equally clear semantics.
- Spec summary rows.
- Optional create-spec action only when product contract exists.

## 9. Responsive contract

Wide/Compact:
- same information hierarchy;
- global nav may be persistent or Drawer;
- overview remains one Primary surface.

Narrow:
- same groups/signals;
- compact row text may reduce tertiary metadata;
- concrete Task signal remains directly tappable;
- no critical signal hidden behind hover or secondary-only detail.

## 10. Interaction flows

### Neutral Spec
Click row/title -> Specification.

### Explicit Task/issue signal
Click explicit TASK-03 signal/action -> Specification with local TASK-03 detail opened when useful.
This does not change the neutral row destination.

### Aggregate signal
"3 Tasks require review" -> Specification attention/task context; user chooses the concrete Task.

### Create Specification

Baseline:

~~~text
New specification
  title *                    required
  initial description       optional / collapsed by default

  slug / workflow mode      not user fields

[Create]
[Create and start with agent]
~~~

Create produces the deterministic Specification scaffold. The application derives slug/technical
defaults; there is no Legacy/Deterministic choice.

Create-and-start continues into the shared Session-start interaction (agent/provider selection as
needed, then normal composer/session experience). Do not maintain a separate rich prompt editor
inside the create dialog.

### Collection switch
Active/Archive changes collection state, not workflow state.

### Search
Search narrows the selected collection. Local filtering is fine for a bounded loaded set; server
search follows shared debounce/cancellation rules when needed.
## 11. States

- loading: preserve header/filter geometry, restrained row skeletons;
- empty active: concise empty state with New specification action;
- archive empty: concise local empty state;
- requires attention: human intervention is actually required;
- ready: actionable but calm; do not style as alert;
- working: active progress without stealing attention;
- partial signal failure: keep Spec identity/list usable and mark unavailable projection locally;
- stale/reconnecting transport: subtle connection feedback without rewriting canonical semantics.
## 12. Data loading, events, and Refresh

This screen inherits
[Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md).

### Initial/live behavior

- fetch only the selected Active or Archive collection;
- relevant Spec change events invalidate/update affected collection items;
- do not fetch every Task document or every Session merely to render the overview;
- when many Spec-change events arrive in one filesystem/runtime burst, coalesce the resulting
  collection cache update rather than rendering once per raw event.

### Refresh

Expose one screen-level **Refresh** in the Specs header/overflow.

It refreshes only the currently displayed collection projection.

It does not automatically refresh:

- Task document bodies;
- Full Session histories;
- Settings;
- file/diff content.

Window-focus refetch and a slow safety refresh may be used as backstops. Avoid short polling when
relevant change events already invalidate the collection.

During refresh, retain the current list and show lightweight refreshing feedback.

The detailed row/group/aggregation contract is defined in
[Spec steering UI spec](../components/spec-steering-ui-spec.md).

## 13. Component / composition map

| Need | Component/composition |
| --- | --- |
| Shell/workspace | AppShell + AppWorkspace |
| Header | WorkspaceHeader |
| Active/Archive | Tabs or SegmentedControl after visual composition review |
| Groups | product composition + Typography |
| Rows | product-owned SpecSummaryItem using semantic list/button/link primitives |
| Status cue | StatusIndicator/Badge sparingly |
| Exceptional page error | Alert |
| Loading | Skeleton |
| Empty | EmptyState |

Do not force the work queue into DataTable unless final content proves genuinely tabular.

## 14. Visual/token contract

- workspace: existing workspace surface;
- titles: \`text-content-primary\`;
- signal explanation: \`text-content-secondary\`;
- tertiary metadata: \`text-content-muted\`;
- row hover/selected: shared interaction tokens;
- dividers: \`border-divider\` / \`border-border-subtle\` only when whitespace is insufficient;
- attention: semantic warning/info/error treatment according to actual meaning, not decorative color;
- ready: visible but calmer than requires-attention;
- working: running/activity tone without warning treatment.

## 15. Local containment rules

- no Card per Spec row by default;
- no Card per group;
- no nested signal Cards;
- use rows, whitespace, headings, and dividers;
- a top-level exceptional outage/attention block may earn stronger containment;
- concurrent signals live inside the row hierarchy, not separate boxes for each signal.

## 16. Accessibility / focus

- row and nested signal targets must have distinct accessible names;
- keyboard user can open neutral Spec or concrete actionable signal;
- group semantics cannot rely on color alone;
- focus after navigation follows product route/surface ownership.

## 17. Storybook scenarios

- multiple concurrent attention signals on one Spec;
- Spec-level attention;
- Task-ready;
- active single Task;
- active batch;
- agent-remediable issue / other-active signal;
- quiet;
- Active empty;
- Archive populated;
- Archive with many Specs + search;
- narrow direct Task signal.

## 18. Acceptance criteria

- requires-attention is reserved for human-blocking situations;
- ready remains visually calmer and does not imply urgency;
- a Spec appears once in the canonical Active queue;
- row/identity always opens Specification;
- explicit signal targets may jump deeper without changing row semantics;
- aggregate signals never invent a representative Task;
- batch remains batch-shaped;
- no current-work language is derived from historical Session association;
- New specification works with title only and does not require an initial prompt;
- create-and-start reuses the shared Session/composer path;
- repeated Specs are rows, not Card soup.
## 19. Open questions

- exact Active/Archive control;
- exact ordering/tie-break inside multiple simultaneous **attention** signals beyond the known rule
  that an active Session waiting on a human is high urgency;
- grouped semantic sections versus one flat ordered Active queue; both remain valid if they preserve
  attention/ready/working semantics without duplicating Specs;
- exact archive interaction;
- exact realtime transport in new Runtime.