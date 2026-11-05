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
  Owner ideas, not yet decisions: one workflow-managed subject contract for Specifications and Tasks,
  one folder per Task with a manifest, a main document and an index, a Task preparation status
  (draft, ready, on-hold, cancelled) separate from the workflow position, explicit hold and cancel
  decisions instead of automatic Task effects on a Specification return, escalation from a Task to its
  Specification, and an explicit typed context list per subject. Options, recommendations, open
  questions and implementation slices.
related:
  - architecture.workflow.workflow-kernel
  - adr.0015-specification-manifest-as-document-registry
  - adr.0017-definitions-as-project-data
  - adr.0019-workflow-kernel-and-automatic-continuation
  - ideas.specflow-engine.plan-06
  - ideas.specflow-engine.workflow-api-requirements
---

# Tasks as workflow-managed resources, and context building

**Status: draft.** This records the owner's ideas for later implementation. Nothing here is decided
or implemented. The current behaviour is described in
[Workflow kernel](../../architecture/workflow/workflow-kernel.md); where this document differs, the
kernel document is right until an ADR accepts the change. Each section ends with a recommendation;
the [open questions](#open-questions) need an owner answer before the ADR is written.

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
  decisions of the spec writer or the owner, or by an escalation of the Task itself.
- G4. A Task can escalate to its Specification; the spec writer decides what happens next.
- G5. An explicit, typed, ordered and bounded context list per subject, with a sensible default.
- G6. Removing a Task by hand is easy, and the Engine detects any inconsistency it leaves.

**Non-goals (for now)**

- Parallel Tasks in separate worktrees (plan 06, F08). One worktree and one thread per Specification.
- Changing a Specification's archetype or a Task's type after creation.
- Path scopes (`allowed_paths` / `forbidden_paths`) enforcement; see [open question Q9](#open-questions).
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
| `status`    | preparation status (values per kind, see Q2)               | `draft \| ready \| on-hold \| cancelled`  |
| `documents` | registry, required `overview`                              | registry, required `task` (`task.md`)     |
| `context`   | optional typed list ([section 7](#7-context-building))     | optional typed list                       |

Task-only fields: `dependsOn[]`, `origin {step, attempt}` (the Specification attempt that created it),
`hold` (why and by whom it is on hold), and optionally `follows` (the Task a review or rework Task
was created for, see [section 6](#6-escalation-and-spec-writer-decisions)).

Sketch (TypeScript-like pseudocode, not a contract):

```ts
interface WorkflowManagedSubject<Kind extends 'specification' | 'task', Status extends string> {
  readonly kind: Kind;
  readonly id: string;
  readonly title: string;
  readonly type: string; // archetype id or task type id
  readonly status: Status; // preparation status, never the workflow position
  readonly documents: readonly SubjectDocument[]; // {id, path, type}, paths relative to the subject folder
  readonly context?: readonly ContextEntry[]; // absent = default context of the kind
}

interface TaskManifest extends WorkflowManagedSubject<'task', TaskStatus> {
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
a `WorkflowSubject` and read the subject through one port, so readiness, context resolution and the
read model need no per-kind branches beyond the status values.

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

**Recommendation: option A.** `tasks/index.yaml` is the only authority for which Tasks exist and in
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
- An index entry without a folder or without `task.yaml` is `dangling`: reported, and the Task cannot
  start ([section 8](#8-impact-on-the-kernel-and-the-adrs)).
- The unused `specification.yaml` `tasks: []` field is removed from the strict parser (no compatibility
  reader, as ADR 0015 decision 3).

Deleting a Task by hand is then: delete the folder and its index line. The Engine also offers a
`removeTask` operation that does both, refuses a Task that has attempts or dependents, and runs as one
change.

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

  **Recommendation: (a).** The effect is declared in the workflow and visible in the definition, so it
  is an explicit decision of the workflow author, applied to a known set of Tasks, not a side effect of
  a return. (b) stays available to spec writer steps.

- **A running Task is never put on hold or cancelled by the Engine.** A Task whose run is `active`
  first finishes or is returned by the owner (F13 stops its Session).

### Readiness and the wait step

Readiness of a Task (derived, never stored) becomes:

1. `cancelled`, `draft`, `on-hold` from the status;
2. `dependencies {waitingFor}` when a direct dependency has not completed;
3. `unsatisfiable {dependency}` when a direct dependency is `cancelled` or its run ended `abandoned`
   (today `WORKFLOW_DEPENDENCY_UNSATISFIED`);
4. otherwise `ready`.

The Specification's wait step completes when every Task is **closed**: its run is terminal, or its
status is `cancelled`. A `draft` or `on-hold` Task keeps the Specification waiting. When open Tasks
exist but none is `ready`, the Specification gets `tasks-stuck` (unchanged rule, wider input). A
cancelled Task whose run never started gets no execution record at all ([section 8](#8-impact-on-the-kernel-and-the-adrs)).

### What happens on a Specification return

The kernel effects `block-pending-tasks` and `unblock-tasks` are removed, together with
`TaskRecord.blocked`. A return changes no Task status by itself. If the owner wants Tasks held while
the Specification is reworked, the return carries explicit decisions (the same `{id, status, note}`
list as the spec writer's), chosen in the return dialog (Q5). The spec writer step that follows the
return sees every Task with its status and can hold, cancel or approve them.

## 6. Escalation and spec writer decisions

A Task can find that the Specification is wrong or incomplete. It then finishes with an escalation
instead of guessing:

- A Task workflow declares a transition with a result such as `needs-spec-change`, `feedback: required`
  and a marker `escalate: specification`. Its target is the step to resume later (usually the same
  work step), so the run goes to `ready {step}` and the handoff keeps the feedback.
- In the same change the Engine sets the Task to `on-hold` (`hold.reason: escalated`, the finishing
  executor, the time and the feedback) and records an attention item for the **Specification** with a
  new reason `task-escalated {taskId, step, attempt}`. The Task itself gets no attention item.
- The Specification is usually at its wait step. The owner returns it to a declared step (existing
  mechanism; returns from a wait step are allowed), or the seed gains a dedicated spec writer step for
  this (Q6). That step's context lists the escalations and every Task with its status.
- The spec writer then decides, in that step's finish input:
  - which Tasks stay valid (`ready`), which are held, which are cancelled;
  - edits to the documents of Tasks that have not started (through document writes, not the finish
    input);
  - new Tasks, for example a review or rework Task for a Task that already finished (`follows: <id>`),
    created as `draft` and approved like any other.
- Resuming the escalated Task (`on-hold` → `ready`) continues its run at the step the escalation
  named, with the escalation feedback and the spec writer's note in the handoff.

At most one attention item exists per subject. If a Specification has both an escalation and a stuck
wait, `task-escalated` wins because it names the cause (Q7).

One worktree and one thread for now: escalations and decisions happen in the Specification's checkout.

## 7. Context building

Both subjects are context providers. A step's context has two parts:

- **Workflow-provided** (exists today in `StepContext`): agent archetype profile and instructions,
  step purpose and instructions, task-type instructions, handoff, allowed task types, existing Tasks.
- **Subject-provided** (new): the resolved `context` list of the subject.

### Entry kinds

| Kind                     | Fields                | Resolves to                                                                         |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------- |
| `document`               | `id`                  | A document of the subject's own registry                                            |
| `specification-document` | `id`                  | A Task only: a document of its Specification's registry (for example `overview`)    |
| `repository-document`    | `id`                  | A repository document by stable id, resolved like `pnpm docs:get <id>`              |
| `path`                   | `path` (file or glob) | Files relative to the repository root (an area, a package folder, a reference file) |
| `instructions`           | `text`                | Inline instructions (bounded)                                                       |

Every entry has `required` (default `true`) and an optional `note` saying why it is there.

### Defaults, order and budgets

- **Default when `context` is absent:**
  - Specification: every registered document at the start of the step. Specification agents create
    documents while they work, so the registry at step start is the context; nothing has to be kept in
    sync by hand.
  - Task: `task.md`, its other registered documents, and the Specification's `overview`
    (recommendation; Q8).
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

**Recommendation: (b).** The tracked record stays small (it is bounded by `RECORD_BYTES_MAX`, see
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
  optional `context`; `summary` may go (Q3).
- **Step context.** `StepContext` gains `context` (the resolved list) and, for steps that manage Tasks,
  each Task's status and hold. `existingTasks` reads the index and the manifests.
- **Consistency checks (every read and every change).**
  - index entry ↔ folder ↔ `task.yaml` `id`;
  - `dependsOn` names registered Tasks, without cycles;
  - an execution record whose Task is not registered (a folder of a started Task deleted by hand) fails
    closed with `WORKFLOW_STATE_CORRUPT` naming the Task; the repair is restoring the folder or deleting
    the record by hand (Q10);
  - a dangling index entry or an unregistered folder is a validation issue shown by
    `inspectExecution`; a dependent of a dangling Task cannot start.
- **Document operations.** The Specification document tree, registry and write operations exclude
  `tasks/`; Task documents get the same operations scoped to a Task (later slice).
- **Plan 06.** F06 ("Revising and cancelling Tasks") is largely replaced by sections 5 and 6; its open
  acceptance question (abandoned or cancelled Tasks at acceptance) remains.

## Open questions

- **Q1.** Index location and authority: accept option A (`tasks/index.yaml` as the registry) and remove
  the unused `specification.yaml` `tasks` field?
- **Q2.** Does the Specification get the same preparation status set (`draft`, `ready`, `on-hold`,
  `cancelled`), or does its `status` become a projection of the run (F14)? The contract needs one
  answer per kind.
- **Q3.** Does a Task keep `summary` next to `task.md`, or is the title plus `task.md` enough?
- **Q4.** Is `cancelled` final, or may the owner reopen a cancelled Task that never started?
- **Q5.** On a Specification return, should the return dialog offer "hold all Tasks that have not
  started" as an explicit choice, or should only the spec writer step decide?
- **Q6.** After an escalation, does the owner return the Specification to an existing step, or does
  the seed workflow gain a dedicated "revise Tasks" spec writer step reachable from the wait step?
- **Q7.** Attention priority when an escalation and `tasks-stuck` coincide (recommended:
  `task-escalated`), and whether several escalations are listed in one item.
- **Q8.** Default Task context: `task.md` plus Task documents plus the Specification `overview`, or
  every Specification document?
- **Q9.** Do legacy `allowed_paths` / `forbidden_paths` come back as a Task scope (with enforcement by
  gates, F03), or stay out?
- **Q10.** Manual deletion of a Task that has attempts: fail closed for the whole Specification
  (recommended, simple) or only for that Task?
- **Q11.** Approval after review: option (a) declared effect, (b) reviewer decisions, or (c) keep
  `create-tasks`?
- **Q12.** Context evidence: accept option (b) (digest tracked, full list local)?

## Suggested implementation slices

Each slice is reviewable on its own; the order follows the dependencies.

1. **ADR 0020 and the architecture update** (owner decisions Q1 to Q12). Documentation only.
2. **Task resource.** `task.yaml` and `tasks/index.yaml` schemas (contracts, JSON Schemas), strict
   parsers, the reserved `tasks/` folder excluded from Specification documents, validation results
   (`dangling`, `unregistered`, dependency checks). Depends on 1.
3. **Kernel on the Task resource.** Slim execution record created at first start, readiness from the
   status, `materializeTasks` writing folders and index as `draft`, removal of the block effects and
   seed update, journal targets outside `.execution/`. Depends on 2.
4. **Lifecycle decisions.** `tasks.decisions[]` for spec writer steps, `setTaskStatus`, approval after
   review, wait-step completion with cancelled Tasks, `removeTask`. Depends on 3.
5. **Escalation.** The `escalate` transition marker, the `task-escalated` attention reason, hold on
   escalation, seed Task workflows with `needs-spec-change`. Depends on 4.
6. **Context.** Entry kinds, defaults, order, budgets, `StepContext.context`, the attempt digest and the
   local evidence file. Depends on 2; independent of 4 and 5.

**Verification that would prove the outcome** (to be refined in the ADR):

- a breakdown creates Task folders and index entries as `draft`, and no draft Task can start;
- an approved Task starts; its step context lists `task.md`, its context entries in order, with
  hashes;
- a Task escalation puts it on hold, gives the Specification `task-escalated`, and a spec writer
  decision resumes it at the named step with the feedback in the handoff;
- a Specification return changes no Task status unless decisions are given;
- the wait step completes with cancelled and completed Tasks, and waits for draft and on-hold Tasks;
- deleting a never-started Task folder and its index line leaves a consistent state; deleting a
  started Task's folder fails closed naming the Task.
