---
id: adr.0021-product-neutral-ai-semantic-search-engine
type: adr
title: Product-neutral AI semantic search engine
status: current
date: 2026-11-09
summary: >
  `@nevo/ai-semantic-search` is a product-neutral engine with embedding provider, chunk source and
  vector store ports, an OpenAI-compatible embeddings adapter with a probe, heading-aware versioned
  markdown chunking and hybrid BM25 + cosine ranking fused by reciprocal rank fusion. Its local index
  is disposable, file-backed, written atomically under a single-writer lock and rebuilt in full on
  any manifest mismatch; it uses no native modules and no provider SDK.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
  - adr.0012-product-package-topology-and-dependency-direction
  - architecture.runtime.configuration
  - architecture.repository-structure
---

# 0021 — Product-neutral AI semantic search engine

## Status

Current. The decisions below were taken by the product owner on 2026-11-09.

## Context

- **Semantic retrieval is not documentation-specific.** Chunking, embeddings, a vector index and
  ranking apply equally to documentation, Specification documents or code. Documentation search
  ([ADR 0020](0020-documentation-discovery-is-a-product-capability.md)) is the first consumer.
- **The product ships as one self-contained artifact**
  ([ADR 0011](0011-product-artifact-packaging-and-pnpm-compatibility.md)) and is developed and used
  on Windows. Native vector libraries (sqlite-vec, LanceDB, hnswlib bindings) break the bundled
  artifact and are a recurring Windows installation problem.
- **The corpus is small.** This repository has a few hundred markdown files, i.e. a few thousand
  chunks. Brute-force cosine similarity over a `Float32Array` answers in milliseconds; a vector
  database is not needed.
- **Embedding hosts are many but share one protocol.** Ollama, LM Studio, vLLM, llama.cpp server,
  Hugging Face TEI, OpenAI and Azure OpenAI expose the OpenAI-compatible `POST /embeddings` call,
  locally or remotely.
- **Instruction-tuned embedding models** (for example Qwen3-Embedding) expect an instruction prefix
  on queries but not on documents.
- **The CLI and a running Runtime use the same index** at the same time, on Windows, where an
  interrupted or concurrent write must never leave a half-written index.
- The `ai-` prefix makes the AI nature of the package visible; "knowledge" is reserved for a broader
  future product layer over documentation, Specifications and code.

## Decision

### 1. Boundary

`@nevo/ai-semantic-search` (`packages/ai-semantic-search`) knows chunks, vectors and queries. It
does not know documentation frontmatter, taxonomies or Specifications.

- It MUST NOT depend on any SpecFlow package (`@nevo/specflow*`). It MAY depend on other neutral
  Nevo packages when a real shared dependency exists.
- It MUST NOT use native modules. Vector math is plain TypeScript over typed arrays.
- It MUST NOT use a provider SDK. The adapter uses Node `fetch`.
- It receives resolved settings from its consumer; it does not read SpecFlow configuration files.

### 2. Ports

| Port                | Responsibility                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `EmbeddingProvider` | `embed(texts, purpose)` with `purpose` `document` or `query`; returns vectors, model id and dimensions.  |
| `ChunkSource`       | Enumerates units with stable ids, content hash, text and filterable metadata. The consumer provides it.  |
| `VectorStore`       | Upserts and deletes vectors by chunk id, answers nearest-neighbour queries, reads and writes a manifest. |

The query instruction prefix is consumer configuration, applied for `purpose: query` only.

### 3. OpenAI-compatible embeddings adapter

The first `EmbeddingProvider` calls `POST {baseUrl}/embeddings` with `{ model, input: string[] }`,
batched and with a timeout. A `protocol` discriminator in the settings selects the adapter;
`openai-compatible` is the only protocol, and further protocols are further adapters.

`probe()` embeds a fixed short text and returns reachability, latency and the observed dimension.
Consumers use it for connectivity checks, status reports and before (re)indexing. A configured
dimension that differs from the observed one is an error.

### 4. Chunking

- Markdown is split on headings; each chunk keeps its heading path (`H1 > H2 > H3`).
- The consumer supplies a short contextual header per unit (for documentation: title, id, summary,
  tags) that is embedded with each chunk, so small chunks keep their document context.
- Chunks have a size bound; overlap is used only when a single section exceeds it.
- The chunker has a version. Changing chunking behavior MUST change the version.

### 5. Ranking

With vectors, ranking is hybrid:

1. BM25 over chunk text;
2. cosine similarity against the query embedding;
3. reciprocal rank fusion of both lists, then consumer filters and grouping by parent unit.

Without vectors the same call returns BM25-only results with `mode: lexical` and a `reason`. The
engine does not fail a search because embeddings are unavailable.

### 6. Local index

- The local `VectorStore` keeps two files: a manifest (schema version, chunker version, protocol,
  model, dimensions, and per chunk id its content hash and vector offset) and a binary `Float32`
  vector file.
- Refresh is incremental: only units whose content hash changed are re-chunked and re-embedded, and
  removed units are deleted.
- A mismatch of schema version, chunker version, protocol, model or dimensions discards the index
  and rebuilds it in full. There is no index migration.
- Writes are atomic: a complete manifest and vector pair is written to temporary files and renamed
  into place, so a reader always sees a complete pair from one write.
- One writer at a time holds a lock in the index directory; concurrent writers in the CLI and a
  running Runtime serialize on it.
- The consumer chooses the index directory. It is disposable cache: deleting it loses nothing but
  the embedding cost of rebuilding.

An external `VectorStore` (for example a hosted shared index) is a possible later adapter and is not
part of this decision.

## Consequences

- Other corpora (Specification documents, code) can reuse the engine by providing a chunk source,
  without depending on the documentation capability.
- The bundled artifact keeps working on every platform without native builds.
- Brute-force search bounds the practical corpus size; a larger corpus is the trigger to add an
  approximate index or an external `VectorStore` adapter.
- Model or chunker changes cost one full re-embedding, never a migration.
- Unit tests use a deterministic fake `EmbeddingProvider`; no test needs a real model or the network.
- Model endpoint adapters move to a separate `@nevo/ai-models` package only when a second consumer
  of model endpoints appears.
