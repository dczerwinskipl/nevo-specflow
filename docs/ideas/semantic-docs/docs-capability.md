---
id: ideas.semantic-docs.docs-capability
type: architecture
title: Documentation capability in SpecFlow
status: draft
scope: specflow
areas:
  - docs
  - cli
  - runtime
  - ai
  - ui
tags:
  - documentation
  - semantic-search
  - agents
  - dogfooding
  - contextual-help
read_when:
  - promoting repository documentation discovery into the SpecFlow product
  - designing `nevo-specflow docs` commands or a documentation search endpoint
  - updating agent instructions for documentation search
summary: >
  Proposal to promote documentation discovery from `tools/docs` into a `@nevo/specflow-docs`
  capability with configurable taxonomy, `nevo-specflow docs` commands including semantic `search`,
  a Runtime search endpoint, agent instructions, and a later contextual help surface.
related:
  - ideas.semantic-docs
  - ideas.semantic-docs.semantic-search-package
  - ideas.semantic-docs.configuration-and-init
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0007-documentation-architecture-and-taxonomy
  - engineering.repository.dogfooding
---

# Documentation capability in SpecFlow

## Promotion, not a move

ADR 0005 forbids implicit promotion of repository tools, and explicitly anticipates a deliberate
"project-knowledge" product feature. This idea is that deliberate promotion and needs its own ADR.

What becomes product:

- the frontmatter contract (`id`, `type`, `title`, `status`, `read_when`, `summary`, `related`, …);
- deterministic discovery: `list`, `find`, `get`, `context`, `check`;
- semantic `search` on top of [the semantic search package](semantic-search-package.md).

What must change on promotion: the taxonomy. Today `scope` values (`nevo-ui`, …), `KNOWN_AREAS` and
document types are this repository's vocabulary hard-coded in `tools/docs`. In the product they are
project configuration (see [configuration](configuration-and-init.md)); this repository declares its
own taxonomy in `.nevo/config.yaml`.

What stays in `tools/docs` (assumption): ADR authoring and repository-only validation rules, built on
the product package. This repository's `pnpm docs:*` scripts switch to the product CLI (dogfooding).

## Packages

```text
@nevo/ai-semantic-search      neutral engine
        ▲
@nevo/specflow-docs           corpus, frontmatter contract, taxonomy, discovery + search
        ▲               ▲
@nevo/specflow (CLI)    @nevo/specflow-runtime (HTTP feature, refresh on start)
        ▲
tools/docs                    ADR authoring, repo-only checks
```

## Command surface

```bash
nevo-specflow docs find git testing            # unchanged deterministic lexical OR search
nevo-specflow docs get <id...>                 # unchanged exact lookup, fails closed on inactive
nevo-specflow docs search "how does the engine commit documents" [--limit 8] [--json] [--no-refresh]
nevo-specflow docs semantic status             # enabled? reachable? model/dimensions? index fresh?
nevo-specflow docs semantic index              # explicit (re)build
nevo-specflow docs semantic eval               # golden-set quality report
```

`search` result: chunks grouped by document — `id`, `title`, heading path, snippet, score, and a
`get` hint — plus top-level `mode: hybrid | lexical` and `reason` when lexical. Status filtering
matches `context`: no `deprecated` / `superseded`, no `ideas/**` unless requested.

`find` / `get` stay deterministic and unchanged; `search` is the only model-dependent command.

## Agents

No separate skill is needed. The repository-knowledge instruction and `.nevo/agent-instructions.md`
gain one routing rule, projected into generated provider skills:

- natural-language question or unknown vocabulary → `docs search`;
- known terms or taxonomy filters → `docs find`;
- always read the selected documents in full with `docs get`.

Agents do not need to know in advance whether semantic mode is on: every result states its `mode`.

## HTTP API

Runtime feature exposing `GET /api/docs/search?q=&limit=&context=`, returning the same result
contract (defined in `@nevo/specflow-contracts`), with an authorization resource. Visible through
[OpenAPI publication](../specflow-runtime/openapi-publication.md).

## Contextual help (later)

A UI "help / related" surface that queries search with context from the current screen or object
(route, Specification type, document archetype). Needs a UX contract first; corpus choice is an open
question in the [hub](README.md).
