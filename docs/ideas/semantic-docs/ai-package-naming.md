---
id: ideas.semantic-docs.ai-package-naming
type: architecture
title: AI package naming family
status: draft
scope: specflow
areas:
  - ai
  - runtime
tags:
  - naming
  - packages
  - providers
  - embeddings
read_when:
  - naming a new AI-related package
  - considering extraction of session provider adapters out of Runtime
summary: >
  Proposal for a consistent `@nevo/ai-*` package family: agent drivers (today inside Runtime
  sessions), model endpoint adapters, and semantic search, without extracting anything yet.
related:
  - ideas.semantic-docs
  - ideas.specflow-runtime.ai-adapters
  - architecture.ai.provider-boundary
  - adr.0012-product-package-topology-and-dependency-direction
---

# AI package naming family

## Current state

The only AI adapters today are session providers in
`packages/specflow-runtime/src/features/sessions/providers/` (claude, codex, antigravity, mock),
configured under `sessions.providers`. They are **agent drivers**: they spawn processes, install hooks,
handle MCP interactions, and are tightly coupled to the Runtime session lifecycle.

Embeddings are a different kind: a stateless HTTP call to a **model endpoint**.

## Proposed family

| Package                    | Holds                                                                               | When                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@nevo/ai-semantic-search` | chunking, vector index, hybrid ranking, embeddings port + OpenAI-compatible adapter | with semantic docs search                                              |
| `@nevo/ai-models`          | model endpoint adapters (embeddings, later others)                                  | split out of semantic search only when a second consumer appears       |
| `@nevo/ai-agents`          | agent drivers currently in Runtime sessions                                         | possible future extraction; separate work, not part of semantic search |

Rationale: the `ai-` prefix makes the AI nature visible (a generic "retrieval" name did not), while
"knowledge" stays reserved for a broader product layer.

Extraction of agent drivers is **not** proposed as part of semantic search; it would need its own
analysis of what is Runtime lifecycle versus driver logic (see the AI adapter hardening ideas).
