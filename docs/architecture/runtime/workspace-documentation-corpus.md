---
id: architecture.runtime.workspace-documentation-corpus
type: architecture
title: Workspace-scoped documentation corpus, freshness and search
status: current
scope: specflow
areas: [runtime, docs, security, ai]
tags: [docs, workspace, corpus, semantic-search, refresh, authorization]
read_when:
  - implementing a workspace-scoped documentation reader
  - debugging lexical fallback, embedding refresh or stale corpus content
  - changing index storage, secure workspace isolation or read-time budget
summary: >-
  Runtime documentation reads use verified workspace checkouts and stable corpus revisions,
  with bounded search refresh, lexical fallback, isolated index ownership and scoped authorization.
related:
  - adr.0022-workspace-scoped-documentation-reader
  - reference.api.workspace-docs
  - reference.cli.nevo-specflow-docs
  - reference.configuration.documentation-and-embeddings
  - product.specflow.ui.documentation-reader
  - architecture.runtime.authorization
---

# Workspace-scoped documentation corpus

The Runtime documentation endpoints operate on a **registered and verified workspace**, never
a caller-supplied file path, branch, checkout or arbitrary directory. The exact HTTP contract
is generated in [OpenAPI](../../reference/api/openapi.md), operations
`getWorkspacesByWorkspaceIdDocs`, `getWorkspacesByWorkspaceIdDocsDocumentsByDocumentId`
and `getWorkspacesByWorkspaceIdDocsSearch`.

## Workspace identity, access and corpus

- `docs.view` is required at trusted `{projectId}` scope. A global/project grant covers
  every registered workspace; a Specification- or Session-only grant does not. Authorization
  runs **before** workspace lookup, so forbidden principals cannot learn which checkout exists.
  With no Engine/project documentation source, the Runtime replies `DOCS_NOT_SERVED`, not
  synthetic demo data.
- Every request verifies the workspace through the Engine and reads that checkout's own
  `docs.root`, `docs.yaml` and `.nevo/config.yaml` documentation settings. Settings are
  refreshed each time; no restart is required. A moved/missing/closing checkout is
  `DOCS_WORKSPACE_UNAVAILABLE` (409). An unregistered id is
  `DOCS_WORKSPACE_NOT_FOUND` (404).
- A missing configured docs root directory returns `DOCS_NOT_CONFIGURED` (503) and only
  its **checkout-relative** `docsRoot`; invalid docs YAML, unreadable corpus or symlink/
  junction at docs.root, docs.yaml or config returns `DOCS_UNAVAILABLE` (503).
  Underlying path/error details are logged on the server, not returned. Demo/no-project
  mode answers `DOCS_NOT_SERVED` (503) rather than exposing a fake corpus.
- Returned paths and search hit `file` values are relative to the checkout's
  `docs.root`, with forward slashes. The CLI's search file paths are relative to its
  checkout, so don't equate these directly.
- `corpusRevision` is an opaque digest of the **effective documentation settings and included
  paths/content hashes**. It is shared by tree, article and search for an unchanged corpus,
  but is **not Git HEAD, not an embedding-index revision and not an ETag**. No
  `If-Match`/`If-None-Match`/412 protocol is supported here; clients compare revisions
  and reload the relevant reads after a difference.
- Invalid frontmatter and **all documents of a duplicated ID** are skipped with reason and
  path (visible in every 200 result). An unresolved `related` or `superseded_by` reference
  does not skip an otherwise readable document. Strict `docs check` still fails those
  inconsistencies. The configured proposal path prefixes mark documents as proposals,
  not current normative guidance.

## Documents and search projections

- Tree lists active documents, inactive deprecated/superseded documents and skipped ones;
  `rootIndexDocumentId` exists only for an active readable `<docs.root>/README.md`.
- Article metadata and Markdown body come from **one file read**; sections are ordered body
  headings with a stable `sectionId`, `headingPath` and **1-based body line**. `_top`
  represents text before the first heading. Search hit line numbers include frontmatter,
  whereas article body section lines do not.
