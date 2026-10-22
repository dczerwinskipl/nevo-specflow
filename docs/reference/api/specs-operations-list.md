---
id: reference.api.specs-operations-list
type: reference
title: Specifications operation list HTTP API
status: current
scope: specflow
areas: [runtime, server, ui]
read_when:
  - showing the background operations above the Specifications list
  - adding a new operation kind or a new feature-owned operation list
  - changing the operation list schema, retention or status derivation
summary: >
  GET /api/specs/operations lists Specification Create operations from the Engine journals and the
  live progress registry: schema, status table, retention, authorization, ETag, query, error codes and
  the demo mirror.
related:
  - reference.api.operation-progress
  - reference.api.specflow-specification-operations
  - reference.api.specs-overview
  - engineering.shared.operation-progress
  - adr.0014-feature-owned-operation-lists
---

# Specifications operation list HTTP API

Exact schemas are in `packages/specflow-contracts/src/operations/list.ts`. The shared helper
(`registerOperationListRoute`, the status table, retention, ordering, ETag) is in
`packages/specflow-runtime/src/features/operations/`; the Create adapter and the route registration are
specs-owned (`features/specs/create/operation-list.ts`). The list is a **display aid** for the owners of
an operation: it never replaces the per-operation inspection (`GET /api/specs/create/operations/:id`) or
its `/events` stream, which stay the source of truth.

## Endpoint

| HTTP | Route                                 | Result                                              |
| ---- | ------------------------------------- | --------------------------------------------------- |
| GET  | `/api/specs/operations`               | 200 `OperationListResponse`, 304 on a matching ETag |
| GET  | `/api/demo/specifications/operations` | the same contract over the demo state (demo mode)   |

Query (both optional, anything else is 400):

- `status`: comma-separated filter of the **items** (default all). Known values: `in-progress`,
  `recovery-required`, `failed`, `completed`, plus the reserved `queued`, `scheduled`. An unknown value or an
  empty list is 400 `OPERATION_LIST_QUERY_INVALID`. `counts` always cover every admitted row, not the filter.
- `limit`: digits, 1..50, default 20. Anything else is 400. `truncated` is true when the filtered rows exceed it.

There is no `kind` parameter: the route lists the kinds of the specification feature (today
`specification-create`). A new kind of the same feature adds rows, not a contract change; another feature
registers its own `<feature>/operations` route with the same helper.

## Response

```ts
{
  items: OperationSummary[];
  counts: { inProgress; recoveryRequired; failed; completed };   // after authorization and retention, before status/limit
  truncated: boolean;
  generatedAt: string;                                           // ISO
}
OperationSummary = {
  operationId; kind;                          // kind: 'specification-create'
  status: 'in-progress' | 'recovery-required' | 'failed' | 'completed';   // 'queued' | 'scheduled' reserved, never produced
  title?; subject?: { specId?; slug? };
  target?: { workspaceKind?: 'existing' | 'new-worktree'; workspaceId?; branch? };
  currentStep?; steps?: { id; status: 'pending' | 'running' | 'done' | 'skipped' }[];
  startedAt?; updatedAt; finishedAt?;         // ISO
  code?;                                      // stable code, never server text
}
```

Serialisation is a strict allow-list (`additionalProperties: false`): a row never carries a path, a
workspace root, an instance id, a Git object id, the raw journal stage, the journal `reason` or any
server text. The step ids are the public vocabulary of `SPECIFICATION_CREATE_STEPS`; the checklist of a row
is `specificationCreateSteps(target, commits)` where `commits` is whether the journal carries `commit`
(Git was enabled at reservation), so `committing-specification` appears only then. The stages
`commit-writing` and `commit-written` map to that step. `startedAt` is the optional journal field
(written at reservation), else the registry start while the operation is live, else absent. `updatedAt` is the
registry time for a live operation, else the journal file time (`mtime`).

Consumers must treat an unknown status, kind, step id or code as a renderable generic value.

`Cache-Control: no-store`. A weak `ETag` covers `items`, `counts` and `truncated` (not `generatedAt`):
`If-None-Match` with a matching validator is **304** without a body, so polling an unchanged list is cheap.

## Status derivation

