---
id: ideas.specflow-ui.components.spec-steering
type: product
title: Spec steering collection and item UI spec
status: draft
scope: specflow
areas:
  - ui
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
  Detailed product presentation contract for cross-Spec steering rows: queue priority / optional grouping,
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

```text
SpecSteeringCollection
├── SteeringGroup
└── SpecSteeringItem
    ├── SpecIdentityTarget
    ├── PrimarySignalTarget
    ├── SecondarySignals
    ├── ProgressMetadata
    └── CurrentExecutionMetadata
```

Use Nevo UI Typography, Link/Button primitives, StatusIndicator/Badge sparingly, Separator, Tabs or
SegmentedControl for Active/Archive, EmptyState, Skeleton.

Do not create a generic DashboardCard abstraction.

## 3. Input payload

The collection consumes the Specs overview projection.

Relevant item shape:

```text
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
```

Signals:

```text
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
```

## 4. Primary queue ordering / optional grouping

One Spec appears in **one canonical Active queue position**.

The semantic ordering classes are:

```text
requires attention
ready
working
quiet / other active
```

This does **not** require four literal stacked sections. Two valid presentation families remain open:

- grouped sections using those semantic classes;
- one flat ordered queue where row labels/hierarchy make the same distinctions obvious.

An "issue" is not automatically its own human-attention category. If the issue requires owner
intervention, it contributes an attention signal. If the agent/system can remediate it without the
human, keep it as working/other active with a reason.

Within Requires attention, an active Session interaction waiting for the human is normally the
strongest signal. Beyond that, the application/read model should provide semantic priority rather
than the frontend reverse-engineering urgency from raw statuses.

Concurrent lower-priority signals remain concise metadata inside the same Spec row.

Do not duplicate the Spec into separate Attention + Ready + Working rows. Separate summary counters
may overlap because they are aggregates, not duplicated navigation rows.

## 5. Signal target model

The **whole Spec row / identity** has one stable meaning:

```text
Spec A
  -> Specification
```

Specific signals may expose explicit nested actions/targets:

```text
TASK-03 requires review [open]
  -> local TASK-03 detail

Agent asks for input [open]
  -> responsible Session/context

3 Tasks require review [open]
  -> Specification attention context
```

The aggregate target never invents one representative Task.

Nested targets supplement the stable row destination; they do not make blank areas of the row
redirect unpredictably based on current priority.

## 6. Row anatomy

Preferred shape:

```text
Spec A
3 Tasks require review                                  >
TASK-03 owner decision · Reviewer working on 2 Tasks
6 / 9 Tasks · Implementation
──────────────────────────────────────────────────────────
```

Hierarchy:

1. Spec identity;
2. strongest signal;
3. one concise line of additional meaningful signals;
4. progress/workflow metadata.

Do not display every raw signal when there are many.

For overflow:

```text
TASK-03 owner decision · TASK-05 ready · +2 more
```

Clicking +N more opens the Spec context, not a floating mega-tooltip.

## 7. Queue / optional group formatting

The exact grouped-vs-flat presentation is still a product-design decision.

If grouped sections are used:

- groups are typography + spacing, not Cards;
- use clear section spacing and optional subtle dividers;
- group by attention / ready / working / other;
- do not use decorative different backgrounds for every group.

If a flat queue is used:

- semantic class remains perceivable in each row;
- sorting preserves human-attention priority;
- rows do not accumulate repetitive badges merely to replace group headings.

Both forms keep one Spec in one canonical queue position.

## 8. Active versus Archive

### Active

Steering semantics dominate.

Group by attention/ready/working/other.

### Archive

Historical browsing dominates.

Default:

```text
Archive

Search specs…

Spec Z
Completed Sep 24
12 / 12 Tasks · last activity Sep 24

Spec Y
Completed Sep 18
...
```

Do not force archived Specs into Requires attention / Ready / Working groups based on stale
historical signals.