- An inactive article is `410 DOCS_DOCUMENT_INACTIVE` with successor information when
  known. A skipped ID is `404 DOCS_DOCUMENT_SKIPPED`, listing every offending file.
  A missing ID or file disappearing/changing during its read is
  `404 DOCS_DOCUMENT_NOT_FOUND`; the refusal carries this workspace's corpus revision
  but tells nothing about documents of other workspaces.
- Search ranks documents and best sections with the existing CLI docs-search semantics.
  `q` is nonempty (up to 500 characters), `limit` is 1..50 (default 10),
  `includeProposals` is off by default, and snippets are on by default. A search hit's
  `id` corresponds to `documentId` in the tree/article.
- A snippet is one plain-text excerpt from a paragraph/list/table row at most **280
  characters**; it may start at most 40 characters before the first word match.
  `snippetMatches` are nonoverlapping **UTF-16** `[start,end)` offsets, at most three
  first occurrences of distinct query words; absent with an omitted snippet, empty when
  no match or `wordMatch:false`. `wordMatch` signals actual lexical words rather
  than a hit found by semantic similarity only.
- `proposalsLeftOut` counts matching proposals omitted from a normal search with the
  same limit/cutoff. It is zero when proposals are included. Semantic search may return
  `mode:hybrid`; a lexical answer with a typed reason is **normal success**, never
  a 503 merely because vectors are unavailable. Index progress belongs in the search
  response; there is no separate status endpoint for the UI.

## Semantic refresh and concurrency policy

- A checkout enables semantic search through its `docs.search.semantic`. Only the Runtime's
  **trusted** config supplies `ai.embeddings`; a workspace cannot supply its own embedding
  endpoint. An index belongs to that checkout at `.nevo/local/cache/docs-index/`, shared
  with the CLI run in that checkout.
- On every HTTP search, read-time refresh checks changed chunks and can embed up to **16**,
  with a **7000 ms** post-corpus answer budget. Probe/embedding has a **4000 ms** deadline,
  leaving at most **3000 ms** for query embedding. Unfinished work is aborted and does not
  perform a partial batch write; search continues lexically with `index-building` and
  schedules background catch-up. The abort is not `endpoint-unreachable`. The UI sets a
  **12000 ms** request timeout for corpus load, transport and remaining work. The CLI has
  no such answer budget.
- If the changed corpus exceeds one bounded refresh, answer lexically immediately and
  schedule one background catch-up after a successful endpoint probe; never silently
  wait for a full re-embedding. When a CLI process owns the index, report that state
  rather than racing writes. After a failed background update, retry no sooner than
  **60 seconds**.
- The Runtime permits **one background indexing job globally** across its workspaces.
  While any such job occupies its embedding endpoint, another semantic-enabled
  search does not query/embed concurrently and returns an appropriate
  `index-building`/other lexical reason. One linked worktree may be seeding from
  Project Home, this same checkout may be actively refreshing, or another checkout
  may occupy the endpoint. The corresponding `indexProgress` is supplied when available.
- At most **four** workspace corpora are retained open, with least-recently-used disposal.
  Before worktree disposal, release that workspace's corpus and wait for its refresh.
  Closing Runtime cancels running refreshes and waits for the index to be released;
  completed persisted chunks remain.
- A new linked worktree without index can seed from Project Home's cache **only** if
  settings and embedding identity match; subsequent refresh embeds the difference.
  Before every write, a fresh `git check-ignore` proves the index path is ignored.
  Failed write admission is fail-closed with **no index write** and a lexical result.
- At Runtime startup, a configured semantic-enabled primary checkout starts a
  background refresh without delaying readiness; other checkouts refresh on search.
  A slow/unreachable indexing endpoint under a running job is reported as
  `index-building`, not falsely as `endpoint-unreachable`.
- Invalid Runtime-owned docs/embeddings configuration fails startup; invalid
  checkout-owned docs settings fail that workspace's request with 503. With semantic
  search off or no trusted endpoint, no embedding writes or noisy refresh diagnostics occur.

Every read uses `Cache-Control: no-store` and the shared endpoint rate limiter. The
[product reader](../../product/specflow/ui/documentation-reader.md) owns the UI's
display and navigation behavior.
