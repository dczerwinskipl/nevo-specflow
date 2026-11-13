---
id: ideas.specflow-engine.task-resource-and-context
type: engineering
title: Tasks as workflow-managed resources and context building (draft)
status: draft
scope: specflow
areas: [workflow, runtime, ai]
tags: [draft, tasks, lifecycle, context, escalation, manifest]
read_when:
  - replacing the provisional Task record of the workflow kernel
  - designing Task folders, the Task index or Task documents
  - designing how the context of a Specification or Task step is built
  - writing the ADR that makes Tasks a resource with their own documents
summary: >
  Owner decisions (2026-11-05), not yet an ADR, for the open part of plan 06 F20: one
  workflow-managed subject contract for Specifications and Tasks, one folder per Task with a manifest,
  a main document and the Task index as registry, and an explicit typed context list per subject.
  The Task lifecycle (status, decisions, approval, escalation, guard) is implemented and lives in the
  workflow kernel document. Options, decisions and the remaining implementation slices.
related:
  - architecture.workflow.workflow-kernel
  - adr.0015-specification-manifest-as-document-registry
  - adr.0017-definitions-as-project-data
  - adr.0019-workflow-kernel-and-automatic-continuation
  - ideas.specflow-engine.plan-06
  - ideas.specflow-engine.workflow-api-requirements
---

# Tasks as workflow-managed resources, and context building

**Status: draft.** This records the owner's decisions for later implementation. The current
behaviour, including the whole Task lifecycle (preparation status `draft | ready | on-hold |
cancelled` with `statusChange`, `taskDecisions` and `setTaskStatus`, the `approve-draft-tasks`
effect, escalation with `escalate: true`, the wait-step triggers `on: tasks-finished |
task-escalated`, the draft and escalation guard, the `taskIds` Task set and broken Tasks), is in
[Workflow kernel](../../architecture/workflow/workflow-kernel.md); where this document differs, the
kernel document is right until an ADR accepts the change. What remains is the Task **storage** and
**context** (plan 06 F20): today a Task is one `.execution/tasks/<id>.yaml` record holding its
metadata, status and run, with no document to work on.

Legacy nevo kept a Task as one markdown file with YAML frontmatter (`status`, `context.required` /
`context.optional`, `allowed_paths` / `forbidden_paths`). The lesson kept here: a Task needs a real
document to work on and an explicit context list. The lesson not kept: frontmatter as the source of
truth (ADR 0015 rejects it) and one status axis that mixes preparation with execution.

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

