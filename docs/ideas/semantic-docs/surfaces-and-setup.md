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
