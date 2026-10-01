---
id: ideas.specflow-ui.components.spec-steering
type: product
title: Spec steering collection and item UI spec
status: draft
scope: specflow
areas:
  - ui
  - product
  - specifications
tags:
  - specs
  - steering
  - attention
  - ready
  - working
  - issue
read_when:
  - implementing Specs Overview steering groups/items
  - creating Storybook/Figma fixtures for Spec signals
  - deciding how concurrent Spec/Task signals aggregate
summary: >
  Detailed product presentation contract for cross-Spec steering rows: group priority,
  concurrent signals, direct context targets, active/archive behavior, payload-backed fixtures,
  data loading, and cardless list composition.
related:
  - ideas.specflow-ui.components
  - ideas.specflow-ui.screens.specs-overview
  - ideas.specflow-ui.data-loading-refresh-and-eventing
---

# Spec steering collection and item UI spec

## 1. Responsibility

The steering collection helps the human choose the next context to inspect.

It is not a general analytics dashboard.

Each visible item must make these questions cheap:

- Which Spec is this?
- Does anything require me?
- Is something ready?
- Is an agent currently working?
- Is there an issue/remediation path?
- What happens if I click this signal?

## 2. Component ownership

Product-owned:

~~~text
SpecSteeringCollection
├── SteeringGroup
└── SpecSteeringItem
    ├── SpecIdentityTarget
    ├── PrimarySignalTarget
    ├── SecondarySignals
    ├── ProgressMetadata
    └── CurrentExecutionMetadata
~~~

Use Nevo UI Typography, Link/Button primitives, StatusIndicator/Badge sparingly, Separator, Tabs or
SegmentedControl for Active/Archive, EmptyState, Skeleton.

Do not create a generic DashboardCard abstraction.

## 3. Input payload

The collection consumes the Specs overview projection.

Relevant item shape:

~~~text
{
  id,
  slug,
  title,
  summary?,
  updatedAt,
  lastMeaningfulActivityAt?,
  workflow,
  progress,
  signals[],
  currentExecutions[]
}
~~~

Signals:

~~~text
{
  id,
  kind: attention | ready | working | issue | quiet,
  scope: spec | task,
  taskId?,
  label,
  reason?,
  priority,
  count?,
  target
}
~~~

## 4. Primary grouping policy

One Spec appears in **one primary group** in Active view.

Recommended human-facing priority:

~~~text
requires attention
issue requiring intervention
ready
working
quiet / other active
~~~

This is presentation priority, not workflow authority.

If the same Spec has:

- TASK-03 requires review;
- TASK-05 ready;
- Reviewer working on TASK-02/03;

then the Spec appears once under Requires attention and preserves the other meaningful signals inside
that row.

Do not duplicate the Spec into Attention + Ready + Working groups.

## 5. Signal target model

Two target types must remain visibly/semantically distinct.

### Neutral identity target

~~~text
Spec A
~~~

opens Specification without selecting a Task.

### Concrete signal target

~~~text
TASK-03 requires review
~~~

opens Specification + TASK-03 context.

A Spec-level signal:

~~~text
Specification approval required
~~~

opens Specification-level decision context.

Aggregate signal:

~~~text
3 Tasks require review
~~~

opens the Specification with the relevant attention group/filter visible, not one arbitrarily chosen
Task.

## 6. Row anatomy

Preferred shape:

~~~text
Spec A
3 Tasks require review                                  >
TASK-03 owner decision · Reviewer working on 2 Tasks
6 / 9 Tasks · Implementation
──────────────────────────────────────────────────────────
~~~

Hierarchy:

1. Spec identity;
2. strongest signal;
3. one concise line of additional meaningful signals;
4. progress/workflow metadata.

Do not display every raw signal when there are many.

For overflow:

~~~text
TASK-03 owner decision · TASK-05 ready · +2 more
~~~

Clicking +N more opens the Spec context, not a floating mega-tooltip.

## 7. Group formatting

Groups are typography + spacing, not Cards.

~~~text
Requires attention
Spec A ...
────────────────
Spec B ...

Ready
Spec C ...

In progress
Spec D ...

Other active
Spec E ...
~~~

Use clear section spacing and optional subtle dividers between rows.

Do not put a background box around every group.

## 8. Active versus Archive

### Active

Steering semantics dominate.

Group by attention/ready/working/other.

### Archive

Historical browsing dominates.

Default:

~~~text
Archive

Search specs…

Spec Z
Completed Sep 24
12 / 12 Tasks · last activity Sep 24

