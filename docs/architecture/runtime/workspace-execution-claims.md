---
id: architecture.runtime.workspace-execution-claims
type: architecture
title: Workspace execution claims
status: current
scope: specflow
areas: [runtime, ai, security]
tags: [engine, claims, journal, recovery, sessions, admission, crash-safety]
read_when:
  - changing how a managed Turn is admitted, dispatched or settled against the Engine
  - adding an Engine operation that must exclude or wait for a running agent
  - diagnosing TURN_CONFLICT or SESSION_RECOVERY_REQUIRED from a Turn start or reconcile
  - designing writer admission for workflow steps or external CLI agents
summary: >
  The Engine journal that admits every native agent execution as a project-wide writer claim: the
  intent, the phases admitted, dispatched, unknown and settled, settlement only on a proven
  not-dispatched or native-result receipt, the project-write resource that excludes Create, Close,
  document changes and manual commits, the archive move, the crash windows, and how Runtime maps the
  errors.
related:
  - architecture.runtime.specflow-engine
  - architecture.ai.session-storage-and-lifecycle
  - architecture.runtime.specflow-lifecycle
  - engineering.shared.specflow-git-recovery
  - reference.api.sessions
---

# Workspace execution claims

A native agent process (Claude, Codex, Antigravity) runs CLI tools that can change any file, ref or
worktree of the repository. The Engine cannot see those writes. Before Runtime starts such a process,
the Engine records a **workspace execution claim**. The claim keeps every other Engine writer out of
the project until the process is proven stopped.

Code: `packages/specflow-engine/src/execution/` (`model.ts`, `journal.ts`, `operations.ts`,
`inspection.ts`). The Runtime adapter is
`packages/specflow-runtime/src/features/sessions/effects/engine.ts`, called by
`sessions/lifecycle/managed-invocation.ts`.

## The journal is the claim

There is no separate reservation store. One JSON record per execution is the claim:

| Field                                        | Meaning                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intent {operationId, ownerId, binding}`     | `operationId` is the Runtime invocation id (a UUID, also the file name); `ownerId` the Session id; `binding` a sha256 of the Session, request, provider selection and workspace identity. |
| `projectId`, `gitInstanceId`                 | The Project Home the claim belongs to. A record of another project is corrupt.                                                                                                            |
| `workspace {workspaceId, root, instanceId?}` | The workspace incarnation the execution runs in.                                                                                                                                          |
| `registryRevision`                           | The workspace registry revision at admission.                                                                                                                                             |
| `resources`                                  | Exactly one: `project-write:<projectId>`.                                                                                                                                                 |
| `phase`                                      | `admitted`, `dispatched`, `unknown` or `settled`.                                                                                                                                         |
| `settlement`                                 | Present exactly when `settled`: `not-dispatched`, or `native-result` with a receipt.                                                                                                      |

Location: `<stateRoot>/engine/operations/external-execution/<operationId>.json`; settled records move
to `external-execution/settled/`. The directories MUST be plain directories (no symlink or junction,
`realpath` equal to the path) and a record MUST be a regular file of at most 64 KiB. Every read
validates the record against its schema and the current Project Home; anything else fails with
`EXECUTION_CORRUPT`.

## Phases

```text
admit ─▶ admitted ──mark dispatched──▶ dispatched ──settle(native-result)──▶ settled
            │                              │                                   ▲
            │                              └──mark unknown──▶ unknown ─────────┘ settle(native-result)
            └──abandon──▶ settled(not-dispatched)
