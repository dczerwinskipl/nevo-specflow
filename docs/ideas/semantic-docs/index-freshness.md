---
id: ideas.semantic-docs.index-freshness
type: architecture
title: Semantic docs index freshness
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - docs
tags:
  - semantic-search
  - vector-index
  - lifecycle
  - windows
read_when:
  - deciding when the semantic documentation index is rebuilt or refreshed
  - considering a file watcher for documentation changes
summary: >
  Proposal to keep the semantic index fresh through refresh on Runtime start, immediate
  invalidation on writes SpecFlow owns, and a cheap staleness check on every read, instead of a
  file watcher.
related:
  - ideas.semantic-docs
  - ideas.semantic-docs.semantic-search-package
  - architecture.runtime.ownership-and-lifecycle
---

# Semantic docs index freshness

## Three triggers

1. **Runtime start** — `nevo-specflow start` refreshes incrementally in the background; startup is
   not blocked. Until ready, search answers `mode: lexical`, reason "index building".
2. **Owned writes** — when SpecFlow itself writes documentation (docs commands, Engine-owned document
   commits), the affected units are invalidated and re-embedded right away.
3. **On read** — every `search` (CLI or HTTP) checks freshness: compare mtime, hash only changed
   files, re-embed only changed chunks. At the current corpus size this is milliseconds plus the
   embedding cost of what actually changed. `--no-refresh` skips it.

A manual edit in an editor therefore shows up on the next search without any background process.

## Why not a file watcher (for now)

- Windows: editor temp files, file locks, and recursive watch edge cases.
- `git checkout` / `rebase` produce bursts that need debouncing and coalescing.
- Another long-lived process with its own lifecycle and failure modes.
- Read-time checking already gives the same observable freshness for CLI and API.

A watcher can be reconsidered if contextual help ever needs live push updates.

## Concurrency

CLI and Runtime share one index directory (for example `.nevo/local/cache/docs-index/`): single
writer lock, atomic rename on write, readers always see a complete manifest + vectors pair.
