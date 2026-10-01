---
id: ideas.specflow-ui.components.task-decision-evidence
type: product
title: Task decision and evidence UI spec
status: draft
scope: specflow
areas:
  - ui
  - workflow
tags:
  - task
  - decision
  - evidence
  - review
  - remediation
  - recovery
read_when:
  - implementing Task decision/evidence composition
  - creating Storybook/Figma fixtures for Task states
  - deciding how review, handover, verification, changes, resume, or recovery are presented
summary: >
  Detailed product presentation contract for Task decision state, action readiness,
  evidence ordering, review/handover/change/verification references, continuation/remediation/recovery,
  payload-backed state fixtures, data loading, and visual containment.
related:
  - ideas.specflow-ui.components
  - ideas.specflow-ui.screens.task-detail
  - ideas.specflow-ui.data-loading-refresh-and-eventing
  - design-system.principles.layout-and-containment
---

# Task decision and evidence UI spec

## 1. Responsibility

This composition answers one question:

> **What does the user need to understand or decide about this Task right now?**

It combines:

- current Task decision state;
- human-readable reason;
- available deterministic action(s);
- Task intent relevant to that decision;
- decision-relevant evidence;
- current execution when relevant;
- continuation/remediation/recovery state.

It does not own:

- the entire Specification Task collection;
- Full Session conversation;
- raw diff/file tooling;
- raw workflow persistence/operation records unless the user explicitly drills into recovery detail.

## 2. Component ownership

Product-owned composition:

~~~text
TaskDecisionEvidence
├── TaskDecisionSummary
├── TaskIntentSummary
├── TaskEvidenceList
│   ├── ReviewEvidenceRow
│   ├── HandoverEvidenceRow
│   ├── ChangeEvidenceRow
│   ├── VerificationEvidenceRow
│   └── ArtifactEvidenceRow
├── CurrentExecutionSummary
├── ContinuationSummary
└── TaskActionRegion
~~~

Use Nevo UI primitives for Typography, MarkdownDocument, Button/Menu, StatusIndicator,
Collapsible, Separator, AlertDialog, and Alert only when an exceptional state actually needs
stronger visual containment.

Do not create a generic design-system TaskDecision component.

## 3. Canonical input model

The screen-level Task projection is the input.

Relevant fields:

~~~text
task
  id
  specId
  title
  intent
  workflow
    semanticStatus
    reason?
    actions[]
  attention?
  currentExecutions[]
  evidence[]
  sessions[]
  continuation?
  revision
  updatedAt
~~~

Evidence item:

~~~text
{
  id,
  kind,
  title,
  summary?,
  relevance,
  status?,
  target,
  sharedTaskIds?,
  updatedAt?
}
~~~

The composition must not infer legal actions from evidence or status text.

## 4. Decision hierarchy

The top of Task detail should answer in this order:

~~~text
Task identity
Decision/current state
Why
Primary legal action, if one exists
Task intent relevant to the decision
Evidence needed for the decision
Secondary/deeper context
~~~

Do not put a large evidence section above the reason the user is there.

## 5. Decision-summary formatting

### Normal / quiet

No heavy status block.

~~~text
TASK-03 — Deterministic admission

No immediate action
~~~

Quiet state may be represented by normal typography plus muted supporting text.

### Human attention

Use stronger hierarchy because user action is required.

~~~text
TASK-03 — Deterministic admission

Review required
Implementation work completed.
Owner decision is required.

[Review / decide]
~~~

The action may be near the summary or repeated/sticky at the bottom if long evidence requires it, but
do not duplicate multiple identical primary buttons within one viewport without reason.

### Ready

Ready is actionable but calmer than required attention.

~~~text
Ready to start

Dependencies complete.
Relevant entry gates satisfied.

[Start]
~~~

Do not style Ready as warning.

### Current execution

~~~text
Currently in execution
Reviewer · 3 Tasks

Reviewing changes…
[Open Session]
~~~

If current execution covers a batch, preserve batch scope.

### Remediation / recovery

Remediation and recovery are different.

