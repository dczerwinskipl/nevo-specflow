---
id: architecture.runtime.document-operation-transport
type: architecture
title: Document operation transport, revision and commit projection
status: current
scope: specflow
areas: [runtime, server, security]
tags: [documents, operations, etag, revisions, commits]
read_when:
  - implementing document API response and header semantics
  - changing revisioned reads, raw downloads or document operations
  - verifying pending/failed/uncommitted commit state propagation
summary: >-
  HTTP-visible semantics of Specification and Task document reads and writes,
  exact revision requests, safe raw content, conditional caching and independent commit state.
related:
  - architecture.runtime.specification-documents
  - reference.api.specification-documents
  - reference.api.specflow-specification-operations
  - architecture.runtime.specflow-lifecycle
---

# Document operation transport and commit projection

The exact endpoints, TypeBox schemas and refusal codes are generated as
[OpenAPI](../../reference/api/openapi.md) under `Documents`. The main document
[architecture](specification-documents.md) owns the manifest, registry, path
validation, write journals and commit policy; this file records the meaning
of the API observations.

## Read authority and conditional retrieval

- Document tree is an Engine projection of the manifest, its registered files
  and a bounded scan of unclassified content. It distinguishes registered,
  unclassified, dangling and skipped/error entries, reports completeness,
  document content kind and capability-based actions. A read never runs Git,
  guesses a missing file or mutates a journal.
- Text JSON responses include `content`; image and binary metadata do not.
  An unclassified file gets a derived `u-` ID; classification registers it
  with a new id, so clients must navigate using the returned identity.
- A `revision` query requests **exactly** that version; missing revision
  returns 409 `DOCUMENT_REVISION_UNAVAILABLE`, not the latest body. Reads
  use `spec.view` at trusted scope. Tree and document observations may
  carry ETag; only an exact validator may answer 304.
- Successful raw reads stream bytes with validated `Content-Type`,
  `Content-Disposition`, `Content-Length`, `X-Content-Type-Options`,
  sandbox CSP and a strong revision ETag. `download=1` forces attachment;
  `download=0` permits safe inline images. Untrusted/binary bytes are
  never served as active HTML; SVG has image media type solely to work
  in `img` while sandbox CSP prevents page script execution.
  Reject query values other than literal 0/1. All auth/refusals happen
  **before the first byte**; aborts and 304 destroy the file stream.

## Write acknowledgment and commit state

- Save, batch save, create, folder and other document mutations require
  `spec.manage`. Every operation has an idempotency `operationId` and
  optimistic `expectedRevision` where relevant. Use a fresh id per new
  user action; reuse it only for the identical uncertain retry. Changed
  body with the same identity conflicts.
- A successful 200/operation result means **file write admitted to disk**,
  **not** that the Git commit finished. Commit follows asynchronously
  through the Engine queue and can be `pending`, `committed`,
  `failed`, `uncommitted` (manual/abandoned) or `not-applicable`.
  `CommitState` has no `abandoned` state: abandonment of a failed
  commit leaves saved files in `uncommitted` with reason `abandoned`.
- Batch save checks every expected revision and path before any write;
  either all 1..25 documents are saved or none. One commit batch is
  queued. `DOCUMENT_REVISION_CONFLICT` includes offending documents;
  the caller keeps **all** drafts and refreshes before retrying.
- The queue normally settles **250..500 ms** after the last save
  (default 300 ms) and not beyond five seconds; `settling` is a
  normal pending reason. If automatic commits are disabled, the
  response reports `uncommitted` immediately, not a fake pending.
- Tree `revision` and commit markers expose pending/failed/uncommitted
  changes without running Git. `If-None-Match` and ETag allow
  observation to become committed. Document operations list includes
  pending, failed and recovery-required changes and removes
  committed ones; operations reveal no absolute machine paths.
- A status GET is **read-only** and reports one operation with a
  conditional ETag. Failed commit Retry/Abandon and flush require
  explicit Manage mutations. Retry rechecks current files and Git
  policy. Abandon leaves file bytes for later user/manual commit;
  it does not roll back the save.
- A busy queue/refusal `SPEC_BUSY` carries a typed reason,
  optional `retryAfterMs` and owner/cause. Autosave backs off and
  retains the draft. `recoveryRequired:true` requires the operator,
  not a blind UI retry.
- A manual commit selects currently uncommitted **ledger paths** of
  the requested owner/scope, not arbitrary files. It uses a stable
  `operationId`, expected ledger revision and closed subset selection;
  refusing a stale or non-closed subset prevents accidentally
  committing unrelated Task/definitions changes.
- Close preview reports pending/failed/uncommitted document blockers
  without flushing the queue. The Close mutation flushes relevant
  work first; the same blocker may remain and refuse integration.
  A foreign dirty checkout never becomes part of a Spec archive
  commit without explicit authorization.

## Archetypes, paths and errors

- The archetype catalogue comes from valid project definitions; invalid
  individual definition files are reported as bounded problems rather
  than hiding valid archetypes. The catalogue revision changes with
  valid definition content. A stale revision or version refuses a
  new Create; a known successful operationId replays its outcome.
- Document types and archetype rules are Engine definitions, not DTO
  defaults in the UI. Titles derive from a first H1 or filename stem;
  template instructions are suggestions, not stored document title.
- Document and folder paths are constrained to a registered
  workspace tree with safe relative names. Path case collisions,
  escape/symlink attempts, protected overview/root, an invalid Git
  policy or Windows path length (up to 240 host characters where
  applicable) refuse with explicit typed errors, never a best-effort
  rename or silent truncation.
- The public error envelope is the shared
  `{error:CODE,code:CODE,details?}` contract; client decisions
  must branch on the stable code, not display text. The Runtime
  does not expose raw Git output, absolute filesystem paths
  or internal journal state. Unknown authority/checkout state
  fails closed.
