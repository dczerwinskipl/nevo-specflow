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
- Expand/read the Specification description/documents without forcing the full body into the initial
  layout.
- See whether the Spec itself requires a human decision.
- See which Tasks require attention, are ready, are executing, or have issues.
- Select one or several Tasks and invoke legal bulk actions such as Start.
- Preserve dependency/readiness warnings for the selected Task set.
- Open a Task without abandoning the Specification.
- Inspect readable supporting documents/evidence.
- Inspect several relevant Sessions and open one.
- Start a new Session when needed using the shared Session-start interaction.
- Follow relevant links to project-level changes/PRs/deployment/release facts when those capabilities
  exist.
## 3. Entry and navigation

Entry:
- Specs Overview neutral Spec target;
- direct/deep link to Specification;
- normal router Back from Full Session may return to this Specification; previously open Task
  Secondary is local state and is not reconstructed from the URL.

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

| Need | New SpecFlow | Old repo evidence | Direction |
| --- | --- | --- | --- |
| Specification summary/tasks | **missing** | **old-repo-available** in `GET /api/dashboard` | Preserve identity/task metadata, replace old lifecycle assumptions with new read model. |
| Document manifest/body | **missing** | **old-repo-available** via `GET /api/specs/:source/:slug/content` and `.../content/:docId` | Strong migration candidate; use stable Spec identity in new contract. |
| Task status/dependencies | **missing** | **old-repo-available** via `.../task-statuses` | Preserve dependency facts, replace universal ready/block semantics with per-action semantic projection. |
| Spec/Task actions | **missing** | **old-repo-available** via `GET/POST /api/specs/active/:slug/actions` | Preserve server-owned readiness/reasons; redesign around canonical new workflow identity. |
| Bulk Task selection validation/start | **missing** | partial: single-Task workflow actions plus Session `taskIds[]`/batch evidence | Add application-owned validation for the whole selected set, returning legal action, warnings and blockers before dispatch; preserve the full selected Task set as execution scope. |
| Create/start Session | **missing** | **old-repo-available** via `POST /api/agent-sessions` and workflow start actions | Preserve Nevo-owned canonical `sessionId`, provider selection/reuse semantics and backend-owned workflow bootstrap; expose one shared Session-start interaction. |
| Task human decision | **missing** | **old-repo-available** via `POST /api/specs/:slug/tasks/:taskId/workflow/human-decision` | Preserve explicit decision command pattern. |
| Related Sessions | **missing** | **old-repo-available** via `GET /api/agent-sessions?specId=...&taskId=...` | Preserve contextual association but keep it separate from current execution. |
| Spec-level current execution + multi-signal summary | **missing** | partial only | Add explicit projection. |

Bulk validation is a semantic application contract, not a frontend loop over individual Task
`ready` flags. A selected set can have selection-level warnings or blockers that do not exist on
one Task in isolation.
## 6. Information hierarchy

1. Spec identity/title.
2. concise Specification description/summary with a deliberate full-content reading action.
3. workflow meaning and high-priority human-required state.
4. Task collection, including multi-selection when batch actions are available.
5. contextual Session history/current execution.
6. supporting Specification documents/evidence and relevant project-operation links.

Opening the full Specification description/document should provide a comfortable reading mode that
uses the main available workspace surface rather than expanding a tiny inline accordion indefinitely.

Future editing: when a capable Markdown editor exists, that full reading mode may expose a small Edit
affordance and edit Markdown in place. Until then the full content is read-only and no dead Edit icon
is shown.

The high-priority region appears only when something genuinely deserves priority; Ready alone does
not become an alert.
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
- concise summary/description + full-content reading action.
- High-priority state slot.
- Task collection with optional checkbox selection and bulk-action region.
- Task search/filter only when needed.
- contextual Session list/history.
- supporting documents/evidence.
- optional references to project-level changes/PRs/deployments/releases/pipelines.
- Task Secondary when selected.
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
Task row -> local Task Secondary; no workflow mutation.

### Multi-select Tasks
Checkboxes select Tasks without opening them. Once selection is non-empty, show selection actions
that the application says are applicable.

For Start:

~~~text
select Tasks
  -> backend validates selection/action
  -> show warnings and blockers
  -> if legal, shared Session-start interaction chooses agent/provider as needed
  -> preserve the selected set as batch scope
~~~

Unmet dependencies or other readiness facts remain visible. Warning != blocker: a warning can leave
the action available; a blocker prevents it and explains why. Frontend does not calculate this from
status strings.

### Filter Tasks
Local filter narrows already-loaded summaries by id/title/semantic steering category when useful.

### Spec-level decision
High-priority Spec signal -> evidence/decision context owned by Specification.

### Start/continue/review
Action availability comes only from authoritative readiness. Command -> pending feedback ->
authoritative projection update.

### Existing Session
On Wide, conversation target opens Floating Session; Compact/Narrow opens Full Session. An explicit
Open full session action may coexist on Wide.

### New Session
New session -> shared Session-start interaction -> choose agent/provider and optional execution
details -> normal Session/composer. Do not embed another standalone prompt editor here.

### Documents
Document/artifact click -> read/inspect. Any approve/reject action comes from the owning workflow
Human Step, not the document viewer itself.
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
- Ready alone is not promoted to human attention;
- Task-specific context remains one deliberate click;
- bulk Task selection preserves batch scope;
- dependency/readiness warnings come from authoritative selection/action validation;
- warning and blocker are visually/semantically distinct;
- Spec-level decision stays Spec-owned;
- action readiness is server-owned;
- batch is not collapsed to one Task;
- several relevant Sessions can be inspected without making Session a top-level nav area;
- unavailable future edit/file/IDE/deployment controls are not faked;
- Task collection is list/row-based, not Card soup.
## 19. Open questions

- final Spec workflow read-model shape;
- canonical artifact/Handover references;
- exact bulk-action command envelope and selection-validation projection;
- exact document editing implementation once Markdown editing is introduced;
- exact project-level operations surface once deployment/command/pipeline capabilities exist.