---
id: ideas.semantic-docs
type: hub
title: Semantic documentation search (RAG) ideas
status: draft
scope: specflow
areas:
  - ai
  - docs
  - cli
  - runtime
  - configuration
tags:
  - rag
  - semantic-search
  - embeddings
  - documentation
  - knowledge
read_when:
  - planning semantic or RAG-style search over project documentation
  - promoting repository documentation discovery into a SpecFlow product capability
  - designing configuration for embedding model providers
  - designing contextual help that shows related documentation
summary: >
  Non-authoritative direction for an optional AI semantic search mode over documentation:
  a product-neutral semantic-search package, documentation discovery promoted into a SpecFlow
  capability, `ai.embeddings` configuration with a lexical fallback, index freshness without a
  file watcher, CLI-first delivery with a later HTTP API and contextual help in the UI.
related:
  - ideas.readme
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0006-product-ships-as-a-single-bundled-artifact
  - adr.0012-product-package-topology-and-dependency-direction
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.openapi-publication
---

# Semantic documentation search (RAG) ideas

Origin: owner planning conversation, 2026-11-09. Everything here is proposal language until it is
promoted (see [ideas README](../README.md)).

## Goal

1. **Priority — CLI for agents.** A bot can ask a natural-language question and get the most
   relevant documentation chunks, then read the full documents with the existing exact lookup.
2. **Later — HTTP API and contextual help.** The same search is exposed by Runtime and used by a
   UI "help / related" surface that shows documents related to the current screen or object.

The semantic mode is **optional**. It requires a configured embedding endpoint. When vectors cannot
be obtained, the semantic mode is disabled and search keeps working lexically, reporting why.

## Owner direction so far

| Topic                | Direction                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Naming               | "AI semantic search" for the engine; "knowledge" is reserved for a broader future layer (docs + specs + code).                     |
| Product placement    | Documentation discovery becomes part of the SpecFlow product, not a separate "nevo docs" tool.                                     |
| Layering             | A product-neutral semantic-search package; a docs-specific capability on top; other uses (specs, code) may reuse the engine later. |
| CLI command          | `nevo-specflow docs …` (not `knowledge …`).                                                                                        |
| Configuration        | Consistent with the whole product: `.nevo/config.yaml` + `.nevo/local/config.yaml`, contributed to `nevo-specflow init`.           |
| Index refresh        | On Runtime start, and when documents change; a file watcher is not preferred.                                                      |
| API shape visibility | Publish OpenAPI generated from route schemas — see [OpenAPI publication](../specflow-runtime/openapi-publication.md).              |
| Delivery             | One PR per feature; no split side PRs.                                                                                             |
| Local testing        | Embedding model in Docker on the owner's workstation (Qwen-class model or smaller).                                                |

## Documents in this package

- [Semantic search engine package](semantic-search-package.md) — neutral package boundary, ports, chunking, hybrid ranking, index storage.
- [Documentation capability in SpecFlow](docs-capability.md) — promotion from `tools/docs`, command surface, agent instructions, HTTP and help UI.
- [Configuration and init](configuration-and-init.md) — `ai.embeddings` and `docs.search` shape, probe, disable semantics.
- [Index freshness](index-freshness.md) — refresh on start, on owned writes and on read; why no watcher.
- [AI package naming](ai-package-naming.md) — the `@nevo/ai-*` family and the existing session provider adapters.
- [Local embeddings playground](local-embeddings-playground.md) — running a model in Docker and trying the CLI/API.

## Execution plan

Temporary task decomposition of delivery step 2: [execution plan](execution-plan/README.md).

## Proposed delivery order

1. OpenAPI publication (small, independent; makes the later endpoint visible immediately).
2. Documentation capability + semantic search, as one feature PR: ADRs, both packages,
   configuration and init, CLI, Runtime endpoint, index freshness, repo dogfooding switch,
   agent instructions, Docker compose for local embeddings.
3. Contextual help in the UI — after a UX contract.

## Open questions

Answered on 2026-11-09 — see the owner answers in the [execution plan](execution-plan/README.md#owner-answers-2026-11-09).
Notable deviations from these ideas: no `semantic eval` command or golden set for now; enabling semantic
search in an already initialized project is deferred (later via re-run setup or UI Settings); no
`context` HTTP parameter until the contextual help UX contract exists.
