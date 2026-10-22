---
id: reference.api.operation-progress
type: reference
title: Operation progress events (SSE) HTTP reference
status: current
scope: specflow
areas: [runtime, server, ui]
read_when:
  - showing live progress of a long-running operation
  - adding a new operation kind to the progress stream
  - changing the progress event schemas or the events endpoint
summary: >
  Server-Sent Events stream of long-running operations: per-feature routes over one shared
  mechanism, event model, step vocabulary per operation kind, replay, waiting and fallback rules.
related:
  - reference.api.specflow-specification-operations
  - engineering.shared.operation-progress
  - product.specflow.specification-creation
---

# Operation progress events (SSE) HTTP reference

Exact schemas are in `packages/specflow-contracts/src/operations/`; the broadcaster and the endpoint
are in `packages/specflow-runtime/src/features/operations/`. The mechanism (event envelope, registry,
SSE framing) is shared and kind-agnostic; the **route** of each operation belongs to its feature and is
registered next to that feature's inspection endpoint. The stream is a **display aid**: it
tells a client which named step a long-running operation is in. It never replaces the operation's
own endpoint or inspection, which stay the source of truth.

## Endpoint

| Kind                   | HTTP | Route                                              | Result                                                   |
| ---------------------- | ---- | -------------------------------------------------- | -------------------------------------------------------- |
| `specification-create` | GET  | `/api/specs/create/operations/:operationId/events` | 200 `text/event-stream`, closes after the terminal event |

There is no global `/api/operations/...` route and no `kind` query parameter: the route implies the
kind, and the registry is keyed by (kind, operationId).

- `operationId` is the client-generated UUID of the operation. A malformed id is 400.
- Authorization is the one of the feature's inspection endpoint (for `specification-create`,
  project-wide Spec `Create`). It is checked before anything about the operation is revealed;
  401/403 use the existing Auth schemas. An operation of another kind is indistinguishable from an
  unknown one.
- `Cache-Control: no-store`. A comment line `: heartbeat` is sent about every 15 s while quiet.
  The stream closes after the terminal event (`completed`, `failed` or `recovery-required`).
- `Last-Event-ID` is honoured: events after that id are replayed. An id the Runtime does not know
  (for example after a restart) yields a fresh `snapshot` instead.

## Wire format

Each frame is `id: <n>`, `event: <type>` and one `data:` line with the JSON event. Ids are
per-operation and strictly monotonic. Events never carry paths, journal internals, stage names or
server error text.

| `event`             | Payload (besides `type`, `operationId`, `kind`, `at`)                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot`          | `status` (`running`, `completed`, `failed`, `recovery-required`), `steps[]` (`{id,status}` with `pending`, `running`, `done`, `skipped`), `currentStep?` |
| `step`              | `step` (id from the kind's vocabulary), `status` (`running`, `done`, `skipped`)                                                                          |
| `completed`         | `result`: the typed result of the kind (for Create the `CreatedSpec`)                                                                                    |
| `failed`            | `code`: stable public code only (for Create the Create error code)                                                                                       |
| `recovery-required` | nothing: the operation needs operator recovery                                                                                                           |

The first event of every stream is a `snapshot`, which carries the checklist of **this run**: a
step that does not apply is simply absent from `steps`. A subscriber of a finished operation gets
the `snapshot` and then the terminal event. Unknown step ids must be ignored by clients.

## Lifecycle of the Runtime state

- State is in memory and per operation; it is not durable. After a Runtime restart the stream
  of an old operation is gone and the operation's inspection endpoint is the only truth.
- A finished operation stays replayable for a short grace period (60 s) and is then forgotten.
- **Subscribing before the operation exists.** The client generates the `operationId` before it
  sends the request, so it may subscribe first. For an operation that is not reserved yet the
  Runtime holds the subscription open for up to 30 s and starts streaming when the operation is
  reserved. If it never starts, the stream ends with `failed` and the code `OPERATION_NOT_FOUND`
  (without an `id`).
- A second request that reuses the `operationId` of a known operation does not restart or
  overwrite its stream.

## Operation kinds

The step vocabulary is defined per kind in the contracts registry (`OPERATION_KINDS`). Ids are a
stable public vocabulary, not internal stages.

### `specification-create`

Result: `CreatedSpec` (see the Create reference). Failure codes: the Create error codes
(`BRANCH_ALREADY_EXISTS`, `CREATE_CONFLICT`, ...). Journal failures that need repair
(`CREATE_RECOVERY_REQUIRED`, `CREATE_JOURNAL_CORRUPT`, `REGISTRY_RECOVERY_REQUIRED`,
`GIT_OPERATION_UNCERTAIN`, `COMMIT_FAILED`) are published as `recovery-required`. `BRANCH_PROTECTED` and `COMMIT_BLOCKED` are admission refusals (nothing was created) and are published as `failed`. An unexpected failure is `failed`
with `INTERNAL_ERROR`.

| Step id                 | Meaning for the user                  | Journal stages mapped (internal)       | Present for         |
| ----------------------- | ------------------------------------- | -------------------------------------- | ------------------- |
| `reserving`             | the name and operation are reserved   | `reserved`                             | every target        |
| `preparing-workspace`   | the Git branch and worktree are made  | `git-initiated`, `git-provisioned`     | `new-worktree` only |
| `writing-specification` | the specification files are written   | `manifest-writing`, `manifest-written` | every target        |
| `committing-specification` | the scaffold is committed in Git   | `commit-writing`, `commit-written`     | only when `git.enabled` |
| `registering`           | the workspace and Spec are registered | `registry-writing`, `registry-linked`  | every target        |

`completed` and `recovery-required` are events, not steps. For an `existing` target (and the
default primary target) `preparing-workspace` is not part of the checklist; with Git disabled
`committing-specification` is not part of it either.

## Fallback without SSE

The stream is optional. When it cannot be opened, drops, or is not supported by a proxy, clients
fall back silently to the operation's own inspection (for Create
`GET /api/specs/create/operations/:operationId`) and polling, and never fail the operation because
of the stream. The response of the operation request and its inspection remain authoritative; a
`completed` event is not a reason to skip them.

## Demo Runtime

The demo Runtime serves the same mechanism on its own Create route,
`GET /api/demo/specifications/operations/:operationId/events`, for the same kind. Its Create publishes the same steps
immediately (a late subscriber replays them); when the demo scenario seam is enabled the scenario
`slow-create` paces the steps (150 ms) so a live checklist can be observed. Forced demo failures are
published as `failed` with the demo error code.
