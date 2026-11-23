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
validation, write journals and commit policy.

## Read authority and conditional retrieval

- **Tree:** Engine projects manifest, registered files and a bounded scan of unclassified files. It distinguishes registered, unclassified, dangling and skipped entries, completeness, content kind and available actions. Reads never run Git, invent missing files or mutate journals.
- **Content:** JSON includes text only; images/binary return metadata. Unclassified files use derived `u-` IDs; classification returns a **new registered ID** that clients must follow.

### Exact revisions and authorization

`spec.view` at trusted scope is required. A `revision` query requires that exact version; missing versions return `409 DOCUMENT_REVISION_UNAVAILABLE`, never latest content. ETag/`304` applies only when the validator exactly matches the tree or document.

### Raw content security

- Stream with validated `Content-Type`, `Content-Disposition`, `Content-Length`, `X-Content-Type-Options`, sandbox CSP and strong revision ETag.
- `download=1` forces attachment; `download=0` allows safe inline images. Reject other values. Never serve untrusted/binary data as active HTML; sandbox SVG scripts.
- Complete authorization/refusals before sending the first byte. On abort or `304`, destroy the stream.

## Write acknowledgment and commit state

- **Authority:** every mutation requires `spec.manage`, an `operationId`, and `expectedRevision` when applicable. Reuse the ID only for an identical uncertain retry; changing the payload conflicts.
- **Acknowledgment:** `200` means bytes saved to disk, **not** Git committed. The asynchronous state is `pending`, `committed`, `failed`, `uncommitted` or `not-applicable`.
- **Abandonment:** no `CommitState.abandoned`. Abandon leaves saved bytes `uncommitted` with reason `abandoned`.

### Batch atomicity and conflicts

Batch save admits 1–25 documents. Verify all paths/revisions before any write; save all or none, then queue one commit batch. `DOCUMENT_REVISION_CONFLICT` identifies conflicting documents; retain all drafts until refreshed.

### Commit settlement

- **Timing:** normal settle delay 250–500 ms (default 300 ms), at most five seconds. `settling` is pending. Auto-commit disabled yields immediate `uncommitted`.
- **Projection:** tree revisions and commit markers show pending/failed/uncommitted work without Git. Conditional ETag/`If-None-Match` reflects settlement.
- **Visibility:** operations list includes pending, failed and recovery-required operations, excluding committed ones. Never reveal absolute paths.

### Retry, abandon and recovery

- Status GET is read-only with conditional ETag. Retry, Abandon and Flush require explicit Manage actions.
- Retry checks current bytes and Git policy; Abandon keeps files for manual commit, never rolls back Save.
- `SPEC_BUSY` includes typed cause/owner and optional `retryAfterMs`; autosave backs off, preserving drafts.
- `recoveryRequired:true` requires operator recovery, not blind UI retries.

### Manual commit admission

Manual commit selects only uncommitted ledger paths in scope, using stable `operationId`, expected ledger revision and an operation-closed subset. Reject stale/non-closed selections; never include unrelated Task/definition files.

### Close integration

Preview exposes pending/failed/uncommitted blockers **without flushing**. Close mutation flushes relevant queues, then may still refuse integration. Foreign dirty files never enter an archive commit implicitly.

## Archetypes, paths and errors

- The archetype catalogue comes from valid project definitions; invalid
  individual definition files are reported as bounded problems rather
  than hiding valid archetypes. The catalogue revision changes with
  valid definition content. A stale revision or version refuses a
  new Create; a known successful operationId replays its outcome.
- Document types and archetype rules are Engine definitions, not DTO
  defaults in the UI. Titles derive from a first H1 or filename stem;
  template instructions are suggestions, not stored document title.

### Path admission and safe errors

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
