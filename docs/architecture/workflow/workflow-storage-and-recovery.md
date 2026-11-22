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

- **Location.** `.execution/` starts with a dot, so the document tree never lists it. It moves with
  the Specification when the Specification is archived.
- **Revisions.** Every record is validated on read (`state/codec.ts`), and a hand-edited or truncated
  file fails closed. Writes are compare-and-swap on content revisions (`WORKFLOW_STATE_CONFLICT`).
- **Atomic change.** One operation produces one `ExecutionChange`. The store writes it whole to the
  journal (`state/journal.ts`), then writes the files, then deletes the journal. A read overlays a
  pending journal, and the next change finishes it.
- **Consistent reads.** The store does not lock. Its precondition is that callers serialize the reads
  and changes of one Specification; the operations do it with the project control lock, which is
  cross-process. So a read never sees a change in the middle of being published.
- **Write-side validation.** Every record is validated against the same codec while the change is
  built, before the journal is written. A record that would not read back fails with
  `WORKFLOW_STATE_CORRUPT`, one over its byte budget with `WORKFLOW_INPUT_INVALID`, and nothing is
  written.
- **Identity and coherence.** Every read, and the state a change would produce, is checked before it
  is used or stored: a Task file holds the Task its name says, every record belongs to the
  Specification (`specId`), Task ids are unique, and `validateExecutionState` (`state/validate.ts`)
  checks the invariants the operations rely on (one open attempt for an active step and none
  otherwise, attempt numbers without gaps, an ordered history) and the Task resource issues (see "The
  Task set"; every dependency a registered Task, no dependency cycle). A failure is
  `WORKFLOW_STATE_CORRUPT`. Whether a position follows from its history needs the definition and is
  checked when the run is loaded (see "Positions, attempts and the handoff").
- **Plain files only.** `.execution/`, `.execution/tasks/`, the journal folder and every
  record file must be a plain directory or a regular file at its expected physical path
  (`state/record-files.ts`). A symlink, a junction or a path that resolves elsewhere fails with
  `WORKFLOW_STATE_CORRUPT` before anything is read, written or removed.
- **Budgets.** A Specification holds at most `TASKS_PER_SPECIFICATION_MAX` (200) Task files, a record
  file at most `RECORD_BYTES_MAX` (256 KiB) and the journal at most `JOURNAL_BYTES_MAX`
  (`workflow/limits.ts`). A file's size is checked before it is read; a stored file over its budget
  fails the read with `WORKFLOW_STATE_CORRUPT`. The record budget is enforced when a change is
  serialized (`state/codec.ts`): a change over it is refused with `WORKFLOW_INPUT_INVALID`, and
  nothing is stored. The journal budget is checked
  when the journal is serialized (`state/journal.ts`); records within their budgets always fit it.
- **Replay and publish check.** Each journal target records the sha256 of the text it replaces, or
  that the file did not exist. A pending journal is used only while every target still holds that
  revision or already the new text, and each target is checked again right before it is published,
  both when a pending journal is replayed and for a fresh change. A target that changed means the
  state changed outside the Engine (a branch switch, a hand edit): the change fails with
  `WORKFLOW_STATE_CONFLICT`, the journal stays pending, and reads fail the same way. The error names
  the local journal file; the owner deletes it by hand to keep the records as they are on disk. A
  conflict found in the middle of publishing also leaves the journal pending, and deleting it then may
  keep a partly applied change; only a concurrent external writer can cause that (F05). This
  narrows, but does not close, the window against a concurrent external writer such as Git between the
  check and the write; full protection needs writer admission (plan 06, F05) through
  [workspace execution claims](../runtime/workspace-execution-claims.md).
- **Stage files.** An atomic write that crashed leaves a `.<record>.<uuid>.tmp` file. Reads skip
  dot-files, and the next change removes only the stage files of known record names
  (`specification.yaml` in `.execution/`, valid Task file names in `.execution/tasks/`); every other
  dot-file is left alone.
- **Other files among the Tasks.** In `.execution/tasks/`, only names that end in `.yaml` and do not
  start with a dot are Task records. Every other name (`.gitkeep`, `Thumbs.db`, `desktop.ini`, swap and
  `.orig` files) is ignored. A record whose name is not a valid Task id fails closed with
  `WORKFLOW_STATE_CORRUPT`.
- **Serialization.** All mutations, `inspectExecution` and `rememberArchetypeModel` run inside
  `withProjectControlLock`.
- **Per-Task files.** Each Task has its own file, so parallel Task worktrees can later merge without
  conflicts (follow-up F08).

### Commits of the execution state

The execution store commits under the document commit policy: the
store's writes (`.execution/**` and `tasks/**`: index, manifests, the initial `task.md`, run records,
removals) made by owner, UI or CLI operations are committed like a change of the Specification's
documents ([documents layer](../runtime/document-commit-policy.md#commits-of-workflow-state)).

- **Admission and record.** The filesystem store takes an `ExecutionStateCommits` port
  (`state/store.ts`; production `specs/documents/write/execution-state.ts`, wired in
  `composition.ts`). Under the control lock it admits the change with its paths before the journal
  is written (a refusal of the commit policy writes nothing), then records the published files in the
  same lock section, before the journal is removed, as one document operation of action `workflow`.
  The journal fixes the operation id, summary and each target's `pre` first, and the record is
  idempotent by that id, so a change finished after a stop is recorded exactly once with its
  original `pre`. Every operation names its change
  (`ExecutionChange.summary`): `create task <id>`, `edit task <id>`, `remove task <id>`,
  `set task <id> <status>`, `start step <step>[ of task <id>] (attempt <n>)`, `finish step ...`,
  `return to step ...`, `abandon the specification`; a pending journal finished by a later change is
  `finish an interrupted workflow change`.
- **Auto-commit on.** The operation is queued and committed by the document queue with its batch
  policy, identity and trailers (`Nevo-Action: workflow`); its subject is
  `spec(workflow): <summary> in <slug>` (`<n> workflow changes` when a batch holds several), never
  cut (a form that fits is chosen whole, see
  [commits of workflow state](../runtime/document-commit-policy.md#commits-of-workflow-state)).
- **Auto-commit off.** The paths go to the uncommitted-changes ledger. Finishing a step ("Next")
  runs the post action `commit-execution-state` (`operations/post-actions.ts`): a manual commit of
  the Specification's ledger entries below `.execution/` and `tasks/` (closed under shared operation
  ids) with the subject `spec(workflow): finish "<step title>"[ of task <id>] in <slug>`, reported in
  `FinishStepResult.postActions`, apart from the finish. Execution state edited since the Engine
  wrote it is held out of that commit with its operations, never refusing it (`held`, see
  [commits of workflow state](../runtime/document-commit-policy.md#commits-of-workflow-state)). A
  failed post action does not fail the finish; a
  repeated finish runs it again. The post-action hook is the seam where E6 adds the push of an agent
  step's work (not implemented).
- **Close and Abandon.** Abandon is a workflow change like the others. A Specification Close takes
  whatever execution state of that Specification is still uncommitted (in the ledger, or dirty
  without a record, for example a hand edit) into its archive commit; anything else that is dirty still refuses
  it, naming the paths ([lifecycle](../runtime/specification-lifecycle.md)).
