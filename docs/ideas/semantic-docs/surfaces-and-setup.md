---
id: ideas.semantic-docs.surfaces-and-setup
type: engineering
title: Semantic docs search — human reader, workspace retrieval and setup follow-ups
status: draft
scope: specflow
areas: [docs, ai, ui, runtime, configuration]
tags: [semantic-search, help, corpora, embeddings, worktree, workspace, reader, authorization]
read_when:
  - planning workspace-aware documentation search, a human reader or contextual help in the UI
  - defining workspace-scope access, corpus revisions and branch-switch refresh behavior
  - indexing another corpus (Specification documents, code) with @nevo/ai-semantic-search
  - enabling semantic search in an initialized project, or supporting another embedding endpoint
  - splitting model adapters or agent drivers into separate packages
summary: >
  Proposals beyond PR #138: a workspace-aware human documentation reader, project-level
  authorization, trusted embedding configuration, corpus revisions and refresh, plus contextual
  help, other corpora, semantic setup, endpoint gaps and future AI package splits.
related:
  - ideas.semantic-docs
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - reference.api.docs-search
  - reference.configuration.documentation-and-embeddings
---

# Semantic docs search — surfaces, corpora and setup follow-ups

Proposal language throughout; each item names the current document.

## Contextual help and related documents in the UI

