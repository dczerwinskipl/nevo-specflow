---
id: ideas.semantic-docs
type: hub
title: Semantic documentation search follow-ups
status: draft
scope: specflow
areas: [docs, ai]
tags: [semantic-search, embeddings, follow-ups]
read_when:
  - planning work on docs search, the semantic index or @nevo/ai-semantic-search beyond what is implemented
  - looking for the open items left by the semantic documentation search PR (#138)
summary: >
  Non-authoritative backlog of what the semantic documentation search (PR #138) deliberately left
  open: search quality and scale, other corpora and UI surfaces, setup and endpoint gaps, package
  splits and eval tracking. Each item names the current authoritative document and what is missing.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - reference.cli.nevo-specflow-docs
  - reference.configuration.documentation-and-embeddings
---

# Semantic documentation search follow-ups

Proposals only. What is implemented is described in the current documents:
[ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)
(the `docs` capability), [ADR 0021](../../architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md)
(the engine), the [`nevo-specflow docs` reference](../../reference/cli/nevo-specflow-docs.md), the
[workspace documentation HTTP API](../../reference/api/workspace-docs.md) and the
[documentation and embeddings configuration](../../reference/configuration/documentation-and-embeddings.md).
Those documents win on any conflict; an item here becomes a requirement only once it is promoted
there.

- [Search quality and scale](search-quality.md): BM25 postings for large corpora, excerpts for
  semantic-only matches, "no answer" detection, partial vector ranking during a rebuild, eval
  tracking.
- [Surfaces, corpora and setup](surfaces-and-setup.md): contextual help in the UI and live updates,
  other corpora, assisted enabling in an initialized project, endpoints that need a query string or
  an `api-key` header, package splits, and what the workspace documentation
  reader ([ADR 0022](../../architecture/decisions/0022-workspace-scoped-documentation-reader.md))
  left out.