| Journal              | Registry (this process)        | Row                                                                                  |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `completed`          | any                            | `completed`, `finishedAt` = registry or file time; listed for 10 min, at most 5 rows |
| `recovery-required`  | any                            | `recovery-required`                                                                  |
| unreadable / corrupt | any                            | `recovery-required`, code `CREATE_JOURNAL_CORRUPT`, no title and no spec             |
| non terminal         | running                        | `in-progress` with the live steps                                                    |
| non terminal         | failed (code)                  | `failed` with the code, kept 60 min                                                  |
| non terminal         | recovery-required              | `recovery-required`                                                                  |
| non terminal         | none, `updatedAt` within 5 min | `in-progress`, steps derived from the stage (CLI-started, just after a restart)      |
| non terminal         | none, idle longer than 5 min   | `recovery-required`, code `OPERATION_INTERRUPTED`                                    |
| none                 | running                        | `in-progress` (before the journal is reserved), no spec, steps from the registry     |
| none                 | failed or completed            | not listed (a request refused before anything existed reports itself)                |

A failure of a request after reservation is only in the registry, so after a restart it surfaces as
"interrupted" (the journal has no failed state). `BRANCH_PROTECTED` and admission-time `COMMIT_BLOCKED` are
refused before a journal exists and never appear here. A post-write `COMMIT_FAILED` leaves the journal at
`commit-writing`: `recovery-required` with code `COMMIT_FAILED` while the registry remembers it, then
interrupted after a restart.

Order: `recovery-required`, `failed`, `in-progress` (by `updatedAt`, newest first), then `completed`
(newest finish first).

## Retention

- Completed rows leave the list after 10 minutes. The journal file is a separate, longer retention: when a
  new Create is reserved the Engine deletes `completed` journals older than 7 days
  (`COMPLETED_OPERATION_JOURNAL_RETENTION_DAYS`, file mtime, at most 50 per reservation, under the
  reservation control lock, no Git). In-progress, `recovery-required` and corrupt journals are never
  deleted automatically and stay until someone resolves them. Inside the window the same operationId
  replays idempotently; after it the same operationId is a new operation (slug protection then comes from
  the Specification existing on disk and in the registry). The retention is a constant, not configuration.
- The progress registry keeps its 60 s replay window for the event stream and, **separately**, a listing
  record: completed 10 minutes, failed and recovery-required 60 minutes, capped at 200 finished entries (the
  oldest drops first). A new run with the same id replaces its record.

## Authorization

The route requires authentication and `SpecCapabilities.View` in any scope (no capability: 403, not
authenticated: 401). Each row is then admitted individually: a row with a `subject.specId` needs
`SpecCapabilities.View` of that spec (the rule the overview uses); a row **without** a spec (an unreadable
journal, an operation not yet reserved) is shown only to a caller who holds `SpecCapabilities.Create`.
`counts` are computed after this filtering. The per-operation inspection and events routes need `Create`:
a caller with View and without Create sees the row but cannot open its progress page.

## Cost and guarantees

The route reads `engine/operations/create` only: one `readdir`, one `lstat` per file and a parse of files
whose `(mtime, ctime, size, inode)` changed since the last call (process-local memo). It spawns **no Git
process**, never takes the Project Home control lock and one corrupt, oversized, redirected or foreign
journal is a row, not a failure. The fail-closed `listCreateJournals` used by Create itself is unchanged.

## Errors

| HTTP      | Body                                           | When                                                                             |
| --------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 400       | `{error,code: 'OPERATION_LIST_QUERY_INVALID'}` | malformed `status` or `limit`                                                    |
| 401 / 403 | the standard authorization schemas             | not authenticated / no spec view                                                 |
| 503       | `{error,code: 'OPERATIONS_UNAVAILABLE'}`       | no Engine composition, or an unexpected read failure (logged on the server only) |

Row codes are open strings: `OPERATION_INTERRUPTED`, `CREATE_JOURNAL_CORRUPT`, and the Create codes
(`COMMIT_FAILED`, `COMMIT_BLOCKED`, `CONTROL_LOCK_BUSY`, ...).

## Demo mirror

`GET /api/demo/specifications/operations` returns the same schema (and the same shaping, ETag and query)
from the Creates of the demo state, the running demo Creates of the shared registry and, when scenarios
are enabled (`demoScenario=operations-panel`, see `reference.api.specification-creation-demo`), a seed of
every status: running with and without steps, an existing and a new worktree target, interrupted, a
`COMMIT_FAILED` recovery, an unreadable journal, a failed row, three completed rows and a very long title.
The `forbidden` scenario answers 403.
