---
id: ideas.semantic-docs.semantic-search-package
type: architecture
title: Semantic search engine package
status: draft
scope: specflow
areas:
  - ai
  - docs
tags:
  - rag
  - semantic-search
  - embeddings
  - vector-index
  - hybrid-search
read_when:
  - designing the product-neutral semantic search package
  - choosing chunking, ranking or vector storage for documentation search
  - adding an embedding provider adapter
summary: >
  Proposal for `@nevo/ai-semantic-search`: a product-neutral package with embedding provider and
  chunk-source ports, an OpenAI-compatible embeddings adapter, heading-aware markdown chunking,
  hybrid BM25 + vector ranking fused by RRF, and a local file-backed index without native modules.
related:
  - ideas.semantic-docs
  - ideas.semantic-docs.index-freshness
  - ideas.semantic-docs.ai-package-naming
  - adr.0006-product-ships-as-a-single-bundled-artifact
  - adr.0012-product-package-topology-and-dependency-direction
---

# Semantic search engine package

## Boundary

Candidate name: `@nevo/ai-semantic-search` under `packages/ai-semantic-search`.

- Product-neutral, like `@nevo/authorization`: it knows chunks, vectors and queries, not
  documentation frontmatter, SpecFlow taxonomies or Specifications.
- Consumers provide a **chunk source**. The first consumer is the SpecFlow documentation
  capability ([docs capability](docs-capability.md)); Specification documents or code could follow.
- MUST NOT depend on SpecFlow packages (ADR 0012 direction for neutral packages).
- No native modules (sqlite-vec, LanceDB, hnswlib bindings): they break the single bundled artifact
  (ADR 0006) and are a recurring Windows problem. Node `fetch` is enough for the adapter; no SDK.

## Ports

| Port                | Responsibility                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `EmbeddingProvider` | `embed(texts, purpose: 'document' \| 'query')` → vectors; reports model id and dimensions. |
| `ChunkSource`       | Enumerates units with stable ids, content hash, text and filterable metadata.              |
| `VectorStore`       | Upsert/delete vectors by chunk id, nearest-neighbour query, manifest read/write.           |

`purpose` exists because instruction-tuned embedding models (for example Qwen3-Embedding) expect
an instruction prefix on queries but not on documents. The prefix is configuration, not code.

### First adapter: OpenAI-compatible embeddings

`POST {baseUrl}/embeddings` with `{ model, input: string[] }`. One adapter covers Ollama, LM Studio,
vLLM, llama.cpp server, Hugging Face TEI, OpenAI, Azure OpenAI and other compatible hosts, local or
external. A `protocol` discriminator in configuration leaves room for non-compatible providers
(for example Voyage or Cohere native APIs) as further adapters.

A `probe()` call embeds a fixed short string and returns reachability, latency and the observed
dimension; it is used by `init`, by a status command and before (re)indexing.

## Chunking

- Markdown split on headings, keeping the heading path (`H1 > H2 > H3`) per chunk.
- Each chunk is embedded with a short contextual header built by the consumer (for docs: title,
  id, summary, tags) so small chunks keep document context.
- Size bounds with overlap only when a single section exceeds the bound.
- Chunker has a version number; changing it invalidates the index.

## Ranking

Hybrid by default when vectors are available:

1. BM25 over chunk text (chunk-level, separate from the existing frontmatter-only lexical scorer).
2. Cosine similarity against query embedding.
3. Reciprocal rank fusion of both lists, then consumer filters (statuses, scopes) and grouping by
   parent unit (document).

Without vectors the same call returns BM25-only results, with `mode: lexical` and a `reason`.

## Index storage

Corpus scale for this repository: about 275 markdown files, about 400k words, i.e. a few thousand
chunks. Brute-force cosine over a `Float32Array` is milliseconds, so no vector database is needed.

- Files: `manifest.json` (schema version, chunker version, protocol, model, dimensions, chunk id →
  content hash, vector offset) + `vectors.f32`.
- Any mismatch of schema version, chunker version, model or dimensions → full rebuild; no migration
  (indexes are local and disposable).
- Writes are atomic (write temp, rename) under a single-writer lock, so the CLI and a running
  Runtime can share one index on Windows.
- An external `VectorStore` adapter (Qdrant, pgvector) is a later option for teams that want a shared
  hosted index; not part of the first delivery.

## Evaluation

A small golden set (query → expected document ids) checked by an `eval` command reporting
recall@k and MRR, to compare models and chunking. Not run in CI (it needs a provider). Unit tests use a
deterministic fake embedder.
