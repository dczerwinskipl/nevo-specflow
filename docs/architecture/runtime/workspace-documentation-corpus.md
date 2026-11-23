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

- **Access:** `docs.view` at trusted `{projectId}` scope; global/project grants cover registered workspaces, Specification/Session-only grants do not. Authorize **before** lookup.
- **Identity:** Engine verifies the registered checkout on every request and reads its own `docs.root`, `docs.yaml` and `.nevo/config.yaml` settings. Changes need no restart.
- **Refusals:** unknown workspace: `404 DOCS_WORKSPACE_NOT_FOUND`; moved/missing/closing workspace: `409 DOCS_WORKSPACE_UNAVAILABLE`; missing docs root: `503 DOCS_NOT_CONFIGURED` (only checkout-relative `docsRoot`); invalid YAML, symlinks/junctions or unreadable corpus: `503 DOCS_UNAVAILABLE`. No Engine/project source or demo mode: `503 DOCS_NOT_SERVED`. Log underlying details server-side only.
- **Paths:** returned paths are slash-separated and relative to `docs.root`; CLI search paths are checkout-relative.

### Corpus revision

`corpusRevision` hashes effective settings and included file paths/content. Tree, article and search share it for unchanged corpus. It is **not** Git HEAD, embedding revision or ETag: no `If-Match`/`If-None-Match`/412 protocol. Clients reload affected reads when it changes.

### Corpus validity and skipped entries

- Skip invalid frontmatter and **every document** with a duplicated ID, reporting reason/path in successful responses.
- Unresolved `related`/`superseded_by` links do not exclude otherwise readable documents, but strict `docs check` fails.
- Configured proposal path prefixes mark proposals, never current normative rules.

## Documents and search projections

- **Tree:** includes active/inactive (deprecated, superseded) and skipped entries. `rootIndexDocumentId` exists only for a readable, active `<docs.root>/README.md`.

### Article reads and refusals

- **Consistency:** metadata/body come from one file read. Headings yield ordered `sectionId`/`headingPath` and 1-based **body** lines; `_top` precedes headings. Search hit lines instead include frontmatter.
- **Inactive:** `410 DOCS_DOCUMENT_INACTIVE` with successor when available.
- **Skipped:** `404 DOCS_DOCUMENT_SKIPPED` naming every offending file.
- **Missing/raced file:** `404 DOCS_DOCUMENT_NOT_FOUND` with this workspace's corpus revision, never another workspace's facts.

### Search results and snippets

- **Query:** nonempty `q` up to 500 characters; `limit` 1–50 (default 10). Proposals excluded and snippets included by default. Result `id` equals tree/article `documentId`.
- **Snippet:** one text excerpt from paragraph, list or row, up to 280 characters, starting no more than 40 before first match.
- **Matches:** `snippetMatches` has up to three nonoverlapping UTF-16 `[start,end)` ranges for distinct query words; absent without snippet, empty with no match or `wordMatch:false`. `wordMatch` means lexical, not semantic-only.

### Lexical fallback and omitted proposals

- `proposalsLeftOut` counts matching omitted proposals at the same cutoff/limit; zero when included.
- Search may return `mode:hybrid` or successful lexical results with a typed reason. Missing vectors **do not** turn lexical success into 503.
- Index progress belongs in the search result, not a separate UI status endpoint.

## Semantic refresh and concurrency policy

Only Runtime's trusted `ai.embeddings` config supplies the endpoint; checkout `docs.search.semantic` opts in. Index lives in that checkout at `.nevo/local/cache/docs-index/`, shared with its CLI.

### Refresh deadlines and fallback

- On each HTTP search, check changed chunks; embed at most 16 within a 7000 ms post-corpus answer budget. Probe/embedding deadline: 4000 ms; remaining query embedding: at most 3000 ms. UI timeout: 12000 ms. CLI has no answer budget.
- Abort unfinished batches **without partial writes**. Return lexical `index-building`, schedule background catch-up after successful probe; an abort is not `endpoint-unreachable`.
- Large corpus changes return lexical immediately. Never await full re-embedding or race a CLI index owner. Retry failed background updates only after 60 seconds.

### Indexing concurrency and disposal

- One background indexing job globally. While its endpoint is busy, other semantic searches fall back to lexical with a typed reason and available `indexProgress`; they do not concurrently embed/query.
- Cache up to four workspace corpora (LRU). Release and await refresh before worktree disposal; shutdown cancels and awaits refresh, preserving completed chunks.

### Cache seeding and write admission

- Linked worktrees may seed from Project Home only with matching settings and embedding identity; refresh embeds differences.
- Require fresh `git check-ignore` proof **before every index write**. Failure leaves no write and serves lexical search.

### Startup and configuration errors

- Primary semantic checkout begins background refresh without delaying readiness; others refresh on search.
- A slow endpoint during a running job reports `index-building`, not `endpoint-unreachable`.
- Invalid Runtime-owned embedding/docs config fails startup; invalid checkout settings fail that workspace's request with 503. Disabled semantics or absent trusted endpoint causes no embedding writes/noisy diagnostics.

Every read uses `Cache-Control: no-store` and the shared endpoint rate limiter. The
[product reader](../../product/specflow/ui/documentation-reader.md) owns the UI's
display and navigation behavior.