Spec Y
Completed Sep 18
...
~~~

Do not force archived Specs into Requires attention / Ready / Working groups based on stale
historical signals.

Search/filter becomes more important in Archive because the collection grows monotonically.

## 9. Payload-backed fixtures

### SS-01 — one attention signal

Fixture: \`spec-steering/attention-task\`

~~~json
{
  "id": "spec-a",
  "title": "Deterministic admission",
  "progress": { "completed": 5, "actionable": 1, "total": 8 },
  "signals": [
    {
      "id": "sig-1",
      "kind": "attention",
      "scope": "task",
      "taskId": "TASK-03",
      "label": "TASK-03 requires review",
      "reason": "Owner decision required",
      "priority": 100,
      "target": { "specId": "spec-a", "taskId": "TASK-03" }
    }
  ],
  "currentExecutions": []
}
~~~

Mock:

~~~text
Spec A
TASK-03 requires review                                  >
Owner decision required
5 / 8 Tasks
~~~

---

### SS-02 — concurrent attention + ready + working

Fixture: \`spec-steering/concurrent-signals\`

~~~json
{
  "id": "spec-a",
  "title": "Deterministic admission",
  "progress": { "completed": 5, "actionable": 2, "total": 9 },
  "signals": [
    {
      "id": "review-3",
      "kind": "attention",
      "scope": "task",
      "taskId": "TASK-03",
      "label": "TASK-03 requires review",
      "priority": 100,
      "target": { "specId": "spec-a", "taskId": "TASK-03" }
    },
    {
      "id": "ready-5",
      "kind": "ready",
      "scope": "task",
      "taskId": "TASK-05",
      "label": "TASK-05 ready",
      "priority": 60,
      "target": { "specId": "spec-a", "taskId": "TASK-05" }
    },
    {
      "id": "working-2",
      "kind": "working",
      "scope": "task",
      "taskId": "TASK-02",
      "label": "Reviewer working",
      "priority": 40,
      "target": { "specId": "spec-a", "taskId": "TASK-02" }
    }
  ],
  "currentExecutions": [
    {
      "sessionId": "session-23",
      "agentRole": "Reviewer",
      "taskIds": ["TASK-02", "TASK-03"]
    }
  ]
}
~~~

Mock:

~~~text
Requires attention

Spec A
TASK-03 requires review                                  >
TASK-05 ready · Reviewer working on 2 Tasks
5 / 9 Tasks
~~~

One row, one primary group.

---

### SS-03 — aggregate attention

Fixture: \`spec-steering/aggregate-attention\`

~~~json
{
  "id": "spec-a",
  "signals": [
    {
      "id": "review-aggregate",
      "kind": "attention",
      "scope": "task",
      "label": "3 Tasks require review",
      "count": 3,
      "priority": 100,
      "target": { "specId": "spec-a" }
    }
  ]
}
~~~

Mock:

~~~text
Spec A
3 Tasks require review                                   >
~~~

The aggregate target must not pretend one Task is the destination.

---

### SS-04 — Spec-level attention

Fixture: \`spec-steering/spec-attention\`

~~~json
{
  "id": "spec-b",
  "signals": [
    {
      "id": "spec-approval",
      "kind": "attention",
      "scope": "spec",
      "label": "Specification approval required",
      "reason": "Owner decision required",
      "priority": 100,
      "target": { "specId": "spec-b" }
    }
  ]
}
~~~

Mock:

~~~text
Spec B
Specification approval required                          >
Owner decision required
~~~

No Task is selected.

---

### SS-05 — ready

Fixture: \`spec-steering/ready\`

~~~json
{
  "id": "spec-c",
  "signals": [
    {
      "id": "ready-5",
      "kind": "ready",
      "scope": "task",
      "taskId": "TASK-05",
      "label": "TASK-05 ready to start",
      "priority": 60,
      "target": { "specId": "spec-c", "taskId": "TASK-05" }
    }
  ]
}
~~~

Mock:

~~~text
Ready

Spec C
TASK-05 ready to start                                  >
~~~

Ready is visible but calmer than required attention.

---

### SS-06 — batch working

Fixture: \`spec-steering/batch-working\`

~~~json
{
  "id": "spec-d",
  "signals": [
    {
      "id": "work-1",
      "kind": "working",
      "scope": "spec",
      "label": "Reviewer · 3 Tasks",
      "priority": 40,
      "target": { "specId": "spec-d" }
    }
  ],
  "currentExecutions": [
    {
      "sessionId": "session-44",
      "agentRole": "Reviewer",
      "taskIds": ["TASK-02", "TASK-03", "TASK-04"],
      "currentActivity": {
        "kind": "tool",
        "label": "Reviewing changes"
      }
    }
  ]
}
~~~

Mock:

~~~text
In progress

Spec D
Reviewer · 3 Tasks
Reviewing changes…
~~~

Do not choose TASK-03 as representative.

---

### SS-07 — issue + remediation

Fixture: \`spec-steering/issue\`

~~~json
{
  "id": "spec-e",
  "signals": [
    {
      "id": "issue-3",
      "kind": "issue",
      "scope": "task",
      "taskId": "TASK-03",
      "label": "TASK-03 needs remediation",
      "reason": "Workspace state must be resolved",
      "priority": 80,
      "target": { "specId": "spec-e", "taskId": "TASK-03" }
    }
  ]
}
~~~

Mock:

~~~text
Needs attention

Spec E
TASK-03 needs remediation                               >
Workspace state must be resolved
~~~

If product chooses to group issues separately from required owner decisions, visual weight still must
make both easy to distinguish.

---

### SS-08 — quiet

Fixture: \`spec-steering/quiet\`

~~~json
{
  "id": "spec-f",
  "signals": [
    {
      "id": "quiet",
      "kind": "quiet",
      "scope": "spec",
      "label": "No immediate action",
      "priority": 10,
      "target": { "specId": "spec-f" }
    }
  ],
  "progress": { "completed": 4, "actionable": 0, "total": 7 }
}
~~~

Mock:

~~~text
Other active

Spec F
No immediate action
4 / 7 Tasks
~~~

---

### SS-09 — archived

Fixture: \`spec-steering/archive-row\`

~~~json
{
  "id": "spec-z",
  "title": "Previous workflow hardening",
  "updatedAt": "2026-09-24T15:20:00Z",
  "progress": { "completed": 12, "actionable": 0, "total": 12 },
  "workflow": {
    "semanticStatus": "completed",
    "phase": "archive"
  },
  "signals": []
}
~~~

Mock:

~~~text
Spec Z
Completed Sep 24
12 / 12 Tasks · last activity Sep 24
~~~

## 10. Interaction behavior

### Nested targets

Do not make the whole row one ambiguous click target if a concrete nested signal must deep-link to a
Task.

A safe pattern:

- title/identity = Spec target;
- primary signal = concrete target;
- secondary signal with concrete Task = own target if still readable;
- whitespace/non-interactive metadata is not accidentally clickable.

Keyboard ordering must remain predictable.

### Hover/focus

Hover treatment belongs to the actual target, not the entire page-width group if only one small
nested target is actionable.

## 11. Data loading / events

Use one collection projection for the selected Active/Archive collection.

A Spec/Task semantic event should update/invalidate only affected item(s) where possible.

When a burst affects several Tasks in the same Spec, batch/coalesce into one resulting Spec row update.

Do not render one row update per raw Task/provider event.

## 12. Refresh

One collection Refresh in header/overflow.

Refreshes selected collection only.

Does not hydrate Task details, Session histories, or documents.

Keep visible rows while refreshing.

## 13. Visual/token contract

- group heading: clear but not oversized;
- identity: primary text;
- primary signal: semantic tone based on meaning;
- secondary signals: secondary text;
- progress/activity metadata: muted;
- dividers subtle;
- attention stronger than ready;
- working uses running/activity tone;
- quiet neutral;
- no decorative different background per group.

## 14. Containment rules

- no Card per Spec;
- no Card around each group;
- no chip/badge for every signal;
- use text hierarchy, spacing, dividers, semantic state;
- aggregate +N is text/navigation, not another Card;
- exceptional system-wide error may use Alert above the collection.

## 15. Storybook/Figma matrix

Required:

~~~text
spec-steering/attention-task
spec-steering/concurrent-signals
spec-steering/aggregate-attention
spec-steering/spec-attention
spec-steering/ready
spec-steering/batch-working
spec-steering/issue
spec-steering/quiet
spec-steering/archive-row
spec-steering/many-secondary-signals
spec-steering/loading
spec-steering/empty-active
~~~

## 16. Acceptance criteria

1. A Spec appears in one primary Active group.
2. Concurrent signals are preserved without row duplication.
3. Neutral identity and concrete Task signal have distinct navigation semantics.
4. Aggregate signals never invent a representative Task.
5. Batch execution remains batch-shaped.
6. Archive reads historically, not like stale Active steering.
7. Rows remain compact and cardless.
8. A large collection remains scannable.
