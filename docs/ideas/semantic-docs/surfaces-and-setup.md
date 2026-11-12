---
id: ideas.semantic-docs.surfaces-and-setup
type: engineering
title: Semantic docs search — surfaces, corpora and setup follow-ups
status: draft
scope: specflow
areas: [docs, ai, ui, runtime, configuration]
tags: [semantic-search, help, corpora, embeddings, worktree, workspace, reader]
read_when:
  - planning contextual help or related-document suggestions in the UI, or live updates for the documentation reader
  - looking for what the workspace documentation reader deliberately left out
  - indexing another corpus (Specification documents, code) with @nevo/ai-semantic-search
  - enabling semantic search in an initialized project, or supporting another embedding endpoint
  - splitting model adapters or agent drivers into separate packages
summary: >
  Open items beyond the semantic search and the workspace documentation reader: contextual help,
  other corpora, semantic setup, endpoint gaps, future AI package splits and what the reader left
  out (related suggestions, live events, shared embedding cache, status endpoint, local images,
  ETag, branch label).
related:
  - ideas.semantic-docs
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - adr.0022-workspace-scoped-documentation-reader
  - reference.api.workspace-docs
  - reference.configuration.documentation-and-embeddings
---

# Semantic docs search — surfaces, corpora and setup follow-ups

Proposal language throughout; each item names the current document. The workspace-scoped reader itself is implemented ([ADR 0022](../../architecture/decisions/0022-workspace-scoped-documentation-reader.md)).

## Contextual help and related documents in the UI

**Now:** documentation search is available to agents and scripts through
[`nevo-specflow docs search`](../../reference/cli/nevo-specflow-docs.md#search) and
the [workspace documentation HTTP API](../../reference/api/workspace-docs.md); the UI reads the same endpoints in the [documentation reader](../../product/specflow/ui/documentation-reader.md), which has no contextual help or related documents.

**Missing:** a UX contract first (where help appears, what "related documents" means for a screen or
an open document, how results and sections are shown and opened), then a UI port on the existing
endpoint. Live updates belong with it: the Runtime notices document changes on the next request
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

## Package splits

**Now:** ADR 0021 keeps the OpenAI-compatible embeddings adapter inside `@nevo/ai-semantic-search`
and names the trigger for a separate `@nevo/ai-models` package: a second consumer of model
endpoints. The AI agent session drivers (Claude, Codex, Antigravity) live in `@nevo/specflow-runtime`
(`features/sessions/providers`, see the
[provider boundary](../../architecture/ai/provider-boundary.md)).

**Missing:** when a second consumer appears, `@nevo/ai-models` for model endpoint adapters, and,
as a separate decision, a product-neutral `@nevo/ai-agents` package for the session drivers if a
consumer outside the Runtime needs them. Neither has a consumer today.

## Workspace-aware retrieval and the documentation reader: what is still open

The workspace-scoped documentation reader is implemented: per-workspace tree, article and search
under `/api/workspaces/{workspaceId}/docs`, project-scoped `docs.view`, trusted embedding egress,
per-checkout indexes with seeding and write admission, corpus revisions and the reader screens. It
is decided in [ADR 0022](../../architecture/decisions/0022-workspace-scoped-documentation-reader.md)
and described in the [workspace documentation API](../../reference/api/workspace-docs.md), the
[workspaces API](../../reference/api/workspaces.md), the
[documentation and embeddings configuration](../../reference/configuration/documentation-and-embeddings.md),
the [authorization reference](../../reference/configuration/authorization.md) and the
[reader screen contract](../../product/specflow/ui/documentation-reader.md). Those documents win;
only the items deliberately left out remain here. None has a consumer yet.

- **Related-document suggestions.** Contextual "related documents" for a screen or an open
  document, beyond explicit search (see also
  [Contextual help](#contextual-help-and-related-documents-in-the-ui)).
- **Live filesystem events.** The reader sees a change on its next request; nothing is pushed. A
  watcher or an event on the Runtime event channels would update an open reader while a document is
  edited.
- **Specification and code corpora.** See [Other corpora](#other-corpora).
- **Shared embedding cache.** Each checkout has its own index; identical sections of different
  checkouts are embedded once per checkout, and only a seed from Project Home avoids that.
  Deduplicating embeddings across checkouts needs a content-addressed cache with its own identity
  and invalidation rules.
- **HTTP status endpoint and detailed status.** Index progress travels with the workspace search
  answer (`indexProgress`); there is no `GET` status route and no per-document or per-section
  detail. `nevo-specflow docs semantic status` is the detailed view (it probes the endpoint, bounded
  by the query timeout, at most 3000 ms). An HTTP status route would also have to pass the request's
  close signal to that probe, so a disconnected client does not keep a probe running.
- **Local images.** The reader does not render images stored in the workspace; adding them needs a
  workspace-scoped, path-safe file route and its own authorization and caching rules.
- **`ETag` / `304` for search.** Search answers are `no-store` and carry a `corpusRevision` for
  coherence; conditional requests would save transfer only.
- **Branch label in the picker.** The picker names workspaces by folder; showing the checked-out
  branch needs a Git read for every listed workspace.
