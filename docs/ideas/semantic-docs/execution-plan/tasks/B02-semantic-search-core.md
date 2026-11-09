---
id: ideas.semantic-docs.execution-plan.task-b02
type: engineering
title: 'B02 — Semantic search engine core (@nevo/ai-semantic-search)'
status: draft
scope: specflow
areas: [ai, testing]
tags: [execution-task, temporary, implementation, semantic-search, embeddings]
read_when:
  - implementing B02 of the semantic documentation search plan
summary: >
  Create the product-neutral @nevo/ai-semantic-search package: ports, OpenAI-compatible embeddings
  adapter with probe, heading-aware versioned markdown chunking, chunk-level BM25 and hybrid
  ranking fused by RRF, with an in-memory vector store for tests.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b01
  - ideas.semantic-docs.semantic-search-package
  - adr.0006-product-ships-as-a-single-bundled-artifact
  - adr.0012-product-package-topology-and-dependency-direction
---

# B02 — Semantic search engine core

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

A consumer that supplies chunk-able units and resolved embedding settings can build an in-memory
index and get hybrid (or lexical-only) ranked results with an explicit `mode` and `reason`, without
any SpecFlow knowledge.

- Kind/profile: backend / `nevo-agents:implementer`.
- Owner paths: new `packages/ai-semantic-search/**` (manifest, `tsconfig.json` extending the Node
  package profile because the adapter and B03's store use Node APIs, `eslint.config.mjs`, `src/**`
  with co-located tests); `tools/eslint/boundaries.mjs` (apply the existing neutral-foundation
  rule, extending its comment); `pnpm-lock.yaml`; `turbo.json`/workspace files only if a new
  package needs an entry.
- Prerequisites: B01 (engine ADR).
- Minimal context: the engine ADR from B01, `ideas.semantic-docs.semantic-search-package`,
  `engineering.shared.code-organization`, `engineering.shared.testing`, `packages/authorization` as
  the reference neutral package layout, `tools/build-package.mjs` profile rules.

## Scope

- Ports `EmbeddingProvider` (`embed(texts, purpose)`, model id, dimensions), `ChunkSource` (units
  with stable id, content hash, text, filterable metadata, consumer-built contextual header),
  `VectorStore` (upsert/delete by chunk id, nearest-neighbour query, manifest read/write). An
  in-memory `VectorStore` for tests and as the reference implementation of the contract.
- OpenAI-compatible adapter: `POST {baseUrl}/embeddings` via Node `fetch`, batching, timeout,
  bearer token resolved from an already-read value (the consumer reads the environment variable),
  query instruction prefix applied only for `purpose: 'query'`; `probe()` returning reachability,
  latency and observed dimension, mapping every failure to a typed result (not a thrown raw error).
- Heading-aware chunker with heading path, size bound with overlap only for oversize sections, and
  an exported chunker version constant.
- Chunk-level BM25; cosine over `Float32Array`; RRF fusion; result grouping by parent unit; consumer
  filter hook. Without vectors the same entry point returns BM25 results with `mode: 'lexical'` and
  the caller-supplied or engine-detected `reason`.
- A deterministic fake embedder exported from a testing subpath (or test-only module) so consumers
  (B05, B07) test without a network.

## Acceptance

- No dependency on `@nevo/specflow*`, React, Fastify, Commander, an embeddings SDK or any native
  module; enforced by the boundary lint rule, not only by review.
- Package builds through `tools/build-package.mjs` with the Node profile and declares
  `engines.node`.
- Adapter tests against a local fake HTTP server cover success, batching, dimension reporting,
  timeout, non-2xx, malformed body and probe failure modes.
- Ranking tests: deterministic order for equal scores, RRF combines both lists, lexical-only path
  reports `mode`/`reason`, grouping by unit.
- Chunker tests: heading paths, oversize sections, stable chunk ids for unchanged content.

## Verification

Targeted (Windows-safe):

```bash
pnpm --filter @nevo/ai-semantic-search exec vitest run src/<chunker test> src/<ranking test> src/<adapter test>
pnpm --filter @nevo/ai-semantic-search typecheck
pnpm --filter @nevo/ai-semantic-search lint
pnpm --filter @nevo/ai-semantic-search build
```

Full package suite on Linux/CI.

## Review focus

Neutrality of the public API (no documentation vocabulary leaks in), port shapes sufficient for B03
and B05 without speculative options, error typing of the adapter, determinism of ranking.

## Out of scope

File-backed index and locking (B03); documentation corpus, frontmatter, configuration parsing
(B04/B05); external vector stores; `@nevo/ai-models` split.
