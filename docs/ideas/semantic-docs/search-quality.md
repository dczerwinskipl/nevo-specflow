---
id: ideas.semantic-docs.search-quality
type: engineering
title: Semantic docs search — quality and scale follow-ups
status: draft
scope: specflow
areas: [docs, ai]
tags: [semantic-search, bm25, excerpts, eval]
read_when:
  - improving docs search ranking, excerpts or scale
  - deciding whether docs search can say that nothing answers a question
  - extending the repository retrieval eval
summary: >
  Proposals for docs search quality and scale: a BM25 inverted index for large corpora, better
  excerpts for semantic-only matches, no-answer detection (blocked: similarity ranges overlap),
  partial vector ranking during a full rebuild, and eval tracking. Measurements from PR #138.
related:
  - ideas.semantic-docs
  - adr.0021-product-neutral-ai-semantic-search-engine
  - reference.cli.nevo-specflow-docs
---

# Semantic docs search — quality and scale follow-ups

Proposal language throughout. The current behaviour is in
[ADR 0021](../../architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md) (ranking,
index) and the [`search` reference](../../reference/cli/nevo-specflow-docs.md#search).

## BM25 postings for large corpora

**Now:** the engine keeps the BM25 statistics between queries but scores every chunk for each query
(a scan of per-chunk term frequencies, `ranking/bm25.ts`). The one-off measurement in #138 gave
37–66 ms per query at 50 000 chunks on the Runtime main thread; this repository has about 2 300.

**Missing:** an inverted index (term → postings) so a query touches only chunks that contain its
terms. Trigger: a corpus well beyond the documentation (for example code, see
[other corpora](surfaces-and-setup.md#other-corpora)) or measured event-loop delay in the Runtime.
The vector side is brute force too; ADR 0021 names an approximate index or an external
`VectorStore` adapter as the answer to the same trigger.

## Excerpts for semantic-only matches

**Now:** an excerpt is the piece of the section with the most query words; when no word matches (a
section found by its meaning only) it is the first sentences after the heading, and the reference
says so (the excerpt says what the section is about, not why it was chosen).

**Missing:** an excerpt that points at the matching part of such a section, for example by embedding
the section's sentences (or a few candidate windows) with the query provider and taking the best,
bounded to the top results so a search adds a small, fixed number of embeddings. Excerpts stay taken
from the document's own text; generated summaries remain out of scope.

## "No answer" detection

**Now:** a search always returns its best candidates; the contract and the agent instructions say
that `score` only orders one search's results and is not a confidence.

**Missing, and not supported by the evidence yet:** a signal that nothing answers the question. In
the #138 eval (30 answerable questions, 8 without an answer, `qwen3-embedding:0.6b`) the best raw
vector similarity was 0.464–0.829 for answerable questions and 0.307–0.660 for the others; the
near-domain questions without an answer ("Which database engine stores Specifications in
production?" 0.660, SSO login 0.575, Helm deployment 0.536) overlap the answerable range, so a
similarity threshold would reject real answers. A candidate needs a different signal (a reranker,
agreement between the lexical and vector rankings, or a calibrated per-model threshold) and a
larger question set to show it separates the cases.

## Partial vector ranking during a full rebuild

**Now:** hybrid ranking needs a vector for every current section; while a full build or rebuild
runs (about 20 minutes on CPU for this repository), searches answer lexically with
`index-building`. This is an accepted compromise of #138.

**Missing:** ranking with the vectors that already exist (the slices a rebuild has written) while
marking the result as partial, so an agent gets semantic recall earlier. It needs a contract for
the partial state (a mode or reason) and a rule for fusing a vector ranking that does not cover
every section.

## Eval tracking

**Now:** `pnpm docs:eval` (`tools/docs`, manual, not in CI) compares `context`, `lexical` and
`hybrid` per language on `tools/docs/eval/questions.yaml`. The #138 result: hybrid Recall@10 0.939
and MRR 0.747 overall (English 1.000 / 0.818, Polish 0.833 / 0.625), lexical 0.767 / 0.571,
frontmatter-only `context` 0.700 / 0.473.

**Missing:** a larger and more balanced question set (11 Polish questions are few; areas such as the
design system and providers have one or two each) and a way to keep results over time without a
CI dependency on a model, for example a committed baseline file the eval compares against and
reports differences from.
