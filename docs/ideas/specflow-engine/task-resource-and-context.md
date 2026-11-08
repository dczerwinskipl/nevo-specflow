---
id: ideas.specflow-engine.task-resource-and-context
type: engineering
title: Tasks as workflow-managed resources, Task lifecycle and context building (draft)
status: draft
scope: specflow
areas: [workflow, runtime, ai]
tags: [draft, tasks, lifecycle, context, escalation, manifest]
read_when:
  - replacing the provisional Task record of the workflow kernel
  - designing Task folders, the Task index, Task statuses or Task escalation
  - designing how the context of a Specification or Task step is built
  - writing the ADR that makes Tasks a resource with their own documents
summary: >
  Owner ideas and decisions (open questions answered on 2026-11-05), not yet an ADR: one
  workflow-managed subject contract for Specifications and Tasks, one folder per Task with a manifest,
  a main document and the Task index as registry, a Task-only preparation status (draft, ready,
  on-hold, cancelled) separate from the workflow position, a guard that keeps draft Tasks out of
  implementation, explicit hold and cancel decisions, escalation from a Task to its Specification
  through a declared Specification transition, and an explicit typed context list per subject.
  Options, decisions and implementation slices.
related:
  - architecture.workflow.workflow-kernel
  - adr.0015-specification-manifest-as-document-registry
  - adr.0017-definitions-as-project-data
  - adr.0019-workflow-kernel-and-automatic-continuation
  - ideas.specflow-engine.plan-06
  - ideas.specflow-engine.workflow-api-requirements
---

# Tasks as workflow-managed resources, and context building

**Status: draft.** This records the owner's ideas for later implementation. The current behaviour is
described in [Workflow kernel](../../architecture/workflow/workflow-kernel.md); where this document
differs, the kernel document is right until an ADR accepts the change. Each section ends with a
recommendation or the owner's decision; every [open question](#open-questions) is decided (the last
ones on 2026-11-05), so the ADR can be written.

**Implemented: the lifecycle slice** (plan 06, W13), inside the provisional storage (the Task is still
one `.execution/tasks/<id>.yaml` record; folders, the index, `task.md` and context remain F20). It
follows sections 5 and 6 with these simplifications:

- the status lives on the Task record as `status` plus `statusChange {source: decision | escalation,
at, reason?}` instead of a `hold` object;
- any Specification work step may carry `taskDecisions[]` (`{taskId, status, reason?}`), without a
  `manages: tasks` marker;
- a producing step's `tasks` are the complete list of draft Tasks: listed drafts are revised,
  unlisted drafts are cancelled, a non-draft id rejects the finish;
- `approve-draft-tasks` approves every draft, not only those of the reviewed attempt (drafts come only
  from producing steps, so these are the same in the seed);
- a running Task may go on hold (its current step finishes, the next start is refused); it still
  cannot be cancelled;
- the escalation marker is `escalate: true`; the Specification gets `task-escalated` only while it
  is active on its wait step (entering the wait step records it; at any other position the
  Specification keeps its own item), and it names one Task (the first in id order). Decided on
  2026-11-05 to change: the item lists every escalated Task (Q7), and the Specification workflow
  reacts to an escalation through a declared transition (Q6);
- leaving out a draft that another Task depends on is not refused: the dependent Task can no longer
  start, which the wait reports as `tasks-stuck`;
