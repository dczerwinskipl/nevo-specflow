---
id: ideas.semantic-docs.execution-plan.task-b01
type: engineering
title: 'B01 — ADRs and authoritative contracts for documentation capability and semantic search'
status: draft
scope: specflow
areas: [ai, docs, configuration]
tags: [execution-task, temporary, adr, documentation]
read_when:
  - implementing B01 of the semantic documentation search plan
summary: >
  Record the owner answers to B-D1..B-D11 as ADRs (deliberate promotion of documentation discovery
  into the product, the neutral semantic search engine and its disposable local index) and update
  the architecture documents whose contracts the later tasks implement.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0007-documentation-architecture-and-taxonomy
  - adr.0012-product-package-topology-and-dependency-direction
  - architecture.runtime.configuration
---

# B01 — ADRs and authoritative contracts

Temporary task of the [semantic docs execution plan](../README.md). The plan owns sequencing and
gates.

## Goal and ownership

The decisions every later task consumes exist as accepted, authoritative documents before any code
is written, so implementers and reviewers check against ADRs instead of ideas.

- Kind/profile: general / `nevo-agents:implementer`.
- Owner paths: new ADRs under `docs/architecture/decisions/` (next free numbers, created with
  `pnpm docs:adr`), `docs/architecture/decisions/README.md` if it lists ADRs,
  `docs/architecture/runtime/configuration.md`, `docs/architecture/repository-structure.md`, and a
  short amendment note in `adr.0007-documentation-architecture-and-taxonomy` and
  `adr.0012-product-package-topology-and-dependency-direction` if their text names the taxonomy as
  repository-fixed or lists the full package set; `docs/index.generated.*` via `docs:check --write`.
- Prerequisites: owner answers to all open decisions B-D1..B-D11 in the plan README. Where the owner
  has not answered, the recommendation in the README is the planning assumption and the ADR records
  it as the decision; a decision the owner explicitly defers is recorded as deferred with its
  consequence.
- Minimal context: the plan README, the six idea documents, ADR 0005, 0006, 0007, 0011, 0012,
  `architecture.runtime.configuration`, `architecture.principles.normative-language`.

## Scope

- **ADR: documentation capability is a product feature.** The deliberate promotion anticipated by
  ADR 0005: `@nevo/specflow-docs` owns the frontmatter contract (types, required fields, statuses,
  inactive statuses), deterministic discovery and semantic search; taxonomy vocabulary (`scope`,
  `areas`) and non-authoritative path prefixes are project configuration (B-D3); ADR authoring and
  repository-only validation stay in `tools/docs` on top of the product package; CLI surface
  `nevo-specflow docs …`; `ai.embeddings` parsing owned by the docs capability until a second
  consumer exists (B-D4); Runtime endpoint `GET /api/docs/search` with resource `docs`, action
  `search`, granted to `viewer` (B-D7), parameters per B-D8, corpus per B-D9; refresh on Runtime
  start and on read, no watcher and no unused invalidation API, with the rule that a future
  SpecFlow writer of corpus documents invalidates the affected units (B-D6).
- **ADR: product-neutral semantic search engine.** `@nevo/ai-semantic-search` boundary (no SpecFlow
  dependency, no native modules, Node `fetch`, no SDK), ports, OpenAI-compatible adapter with
  `probe()`, heading-aware versioned chunking, hybrid BM25 + cosine + RRF, local file-backed index
  under the disposable cache namespace with atomic writes, single-writer lock and full rebuild on
  any manifest mismatch (no migration).
- `architecture.runtime.configuration`: the disposable `.nevo/local/cache/` namespace (B-D5:
  rebuildable, never migrated, safe to delete) next to `config.yaml` and `state/`; the `docs` and
  `ai` capability namespaces with their ownership rules (`docs.*` project-only; `ai.embeddings` in
  both, local wins per key; secrets only through an environment variable name).
- `repository-structure.md`: the two new packages and their dependency direction.
- How this repository declares its taxonomy and how `pnpm docs:*` run the product command (B-D1,
  B-D2) is repository engineering, recorded in the ADR's consequences; the detailed workflow doc
  update belongs to B08.

## Acceptance

- Each ADR decides on its own terms (ADR 0005): context, decision, consequences; no task ids, plan
  language, "will be implemented in" or links into `docs/ideas/**` as normative sources.
- Every open decision B-D1..B-D11 is answered or explicitly deferred in an authoritative document;
  the plan README's open-decision table can be checked off against them.
- No contradiction remains between the new ADRs and ADR 0005/0006/0007/0012 or
  `architecture.runtime.configuration`; amended ADRs keep their ids.
- `pnpm docs:check` passes with the new documents indexed.

## Verification

```bash
pnpm exec prettier --check docs/architecture
pnpm docs:check
pnpm docs:get <new ADR ids> architecture.runtime.configuration
```

## Review focus (heightened gate)

Decision completeness against the README table; normative language per
`architecture.principles.normative-language`; that machine-verifiable rules (ownership, package
direction, no native modules) are stated so later tasks can enforce them deterministically; no
plan language in authoritative docs.

## Out of scope

Any code; CLI, configuration and API reference docs (owned by the implementing tasks); superseding
the ideas (B09); contextual help UX.
