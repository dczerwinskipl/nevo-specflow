---
id: ideas.specflow-ui.screens.specification-workspace
type: product
title: Specification UI spec
status: draft
scope: specflow
areas: [ui, product, specifications, workflow]
tags: [specification, workspace, tasks, workflow, evidence]
read_when:
  - implementing or reviewing a Specification surface
  - designing Spec-level steering and Task collection behavior
summary: >
  Vertical UI specification for one Specification surface: workflow meaning, high-priority
  signals, Task collection, evidence, navigation, API/read-model requirements and responsive behavior.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.spec-task-information-hierarchy
  - ideas.specflow-ui.spec-task-screen-structure
  - product.specflow.ui.interaction-model
---

# Specification UI spec

## 1. Purpose and ownership

The Specification surface is the main context for one Specification.

It owns:

- Spec identity and intent;
- Spec-level workflow meaning/actions;
- high-priority human-facing state;
- Task collection;
- supporting Spec-level evidence/history;
- contextual entry into Task detail and related Sessions.

It does not flatten Task detail, Session transcript, or raw workflow internals into the Primary.

## 2. User use cases

- Understand what change the Specification represents.
- See whether the Spec itself requires a human decision.
- See which Tasks require attention, are ready, are executing, or are blocked/remediable.
- Open a Task without abandoning the Specification.
- Start/approve/finalize only through authoritative available actions.
- Inspect supporting documents/evidence.
- Open a related Session as quick conversation context where supported, or open Full Session directly.

## 3. Entry and navigation

Entry:
- Specs Overview neutral Spec target;
- direct/deep link to Specification;
- return from Full Session where originating context is representable.

Wide/Compact:
- Specification = Primary;
- selected Task = Secondary.

Narrow:
- Specification = visible surface;
- selecting Task pushes Task detail;
- Back returns to Specification preserving selection/scroll where possible.

## 4. Data source / read-model ownership

Backend/application owns:

- Spec identity/document inventory;
- Spec-level workflow projection;
- Task summaries and semantic signals;
- current single/batch execution projections;
- action readiness/reasons;
- relevant evidence/artifact references;
- related Session summaries.

Frontend may compose/group those projections but must not reconstruct workflow semantics from
repository files or Session history.

## 5. API availability / migration status

