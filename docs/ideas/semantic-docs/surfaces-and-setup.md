---
id: ideas.semantic-docs.surfaces-and-setup
type: engineering
title: Semantic docs search — surfaces, corpora and setup follow-ups
status: draft
scope: specflow
areas: [docs, ai, ui, runtime, configuration]
tags: [semantic-search, help, corpora, embeddings]
read_when:
  - planning a contextual help or related-documents surface in the UI
  - indexing another corpus (Specification documents, code) with @nevo/ai-semantic-search
  - enabling semantic search in an initialized project, or supporting another embedding endpoint
  - splitting model adapters or agent drivers into separate packages
summary: >
  Proposals beyond PR #138: contextual help and live updates in the UI, other corpora through the
  chunk-source port, assisted enabling of semantic search in an initialized project, endpoints that
  need a query string or an api-key header, the status probe on client close, and the
  @nevo/ai-models and @nevo/ai-agents splits.
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

This is **non-authoritative design exploration**, not behavior implemented by PR #138.
Promote accepted parts into the owning product, API and architecture contracts before implementation.

### Verified gap and separation

PR #138's Runtime creates one \`ProjectDocs\` from its \`projectRoot\`. Its \`GET /api/docs/search\`
and \`GET /api/docs/status\` do not resolve a workspace identity. Thus a Runtime hosted from Project
Home can search that checkout even when the human or agent is working in another linked worktree.
The CLI resolves its project root from the invoking checkout; using the CLI *from* a worktree can
already search that checkout. These are different paths and must not be conflated.

The index already hashes current Markdown on read and updates changed chunks incrementally. Dirty
changes are detectable. Branch switching need not trigger a blind full rebuild, but the selected
corpus and its settings must be re-resolved. \`Documents\` at \`/specs/:specId/documents\` is the
Specification document editor and **not** the project's \`docs.root\` corpus.

### Resource identity and HTTP proposal

Use a stable registered \`workspaceId\` as a route parameter, not a search query filter:

\`\`\`http
GET /api/workspaces/:workspaceId/docs
GET /api/workspaces/:workspaceId/docs/documents/:documentId
GET /api/workspaces/:workspaceId/docs/search?q=...&limit=...
GET /api/workspaces/:workspaceId/docs/status
\`\`\`

The server resolves \`workspaceId\` via the existing verified registry and derives the physical
checkout. Never accept a client-provided root or arbitrary Git ref. Search query parameters
control search behavior, not resource identity. Reuse the existing UUID type and do not invent
a second workspace identity. No synthetic \`projectId\` is needed in the current single-project
Runtime. Multi-project hosting may later need its own explicit route hierarchy.

The current \`/api/docs/*\` contract remains defined during migration. Do not silently reinterpret
it as the last selected UI workspace. The exact compatibility policy is an open decision.
Document IDs and section references are resolved **inside the selected corpus**. Treat missing,
removed, forbidden, invalid and temporarily unavailable worktrees differently.

**Authorization must be re-reviewed.** The existing \`docs.search\` capability admitted in any
scope was defined for one project corpus. It must not inadvertently authorize every worktree merely
because a principal can see one Session or Specification. Workstation-local workspace IDs must not
be persisted as portable authorization grants.

### Freshness, branch changes and lifecycle

- A worktree's live filesystem is the documentation truth, including uncommitted edits and its
  own \`docs.yaml\` and checked-out \`.nevo/config.yaml\` documentation settings. Endpoint
  credentials and trusted model configuration remain host-managed; do not execute or trust
  arbitrary configuration/paths from a checkout without validation.
- Start with isolated corpus/index instances per verified workspace. Cache writes remain subject
  to the existing Git-ignore policy. Bound the number of open instances and handle removed
  worktrees, close, rebind, cancellation and Runtime shutdown.
- \`workspaceId\` alone is not a **content revision**. Branch/HEAD can change under the same
  workspace identity, and dirty files can change without a Git commit. Return sufficient source
  provenance to identify checkout, observed branch/HEAD and the current corpus/index revision;
  never treat HEAD as an exhaustive revision token.
- Detect changed/added/deleted Markdown and \`docs.yaml\` changes. Reuse existing content-hash
  comparison, incremental embedding, versioned chunker, index fingerprint and single-writer lock.
  Full rebuild is justified by incompatible embedding/chunker identity, not by every branch switch.
- Until vectors for the current corpus are complete, return lexical results **from that corpus**
  with an accurate reason. Never mix stale vectors or in-flight search results from a previous
  workspace into a newly selected workspace's UI.
- A shared, content-addressed embedding cache across worktrees may later reduce cost, keyed by
  chunk content and embedding identity. Do not start by sharing one mutable vector index.

### Human UI: established Nevo SpecFlow patterns

The first draft resembling a separate documentation portal is **rejected**. Use the existing
\`SpecFlowShell\` / \`AppShell\`, \`AppWorkspace\`, workspace headers, navigation semantics, design
tokens and scroll ownership. The prototype HTML is exploratory and must not introduce new
design-system primitives.

- A standalone project documentation activity may justify one global **Documentation** entry
  next to **Specifications**, but the interaction model explicitly keeps global navigation
  small. This placement requires a product-owner decision. Do not add a nested \`Project\` menu
  or create a permanent new global section by default.
- On Wide and Compact, use the existing Specification Documents composition as precedent:
  a bounded Primary (approximately 360px) holds the workspace selector, search and document
  tree/results. Secondary holds the read-only Markdown document. The article is **not** nested
  inside another card, and there is no permanent third TOC panel.
- On Narrow, tree/results is the visible level. Selecting an article pushes the reader with an
  explicit Back to the list, preserving the search and list scroll. Global navigation uses the
  existing drawer behavior; never shrink a desktop three-pane layout into mobile.
- Search operates within the selected workspace and returns ranked documents plus section links.
  Selecting a hit opens the real section. Hybrid and lexical fallback are both valid; index state
  belongs in compact contextual status. Do not introduce an AI-generated answer/chat surface yet.
- The reader supports headings, lists, code, internal links, the document path, section linking and
  an optional local TOC affordance. Content is read-only. Keep \`Specification Documents\` and
  their edit/commit workflow distinct.
- Entering from a Session/Specification resolves its real bound checkout. A global entry needs a
  deliberate authorized default; don't guess from browser history or a last-opened Specification.
  An in-reader workspace change clears old data before showing the new corpus.
- Candidate canonical UI locations: \`/workspaces/:workspaceId/docs\` and
  \`/workspaces/:workspaceId/docs/:documentId\`. The optional \`/docs\` entry requires an explicit
  redirect rule. TanStack Router owns routable state; TanStack Query keys include workspace
  identity and coherent source revision.

### Implementation slices and acceptance evidence

1. **Workspace-aware Runtime read/search:** resolve/authorize checkout and index ownership;
   test conflicting files in two worktrees, dirty edits, branch switch, changed settings,
   missing/closed worktree, concurrent refresh, and a denied scoped principal.
2. **Read-only document API:** corpus navigation, exact document/section reads, stable source
   links, typed statuses and errors. Reuse \`@nevo/specflow-docs\`; avoid another Markdown parser.
3. **Nevo-native UI:** the same tree/search/detail surface across Wide, Compact and Narrow,
   typed feature APIs, shared HTTP transport and app-level TanStack Query, with working Back,
   selection retention and honest lexical/index-building states.
4. **Later:** context-sensitive related documents, event-driven live refresh, Specification
   documents/code as **separate corpora**, optional embedding deduplication.

Acceptance for the UI includes rendered *composed* AppShell/AppWorkspace captures at 1440px,
around 1024px, 375px and 320px, plus long paths, many documents, empty/error states,
keyboard navigation, deep links, rapid workspace changes and no horizontal overflow. A
standalone HTML screenshot by itself does not establish production fidelity.
