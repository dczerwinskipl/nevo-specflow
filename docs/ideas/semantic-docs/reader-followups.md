---
id: ideas.semantic-docs.reader-followups
type: product
title: Documentation reader pending verification and search follow-ups
status: draft
scope: specflow
areas: [ui, docs]
read_when:
  - planning reader mobile verification or relevance calibration
  - tracking unimplemented reader improvements
summary: >-
  Unfinished device verification, relevance cutoff default, light theme and embedding endpoint concurrency considerations.
related:
  - product.specflow.ui.documentation-reader
  - reference.configuration.documentation-and-embeddings
---

# Documentation reader follow-ups (not current contract)

## Pending verification and ideas

- **Real-phone check (required before the search is accepted on phones):** the sticky search MUST
  be verified on a real phone (iOS Safari and Android Chrome) with the keyboard open, with
  `interactive-widget=resizes-content` in the viewport meta and `dvh` units, so that the sticky
  field stays above the keyboard. iOS Safari ignores `interactive-widget`, so only this check
  settles it.
- **Relevance cutoff (issue #156, first stage):** optional and model-specific, with no default
  yet. An installation may set `ai.embeddings.minSimilarity`
  ([configuration](../../reference/configuration/documentation-and-embeddings.md#relevance-cutoff-minsimilarity)):
  hybrid search then drops sections found by meaning only whose vector similarity is below it, and
  `proposalsLeftOut` counts with the same floor; word matches are never dropped. The answer may
  then have fewer results than the limit, or none, which the [empty states](../../product/specflow/ui/documentation-reader-search.md#empty-states) cover.
  Without the setting (every installation by default) a nonsense query still gets results found by
  meaning; the "no word match" line covers that case. A safe default per model is still open.
- **Light theme:** the palette is dark only; the amber status dot and the marks need checking once a
  light theme exists.
- **Configurable endpoint concurrency:** a running background index job counts as occupying the
  embedding endpoint, so searches meanwhile answer word-only; an `ai.embeddings` setting for
  endpoints that serve requests concurrently is the planned follow-up ("Index freshness" in the
  [API reference](../../reference/api/workspace-docs.md)).