~~~text
Needs remediation
Workspace state must be resolved before the normal step can start.

[Open remediation]
~~~

versus:

~~~text
Recovery required
A durable operation is in an ambiguous state.
Automatic continuation is unsafe.

[Inspect recovery]
~~~

Recovery may justify stronger contained emphasis.

## 6. Evidence ordering

Evidence order is decision-dependent, not fixed alphabetically by artifact kind.

### Review-required default

Preferred order:

~~~text
Review outcome
Handover / what changed                    when available
Changes / diff entry                       when available
Verification                               when decision-relevant
Session                                    when context helps
Other artifacts
~~~

### Ready-to-start

Usually no evidence dump is needed.

Show:

- why ready;
- dependencies/gates;
- what Start does;
- optional Task intent.

### Recovery

Preferred order:

~~~text
Recovery reason
Affected durable operation
Last known operation state
Why automatic continuation is unsafe
Authoritative recovery action
Supporting logs/artifacts
~~~

### Shared multi-Task evidence

If one review report supports several Tasks, preserve one shared artifact identity.

Task detail shows the Task-specific outcome plus:

~~~text
Shared review report · 3 Tasks                         [Inspect]
~~~

Do not clone the report into three fake Task-local artifacts.

### Multiple change sources

`Changes` is not necessarily one diff. The Task projection may contain several change evidence
entries or an aggregate change-set reference that preserves multiple sources such as current
worktree, base-branch diff, and linked PR/MR references.

Present a concise source label/count first and keep provider-specific inspection behind the target.
Do not assume one GitHub pull request is the canonical change object.

## 7. Evidence-row formatting

Evidence rows are homogeneous and borderless by default.

~~~text
Review
Ready for owner decision
2 required fixes · 1 informational finding                 >

Handover
Implementation completed; changed admission + recovery      >

Changes
3 files · +84 / -21                                         >

Verification
241/241 tests passed                                        >
~~~

Rules:

- one row = one independently selectable evidence resource;
- summary is concise and human-readable;
- metadata/status only when decision-relevant;
- no Card per evidence row;
- one failed/high-risk item may use a semantic status marker;
- raw report bodies load only after Inspect/open.

## 8. Payload-backed fixtures

### TDE-01 — ready to start

