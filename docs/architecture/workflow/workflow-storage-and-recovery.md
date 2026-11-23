---
id: architecture.workflow.workflow-storage-and-recovery
type: architecture
title: Workflow storage, journal and recovery
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - changing .execution persistence, workflow mutation journal or recovery
  - verifying Git commit and journal boundaries for workflow state
summary: >-
  Pinned execution store, Task-resource persistence, Engine operation journals, commit policy and crash replay guarantees.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-runs-and-handoffs
  - architecture.runtime.document-commit-policy
  - engineering.shared.specflow-git-recovery
---

# Workflow storage and recovery

## State and storage

| What                                    | Where                                                  | Belongs to                 |
| --------------------------------------- | ------------------------------------------------------ | -------------------------- |
| Specification run                       | `<specification>/.execution/specification.yaml`        | Git (committed, see below) |
| Task runs (created at the first start)  | `<specification>/.execution/tasks/<taskId>.yaml`       | Git (committed, see below) |
| Task resources (index, manifests, docs) | `<specification>/tasks/`                               | Git (committed, see below) |
| Change journal                          | `<stateRoot>/engine/operations/workflow/<specId>.json` | local                      |

### Storage layout and revisions

- **Location.** `.execution/` starts with a dot, so the document tree never lists it. It moves with
  the Specification when the Specification is archived.
- **Revisions.** Every record is validated on read (`state/codec.ts`), and a hand-edited or truncated
  file fails closed. Writes are compare-and-swap on content revisions (`WORKFLOW_STATE_CONFLICT`).

### Journal, preconditions and CAS

- **Atomic change:** one `ExecutionChange` is validated, journaled, published to files, then its journal removed. Reads overlay a pending journal; the next change completes it.
- **Serialization:** callers must serialize reads/mutations of one Specification. Operations use the cross-process project control lock; the store itself does not lock.
- **Validation:** apply the read codec before writing. Invalid state: `WORKFLOW_STATE_CORRUPT`; oversized change: `WORKFLOW_INPUT_INVALID`. Neither writes a journal.

### Identity and coherence

- Validate on every read and before publication: Specification/Task IDs match file identity; Task IDs are unique; dependencies reference registered Tasks without cycles; open attempt and attempt sequence are coherent.
- Definition-dependent position/history consistency is checked when loading the pinned workflow.
- Reject inconsistent state as `WORKFLOW_STATE_CORRUPT`.

### Filesystem safety

`.execution/`, Task records and journal directories must resolve to their expected physical locations and be plain directories/regular files. Symlinks, junctions and redirected paths fail as `WORKFLOW_STATE_CORRUPT` before any access.

### Storage budgets

- **Budgets.** A Specification holds at most `TASKS_PER_SPECIFICATION_MAX` (200) Task files, a record
  file at most `RECORD_BYTES_MAX` (256 KiB) and the journal at most `JOURNAL_BYTES_MAX`
  (`workflow/limits.ts`). A file's size is checked before it is read; a stored file over its budget
  fails the read with `WORKFLOW_STATE_CORRUPT`. The record budget is enforced when a change is
  serialized (`state/codec.ts`): a change over it is refused with `WORKFLOW_INPUT_INVALID`, and
  nothing is stored. The journal budget is checked
  when the journal is serialized (`state/journal.ts`); records within their budgets always fit it.

### Replay and publish checks

- **Preconditions:** each journal target records its prior SHA-256 (or absence). Before any fresh/replayed write, require the expected old state or already-published new state; check again immediately before replacement.
- **Conflict:** external edits/branch changes yield `WORKFLOW_STATE_CONFLICT` and leave the journal pending; reads fail likewise. Operator may remove the named local journal to retain disk state.
- **Partial risk:** removing a journal after a mid-publish external race can preserve a partially applied change. This cannot be fully prevented until external writers participate in [workspace claims](../runtime/workspace-execution-claims.md) (F05).
- **Temp files:** readers ignore `.<record>.<uuid>.tmp`. Next mutation cleans only temp files for known record names; unrelated dot-files remain untouched.

### Foreign files and recovery

- **Other files among the Tasks.** In `.execution/tasks/`, only names that end in `.yaml` and do not
  start with a dot are Task records. Every other name (`.gitkeep`, `Thumbs.db`, `desktop.ini`, swap and
  `.orig` files) is ignored. A record whose name is not a valid Task id fails closed with
  `WORKFLOW_STATE_CORRUPT`.

### Mutation serialization

- **Serialization.** All mutations, `inspectExecution` and `rememberArchetypeModel` run inside
  `withProjectControlLock`.
- **Per-Task files.** Each Task has its own file. This reduces Git merge conflicts between Task changes; concurrent worktree merges are not guaranteed.

### Commits of the execution state

The execution store commits under the document commit policy: the
store's writes (`.execution/**` and `tasks/**`: index, manifests, the initial `task.md`, run records,
removals) made by owner, UI or CLI operations are committed like a change of the Specification's
documents ([documents layer](../runtime/document-commit-policy.md#commits-of-workflow-state)).

- **Admission and record.** The filesystem store takes an `ExecutionStateCommits` port (`state/store.ts`; production `specs/documents/write/execution-state.ts`, wired in `composition.ts`).
  - Under the control lock it admits the change with its paths before the journal is written (a refusal of the commit policy writes nothing), then records the published files in the same lock section, before the journal is removed, as one document operation of action `workflow`.
  - The journal fixes the operation id, summary and each target's `pre` first, and the record is idempotent by that id, so a change finished after a stop is recorded exactly once with its original `pre`.
  - Every operation names its change (`ExecutionChange.summary`): `create task <id>`, `edit task <id>`, `remove task <id>`, `set task <id> <status>`, `start step <step>[ of task <id>] (attempt <n>)`, `finish step ...`, `return to step ...`, `abandon the specification`; a pending journal finished by a later change is `finish an interrupted workflow change`.
- **Auto-commit on.** The operation is queued and committed by the document queue with its batch
  policy, identity and trailers (`Nevo-Action: workflow`); its subject is
  `spec(workflow): <summary> in <slug>` (`<n> workflow changes` when a batch holds several), never
  cut (a form that fits is chosen whole, see
  [commits of workflow state](../runtime/document-commit-policy.md#commits-of-workflow-state)).
- **Auto-commit off.** The paths go to the uncommitted-changes ledger.
  - Finishing a step ("Next") runs the post action `commit-execution-state` (`operations/post-actions.ts`): a manual commit of the Specification's ledger entries below `.execution/` and `tasks/` (closed under shared operation ids) with the subject `spec(workflow): finish "<step title>"[ of task <id>] in <slug>`, reported in `FinishStepResult.postActions`, apart from the finish.
  - Execution state edited since the Engine wrote it is held out of that commit with its operations, never refusing it (`held`, see [commits of workflow state](../runtime/document-commit-policy.md#commits-of-workflow-state)).
  - A failed post action does not fail the finish; a repeated finish runs it again.
  - The post-action hook is the seam where E6 adds the push of an agent step's work (not implemented).
- **Close and Abandon.** Abandon is a workflow change like the others. A Specification Close takes
  whatever execution state of that Specification is still uncommitted (in the ledger, or dirty
  without a record, for example a hand edit) into its archive commit; anything else that is dirty still refuses
  it, naming the paths ([lifecycle](../runtime/specification-lifecycle.md)).