Search/filter becomes more important in Archive because the collection grows monotonically.

## 9. Payload-backed fixtures

### SS-01 — one attention signal

Fixture: \`spec-steering/attention-task\`

```json
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
```

Mock:

```text
Spec A
TASK-03 requires review                                  >
Owner decision required
5 / 8 Tasks
```

---

### SS-02 — concurrent attention + ready + working

Fixture: \`spec-steering/concurrent-signals\`

```json
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
```

Mock:

```text
Requires attention

Spec A
TASK-03 requires review                                  >
TASK-05 ready · Reviewer working on 2 Tasks
5 / 9 Tasks
```

One row, one canonical queue position.

---

### SS-03 — aggregate attention

Fixture: \`spec-steering/aggregate-attention\`

```json
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
```

Mock:

```text
Spec A
3 Tasks require review                                   >
```

The aggregate target must not pretend one Task is the destination.

---

### SS-04 — Spec-level attention

Fixture: \`spec-steering/spec-attention\`

```json
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
```

Mock:

```text
Spec B
Specification approval required                          >
Owner decision required
```

No Task is selected.

---

### SS-05 — ready

Fixture: \`spec-steering/ready\`

```json
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
```

Mock:

```text
Ready

Spec C
TASK-05 ready to start                                  >
```

Ready is visible but calmer than required attention.

---

### SS-06 — batch working

Fixture: \`spec-steering/batch-working\`

```json
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
```

Mock:

```text
In progress

Spec D
Reviewer · 3 Tasks
Reviewing changes…
```

Do not choose TASK-03 as representative.

---

### SS-07 — issue + remediation

Fixture: \`spec-steering/issue\`

```json
{
  "id": "spec-e",
  "signals": [
    {
      "id": "issue-3",
      "kind": "issue",
      "scope": "task",
      "taskId": "TASK-03",
      "label": "TASK-03 remediation available",
      "reason": "Normal start is blocked; agent remediation can continue",
      "priority": 30,
      "target": { "specId": "spec-e", "taskId": "TASK-03" }
    }
  ]
}
```

Mock:

```text
Other active

Spec E
TASK-03 remediation available                           >
Normal start is blocked; agent remediation can continue
```

`kind: issue` is reserved here for a non-human issue/remediation signal. If owner intervention is
required, the backend projection should emit `kind: attention` with the concrete issue as its
reason rather than asking the frontend to guess whether an issue needs the human.

---

### SS-08 — quiet

Fixture: \`spec-steering/quiet\`

```json
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
```

Mock:

```text
Other active

Spec F
No immediate action
4 / 7 Tasks
```

---

### SS-09 — archived

Fixture: \`spec-steering/archive-row\`

```json
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
```

Mock:

```text
Spec Z
Completed Sep 24
12 / 12 Tasks · last activity Sep 24
```

## 10. Interaction behavior

### Row and nested targets

- whole row/title = Specification;
- explicit concrete signal action = its concrete target;
- aggregate signal = Specification-level attention/task context;
- non-action metadata remains non-actionable.

A user clicking the Spec row because they want general context must never be forced into whichever
issue happens to rank highest.

Keyboard ordering remains predictable: row/identity first, then explicit nested targets.

### Hover/focus

Hover/focus treatment must make the stable row target and explicit nested signal targets visually
distinguishable without turning every metadata fragment into a button.

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

```text
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
```

## 16. Acceptance criteria

1. A Spec appears once in the canonical Active queue.
2. Concurrent signals are preserved without row duplication.
3. Requires attention means human intervention is actually needed.
4. Ready work remains separate from attention.
5. The whole row/identity always opens Specification.
6. Concrete signal actions have explicit, separate navigation semantics.
7. Aggregate signals never invent a representative Task.
8. Batch execution remains batch-shaped.
9. Archive reads historically, not like stale Active steering.
10. Rows remain compact, cardless, and scannable.
