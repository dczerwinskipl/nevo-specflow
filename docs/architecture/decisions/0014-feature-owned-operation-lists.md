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
  kind or feature costs one adapter and one registration. There is **no global** `GET /api/operations`.
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
  durable `failed` marker, an `initiator` for a "mine" filter, journal garbage collection, a diagnostics
  API and a resumable runner stay out of scope; the contract reserves `queued`, `scheduled` and `resumable`.
- Every viewer of a spec sees its operations: journals hold no initiator.
- The list route is a second reader of the journals; it must stay free of Git and of the control lock.
- Journals are never deleted, so `recovery-required` rows accumulate until resolved (follow-up: garbage
  collection).

## Rejected

- A global operations index as the product API (couples features, centralises authorization).
- One event stream per list row; a durable failed state now; persisted dismiss (UI session state only).