```

- **Admit** (`admitWorkspaceExecution`) runs under the project control lock. It checks that the
  workspace incarnation in the registry is still the Engine's, that the registry revision did not
  change since it was read, and that no other claim conflicts (below), then publishes `admitted`. A
  retry with the same `operationId` returns the existing record when intent and workspace are equal,
  and fails with `EXECUTION_CONFLICT` otherwise.
- **Dispatched** (`markWorkspaceExecutionDispatched`) is allowed only from `admitted`. Runtime MUST
  await it before it calls the provider driver, so a record that is still `admitted` proves the
  native process was never started.
- **Unknown** (`markWorkspaceExecutionUnknown`) records that the process or its outcome cannot be
  verified (lost process, forced stop, contradicting facts). It is allowed from any unsettled phase.
- **Abandon** (`abandonWorkspaceExecutionAdmission`) settles `admitted` as `not-dispatched`. From any
  other phase it fails with `EXECUTION_RECOVERY_REQUIRED`: a possibly dispatched execution needs a
  receipt.
- **Settle** (`settleWorkspaceExecution`) needs a receipt `{invocationId, process: 'stopped',
outcome}` whose `invocationId` is the claim's `operationId`, and is allowed from `dispatched` or
  `unknown`. Settling `admitted` with a native result, or settling again with a different receipt, is
  `EXECUTION_CONFLICT`. A repeat with the same receipt returns the record unchanged.

Every transition after admission re-reads the record under the control lock, requires the same
intent and workspace, and requires the registry revision recorded at admission. A registry that
changed while the claim was held is `EXECUTION_RECOVERY_REQUIRED`: a rebind or workspace change
under a running agent is never silently accepted.

**A claim settles only on proof.** The two receipts are the only ways out: the native-process
boundary was never crossed, or the process owner proved the process stopped with a result. Time,
process exit codes, a missing record or an operator assertion are not proof. There is no HTTP or CLI
operation that forces a claim to succeed or fail; `settleWorkspaceExecution` is a trusted Runtime
boundary.

## The project-wide resource

The resource is `project-write:<projectId>`, not a checkout or Specification resource. A native CLI
agent started in one checkout can check out branches, commit, rewrite refs or edit another worktree
of the same repository. A checkout-scoped claim would pretend a containment that does not exist.

`project-write:` overlaps every other resource (`specs/durable/claims.ts`), and the shared admission
check (`assertSharedResourcesAvailable` in `specs/coordination/resources.ts`) treats any unsettled
execution claim as a conflict for every requested resource. So, in both directions:

- while a claim is unsettled, Create, Close, document changes, manual commits and a second agent
  execution are refused with `RESOURCE_CONFLICT`;
- an execution is not admitted while an unfinished Create, Close, document change or manual commit
  holds any resource.

At most one native agent execution therefore runs per project at a time. Per-Task or per-worktree
claims are future work and need real containment of the agent first (plan 06 F08,
[execution scopes](../../ideas/specflow-engine/execution-scopes-and-recovery.md)).

The workflow kernel's own operations (start, finish, return) do not consult claims yet; its store
narrows but does not close the window against a concurrent external writer (plan 06 F05, see
[Workflow kernel](../workflow/workflow-kernel.md)).

## Publication and archive

`publishExecutionJournal` writes the record atomically (stage file and rename), reads it back and
compares it with what was written; a mismatch is `EXECUTION_RECOVERY_REQUIRED`. A `settled` record is
then renamed into `settled/` and both directories are synced. Reads look in the active directory
first and then in the archive, so an exact replay works from either location. An archived record
that is not settled, or an archived record that differs from the one being archived, is
`EXECUTION_CORRUPT`. Admission lists only the active directory and skips settled records and stage
files.

## Crash windows

| Crash or failure                                    | State left                        | Resolution                                                                                                                                                                       |
| --------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime stored the Turn, Engine admission never ran | No record                         | Reconcile admits the same intent under the Engine lock (revalidating workspace and conflicts), then abandons it as `not-dispatched`. A missing record alone never ends a Turn.   |
| After `admitted`, before `dispatched`               | `admitted`                        | The driver was never called: abandon to `not-dispatched` (on the spot or on reconcile, when Runtime's record says the native process was not dispatched).                        |
| After `dispatched`, without a verified result       | `dispatched` or `unknown`         | The process may have written. The claim blocks the project until a `native-result` receipt exists; reconcile returns no evidence and the Turn stays `SESSION_RECOVERY_REQUIRED`. |
| After the settled write, before the archive rename  | `settled` in the active directory | Harmless: the record stays where it is, admission skips settled records, and reads and an exact replay find it.                                                                  |
| Read-back of a publication differs                  | Unverified record                 | `EXECUTION_RECOVERY_REQUIRED`; the next transition re-reads the same claim.                                                                                                      |

## Errors and the Runtime mapping

| Engine code                   | Cause                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXECUTION_CONFLICT`          | Invalid intent, identity or workspace changed for the same `operationId`, receipt of another invocation, native result for an undispatched claim, changed receipt. |
| `EXECUTION_CORRUPT`           | Record or directory fails validation, archived record not settled or different.                                                                                    |
| `EXECUTION_RECOVERY_REQUIRED` | Missing admission, registry changed while held, phase does not allow the step, unverified publication, receipt without positive evidence.                          |
| `RESOURCE_CONFLICT`           | Admission found another unfinished writer (from the shared resource check).                                                                                        |

Runtime (`createEngineSessionEffects`) maps `RESOURCE_CONFLICT` to `TURN_CONFLICT` ("an unfinished
project writer prevents agent execution"); a Turn refused this way before its driver was invoked
finishes `failed` as `not-dispatched`. Every other Engine error maps to `SESSION_RECOVERY_REQUIRED`.
Admission also refuses with `SESSION_RECOVERY_REQUIRED` when the Turn's workspace root or identity
hash is not the Engine's workspace, or when the claim is already past `admitted`.

The Turn reconcile endpoint (reference.api.sessions) reads the claim and turns only a `not-dispatched`
or `native-result` settlement into a Turn outcome.

## Inspection

`inspectWorkspaceExecution(operationId)` reads one claim from either location, after verifying the
Project Home on disk, so diagnostics work even when the execution's workspace is gone.
`listUnsettledWorkspaceExecutions` pages unsettled claims by `operationId` (default 40, at most 100).
Both are read-only diagnostics, never a fencing proof for release or dispatch. They are not exposed
over HTTP or the CLI yet; an operator inspect, release and takeover protocol is a proposal in
[execution scopes and recovery](../../ideas/specflow-engine/execution-scopes-and-recovery.md).