**Now:** documentation search is available to agents and scripts through
[`nevo-specflow docs search`](../../reference/cli/nevo-specflow-docs.md#search) and
[`GET /api/docs/search`](../../reference/api/docs-search.md); the UI has no documentation surface.

**Missing:** a UX contract first (where help appears, what "related documents" means for a screen or
an open document, how results and sections are shown and opened), then a UI port on the existing
endpoint. Live updates belong with it: the Runtime notices document changes on the next search
(read-time refresh) and refreshes on start, but pushes nothing; a help surface that should update
while the user edits needs a file watcher or an event on the existing Runtime event channels.

## Other corpora

**Now:** [ADR 0021](../../architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md)
keeps the engine product-neutral behind a `ChunkSource` port; the only consumer is the project
documentation (`@nevo/specflow-docs`).

**Missing:** chunk sources for Specification documents and for code, with their own identity,
filters, freshness rules and index directories, and a decision on how their results reach agents
and the UI. Code also needs a chunker that is not Markdown-heading based and is the likely trigger
for [BM25 postings](search-quality.md#bm25-postings-for-large-corpora) and an approximate vector
index.

## Assisted enabling in an initialized project

**Now:** `nevo-specflow init` offers semantic search for a new project; in an initialized project no
command offers it, and the
[configuration reference](../../reference/configuration/documentation-and-embeddings.md) says to edit
`.nevo/config.yaml` and `.nevo/local/config.yaml` by hand.

**Missing:** a guided path, either a re-runnable setup step (for example a `docs semantic enable`
command with the same probe and review as `init`) or a Settings screen in the UI, both writing the
same keys with the same validation.

## Endpoints that need a query string or an `api-key` header

**Now:** `ai.embeddings.baseUrl` rejects a query string, and the adapter sends the key as a bearer
token, so classic Azure OpenAI deployments (`api-version` query parameter, `api-key` header) are not
supported; the configuration reference says so.

**Missing:** configuration for a query string and the authentication header (for example an
`apiKeyHeader` key), with the same secret rules (the key value still only from an environment
variable) and the embedding-space fingerprint covering what changes the model served.

## Status probe on client close

**Now:** `GET /api/docs/status` probes the endpoint (bounded by the query timeout, at most 3000 ms,
and shared between requests for a few seconds); the probe does not observe the request's close.

**Missing:** passing the request's close signal to the probe, so a client that disconnects does not
keep a probe running for it. Low priority while the probe is bounded and shared.

## Package splits

**Now:** ADR 0021 keeps the OpenAI-compatible embeddings adapter inside `@nevo/ai-semantic-search`
and names the trigger for a separate `@nevo/ai-models` package: a second consumer of model
endpoints. The AI agent session drivers (Claude, Codex, Antigravity) live in `@nevo/specflow-runtime`
(`features/sessions/providers`, see the
[provider boundary](../../architecture/ai/provider-boundary.md)).

**Missing:** when a second consumer appears, `@nevo/ai-models` for model endpoint adapters, and,
as a separate decision, a product-neutral `@nevo/ai-agents` package for the session drivers if a
consumer outside the Runtime needs them. Neither has a consumer today.

## Workspace-aware retrieval and Nevo-native documentation reader (proposal, 2026-11-11)

This is a **non-authoritative idea**, not behavior implemented by PR #138. The choices below
are the proposed **target contract** for a future implementation, to be promoted to the owning
ADR, API, product and authorization documents together. They are not a request to add
compatibility layers, new design-system components or a new AI chat.

### Observed gap and resource boundary

- Current Runtime creates one `ProjectDocs` from its `projectRoot`. The `/api/docs/search`
  and `/api/docs/status` endpoints have no workspace parameter; a request from a Specification
  using a linked worktree may read the Project Home checkout's documentation.
- The CLI resolves the checkout from its invoking working directory, so a `docs search` issued
  *inside* a linked worktree can already read that checkout; CLI and Runtime behavior differ.
- `DocsChunkSource` hashes Markdown files on each search and supports incremental updates,
  including uncommitted changes. It does **not** automatically reload `docs.root`, `docs.yaml`,
  `exclude` or taxonomy when a long-lived `ProjectDocs` was opened before a branch switch.
- Project documentation under `docs.root` is not Specification Documents under
  `/specs/:specId/documents`; the latter is a separate corpus and edit workflow.

### Chosen scope and authorization model

Documentation of any registered workspace belongs to the **current project** for access-control
purposes. Use one project-level read capability, provisionally **`docs.view`**, for **list,
read, search and ordinary indexing-status inspection**. Replace the existing `docs.search` action
when the new API is implemented; do not layer an alias only for pre-production compatibility.
The built-in viewer/developer/admin role compositions keep documentation read access.

- Every docs HTTP read must call `request.authz.require` (or the matching scoped guard) for
  the **resolved current project scope** `{ projectId: engine.context.project.projectId }`.
  Do not use `requireCapabilityInAnyScope`, and do not derive access from the selected
  `workspaceId`, `specId` or `sessionId`. A grant bounded to one Specification or Session
  does **not** authorize any project documentation; a global grant covers the current project.
- `projectId` here is the Runtime's required **authorization target**, **not** a newly invented
  public route parameter or a recommended literal in committed policy. Existing workstation-local
  identities are not necessarily portable between clones. Until portable per-project grant
  identity is explicitly defined, use global role assignments for the single-project deployment;
  do not write local `projectId` or `workspaceId` values into Git-tracked role assignments.
- Perform the project-level authorization check before revealing the registration/existence of
  the requested workspace; afterwards resolve it via the verified Engine registry. Never accept
  an absolute path, unchecked Git ref or arbitrary directory from the caller. Recheck membership
  before filesystem access and when the workspace is closed/rebound.
- Return `401` for missing authentication and `403` for absent project capability. Once authorized,
  distinguish unknown workspace (`404`), unavailable/changed workspace (`409` or `503`, by
  cause), unknown/removed document (`404`) and invalid corpus (`503`).
- Ordinary `status` responses expose mode, index freshness and progress, but should not disclose
  credentials or sensitive embedding endpoint diagnostics to viewers. Keep detailed host settings
  inspection behind the existing `settings.view` capability if offered.
- UI visibility of the navigation link is not an authorization boundary; Runtime checks every
  operation. Standalone CLI retains its explicitly separate local trust model.

### HTTP and UI resource identity

Use the registered checkout UUID, `workspaceId`, in the **route**, not the search query:

```http
GET /api/workspaces/:workspaceId/docs
GET /api/workspaces/:workspaceId/docs/documents/:documentId
GET /api/workspaces/:workspaceId/docs/search?q=...&limit=...
GET /api/workspaces/:workspaceId/docs/status
```

The first returns the human-reader tree/list, the second the active document (optionally a
section reference), the third ranked document/section results, and the fourth indexing state.
Document and section references resolve only inside the selected validated corpus.
`q`, `limit`, `snippets` and `includeNonAuthoritative` remain search options.

**No backward compatibility by default.** In the implementing PR migrate internal consumers,
contracts, API tests, OpenAPI, authorization documentation and agents together, then remove
`GET /api/docs/search` and `GET /api/docs/status`. The public CLI commands keep their own
checkout-relative semantics; this decision is not a CLI deprecation. Reconsider compatibility
only if an actual external consumer is found before implementation.

Canonical reader routes proposed for the UI:
`/workspaces/:workspaceId/docs` and `/workspaces/:workspaceId/docs/:documentId`.
`/docs` may show an explicit workspace chooser, not silently redirect to `main`, browser
history or the last-selected Specification. A permanent global Documentation navigation entry
remains a product decision; having a route does not imply it.

### Configuration ownership, refresh and trust

Separate three lifecycles:

1. **Selected checkout corpus configuration:** read the checkout's current `.nevo/config.yaml`
   **`docs` namespace only** (`docs.root`, `docs.search.semantic`) and the selected
   `<docs.root>/docs.yaml` (`taxonomy`, `exclude`, `nonAuthoritative`) as untrusted
   data. Validate paths, absence of symlink/junction traversal, schema and allowed roots.
   Changes to either file must take effect even if all Markdown hashes are unchanged.
2. **Trusted embedding configuration:** Runtime takes `ai.embeddings` (provider, endpoint,
   model, embedding-space identity, credentials and egress permission) exclusively from its
   trusted host/Project Home configuration. **Do not merge or execute `ai.embeddings` from a
   selected worktree**: otherwise checking out a branch could redirect source documents
   to an attacker-controlled endpoint. Host policy may disable semantic/remote egress.
3. **Derived corpus and index state:** open a `ProjectDocs` for one verified workspace and
   effective corpus configuration, with an isolated logical vector index and cache. Indexes
   are disposable, never a source of authority. Respect Git-ignore checks for every worktree
   and use lexical fallback if the cache cannot safely be written.

Before any list/get/search/status operation, detect a changed effective `docs` configuration or
`docs.yaml` and retire/reopen the old corpus instance (including its file walker, filters,
validation, chunk cache and pending refresh). This is not only a `refreshIndex` call:
the old `createFileSystemDocRepository` captures `exclude` and the old corpus captures taxonomy.
Re-evaluate added, deleted and changed Markdown under the **new** rules; refresh vectors
incrementally when the embedding/chunker identity is compatible. Removed/excluded documents
must disappear immediately from lexical results and reader navigation.

A branch switch under the same workspace UUID does not require a full rebuild merely because
HEAD changed. An embedding model/space, dimension, chunker or incompatible index schema
change does require re-embedding under the existing engine rules. A changed docs root or taxonomy
must revalidate and may change included chunks. On a large gap return current-corpus lexical
results with `index-building`, never old-workspace/old-revision vector results.

Instances and background refreshes need bounded memory, per-workspace cancellation/disposal,
locks and no stale publish after workspace close, rebind or Runtime shutdown. Keeping many
simultaneously open `ProjectDocs` instances must not grow without limit. A future shared
content-addressed **embedding cache** is optional; do not share one mutable vector store
between workspaces now.

### Corpus revision, snapshots and cache consistency

Do not equate Git HEAD, source revision, index generation and workspace identity:

- **`workspaceId`** identifies the registered checkout on this workstation, not the content.
- **`corpusRevision`** is an opaque digest of the *effective* docs configuration
  (`docs.root` and parsed `docs.yaml` semantics) plus a deterministic sorted list of
  included documentation paths and file-content hashes (including frontmatter). It changes
  with dirty edits and config/filter changes even if HEAD stays unchanged. It excludes secret
  host embedding settings and disposable caches. The server owns the digest algorithm/version.
- **`index`** reports separate `state`, `generation`, pending chunk count and embedding
  identity/status, all scoped to that workspace; its generation is not the corpus revision.
  **`branch`, `HEAD` and dirty flag** are informative source provenance only, never
  cache-invalidation keys or proof of a stable corpus snapshot.

Every successful list/get/search response identifies `workspaceId` and
`corpusRevision` (for example in a shared response envelope). Include index mode/status
on search/status, and document ID, path and section ID on results. The corresponding HTTP
`ETag` names the selected corpus revision (scoped to the workspace). When opening an article
from a tree/search revision, the UI may send `If-Match`; if the corpus has changed, return
`412 Precondition Failed` and reload the selected workspace's tree/search before opening it.
A direct article link without a revision reads the current corpus.

Prevent a request from returning mixed-version file metadata and content: load/validate a
coherent corpus read snapshot, verify its inputs have not changed before committing the response,
and retry a bounded number of times. If concurrent branch checkout/file writes prevent a
consistent observation, return an explicit `409 DOCS_CORPUS_CHANGED` rather than fabricating
atomic filesystem semantics. Check configuration and documents in the same snapshot, not as
independent cached objects.

TanStack Query keys include `workspaceId`, `corpusRevision` where known, and the query or
document ID. Switching workspace immediately resets the visible tree/article/search and cancels
or ignores in-flight old-context requests; responses with a mismatched source identity are never
rendered under the new context. A revision mismatch within one workspace invalidates the tree,
article, search results and section selection together, preserving user input where possible.
Deep links remain routable even if their original revision became stale.

### Visibility and links

For the initial reader, show **active** documents in the tree and exact reads. Inactive
(`deprecated`, `superseded`) entries are hidden and `get` remains fail-closed for them;
an explicit archive reader would require a later API/product decision. `exclude` paths are
never visible or searchable.

`nonAuthoritative` is **not** an inactive status: include these active documents in the tree
and allow their explicit read, with a quiet "Non-authoritative" marker and relevant explanation.
Keep search's existing default exclusion of those paths unless
`includeNonAuthoritative=true`; preserve `context`'s stricter exclusion. Do not quietly
merge non-authoritative results into default agent context.

For documentation Markdown use the existing `@nevo/ui` **`MarkdownDocument`** renderer
(`react-markdown`, GFM, raw HTML not rendered), with a product-owned `renderLink` policy.
Treat the source and all href/src attributes as **untrusted**. Block scriptable schemes
(`javascript:`, `data:`, `file:`, etc.), disallow raw HTML execution, canonicalize
relative workspace-local references under the selected docs root, reject traversal/symlink
escapes and resolve internal document links through stable document routes. External links
need explicit safe protocols and `noopener noreferrer`; don't silently fetch remote
images or embedded resources from documentation in the local product without a separate
policy (avoid leaking project access tokens/context or triggering remote requests).
No new HTML/Markdown rendering engine or unrestricted plugin execution.

### Session/Specification origin and user interaction

A Specification entry derives the current verified workspace via its authoritative Engine
binding, including later rebind. For a Session, first resolve a verified authoritative
execution workspace if Runtime actually provides it; otherwise use the associated
Specification's current binding. **Standalone Sessions can have neither**. In that case
open an explicit authorized workspace chooser, not an inferred Project Home or last
visited checkout. A workspace switch from the reader is explicit and clears stale data.
Do not use a caller-provided session/workspace mapping as authorization.

The first prototype resembling an independent docs portal was rejected. Reuse the actual
`SpecFlowShell`/`AppShell`, `AppWorkspace`, workspace headers, navigation, scroll
ownership and design tokens. The existing Specification Documents pattern is the geometric
precedent: Wide/Compact uses a bounded Primary tree/results pane (approximately 360px)
and a read-only Markdown Secondary. Narrow pushes the article with Back while preserving
search, tree selection and scroll. No always-on third TOC pane, additional card around prose,
new global navigation level, cloned editor or AI-generated answer chat.

### Delivery and verification

1. **Workspace-aware Runtime and authorization:** registered checkout resolution, project-scoped
   `docs.view` on every operation, trusted embedding egress and safe filesystem boundary;
   no unauthorized cross-worktree data disclosure.
2. **Corpus lifecycle and revision:** reread effective configuration, reopen on change,
   incremental index refresh, content revisions, coherent reads/`If-Match`, correct branch
   checkout and dirty document behavior; cancellation on close/rebind.
3. **Read-only API and UI:** active tree, exact Markdown read, lexical/hybrid search, safe links,
   source/version metadata, Standalone Session selector, error and fallback states.
4. **Later only:** related-document suggestions, live filesystem events, optional global
   navigation promotion, Specification/code corpora, shared embedding deduplication.

Acceptance tests must cover two registered worktrees with conflicting text; branch switches with
unchanged and changed Markdown; dirty edits; modified `docs.root`, `exclude`, taxonomy and
`nonAuthoritative` with identical Markdown hashes; untrusted worktree `ai.embeddings` attempting
endpoint redirection; denied Specification-only or Session-only users; permitted global viewer;
deleted/excluded/inactive documents; stale tree-to-article `If-Match`; branch switch during
search; long-running index refresh during workspace removal; and internal/external Markdown
link/image sanitization.

For UI render **composed** AppShell/AppWorkspace stories at 1440px, approximately 1024px,
375px and 320px, with long paths, no horizontal overflow, workspace changes, keyboard
navigation and correct Back/scroll restoration. Standalone HTML is only design evidence,
not implementation verification.