Fixture: \`task-decision/ready\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "title": "Implement deterministic admission",
    "workflow": {
      "semanticStatus": "ready",
      "reason": "Dependencies and entry gates are satisfied.",
      "actions": [
        {
          "id": "start",
          "label": "Start",
          "available": true
        }
      ]
    },
    "attention": null,
    "currentExecutions": [],
    "evidence": [],
    "continuation": { "kind": "none", "reason": "" }
  }
}
~~~

Mock:

~~~text
TASK-03 — Implement deterministic admission

Ready to start
Dependencies and entry gates are satisfied.

Task intent
Prevent ambiguous workspace admission before execution.

[Start]
~~~

No Card needed.

---

### TDE-02 — review required

Fixture: \`task-decision/review-required\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "title": "Implement deterministic admission",
    "workflow": {
      "semanticStatus": "needs-human-review",
      "reason": "Implementation work is complete.",
      "actions": [
        {
          "id": "review",
          "label": "Review / decide",
          "available": true
        }
      ]
    },
    "attention": {
      "kind": "owner-review",
      "label": "Review required",
      "reason": "Owner decision is required.",
      "decisionType": "task-review"
    },
    "evidence": [
      {
        "id": "review-17",
        "kind": "review",
        "title": "Implementation review",
        "summary": "2 required fixes · 1 informational finding",
        "relevance": "primary",
        "status": "needs-decision",
        "target": { "kind": "artifact", "id": "review-17" }
      },
      {
        "id": "handover-17",
        "kind": "handover",
        "title": "Handover",
        "summary": "Changed admission and recovery handling.",
        "relevance": "primary",
        "target": { "kind": "artifact", "id": "handover-17" }
      },
      {
        "id": "changes-17",
        "kind": "changes",
        "title": "Changes",
        "summary": "3 files · +84 / -21",
        "relevance": "supporting",
        "target": { "kind": "change-set", "id": "changes-17" }
      },
      {
        "id": "verify-17",
        "kind": "verification",
        "title": "Verification",
        "summary": "241/241 tests passed",
        "relevance": "supporting",
        "status": "passed",
        "target": { "kind": "artifact", "id": "verify-17" }
      }
    ]
  }
}
~~~

Mock:

~~~text
Review required
Implementation work is complete.
Owner decision is required.

Review
2 required fixes · 1 informational finding                    >

Handover
Changed admission and recovery handling.                      >

Changes
3 files · +84 / -21                                          >

Verification
241/241 tests passed                                          >

[Review / decide]
~~~

---

### TDE-03 — current batch execution

Fixture: \`task-decision/current-batch\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "workflow": {
      "semanticStatus": "in-progress",
      "actions": []
    },
    "currentExecutions": [
      {
        "sessionId": "session-review-23",
        "agentRole": "Reviewer",
        "taskIds": ["TASK-02", "TASK-03", "TASK-04"],
        "currentActivity": {
          "kind": "tool",
          "label": "Reviewing changes"
        }
      }
    ]
  }
}
~~~

Mock:

~~~text
Currently in execution
Reviewer · 3 Tasks

Reviewing changes…
TASK-02 · TASK-03 · TASK-04

[Open Session]
~~~

Do not rewrite this as "Reviewer working on TASK-03".

---

### TDE-04 — dependency prevents normal start

Fixture: \`task-decision/dependency-block\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "workflow": {
      "semanticStatus": "waiting",
      "reason": "TASK-02 must complete first.",
      "actions": [
        {
          "id": "start",
          "label": "Start",
          "available": false,
          "reason": "Waiting for TASK-02."
        }
      ]
    },
    "intent": {
      "dependencies": ["TASK-02"]
    }
  }
}
~~~

Mock:

~~~text
Cannot start normal workflow step
Waiting for TASK-02.

Dependency
TASK-02                                                     >

Start unavailable
Waiting for TASK-02.
~~~

Do not label the entire Task universally BLOCKED if another remediation/action is legal.

---

### TDE-05 — remediation available

Fixture: \`task-decision/remediation\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "workflow": {
      "semanticStatus": "issue",
      "reason": "Workspace admission cannot continue.",
      "actions": [
        {
          "id": "remediate-worktree",
          "label": "Open remediation",
          "available": true
        }
      ]
    },
    "continuation": {
      "kind": "remediation",
      "reason": "Dirty worktree state can be resolved before attempt activation.",
      "actionId": "remediate-worktree"
    }
  }
}
~~~

Mock:

~~~text
Needs remediation
Workspace admission cannot continue.

Dirty worktree state can be resolved before attempt activation.

[Open remediation]
~~~

---

### TDE-06 — safe continuation

Fixture: \`task-decision/continue\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "continuation": {
      "kind": "continue",
      "reason": "The previous Turn ended safely and legal work remains.",
      "actionId": "continue"
    },
    "workflow": {
      "semanticStatus": "ready-to-continue",
      "actions": [
        {
          "id": "continue",
          "label": "Continue",
          "available": true
        }
      ]
    }
  }
}
~~~

Mock:

~~~text
Ready to continue
The previous Turn ended safely and legal work remains.

[Continue]
~~~

Do not require an active workflow attempt for this state.

---

### TDE-07 — recovery required

Fixture: \`task-decision/recovery-required\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "workflow": {
      "semanticStatus": "recovery-required",
      "reason": "A durable finish operation is unresolved.",
      "actions": [
        {
          "id": "inspect-recovery",
          "label": "Inspect recovery",
          "available": true
        }
      ]
    },
    "continuation": {
      "kind": "recovery",
      "reason": "The durable operation state must be reconciled before continuation.",
      "actionId": "inspect-recovery"
    },
    "evidence": [
      {
        "id": "finish-op-23",
        "kind": "operation",
        "title": "Finish operation",
        "summary": "Persisted stage: commit created · push status unknown",
        "relevance": "primary",
        "status": "ambiguous",
        "target": { "kind": "operation", "id": "finish-op-23" }
      }
    ]
  }
}
~~~

Mock:

~~~text
┌────────────────────────────────────────────────────────────┐
│ Recovery required                                          │
│ A durable finish operation is unresolved.                  │
│                                                            │
│ Finish operation                                           │
│ commit created · push status unknown                       │
│                                                            │
│ [Inspect recovery]                                         │
└────────────────────────────────────────────────────────────┘
~~~

This is a justified stronger surface because normal continuation is unsafe.

---

### TDE-08 — shared review artifact

Fixture: \`task-decision/shared-review\`

~~~json
{
  "task": {
    "id": "TASK-03",
    "attention": {
      "kind": "owner-review",
      "label": "Review required",
      "reason": "This Task has a Task-specific owner decision."
    },
    "evidence": [
      {
        "id": "review-batch-42",
        "kind": "review",
        "title": "Batch review report",
        "summary": "TASK-03: 1 required fix",
        "relevance": "primary",
        "sharedTaskIds": ["TASK-02", "TASK-03", "TASK-04"],
        "target": { "kind": "artifact", "id": "review-batch-42" }
      }
    ]
  }
}
~~~

Mock:

~~~text
Review
TASK-03 · 1 required fix

Shared report · 3 Tasks                                      >
~~~

The Task-specific result remains visible without cloning the report.

## 9. Decision action behavior

Actions are commands, not optimistic local status changes.

On action:

~~~text
click
-> disable duplicate submission
-> command with idempotency key
-> show pending operation state
-> consume operation/event result
-> refresh/update coherent Task + parent Specification projections
~~~

If the command is rejected because readiness changed, show the authoritative reason and refresh the
Task projection.

Do not leave stale enabled controls after a command starts.

## 10. Data loading / batching

This composition uses the coherent Task projection for state + legal actions.

Heavy evidence bodies are independent:

- review report;
- Handover body;
- diff;
- verification logs;
- raw recovery operation detail.

Selecting evidence loads only that resource.

If multiple evidence metadata/body items are intentionally needed together, use bounded batch reads
from the shared data-loading contract. Do not load every evidence body on Task open.

## 11. Refresh

No prominent local Refresh by default.

Task projection follows parent/live invalidation.

If user explicitly refreshes Task detail from overflow:

- refresh Task projection;
- do not automatically refetch all evidence bodies;
- stale/open evidence with its own revision can expose local Retry/Refresh.

## 12. Visual/token contract

- normal state: neutral workspace text;
- attention: stronger semantic attention but not necessarily a Card;
- ready: normal primary action treatment;
- current execution: running/activity tone;
- recovery: warning/error according to actual safety risk;
- evidence rows: neutral with semantic status marker only where meaningful;
- timestamps/technical metadata: muted;
- raw operation ids never lead the visual hierarchy.

## 13. Containment rules

- Task host already contains the composition;
- evidence rows are not Cards;
- Task intent is not a Card;
- Review section is not a Card by default;
- one recovery/critical decision block may earn stronger containment;
- do not nest evidence Cards inside a decision Card;
- whitespace/heading/divider first.

## 14. Storybook/Figma matrix

Required fixtures:

~~~text
task-decision/ready
task-decision/review-required
task-decision/current-batch
task-decision/dependency-block
task-decision/remediation
task-decision/continue
task-decision/recovery-required
task-decision/shared-review
task-decision/evidence-missing
task-decision/action-became-stale
~~~

Every fixture includes the exact Task projection payload.

## 15. Acceptance criteria

1. User sees why they are here before seeing raw evidence.
2. Legal action comes only from server-owned action projection.
3. Evidence order follows the current decision.
4. Shared artifacts preserve shared identity.
5. Batch execution remains batch-shaped.
6. Continue/remediation/recovery remain distinct.
7. Heavy evidence does not load eagerly.
8. Recovery can stand out without making every state a Card.
9. No evidence Card soup.
