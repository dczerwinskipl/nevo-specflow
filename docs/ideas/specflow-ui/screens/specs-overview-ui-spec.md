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

It should answer, before drill-down:

1. What requires me?
2. What is ready if I want to continue?
3. What is currently being worked?
4. What has an issue/remediation path?
5. What is quiet?

It does not own Task evidence, Session transcript, or detailed workflow inspection.

## 2. User use cases

- Find a Specification or Task requiring owner review/decision.
- Find ready work without confusing it with required attention.
- See current agent work, including batch execution, without inventing one representative Task.
- Open a neutral Specification.
- Open the responsible Task/Spec context directly from a concrete signal.
- Switch between Active and Archive collection views.
- Recover orientation after reload/deep link.

## 3. Entry and navigation

Global navigation -> Specs.

Neutral Spec identity opens the Specification.

A Task-specific signal opens the Specification with that Task context already selected/open.

A Spec-level signal opens the Specification itself.

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

| Need | New SpecFlow | Legacy Nevo | Direction |
| --- | --- | --- | --- |
| Active/archive Spec collection | **missing** | **legacy-available** via \`GET /api/dashboard\` | Preserve list identity/summary, replace legacy lifecycle ranking with new semantic steering projection. |
| Task summary/progress | **missing** | **legacy-available** in \`/api/dashboard\` and \`GET /api/specs/:source/:slug/task-statuses\` | Preserve useful task metadata, but do not treat legacy \`ready\`/status as complete new readiness model. |
| Human-attention projection | **missing** | partial/legacy workflow-action evidence | Add explicit server-owned attention signals. |
| Current single/batch execution | **missing** | partial Session/task association exists, but association is not authoritative execution | Add explicit current execution projection. |
| Live invalidation | **missing** | **legacy-available** via \`GET /api/events\` specs-changed SSE | Reuse event-driven invalidation concept; exact new transport may differ. |


### Legacy field evidence

Legacy \`SpecificationSummary\` already exposes:

~~~text
id
specId
slug
title
status
source
priority
created
updatedAt
path
overviewFile
summary
tasks[]
lanes[]
nextTask
metrics {
  total
  actionable
  completed
  abandoned
  inImplementation
  inReview
  ready
  stageCounts
  progress
}
~~~

Legacy Task summary fields include:

~~~text
id
title
status
stage
order
dependsOn[]
blockedBy[]
ready
terminal
file
~~~

The new overview can migrate identity/title/summary/timestamps/progress inputs, but **must not carry
forward** legacy \`ready\`, \`nextTask\`, \`stage\`, or status ranking as the new steering truth.
\`signals[]\` and \`currentExecutions[]\` are genuinely new semantic projections.

### Proposed read API

Illustrative:

~~~text
GET /api/specs?collection=active
GET /api/specs?collection=archive

optional later/server-backed filtering:
GET /api/specs?collection=archive&q=recovery
~~~

Response:

~~~text
{
  revision,
  generatedAt,
  collection,
  specs: [
    {
      id,
      slug,
      title,
      summary?,
      updatedAt,
      lastMeaningfulActivityAt?,
      workflow: {
        definitionId?,
        phase,
        semanticStatus,
        label?
      },
      progress: {
        completed,
        actionable,
        total
      },
      signals: [
        {
          id,
          kind: "attention" | "ready" | "working" | "issue" | "quiet",
          scope: "spec" | "task",
          taskId?,
          label,
          reason?,
          priority,
          count?,
          target: { specId, taskId? }
        }
      ],
      currentExecutions: [
        {
          sessionId,
          agentRole,
          taskIds[],
          currentActivity?: { kind, label },
          startedAt?
        }
      ]
    }
  ]
}
~~~

Field coverage notes:

- `revision/generatedAt` support cache validation and explicit refresh without inventing freshness in
  the client.
- `lastMeaningfulActivityAt` is optional supporting metadata; it must not outrank human attention.
- `signals[]` is the semantic steering source. The UI does not reconstruct attention/ready/issue
  from lifecycle strings.
- `count` allows the server to represent a meaningful aggregate when the backend already knows the
  grouping; the UI may also count homogeneous returned signals when that is purely presentational.
- `currentExecutions[]` is plural deliberately. Do not assume a Specification can have only one
  concurrently relevant execution/read-only reviewer. Each execution remains batch-shaped through
  `taskIds[]`.

Behavior:

- one Spec may expose several simultaneous signals;
- server preserves semantic signal multiplicity;
- UI places a Spec in at most one primary steering group based on its highest-priority human-facing
  signal, then preserves additional meaningful signals inside the same row; do not duplicate one Spec
  across several groups merely because it has several signals;
- target identity is stable enough for one-click context/deep link;
- current execution is authoritative and batch-shaped;
- Archive is primarily a historical collection: default presentation should favor recency/identity
  rather than forcing archived Specs back into active attention/ready group semantics.

No write endpoint belongs to the collection screen except future create/archive operations, which
should be specified separately when their interaction is designed.

## 6. Information hierarchy

Per Spec item:

1. identity/title;
2. strongest human-facing signal;
3. count/aggregate when several same-category signals exist;
4. concise secondary progress/workflow/current-work metadata;
5. last meaningful activity only if useful.

Avoid miniature detail screens inside rows.

## 7. Pseudo-layout

~~~text
┌───────────────┬────────────────────────────────────────────────────────────┐
│ Nevo SpecFlow │ Specs                                                      │
│               │ [ Active ] [ Archive ]                                     │
│ Specs         │                                                            │
│               │ Requires attention                                         │
│ Settings      │ Spec A                 3 Tasks require review        >      │
│               │   TASK-03 owner decision · Reviewer working on 2 Tasks     │
│               │ ───────────────────────────────────────────────────────     │
│               │ Spec B                 Specification approval required >    │
│               │                                                            │
│               │ Ready                                                      │
│               │ Spec C                 TASK-05 ready to start        >      │
│               │                                                            │
│               │ In progress                                                │
│               │ Spec D                 Reviewer · 3 Tasks            >      │
│               │                                                            │
│               │ Other active                                               │
│               │ Spec E                 No immediate action           >      │
└───────────────┴────────────────────────────────────────────────────────────┘
~~~

Rows are borderless/list-first. Group headings + whitespace create hierarchy.

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
Spec title/neutral row target -> Specification.

### Task signal
TASK-03 requires review -> Specification + TASK-03 detail in one navigation action.

### Aggregate signal
3 Tasks require review -> Specification with relevant attention group visible; user can then choose
the concrete Task.

### Collection switch
Active/Archive changes collection state, not workflow state.

### Search
Search narrows the currently selected collection by Spec identity/title/summary and, where the backend
supports it, Task/signal labels.

For a bounded already-loaded collection, filter locally.

If search becomes server-backed, use the shared 150–300 ms network debounce/cancellation rules.
Clearing search restores the same collection/grouping without workflow mutation.

## 11. States

- loading: preserve header/filter geometry, restrained row skeletons;
- empty active: concise empty state, not a large Card;
- archive empty: concise local empty state;
- partial signal failure: keep Spec identity/list usable and mark unavailable projection locally;
- stale/reconnecting live transport: show subtle connection feedback without rewriting canonical
  Spec semantics.


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
- issue/remediation;
- quiet;
- Active empty;
- Archive populated;
- Archive with many Specs + search;
- narrow direct Task signal.

## 18. Acceptance criteria

- attention vs ready vs working is immediately distinguishable;
- one Spec is not visually duplicated across several steering groups;
- Archive reads as historical browsing rather than an active-work dashboard;
- one click reaches responsible context;
- neutral row does not invent Task selection;
- batch remains batch-shaped;
- no current-work language derived from historical Session association;
- repeated Specs are rows, not Card soup.

## 19. Open questions

- exact Active/Archive control;
- final signal aggregation/sorting policy;
- create/archive interactions;
- exact realtime transport in new Runtime.