| Need | New SpecFlow | Legacy Nevo | Direction |
| --- | --- | --- | --- |
| Specification summary/tasks | **missing** | **legacy-available** in \`GET /api/dashboard\` | Preserve identity/task metadata, replace old lifecycle assumptions with new read model. |
| Document manifest/body | **missing** | **legacy-available** via \`GET /api/specs/:source/:slug/content\` and \`.../content/:docId\` | Strong migration candidate; use stable Spec identity in new contract. |
| Task status/dependencies | **missing** | **legacy-available** via \`.../task-statuses\` | Preserve dependency facts, replace universal ready/block semantics with per-action semantic projection. |
| Spec/Task actions | **missing** | **legacy-available** via \`GET/POST /api/specs/active/:slug/actions\` | Preserve server-owned readiness/reasons; redesign around canonical new workflow identity. |
| Task human decision | **missing** | **legacy-available** via \`POST /api/specs/:slug/tasks/:taskId/workflow/human-decision\` | Preserve explicit decision command pattern. |
| Related Sessions | **missing** | **legacy-available** via \`GET /api/agent-sessions?specId=...&taskId=...\` | Preserve contextual association but keep it separate from current execution. |
| Spec-level current execution + multi-signal summary | **missing** | partial only | Add explicit projection. |


### Legacy field evidence

Useful legacy coverage:

~~~text
SpecificationSummary
  id / specId / slug / title / summary / source / updatedAt
  tasks[]
  metrics

SpecificationManifest
  id / specId / slug / title / source / path
  overview
  areas[]
  tasks[]
  sections[]

SpecificationManifestDocument
  id / docId / kind / title / path / available / lastModified

SpecificationActionsPayload
  workflowMode
  workflowDefinition
  worktree
  tasks[taskId] {
    action
    enabled
    reason
    availableActions?
    status?
    currentStep?
    attempt?
    workflowState?
  }
  finalize { enabled, reason, checks, pullRequest }
~~~

The new projection can reuse document metadata and workflow/action facts, but should not copy the
legacy payload boundary wholesale. In particular:

- \`worktree\` is contextual evidence, not mandatory top-level Specification chrome;
- \`enabled/reason/currentStep/attempt/workflowState\` are useful action/read-model facts;
- new \`signals[]\` and \`currentExecutions[]\` are required because legacy payloads do not express
  the new steering/execution semantics cleanly.

### Proposed Specification read API

Illustrative:

~~~text
GET /api/specs/:specId
~~~

Response:

~~~text
{
  revision,
  updatedAt,
  specification: {
    id,
    slug,
    title,
    summary,
    collection,
    workflow: {
      definitionId?,
      phase,
      currentStep?,
      semanticStatus,
      reason?,
      actions: [
        { id, label, available, reason?, confirmation? }
      ]
    },
    highPrioritySignals: [
      {
        id,
        kind,
        scope: "spec" | "task",
        taskId?,
        label,
        reason?,
        priority,
        target
      }
    ],
    tasks: [
      {
        id,
        title,
        order,
        semanticStatus,
        signals[],
        actions[],
        dependencies: {
          dependsOn[],
          blockedBy[]
        },
        currentExecutions[]
      }
    ],
    documents: [
      { id, title, kind, available, lastModified?, reference }
    ],
    evidence: [
      { id, kind, title, summary?, target, updatedAt? }
    ],
    sessions: [
      { id, title?, relation, taskIds[], lastActivityAt? }
    ],
    currentExecutions: [
      { sessionId, agentRole, taskIds[], currentActivity?, startedAt? }
    ]
  }
}
~~~

Field coverage notes:

- top-level `revision/updatedAt` make the projection refreshable and protect against stale
  out-of-order responses.
- `workflow.actions[]` and Task `actions[]` carry server-owned availability/reasons; the UI never
  translates raw lifecycle status into legal commands.
- Task `signals[]` preserves simultaneous attention/ready/issue/work signals without requiring a
  miniature Task-detail fetch for every row.
- `currentExecutions[]` is plural both at Spec and Task summary level.
- document entries remain metadata/references only; bodies stay independently cacheable.
- evidence/session entries are lightweight references and summaries, not embedded large artifacts.

Behavior:

- stable Spec id is authoritative route/resource identity;
- Task rows return semantic UI-ready projections, not raw persisted statuses only;
- current execution is independent from historical Session association;
- several signals may coexist;
- document bodies remain lazy-loaded rather than bloating the main projection.

Suggested supporting reads:

~~~text
GET /api/specs/:specId/documents/:documentId
GET /api/specs/:specId/actions
~~~

Suggested commands:

~~~text
POST /api/specs/:specId/actions/:actionId
POST /api/specs/:specId/tasks/:taskId/actions/:actionId
~~~

Exact paths are not frozen. The important behavior is command-style mutation with server-owned
validation/readiness and a refreshed authoritative projection afterward.

## 6. Information hierarchy

1. Spec identity/title.
2. concise workflow meaning.
3. high-priority attention/ready/current-work/issues, capped to the few items that genuinely need
   immediate prominence; additional signals remain discoverable in the Task collection.
4. Task collection.
5. supporting Spec context/evidence/history.

The high-priority region appears only when something deserves priority; it is not a permanent Card.

## 7. Pseudo-layout

~~~text
┌──────────────┬──────────────────────────────────────┬─────────────────────────┐
│ Navigation   │ Spec A                               │ TASK-03                 │
│              │ Deterministic admission hardening    │ Review required         │
│ Specs        │                                      │                         │
│ Settings     │ Needs attention                      │ Why                     │
│              │ 3 Tasks require review               │ owner decision required │
│              │ TASK-07 ready to continue            │                         │
│              │                                      │ Task intent             │
│              │ Tasks                                │ ...                     │
│              │ TASK-01  Done                        │                         │
│              │ ───────────────────────────────       │ Review                  │
│              │ TASK-02  Reviewer working            │ verdict / findings      │
│              │ ───────────────────────────────       │                         │
│              │ TASK-03  Review required        >    │ [Review / decide]       │
│              │ ───────────────────────────────       │                         │
│              │ TASK-04  Ready                  >    │                         │
│              │                                      │                         │
│              │ Specification context                │                         │
│              │ workflow · evidence · recent activity│                         │
└──────────────┴──────────────────────────────────────┴─────────────────────────┘
~~~

Task Secondary is shown only when selected. Primary remains scannable without it.

## 8. Screen anatomy

- Specification header.
- High-priority state slot; avoid letting this grow into a second Task list.
- Task collection.
- lightweight Task search/filter only when the collection becomes too large to scan comfortably;
  this filters the already-loaded lightweight Task summaries and does not fetch every Task detail.
- Supporting Specification context.
- Contextual Session references.
- Optional Task Secondary.

## 9. Responsive contract

Wide/Compact:
- split Specification + Task detail;
- navigation breakpoint independent from workspace split.

Narrow:
- Specification first;
- direct Task signal or Task row pushes Task detail;
- critical attention/ready/current-work remains visible before opening Task.

## 10. Interaction flows

### Select Task
Task row -> Task Secondary; no workflow mutation.

### Filter Tasks
When needed, local Task search/filter narrows the visible summary rows by id/title and semantic
steering category such as attention/ready/working. It does not change workflow state and does not
issue per-Task detail requests.

The default unfiltered view remains optimized for human attention rather than alphabetical browsing.

### Open Task signal from overview
Deep-linked selected Task -> Specification Primary + Task Secondary (or pushed detail narrow).

### Spec-level decision
High-priority Spec signal -> evidence/decision context owned by Specification; no fake Task owner.

### Start/continue/review
Action enabled only from authoritative action/readiness projection; command -> pending feedback ->
refresh/read model update.

### Open Session
A Task/Spec Session reference exposes a conversation target plus an explicit full-screen action.
Where Floating Session is supported, the conversation target opens it without abandoning the
Specification. Open full session navigates directly to Full Session and does not require the floating
presentation first.

## 11. States

- normal/quiet;
- Task attention;
- Spec-level attention;
- ready;
- current single Task execution;
- current batch execution;
- issue/remediation;
- resumable/continue;
- recovery required;
- partial evidence unavailable;
- archived/read-only Spec.


## 12. Data loading, events, and Refresh

This screen inherits
[Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md).

### Projection boundaries

Load one coherent Specification steering projection containing:

- Spec workflow/actions;
- Task semantic summaries/actions;
- high-priority signals;
- current execution summaries;
- lightweight document/evidence/Session references.

Do not bundle all document bodies, Session histories, diffs, or raw artifact bodies into that request.

Documents/details load lazily when opened. If several homogeneous documents are intentionally needed
together, use the shared bounded batch-read pattern rather than N uncontrolled requests.

### Event updates

A Task/workflow change that affects both Task detail and Spec steering should update/invalidate those
two projections together from one semantic event/operation completion.

Do not invalidate every document or Session because one Task status changed.

### Refresh

Expose one Specification-level **Refresh** in the header/overflow.

It refreshes:

- the Specification steering projection;
- Spec/Task action readiness contained in that projection.

It does not automatically refetch:

- every document body;
- historical Session transcripts;
- unopened Handover/artifact bodies;
- file/diff details.

If an open detail has its own revision/stale signal, refresh that detail independently.

Keep visible data during refresh. Async actions should normally wait for their terminal operation/event
before forcing a final refresh; do not refetch repeatedly for every progress event.

## 13. Component / composition map

| Need | Composition |
| --- | --- |
| Main layout | AppWorkspace |
| Header | WorkspaceHeader |
| Task rows | SpecFlow product composition |
| High-priority summary | product composition using Typography/Alert only when justified |
| Status metadata | StatusIndicator/Badge sparingly |
| Evidence prose | Typography/MarkdownDocument |
| History | Timeline when genuinely chronological |
| Disclosure | Collapsible |
| Actions | Button/Menu |
| Task detail | product Secondary composition |

## 14. Visual/token contract

- workspace surface: existing AppWorkspace material;
- primary title: \`text-content-primary\`;
- supporting explanation: \`text-content-secondary\`;
- metadata: \`text-content-muted\`;
- task rows: neutral by default, hover/selected from shared interaction tokens;
- divider: subtle only where spacing is insufficient;
- requires-attention: semantic tone with greater weight;
- ready: calmer semantic action state;
- current execution: running/activity treatment, not warning;
- issue/recovery: semantic warning/error according to actual condition.

## 15. Local containment rules

- no Card per Task;
- no permanent Card around Task collection;
- no Card per evidence section;
- high-priority contained surface only if exceptional state truly needs emphasis;
- use headings/spacing/dividers for Specification context;
- never Card-inside-Card between Primary and Secondary content.

## 16. Accessibility/focus

- Task rows keyboard-operable;
- selected Task semantically indicated;
- opening Secondary moves focus to meaningful Task heading; Back/Close restores context;
- statuses not color-only;
- actions expose reason when disabled/unavailable through accessible supporting text, not tooltip-only.

## 17. Storybook scenarios

- no selected Task;
- selected Task review;
- Spec-level approval;
- mixed simultaneous signals;
- large Task collection with local search/filter;
- single Task execution;
- batch execution;
- ready Task;
- remediation;
- resume;
- recovery;
- archived/read-only;
- narrow pushed Task.

## 18. Acceptance criteria

- user understands Spec state before opening a Task;
- the high-priority region stays concise and does not duplicate the Task collection;
- several simultaneous signals are preserved;
- Task-specific context is one click;
- Spec-level decision stays Spec-owned;
- action readiness is server-owned;
- batch is not collapsed to one Task;
- Task collection is list/row-based, not Card soup.

## 19. Open questions

- final Spec workflow read-model shape;
- artifact/Handover references;
- exact action command envelope and async operation reporting;
- exact document reference/file inspection integration.