Task-only fields: `status` (`draft | ready | on-hold | cancelled`, the kernel's "Status"),
`summary` (one line for UI lists and cards, Q3; the full description is `task.md`), `dependsOn[]`,
`origin` (tagged as owner-created or from a producing Specification attempt), creation-time
`expectedBinding` (Task Type/Workflow revisions and relevant Specification archetype policy),
`statusChange` (the last
explicit status change, as in the kernel), and optionally `follows` (the Task a review or rework Task was created for, see
the kernel's "Escalation").

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
  readonly origin:
    | { readonly kind: 'manual'; readonly actorId: string }
    | { readonly kind: 'produced'; readonly step: string; readonly attempt: number };
  readonly expectedBinding: {
    readonly taskTypeFingerprint: string; // canonical hash of relevant Task Type fields
    readonly workflowId: string;
    readonly workflowRevision: string;
    readonly specificationTaskTypePolicyDigest: string;
  }; // validation evidence at creation, NOT a Task-specific workflow override or Run
  readonly statusChange?: {
    readonly source: 'decision' | 'escalation';
    readonly at: string;
    readonly reason?: string;
  };
  readonly follows?: string;
}

type TaskStatus = 'draft' | 'ready' | 'on-hold' | 'cancelled';
```

The selected Workflow still follows from the Task Type, and a per-Task Workflow override remains
rejected. **Draft F20 addendum (pending ADR):** record the expected Task Type content fingerprint (no TaskType revision field exists today),
derived Workflow id/revision and the Specification archetype's relevant allow-list fingerprint
at Task creation, even if no SpecificationRun exists. This is **binding evidence**, not a user
workflow override and not a started Run. On first start compare live definitions and policy with
this evidence. Refuse drift until an explicitly authorized, revision-checked
`rebindUnstartedTask` confirms adoption of current definitions. It cannot rebind a started Task.
The Run pins the newly confirmed Workflow only when the Task is actually started.

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
(`.execution/specification.yaml`) lists the Task ids in creation order (`taskIds`, see the kernel's "The Task set").
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

## 5. Status and escalation in the Task resource

The lifecycle rules stay as implemented. With the Task resource, `status` and `statusChange` move
from the execution record to `task.yaml`, and two readiness inputs are added:

- `broken` also covers a Task whose execution record exists but whose folder or index entry is gone
  (Q10, [section 8](#8-impact-on-the-kernel-and-the-adrs));
- a dependent of a `dangling` Task cannot start.

A cancelled Task whose run never started gets no execution record at all.

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

Every entry has `required` (default `true`) and an optional `note` saying why it is there. As
implemented, a reference entry may be a process artifact (`artifact: true`, awaited while missing).
The context is the Task's inputs; what the Task produces is expressed by exit and entry gates, so a
required artifact of the Task's own documents is refused (see the
[workflow kernel](../../architecture/workflow/workflow-kernel.md#readiness-and-the-step-context)). A
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
  Specification. Amends ADR 0019 decision 9
  (a Task execution record holds only the run).
- **Task execution record.** `.execution/tasks/<id>.yaml` keeps only `{specId, taskId, run}`. Title,
  summary, type, `dependsOn`, tagged origin, creation-time `expectedBinding`, status and
  `statusChange` move to `task.yaml`. The record is created at the Task's first start, so a Task that never started is only its
  folder and index entry and can be deleted by hand without leftovers.
- **Materialization.** `materializeTasks` writes the Task folders (`task.yaml`, `task.md` from the
  finish input or a task-type template) and the index entries, all as `draft`, in the same change as
  the finish. The change journal therefore gains targets outside `.execution/`; the replay and publish
  checks apply to them unchanged. Commit behaviour follows F04.
- **Finish input.** A Task proposal gains the main description (`description` → `task.md`) and an
  optional `context`; it keeps the one-line `summary` (Q3), stored in `task.yaml`.
- **Specification status.** No preparation status for the Specification; the manifest's free `status`
  string gives way to the run projection of F14 (completed / ready to merge).
- **Step context.** `StepContext` gains `context` (the resolved list) and, for steps that manage Tasks,
  each Task's status and last status change. `existingTasks` reads the index and the manifests.
- **Consistency checks (every read and every change).**
  - index entry ↔ folder ↔ `task.yaml` `id`;
  - `dependsOn` names registered Tasks, without cycles;
  - an execution record whose Task is not registered (the folder or index entry of a started Task
    deleted by hand) makes **only that Task** `broken` (Q10, decided). It is not a Specification-wide
    `WORKFLOW_STATE_CORRUPT`: other Tasks and the Specification keep working. A `broken` Task cannot
    start or finish (refused naming the Task, before anything changes), is listed as broken by
    `inspectExecution` and the read model, counts as open for the wait step (so, with nothing else
    able to progress, the Specification gets `tasks-stuck`), and its dependents cannot start. Nothing repairs it automatically: the owner restores the folder and index entry,
    or deletes the execution record by hand. This prevents further damage with one simple check per
    Task instead of recovery code;
  - a dangling index entry or an unregistered folder is a validation issue shown by
    `inspectExecution`; a dependent of a dangling Task cannot start.
- **Document operations.** The Specification document tree, registry and write operations exclude
  `tasks/`; Task documents get the same operations scoped to a Task (later slice).
- **Plan 06.** F06 keeps only revising a `ready` Task that never started, editing dependencies of
  non-draft Tasks, and the acceptance question for abandoned or cancelled Tasks.

## Owner decisions for the ADR

Decided on 2026-11-05; the lifecycle decisions (the Q2 guard, Q4, Q5, Q6, Q7, Q11) are implemented
and documented in the kernel.

- **Q1.** Option A: `tasks/index.yaml` is the registry, and the unused `specification.yaml` `tasks`
  field is removed ([section 4](#4-task-folder-layout-and-the-task-index)).
- **Q2.** The Specification does not get the preparation status; it reports at most completed or
  ready to merge, derived from its run (F14). `status` is Task-only.
- **Q3.** Keep a one-line `summary` in `task.yaml` for UI lists and cards; the full description is
  `task.md`.
- **Q8.** Default Task context: `task.md`, the Task's other documents and the Specification
  `overview`; other Specification documents are listed explicitly
  ([section 7](#defaults-order-and-budgets)).
- **Q9.** `allowed_paths` / `forbidden_paths` come back only as a `path-hint` in the Task's context,
  without enforcement ([section 7](#entry-kinds)).
- **Q10.** Deleting the folder of a Task that has attempts breaks only that Task (implemented for a
  missing record; extended to folders and index entries with the Task resource).
- **Q12.** Per attempt, a digest of the resolved context list in Git, the full list locally
  ([section 7](#evidence-per-attempt)).

## Pre-release schema cutover and binding policy

**No backwards-compatibility work.** The provisional `.execution/tasks/<id>.yaml` data
format is not production state. Replace it with the single strict F20 authority layout.
Rewrite fixtures, sample projects and current tests to the new model; do not add old Task
readers, migrations, shims or dual-status writers. Unsupported old-format data is an
explicit validation failure, never silently auto-converted, per the strict-parser approach
of [ADR 0015](../../architecture/decisions/0015-specification-manifest-as-document-registry.md).

**First-start drift (R02):** creation-time expected binding uses canonical hashes of execution-
relevant fields, so changes to unrelated display metadata do not falsely block start. It protects
the first user
from Task Type, Workflow and Specification archetype/allow-list changes between authoring and
execution. Only an explicit authorized rebind of a not-yet-started Task adopts changed
definitions. No compatibility format is needed to implement this current-user safety rule.

**Minimum Close guard:** the Task Resource slice must install a shared Engine Close preflight
refusal for uncompleted/broken Tasks and active writer claims **before** UI Task CRUD is enabled.
The independent Workflow Run start path must install its Close refusal before it becomes
available, including when an early agent-only E6a is delivered. Full acceptance UX may follow
later, but no release window permits Technical Close of required unfinished work.

## Remaining implementation slices

Each slice is reviewable on its own; the order follows the dependencies.

1. **New ADR (number assigned at promotion)** and the architecture update (owner decisions
   above). ADR 0020 is already Documentation Discovery and ADR 0021 is Semantic Search;
   neither number may be reused. Documentation only.
2. **Task resource.** `task.yaml` (with `status`, `statusChange` and `summary`) and
   `tasks/index.yaml` schemas (contracts, JSON Schemas), strict parsers, removal of the
   `specification.yaml` `tasks` field, the reserved `tasks/` folder excluded from Specification
   documents, validation results (`dangling`, `unregistered`, `broken`, dependency checks). Depends
   on 1.
3. **Kernel on the Task resource.** Slim execution record created at first start, readiness from the
   status and the `broken` check, `materializeTasks` writing folders and index as `draft`, journal
   targets outside `.execution/`, `removeTask`. Depends on 2.
4. **Context.** Entry kinds (including `path-hint`), defaults, order, budgets, `StepContext.context`,
   the attempt digest and the local evidence file. Depends on 2; independent of 3.

**Verification that would prove the outcome** (to be refined in the ADR):

- a breakdown creates Task folders and index entries as `draft`;
- an approved Task starts; its step context lists `task.md`, its other documents and the
  Specification `overview` (or its explicit entries) in order, with hashes; the attempt record holds
  the digest and the full list stays local;
- deleting a never-started Task folder and its index line leaves a consistent state; deleting a
  started Task's folder makes only that Task `broken` (it cannot start or finish, its dependents
  cannot start), while the other Tasks and the Specification keep working.
