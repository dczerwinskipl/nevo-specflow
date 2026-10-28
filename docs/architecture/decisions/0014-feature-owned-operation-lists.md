---
id: adr.0014-feature-owned-operation-lists
type: adr
title: Feature-owned operation lists over a shared operation model
status: current
date: 2026-10-22
summary: >
  Operations are a shared entity (model, journal and registry index, per-kind adapters) read through
  feature-owned, read-only list routes registered by one helper. Specifications exposes
  GET /api/specs/operations, authorized by spec view; status comes from one documented table; freshness is
  by polling with ETag; there is no global operations index.
related:
  - reference.api.specification-documents
  - reference.api.specs-operations-list
  - reference.api.operation-progress
  - engineering.shared.operation-progress
  - adr.0013-engine-owned-commits-and-protected-branches
---

# 0014 — Feature-owned operation lists over a shared operation model

## Status

Current.

## Context

A long-running operation persists in an Engine journal and publishes live steps to a process-local
progress registry. Execution, inspection and the event stream already have per-feature routes. The owner of
a Create only saw their own unfinished one, from browser storage; an operation started in another tab,
another browser or the CLI was invisible, and a failure vanished with the 60 s replay window of the
registry. The product needs a panel of background operations above the Specifications list that renders
from API data alone.

## Decision

- Operation is a **shared entity**: one list model in contracts (`OperationSummary`, strict), one
  registry overlay and one status table in the Runtime, and a per-kind **adapter** that reads the kind's
  persisted records (`OperationListSource`).
- Access goes through **feature-owned, read-only routes** registered by `registerOperationListRoute`,
  exactly like the per-operation events route. Specifications exposes `GET /api/specs/operations`; its
  authorization is that feature's capability (spec view per row, rows without a spec need Create). A new
  kind or feature costs one adapter and one registration. The documents feature registers a second such list,
  `GET /api/specs/document-operations` (document changes that wait for their commit; status `queued`), with
  the same helper, query and ETag. There is **no global** `GET /api/operations`.
- **Status is derived by one documented table** from the journal, the registry and the idle time
  (reference.api.specs-operations-list). The registry keeps a listing record separate from its replay
  window (completed 10 min, failed 60 min, capped). A non terminal journal idle for 5 minutes with no live
  writer is `recovery-required` with the code `OPERATION_INTERRUPTED`, never "failed".
- The **Engine listing is tolerant and cheap**: disk only, no Git process, no control lock, parse only
  files whose stat signature changed, one bad journal is a row. The strict, fail-closed journal listing
  used by Create is untouched. The journal gains an optional `startedAt`.
- One pure `createStepForStage` maps a durable stage onto the public step for both the live progress and
  the journal-derived rows.
- Freshness is **polling with a weak ETag** (304). The list is not streamed: the registry is
  process-local, CLI journals would need a file watcher and a stream per row would exhaust the HTTP/1
  connection ceiling.

## Consequences

- Operations started by the CLI or another browser appear within one poll, without live steps.
- A failure is not durable: after a Runtime restart it is shown as interrupted ("check the result"). A
  durable `failed` marker, an `initiator` for a "mine" filter, a diagnostics
  API and a resumable runner stay out of scope; the contract reserves `queued`, `scheduled` and `resumable`.
- Every viewer of a spec sees its operations: journals hold no initiator.
- The list route is a second reader of the journals; it must stay free of Git and of the control lock.
- Settled journals are garbage collected: reserving a new Create deletes `completed` journals older than 7
  days (bounded to 50 per reservation, under the reservation lock, no Git; the hook is kind agnostic so
  Close can reuse it). `recovery-required`, in-progress and corrupt journals are never deleted, so they
  accumulate until resolved. After the retention the same operationId is a new operation.
- The Create journal format is `version: 2` (the archetype layer). The scaffold contents are not in the journal:
  they live in a hash-addressed payload folder next to it and the journal keeps only evidence (path, sha256,
  bytes). A file that is not JSON or has no numeric `version` is _unsupported_ and nothing else is read from it (a parsable
  file of any other shape is a corrupt journal and blocks). It never counts as a
  resource claim, so it blocks neither Create nor Close; the retention sweep deletes it after 7 days; reading it
  by operation id answers `CREATE_JOURNAL_UNSUPPORTED` (503, distinct from `CREATE_JOURNAL_CORRUPT`), and the
  tolerant list shows it as `recovery-required` with that code.

## Known gap: no product path to resume or abandon

The list shows a stuck Create as `recovery-required` (also `OPERATION_INTERRUPTED` after 5 minutes without a live
writer) but offers no action: neither the Runtime nor the UI can resume or abandon it, and its journal keeps holding
the slug, the branch/worktree path and workspace capacity (only `completed` journals are garbage collected). The
operator resumes it with `nevo-specflow specs recover <operation-id> --confirmed-stopped` or removes a journal that
has no effects by hand; see
[Recovering a stuck Create](../runtime/specification-lifecycle.md#recovering-a-stuck-create-operator-procedure-and-known-gap).
The reserved `resumable` status and a runner stay out of scope.

## Rejected

- A global operations index as the product API (couples features, centralises authorization).
- One event stream per list row; a durable failed state now; persisted dismiss (UI session state only).