- the Specification may enter its wait step while Tasks are still `draft` (the wait then reports
  `tasks-stuck`). Decided on 2026-11-05 to change: a guard refuses entering the wait step while any
  non-cancelled Task is `draft` ([section 5](#guard-before-implementation), Q2).

## 1. Context: Specification and Task today

Observed in the repository (commit `8ab67432`, PR #120):

| Aspect                  | Specification                                                                                                                                 | Task                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Manifest                | `specification.yaml` (`SpecificationManifest`, `src/specs/model.ts`): id, slug, title, archetype snapshot, `documents[]`, status, `tasks: []` | None                                                                                                                       |
| Documents               | Registry in the manifest (ADR 0015); `overview.md` is required and protected                                                                  | None. The agent works only from `title` and `summary` in the step context                                                  |
| Type                    | `archetype.id` (Specification archetype)                                                                                                      | `type` (task type) in the Task record                                                                                      |
| Workflow                | Resolved from the archetype's `execution` binding at start, pinned in the run                                                                 | Resolved from `task-type.workflow` at creation, pinned in the run                                                          |
| Preparation status      | `status` in the manifest, a free string read by nothing (plan 06, F14)                                                                        | None. `blocked {reason: specification-returned}` is set and cleared by the effects `block-pending-tasks` / `unblock-tasks` |
| Execution state         | `.execution/specification.yaml` (run only)                                                                                                    | `.execution/tasks/<id>.yaml`: title, summary, type, `dependsOn`, origin, block **and** the run                             |
| Context for an agent    | Step context: archetype, step instructions, handoff. No document list                                                                         | Same, plus Task title, summary and task-type instructions                                                                  |
| Read contract (planned) | —                                                                                                                                             | `task-read.ts` step `hints[]` of kind `doc`, `skill`, `file`, and resources with relation `context`                        |

The two subjects are therefore not handled the same way: a Specification is a resource with a
manifest and documents that the workflow drives, while a Task is only an execution record with some
metadata copied from the breakdown finish input.

Legacy nevo (`D:\repos\git\nevo\specs\active\*\tasks\*.md`) kept a Task as one markdown file with
YAML frontmatter: `id`, `status` (`draft`, `approved`, `in-implementation`, `implemented`, `verified`,
`abandoned`, `archived`), `context.required` / `context.optional` (paths to the Specification's
overview, area files, decision files), `allowed_paths` / `forbidden_paths` and
`semantic_references`. The markdown body held goal, requirements, constraints and acceptance
criteria. The step context added routed documentation hints (`relevantDocs`) matched from the
allowed paths. The lesson kept here: a Task needs a real document to work on and an explicit context
list. The lesson not kept: frontmatter as the source of truth (ADR 0015 rejects it) and one status
axis that mixes preparation with execution.

## 2. Goals and non-goals

**Goals**

- G1. One contract that both a Specification and a Task implement, so the kernel, the read model, the
  CLI and the UI treat them alike.
- G2. A Task is a resource: a folder with a manifest, a main document and optional extra files.
- G3. A Task preparation status, separate from the workflow position, changed only by explicit
  decisions of the spec writer or the owner, or by an escalation of the Task itself. Only Tasks have
  it; for the Specification it is an internal mechanism of its flow over its Tasks.
- G4. A Task can escalate to its Specification; the Specification workflow declares where an
  escalation leads, and the spec writer decides what happens next.
- G5. An explicit, typed, ordered and bounded context list per subject, with a sensible default.
- G6. Removing a Task by hand is easy, and the Engine detects any inconsistency it leaves; a broken
  Task never breaks the rest of its Specification.

**Non-goals (for now)**

- Parallel Tasks in separate worktrees (plan 06, F08). One worktree and one thread per Specification.
- Changing a Specification's archetype or a Task's type after creation.
- Path scopes (`allowed_paths` / `forbidden_paths`) enforcement. They come back only as a hint in
  the Task's context ([section 7](#7-context-building), Q9).
- A preparation status for the Specification (Q2).
- Gates (F03) and commits of the new files (F04); the new files follow whatever F04 decides for
  `.execution/`.

## 3. The workflow-managed subject contract

A **workflow-managed subject** is a resource whose manifest the Engine reads to run its workflow.
Shared fields:

| Field       | Specification                                              | Task                                      |
| ----------- | ---------------------------------------------------------- | ----------------------------------------- |
| `id`        | slug (with the persisted `spec_id` UUID)                   | Task id (lowercase, digits, dashes, ≤ 64) |
| `title`     | as today                                                   | ≤ 200 characters                          |
| `type`      | `archetype.id` (Specification archetype)                   | task type id                              |
| `workflow`  | derived: archetype `execution.workflow`, pinned in the run | derived: `task-type.workflow`, pinned     |
| `documents` | registry, required `overview`                              | registry, required `task` (`task.md`)     |
| `context`   | optional typed list ([section 7](#7-context-building))     | optional typed list                       |

**The preparation status is Task-only (Q2, decided).** It is an internal mechanism of the
Specification flow over its Tasks, not a property every subject has. A Specification gets no
`draft | ready | on-hold | cancelled` status; externally it reports at most whether it is completed or
ready to merge, derived from its workflow run (plan 06, F14), never stored as a free string. The
manifest's current free `status` string is replaced by that projection under F14.

Task-only fields: `status` (`draft | ready | on-hold | cancelled`, [section 5](#5-task-preparation-status)),
`summary` (one line for UI lists and cards, Q3; the full description is `task.md`), `dependsOn[]`,
`origin {step, attempt}` (the Specification attempt that created it), `hold` (why and by whom it is
on hold), and optionally `follows` (the Task a review or rework Task was created for, see
[section 6](#6-escalation-and-spec-writer-decisions)).

Sketch (TypeScript-like pseudocode, not a contract):

```ts
interface WorkflowManagedSubject<Kind extends 'specification' | 'task'> {
  readonly kind: Kind;
  readonly id: string;
  readonly title: string;
  readonly type: string; // archetype id or task type id
  readonly documents: readonly SubjectDocument[]; // {id, path, type}, paths relative to the subject folder
  readonly context?: readonly ContextEntry[]; // absent = default context of the kind
}

interface TaskManifest extends WorkflowManagedSubject<'task'> {
  readonly status: TaskStatus; // preparation status, never the workflow position
  readonly summary: string; // one line for UI lists and cards; the description is task.md
  readonly dependsOn: readonly string[];
  readonly origin: { readonly step: string; readonly attempt: number };
  readonly hold?: {
    readonly reason: 'escalated' | 'decided';
    readonly by: ExecutorRecord;
    readonly at: string;
    readonly note?: string;
  };
  readonly follows?: string;
}

type TaskStatus = 'draft' | 'ready' | 'on-hold' | 'cancelled';
```

The workflow is **not** stored in the manifest of either subject: it follows from the type, and the
run pins the resolved definition. A per-Task workflow override is rejected for now (it would couple a
Task to a workflow its type does not name, the coupling ADR 0019 rejected for Specifications).

**Recommendation.** Introduce the contract as a shared Engine interface and a shared read shape; keep
two parsers (the Specification manifest is already strict and versioned). The Engine operations take
a `WorkflowSubject` and read the subject through one port, so context resolution and the read model
need no per-kind branches; readiness from a preparation status exists only for Tasks.

## 4. Task folder layout and the Task index

Decided by the owner: **one folder per Task**, so a Task can be deleted as a whole.

```text
<specification>/
  specification.yaml
  overview.md
  tasks/
    index.yaml              # the ordered list of Tasks
    <task-id>/
      task.yaml             # Task manifest (section 3)
      task.md               # main description: the counterpart of overview.md
      notes.md              # optional extra files (notes, extra instructions, ...)
  .execution/
    specification.yaml      # Specification run
    tasks/<task-id>.yaml    # Task run only (section 8)
```

- The folder name is the Task id; `task.yaml` `id` must equal it (like `specification.yaml` `id` and
  the slug).
- `task.md` has document id and type `task`, is required and cannot be deleted while the Task exists.
  Extra files are registered in `task.yaml` `documents[]` or are `unclassified`, as in ADR 0015.
- `tasks/` becomes a reserved folder of a Specification: the Specification document tree and registry
  never list or register paths under it (today any file there would be `unclassified`).

### Where the index lives and what is authoritative

The planner agent needs one place to decide the layout and split of Tasks, and the system needs one
ordered list. Options:

| Option                                               | Authority                                                                 | Pros                                                                                                       | Cons                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. `tasks/index.yaml` is the registry                | Index: membership and order. Folder: content.                             | Same model as ADR 0015 (registry plus files); one ordered list; planner edits one file; folders stay small | Two places to touch when adding or deleting by hand                                                                                                    |
| B. Folders are authoritative, index is derived       | Folders. Order from an `order` field in each `task.yaml`; index generated | Deleting a folder is the whole deletion                                                                    | A derived file in Git drifts (legacy `index.generated.json` went stale, REC-03 in the legacy history); ordering spread over many files; no single list |
| C. The existing `specification.yaml` `tasks[]` field | Specification manifest                                                    | Reuses an existing, unused field; one registry per Specification                                           | The Specification manifest changes on every planning action; it grows towards `MANIFEST_MAX_BYTES`; a merge hotspot once F08 brings parallel worktrees |

**Decided (Q1): option A.** `tasks/index.yaml` is the only authority for which Tasks exist and in
which order:

```yaml
schemaVersion: 1
tasks:
  - id: activity-core-model
  - id: activity-local-store
```

- An index entry is only `{id}` (title and everything else live in `task.yaml`), so the index never
  duplicates Task data.
- The order is the planner's presentation and suggested execution order; dependencies remain the only
  constraint on what may start.
- A folder under `tasks/` without an index entry is `unregistered`: reported, never executed, never an
  error (like an unclassified document).

**Interim registry.** Until `tasks/index.yaml` exists, the Specification execution record
(`.execution/specification.yaml`) lists the Task ids in creation order (`taskIds`, plan 06, W15).
It plays the index's role for membership: a listed Task without its record is broken (only that
Task), and, stricter than the index rule above, a Task record that it does not list is refused as
corrupt state, because the provisional records carry no separate content folder to report. The
list moves to `tasks/index.yaml` with the Task folders (F20).

- An index entry without a folder or without `task.yaml` is `dangling`: reported, and the Task cannot
  start ([section 8](#8-impact-on-the-kernel-and-the-adrs)).
- A Task whose execution record exists (it has attempts) but whose folder or index entry is gone is
  `broken`: only that Task is affected, the rest of the Specification keeps working (Q10,
  [section 8](#8-impact-on-the-kernel-and-the-adrs)).
- The unused `specification.yaml` `tasks: []` field is removed from the manifest and its strict parser
  (no compatibility reader, as ADR 0015 decision 3).

Deleting a never-started Task by hand is then: delete the folder and its index line. The Engine also
offers a `removeTask` operation that does both, refuses a Task that has attempts or dependents, and
runs as one change. Deleting a started Task by hand leaves it `broken`.

## 5. Task preparation status

The preparation status says whether a Task may be worked on. The workflow position says where its
run is. They are separate dimensions: the position is never stored in `task.yaml`, and the status is
never derived from the position.

| Status      | Meaning                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `draft`     | Created by a breakdown; not reviewed yet. Cannot start.                                 |
| `ready`     | Accepted for execution. Can start when its dependencies are satisfied.                  |
| `on-hold`   | Kept, but must not start or continue until a decision. Keeps the Specification waiting. |
| `cancelled` | Will not be done. Final.                                                                |

There is no `completed` status: completion is the run reaching `terminal {completed}`.

### Transitions and who may make them

| From → to                                   | By                                                                                       | Allowed when                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| (new) → `draft`                             | A Specification step with `produces: tasks` (breakdown, or the spec writer adding Tasks) | Always; new Tasks always start as `draft`     |
| `draft` → `ready`                           | Review approval (see below), the spec writer, the owner                                  | The Task is valid (manifest, `task.md`, deps) |
| `ready` → `on-hold`                         | The spec writer, the owner, or the Task's own escalation                                 | The Task's run is not `active`                |
| `on-hold` → `ready`                         | The spec writer, the owner                                                               | —                                             |
| `draft` / `ready` / `on-hold` → `cancelled` | The spec writer, the owner                                                               | The run is not `active` and not terminal      |
| `cancelled` → anything                      | Nobody (create a new Task instead, Q4)                                                   | —                                             |

- **The spec writer** decides through the finish input of a Specification step that declares it
  manages Tasks (for example `manages: tasks` on the step, next to `produces: tasks`):
  `tasks.decisions[]` of `{id, status, note?}`. The whole finish is rejected if one decision is not
  allowed, as for Task proposals today.
- **The owner** decides through an owner operation (`setTaskStatus(specId, taskId, status, note)`)
  with a human executor from trusted context, under the project control lock.
- **Approval after review.** The seed runs `breakdown → breakdown-review → create-tasks`. With
  `draft`, the breakdown can materialize the Tasks immediately (the reviewer then reviews real
  folders), and approval becomes explicit. Options:
  - (a) a declared transition effect `approve-draft-tasks` on the review's `pass` transition, limited
    to the Tasks created by the reviewed breakdown attempt;
  - (b) the reviewer lists per-Task decisions in its finish input;
  - (c) keep `create-tasks` as the approving step.

  **Decided (Q11, implemented in W13): (a).** The effect is declared in the workflow and visible in the definition, so it
  is an explicit decision of the workflow author, applied to a known set of Tasks, not a side effect of
  a return. (b) stays available to spec writer steps.

- **A running Task is never put on hold or cancelled by the Engine.** A Task whose run is `active`
  first finishes or is returned by the owner (F13 stops its Session).

### Readiness and the wait step

Readiness of a Task (derived, never stored) becomes:

1. `broken` when the Task has an execution record but no registered folder (Q10, section 8);
2. `cancelled`, `draft`, `on-hold` from the status;
3. `dependencies {waitingFor}` when a direct dependency has not completed;
4. `unsatisfiable {dependency}` when a direct dependency is `cancelled`, `broken`, or its run ended
   `abandoned` (today `WORKFLOW_DEPENDENCY_UNSATISFIED`);
5. otherwise `ready`.

The Specification's wait step completes when every Task is **closed**: its run is terminal, or its
status is `cancelled`. An `on-hold` or `broken` Task keeps the Specification waiting (a `draft` Task
cannot be open there, see the guard below). When open Tasks exist but none is `ready`, the
Specification gets `tasks-stuck` (unchanged rule, wider input). A cancelled Task whose run never
started gets no execution record at all ([section 8](#8-impact-on-the-kernel-and-the-adrs)).

### Guard before implementation

Decided by the owner (2026-11-05, Q2): **a Specification cannot enter its wait step while any
non-cancelled Task is `draft`.** Every Task must be ready to implement (or deliberately cancelled)
before implementation is handed over. This is a new kernel rule:

- It is a condition on **entering** a `wait-for-tasks` step, checked on the state the change would
  produce: after the finish's `tasks` and `taskDecisions` and after the transition's effects (so
  `approve-draft-tasks` on the seed's `breakdown-review` `pass` satisfies it in the same change).
- A finish whose transition would enter the wait step while a non-cancelled `draft` Task remains is
  refused with `WORKFLOW_INPUT_INVALID` and a dedicated message naming the draft Tasks (for example
  "cannot enter wait step `implementation`: Tasks still draft: a, b"), before anything is written. The
  attempt stays active, so the agent or the owner can finish again with a different result or with
  decisions that approve or cancel the drafts.
- The rule belongs to the kernel, not to the seed workflow, so every Specification workflow gets it
  without declaring it; it is the deterministic enforcement of an invariant the system can observe.
- It removes today's case where a Specification waits on drafts and reports `tasks-stuck` for them;
  a Task can still become `on-hold` while the Specification waits (escalation, decision), which keeps
  waiting as today.

The same "condition on entering a step" is the place for later entry conditions (for example a gate
before a Specification execute or implement step, F03); the guard is the first one.

### What happens on a Specification return

The kernel effects `block-pending-tasks` and `unblock-tasks` are removed, together with
`TaskRecord.blocked`. A return changes no Task status by itself and carries no decisions (Q5,
decided): if Tasks should be held while the Specification is reworked, the spec writer step that
follows the return decides it (it sees every Task with its status and can hold, cancel or approve
them), or the owner uses `setTaskStatus`.

## 6. Escalation and spec writer decisions

A Task can find that the Specification is wrong or incomplete. It then finishes with an escalation
instead of guessing:

- A Task workflow declares a transition with a result such as `needs-spec-change`, `feedback: required`
  and the marker `escalate: true` (W13). Its target is the step to resume later (usually the same
  work step), so the run goes to `ready {step}` and the handoff keeps the feedback.
- In the same change the Engine sets the Task to `on-hold` (`hold.reason: escalated`, the finishing
  executor, the time and the feedback). The Task itself gets no attention item.
- The Specification reacts through a **declared transition** of its workflow (Q6, decided), not
  through a generic owner return; see [below](#the-escalation-transition). The step it leads to
  (in the seed `breakdown`, "Add or change Tasks") has a context that lists every escalated Task with
  its feedback, and every Task with its status.
- The spec writer then decides, in that step's finish input:
  - which Tasks stay valid (`ready`), which are held, which are cancelled;
  - edits to the documents of Tasks that have not started (through document writes, not the finish
    input);
  - new Tasks, for example a review or rework Task for a Task that already finished (`follows: <id>`),
    created as `draft` and approved like any other.
- Resuming the escalated Task (`on-hold` → `ready`) continues its run at the step the escalation
  named, with the escalation feedback and the spec writer's note in the handoff.

### The escalation transition

Today (W13) an escalation gives the Specification, while it is active on its wait step, the attention
item `task-escalated`; the wait step stays active and the owner resolves it with a generic return (for
example "Add or change Tasks" → `breakdown`) or a `setTaskStatus` decision. Decided (Q6): the
Specification workflow declares where an escalation leads, so the reaction is visible in the
definition and needs no owner improvisation.

Minimal schema idea: a transition of a `wait-for-tasks` step gains a trigger `on`, with the values
`tasks-finished` (today's only, implicit transition) and `task-escalated`:

```yaml
- id: implementation
  kind: wait-for-tasks
  transitions:
    - id: tasks-finished
      on: tasks-finished
      to: { step: acceptance }
    - id: task-escalated
      on: task-escalated
      to: { step: breakdown }
      feedback: required # filled by the Engine with the ids of the escalated Tasks
```

- **Load-time checks:** `on` exists only on wait-step transitions (a work step keeps `result`); at
  most one transition per trigger; `tasks-finished` is required (a transition without `on` counts
  as `tasks-finished`, W14); a `task-escalated` transition targets
  a step, not a terminal, and needs `feedback: required`. `continuation` and `effects` work as on any
  transition (the seed keeps `owner-action`, so the owner sees the move before the spec writer runs).
- **Taking it:** in the same change as the escalating Task's finish, when the Specification is active
  on the wait step, the Engine ends the wait attempt with the `task-escalated` transition; the next
  step's handoff feedback is a bounded Engine text naming **every** escalated Task (`Escalated Tasks:
<ids>. Each Task's escalation feedback is in its status change.`), and each reason is in that
  Task's `statusChange` in the step's `existingTasks`. When the Specification is elsewhere (for
  example back at `breakdown` after a return), nothing happens then, and it cannot enter the wait
  step again while a Task is still escalated: the guard refuses entering a wait step while a Task is
  `draft` or on hold by its own escalation (`WORKFLOW_INPUT_INVALID`, naming both), so the spec
  writer or the owner resolves each escalation (resume or cancel) first.
- **Without the transition** (a workflow that declares none) the kernel keeps today's behaviour: the
  wait step stays active with the attention item `task-escalated`, and the owner returns or decides.
- **Generalisation.** The same trigger mechanism is how a future Specification `execute` or
  `implement` step (one that drives its Tasks itself instead of only waiting) declares explicit
  transitions for Task events, instead of the Engine moving the Specification implicitly.

### Attention priority

At most one attention item exists per subject. If a Specification has both an escalation and a stuck
wait, `task-escalated` wins because it names the cause (Q7, decided). The item lists **all** escalated
Tasks (`taskIds`, in id order), not only the first, in the item and in
`FinishStepResult.specification` (implemented in W14). The item is removed once no
Task is escalated any more, as today.

One worktree and one thread for now: escalations and decisions happen in the Specification's checkout.

## 7. Context building

Both subjects are context providers. A step's context has two parts:

- **Workflow-provided** (exists today in `StepContext`): agent archetype profile and instructions,
  step purpose and instructions, task-type instructions, handoff, allowed task types, existing Tasks.
- **Subject-provided** (new): the resolved `context` list of the subject.

### Entry kinds

| Kind                     | Fields                                      | Resolves to                                                                                                                 |
| ------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `document`               | `id`                                        | A document of the subject's own registry                                                                                    |
| `specification-document` | `id`                                        | A Task only: a document of its Specification's registry (for example `overview`)                                            |
| `repository-document`    | `id`                                        | A repository document by stable id, resolved like `pnpm docs:get <id>`                                                      |
| `path`                   | `path` (file or glob)                       | Files relative to the repository root (an area, a package folder, a reference file)                                         |
| `instructions`           | `text`                                      | Inline instructions (bounded)                                                                                               |
| `path-hint`              | `allowed[]`, `forbidden[]` (paths or globs) | A Task only: where the change is expected and where it must not go. Passed to the agent as a hint; nothing enforces it (Q9) |

Every entry has `required` (default `true`) and an optional `note` saying why it is there. A
`path-hint` resolves to no files and is never `omitted`; it replaces legacy `allowed_paths` /
`forbidden_paths` as context only. Enforcement (for example by gates, F03) is not planned.

### Defaults, order and budgets

- **Default when `context` is absent:**
  - Specification: every registered document at the start of the step. Specification agents create
    documents while they work, so the registry at step start is the context; nothing has to be kept in
    sync by hand.
  - Task (Q8, decided): `task.md`, its other registered documents, and the Specification's
    `overview`. Any other Specification document must be listed explicitly as a
    `specification-document` entry.
- **An explicit `context` replaces the default**; it does not extend it. A Task's own `task` document
  is always included first, explicit or not.
- **Order is deterministic:** workflow-provided parts first (fixed order as in `StepContext`), then the
  subject's entries in declared order, glob matches sorted by path. The same state always yields the
  same list.
- **References, not content.** The step context carries each resolved entry as
  `{kind, ref, path?, sha256, bytes}`; the agent reads the files. Only `instructions` text is inline.
- **Budgets** (in `workflow/limits.ts`, the single source): at most a fixed number of entries, of glob
  matches per entry, of inline instruction characters, and of total resolved bytes. A manifest whose
  context breaks a budget is refused when it is written; a state that breaks one at step start refuses
  the start.
- **Missing entries:** a missing `required` entry refuses the start with a new code
  (`WORKFLOW_CONTEXT_UNRESOLVED`, naming the entry) before anything changes; a missing optional entry
  is listed as `omitted`. This follows the rule "prevent bad state with simple validation".
- The planned read contract (`task-read.ts` `hints[]` of kind `doc` / `file`, resources with relation
  `context`) is the projection of this list; `skill` hints come from the agent archetype profile.

### Evidence per attempt

Recording what an agent was given makes reviews and escalations explainable. Options:

- (a) nothing recorded; recompute on demand (wrong once files change);
- (b) a `context` digest (sha256 of the resolved list) and entry count on the attempt record, the full
  resolved list in a local evidence file per attempt;
- (c) the full resolved list on the attempt record.

**Decided (Q12): (b).** Per attempt, a digest of the resolved context list in Git, the full list
locally. The tracked record stays small (it is bounded by `RECORD_BYTES_MAX`, see
F19), the digest proves which list was used, and the local file gives the detail on the machine that
ran the attempt.

## 8. Impact on the kernel and the ADRs

- **New ADR (proposed 0020): Tasks are resources.** Amends the ADR 0015 consequence "Reviews and Tasks
  remain separate resources; they are not documents" to: a Task is a resource with its own manifest and
  document registry, under the reserved `tasks/` folder; it is still not a document of the
  Specification. Amends ADR 0019 decision 6 (returns no longer apply Task effects) and decision 9
  (a Task execution record holds only the run).
- **Task execution record.** `.execution/tasks/<id>.yaml` keeps only `{specId, taskId, run}`. Title,
  summary, type, `dependsOn`, origin and hold move to `task.yaml`; `TaskBlock` and `blocked` are
  removed. The record is created at the Task's first start, so a Task that never started is only its
  folder and index entry and can be deleted by hand without leftovers.
- **Effects.** `block-pending-tasks` and `unblock-tasks` are removed from `WORKFLOW_EFFECTS`, the seed
  `specification-standard` and its tests. `approve-draft-tasks` is added if option (a) of section 5 is
  accepted.
- **Materialization.** `materializeTasks` writes the Task folders (`task.yaml`, `task.md` from the
  finish input or a task-type template) and the index entries, all as `draft`, in the same change as
  the finish. The change journal therefore gains targets outside `.execution/`; the replay and publish
  checks apply to them unchanged. Commit behaviour follows F04.
- **Finish input.** A Task proposal gains the main description (`description` → `task.md`) and an
  optional `context`; it keeps the one-line `summary` (Q3), stored in `task.yaml`.
- **Draft guard.** Entering a `wait-for-tasks` step is refused while a non-cancelled Task is `draft`
  ([section 5](#guard-before-implementation)): `WORKFLOW_INPUT_INVALID` with a dedicated message,
  checked on the resulting state, before anything is written.
- **Wait-step triggers.** Wait-step transitions gain `on: tasks-finished | task-escalated`; the
  `task-escalated` attention item and `FinishStepResult.specification` list every escalated Task
  ([section 6](#6-escalation-and-spec-writer-decisions)).
- **Specification status.** No preparation status for the Specification; the manifest's free `status`
  string gives way to the run projection of F14 (completed / ready to merge).
- **Step context.** `StepContext` gains `context` (the resolved list) and, for steps that manage Tasks,
  each Task's status and hold. `existingTasks` reads the index and the manifests.
- **Consistency checks (every read and every change).**
  - index entry ↔ folder ↔ `task.yaml` `id`;
  - `dependsOn` names registered Tasks, without cycles;
  - an execution record whose Task is not registered (the folder or index entry of a started Task
    deleted by hand) makes **only that Task** `broken` (Q10, decided). It is not a Specification-wide
    `WORKFLOW_STATE_CORRUPT`: other Tasks and the Specification keep working. A `broken` Task cannot
    start or finish (refused naming the Task, before anything changes), is listed as broken by
    `inspectExecution` and the read model, counts as open for the wait step (so, with nothing else
    able to progress, the Specification gets `tasks-stuck`), and makes its dependents
    `unsatisfiable`. Nothing repairs it automatically: the owner restores the folder and index entry,
    or deletes the execution record by hand. This prevents further damage with one simple check per
    Task instead of recovery code;
  - a dangling index entry or an unregistered folder is a validation issue shown by
    `inspectExecution`; a dependent of a dangling Task cannot start.
- **Document operations.** The Specification document tree, registry and write operations exclude
  `tasks/`; Task documents get the same operations scoped to a Task (later slice).
- **Plan 06.** F06 ("Revising and cancelling Tasks") is largely replaced by sections 5 and 6; its open
  acceptance question (abandoned or cancelled Tasks at acceptance) remains.

## Open questions

All questions are decided; the original question is kept briefly after each decision.

- **Q1 (decided, 2026-11-05).** Option A: `tasks/index.yaml` is the registry, and the unused
  `specification.yaml` `tasks` field is removed ([section 4](#4-task-folder-layout-and-the-task-index)).
  Original question: index location and authority?
- **Q2 (decided, 2026-11-05).** The Specification does **not** get the preparation status set. The
  preparation status is an internal mechanism of the Specification flow for its Tasks; externally a
  Specification reports at most whether it is completed or ready to merge, derived from its run (F14).
  The shared subject contract has `id`, `title`, `type`, `workflow`, `documents` and `context`;
  `status` is Task-only ([section 3](#3-the-workflow-managed-subject-contract)). New kernel rule: the
  Specification cannot enter its wait step while any non-cancelled Task is `draft`; the finish that
  would enter it is refused with `WORKFLOW_INPUT_INVALID` and a dedicated message before anything is
  written ([section 5](#guard-before-implementation)). Original question: the same status set for the
  Specification, or a projection of the run?
- **Q3 (decided, 2026-11-05).** Keep a short one-line `summary` in `task.yaml` for UI lists and cards;
  the full description is `task.md`. Original question: keep `summary`, or title plus `task.md`?
- **Q4 (decided, W13).** `cancelled` is final; a new Task replaces a cancelled one if needed.
- **Q5 (decided, W13).** Only explicit decisions: a return changes no Task, and the spec writer step
  (`taskDecisions`) or the owner (`setTaskStatus`) decides. Original question: on a Specification
  return, should the return dialog offer "hold all Tasks that have not
  started" as an explicit choice, or should only the spec writer step decide?
- **Q6 (decided, 2026-11-05).** An explicit declared transition of the Specification workflow, not a
  generic owner return: the wait step declares a transition with the trigger `task-escalated` (in the
  seed to `breakdown`); the same mechanism serves a future Specification execute or implement step
  ([section 6](#the-escalation-transition)). Original question: owner return to an existing step, or a
  dedicated "revise Tasks" step reachable from the wait step?
- **Q7 (decided, 2026-11-05).** `task-escalated` wins over `tasks-stuck`, and one attention item lists
  **all** escalated Tasks, a kernel change from today's item naming the first
  ([section 6](#attention-priority)). Original question: priority, and several escalations in one
  item?
- **Q8 (decided, 2026-11-05).** Default Task context: `task.md`, the Task's other documents and the
  Specification `overview`; other Specification documents are listed explicitly
  ([section 7](#defaults-order-and-budgets)). Original question: that default, or every Specification
  document?
- **Q9 (decided, 2026-11-05).** `allowed_paths` / `forbidden_paths` come back only as a hint in the
  Task's context (`path-hint`), without enforcement ([section 7](#entry-kinds)). Original question: a
  Task scope enforced by gates (F03), or stay out?
- **Q10 (decided, 2026-11-05).** Manual deletion of the folder of a Task that has attempts breaks only
  that Task: it is reported as `broken`, cannot start or finish, and keeps the wait open
  (`tasks-stuck` when nothing else can progress); the rest of the Specification keeps working
  ([section 8](#8-impact-on-the-kernel-and-the-adrs)). This replaces the earlier recommendation to fail
  closed for the whole Specification. Original question: fail closed for the whole Specification, or
  only for that Task?
- **Q11 (decided, W13).** Option (a), the declared effect `approve-draft-tasks`; `taskDecisions`
  stay available to every Specification step. Original question: approval after review: option (a)
  declared effect, (b) reviewer decisions, or (c) keep
  `create-tasks`?
- **Q12 (decided, 2026-11-05).** Option (b): per attempt, a digest of the resolved context list in
  Git, the full list locally ([section 7](#evidence-per-attempt)). Original question: accept option
  (b)?

## Suggested implementation slices

Each slice is reviewable on its own; the order follows the dependencies. The lifecycle (statuses,
decisions, approval after review, escalation with `escalate: true`, the `task-escalated` reason) is
already implemented in the provisional storage (W13); `removeTask` and the storage remain.

1. **ADR 0020 and the architecture update** (owner decisions Q1 to Q12). Documentation only.
2. **Kernel follow-ups to W13** (implemented, plan 06 W14; a wait-step transition without `on`
   counts as `tasks-finished`), in the current provisional storage (they need no Task folders):
   - the draft and escalation guard: entering a `wait-for-tasks` step is refused while a Task is
     `draft` or on hold by its own escalation (`WORKFLOW_INPUT_INVALID`, dedicated message naming
     the draft and the escalated Tasks, checked after decisions and effects, before anything is
     written);
   - one `task-escalated` item (and `FinishStepResult.specification`) listing every escalated Task
     instead of the first;
   - the explicit escalation transition: `on: tasks-finished | task-escalated` on wait-step
     transitions, its load-time checks, taking it in the escalating finish with a bounded handoff
     text naming the escalated Tasks, and the seed `specification-standard` declaring `task-escalated` to `breakdown`.

   Depends on 1 (the kernel document and ADR 0019 change with it).

3. **Task resource.** `task.yaml` (with `status` and `summary`) and `tasks/index.yaml` schemas
   (contracts, JSON Schemas), strict parsers, removal of the `specification.yaml` `tasks` field, the
   reserved `tasks/` folder excluded from Specification documents, validation results (`dangling`,
   `unregistered`, `broken`, dependency checks). Depends on 1.
4. **Kernel on the Task resource.** Slim execution record created at first start, readiness from the
   status and the `broken` check, `materializeTasks` writing folders and index as `draft`, removal of
   the block effects and seed update, journal targets outside `.execution/`, `removeTask`. Depends
   on 3.
5. **Context.** Entry kinds (including `path-hint`), defaults, order, budgets, `StepContext.context`,
   the attempt digest and the local evidence file. Depends on 3; independent of 2 and 4.

**Verification that would prove the outcome** (to be refined in the ADR):

- a breakdown creates Task folders and index entries as `draft`, and no draft Task can start;
- a finish that would enter the wait step while a non-cancelled Task is `draft` is refused with
  `WORKFLOW_INPUT_INVALID` naming the drafts, and nothing is written; the same finish with
  `approve-draft-tasks`, or with decisions that approve or cancel every draft, enters the wait step;
- an approved Task starts; its step context lists `task.md`, its other documents and the
  Specification `overview` (or its explicit entries) in order, with hashes; the attempt record holds
  the digest and the full list stays local;
- a Task escalation puts it on hold and moves the Specification along its declared `task-escalated`
  transition with the escalated Tasks named in the handoff (each reason in its `statusChange`); without that transition, one `task-escalated`
  item lists every escalated Task and wins over `tasks-stuck`; a spec writer decision resumes the
  Task at the named step with the feedback in the handoff;
- a Specification return changes no Task status;
- the wait step completes with cancelled and completed Tasks, and waits for on-hold and broken Tasks;
- deleting a never-started Task folder and its index line leaves a consistent state; deleting a
  started Task's folder makes only that Task `broken` (it cannot start or finish, its dependents are
  unsatisfiable), while the other Tasks and the Specification keep working.
