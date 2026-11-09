---
id: ideas.semantic-docs.execution-plan.task-b03
type: engineering
title: 'B03 — Local file-backed vector index store'
status: draft
scope: specflow
areas: [ai, testing]
tags: [execution-task, temporary, implementation, vector-index, windows]
read_when:
  - implementing B03 of the semantic documentation search plan
summary: >
  Add the file-backed VectorStore of @nevo/ai-semantic-search (manifest.json + vectors.f32) with
  atomic writes, a single-writer lock safe on Windows, incremental refresh by content hash and full
  rebuild on any manifest mismatch.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b02
  - ideas.semantic-docs.semantic-search-package
  - ideas.semantic-docs.index-freshness
---

# B03 — Local file-backed vector index store

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

A CLI process and a running Runtime can share one disposable index directory: readers always see a
complete manifest + vectors pair, at most one writer works at a time, and an incompatible index is
rebuilt rather than migrated.

- Kind/profile: backend / `nevo-agents:implementer`.
- Owner paths: `packages/ai-semantic-search/src/` (a new store module and its tests, plus the
  refresh/index orchestration that diffs a `ChunkSource` against the manifest); package manifest
  and `pnpm-lock.yaml` only if a pure-JS dependency is justified.
- Prerequisites: B02 (ports, chunker version, fake embedder).
- Minimal context: the engine ADR from B01, `ideas.semantic-docs.index-freshness`,
  `engineering.shared.async-and-lifecycle`, `engineering.shared.effects-and-io`, B02's port
  definitions.

## Scope

- The store receives its directory from the consumer (the cache location is a consumer decision,
  B-D5); it creates it if missing.
- Manifest fields: schema version, chunker version, protocol, model, dimensions, chunk id → content
  hash and vector offset. Any mismatch of schema version, chunker version, protocol, model or
  dimensions, or an unreadable/inconsistent pair, means full rebuild. No migration code
  (prevent-don't-recover: validate the manifest at the boundary and rebuild).
- Writes: temp files in the same directory, then rename, so a reader opens either the old or the new
  complete pair. Windows rename-over-open-file behavior is handled by design (for example a
  generation directory or manifest-last ordering), not by retry loops hiding failures.
- Single-writer lock with stale-lock detection by owner process liveness; a reader never waits for
  the lock. A second writer gets a typed "index busy" result the consumer reports as lexical with a
  reason.
- Incremental refresh: unchanged content hashes keep their vectors; only new or changed chunks are
  embedded; removed chunks are dropped. A cheap freshness check (mtime, then hash only changed
  units) is exposed for read-time refresh.

## Acceptance

- Concurrent reader during a write never observes a partial index (test with interleaved
  operations, not timing sleeps).
- Two writers: exactly one proceeds, the other gets the busy result; a lock left by a dead process
  is reclaimed.
- Changing any manifest identity field triggers a full rebuild; a truncated `vectors.f32` triggers
  a full rebuild, not an exception from the read path.
- Refresh embeds only changed chunks (asserted through the fake embedder's call log).

## Verification

Targeted (Windows-safe, these tests must run on Windows because the risk is Windows-specific):

```bash
pnpm --filter @nevo/ai-semantic-search exec vitest run src/<store test> src/<lock test> src/<refresh test>
pnpm --filter @nevo/ai-semantic-search typecheck
pnpm --filter @nevo/ai-semantic-search lint
```

Consider adding the store tests to `tools/ci-windows-smoke-tests.json` if that list owns
Windows-sensitive filesystem tests. Full suite on Linux/CI.

## Review focus (heightened gate)

Atomicity and lock correctness on Windows; no migration or repair branches; failure results are
typed and never crash a reader; temp file cleanup.

## Out of scope

Where the index lives and when refresh is triggered (B05, B07); external stores.
