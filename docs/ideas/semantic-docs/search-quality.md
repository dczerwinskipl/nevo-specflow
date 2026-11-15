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
  excerpts for semantic-only matches, no-answer detection (first stage: an optional per-model
  relevance floor, #156; no default yet),
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

**Now (issue #156, first stage):** an optional relevance floor, `ai.embeddings.minSimilarity`, drops
sections found by meaning only whose raw cosine similarity is below it, before fusion; word
matches are never dropped and `proposalsLeftOut` counts with the same floor. `minSimilarity` is a relevance filter for vector-only candidates, not a confidence measure of whether the documentation answers the question. It
has no default, so every installation that does not set it still gets documents found by meaning
only for a query nothing answers; `score` remains a rank, not a confidence. `pnpm docs:eval`
measures it (`--min-similarity`, `--query-instruction`, `--random`, question classes and false
positives); this repository's local setting for `qwen3-embedding:0.6b` is in the
[local setup](../../engineering/repository/local-setup.md#semantic-documentation-search) and its
measurement in the
[evaluation report](../../../tools/docs/eval/reports/2026-11-qwen3-0.6b-min-similarity.md).

**#156 is not fully solved.** With that setting, about one in eight (about 12%) random strings and one in five
real questions without an answer still return documents found by meaning only, and partial words
lose matches the floor removes.

What the calibration showed: an absolute floor separates generated nonsense from real questions
only for a given model and query instruction (the instruction shifts the whole scale), relative
cutoffs (margin below the best match, z-score, gap) do not separate them at all, and the answerable
queries with the lowest similarity are partial words and typos, so they are what any floor costs.
The calibration is optimistic: the instruction and the floor were tuned on the same eval questions
they are reported on, and the floor's margin rests on ten partial-word questions; a held-out set
(`tools/docs/eval/questions-holdout.yaml`) checks the choice, and a larger one is needed before
any default.

**Open:**

- **Partial-word queries:** controlled prefix matching on the lexical side (a cut-short word
  matching the words it starts, bounded so short prefixes do not match everything), then the prefix
  matching and the floor re-evaluated together, since prefix matches are word matches the floor
  never drops.
- **Questions without an answer:** a similarity floor is not a reliable answerability signal; near-domain
  questions the documentation does not answer score like answerable ones. Telling them apart needs
  another signal (a reranker, agreement between the lexical and vector rankings) measured on a
  larger question set, and a safe default per model needs the same evidence.

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
