---
id: ideas.semantic-docs.execution-plan
type: engineering
title: 'Temporary execution plan — Documentation capability and AI semantic search'
status: draft
scope: specflow
areas: [ai, docs, cli, runtime, configuration, testing]
tags: [execution-plan, temporary, semantic-search, embeddings, documentation]
read_when:
  - implementing the SpecFlow documentation capability or the AI semantic search package
  - selecting the next dependency-complete task of the semantic documentation search feature
summary: >
  Decomposition of the semantic documentation search ideas into nine reviewable tasks delivered in
  one pull request: ADRs and contracts, the neutral @nevo/ai-semantic-search package and its local
  index, the @nevo/specflow-docs product capability with configurable taxonomy, semantic search and
  configuration, init contribution, Runtime endpoint, repository dogfooding and final promotion.
related:
  - ideas.semantic-docs
  - ideas.semantic-docs.semantic-search-package
  - ideas.semantic-docs.docs-capability
  - ideas.semantic-docs.configuration-and-init
  - ideas.semantic-docs.index-freshness
  - ideas.semantic-docs.ai-package-naming
  - ideas.semantic-docs.local-embeddings-playground
  - ideas.specflow-runtime.execution-plans.openapi-publication
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
  - adr.0012-product-package-topology-and-dependency-direction
  - architecture.runtime.configuration
---

# Documentation capability and AI semantic search — execution plan

Source ideas: the [semantic docs hub](../README.md) and its child documents. This plan owns only
sequencing, scope boundaries and review gates. It is delivered as **one pull request** (owner rule:
prerequisites in the same PR, no side PRs), after the
[OpenAPI publication PR](../../specflow-runtime/execution-plans/openapi-publication/README.md) has
merged. Contextual help in the UI is out of scope (it needs a UX contract first).

## Scope and result

- `@nevo/ai-semantic-search` (`packages/ai-semantic-search`): product-neutral engine — embedding
  provider / chunk source / vector store ports, OpenAI-compatible embeddings adapter with `probe()`,
  heading-aware chunking, BM25 + cosine + RRF hybrid ranking, a local file-backed disposable index
  without native modules.
- `@nevo/specflow-docs` (`packages/specflow-docs`): the deliberately promoted documentation
  capability (ADR 0005) — frontmatter contract, `list/find/get/context/check`, configurable
  taxonomy, semantic `search` and `semantic status|index|eval`, `docs.*` and `ai.embeddings`
  configuration with ownership validation, init contribution; Commander adapter at `./cli` mounted
  by the product shell as `nevo-specflow docs`.
- Runtime feature `GET /api/docs/search` with an authorization resource, background refresh on
  start, result contract in `@nevo/specflow-contracts`; visible in the OpenAPI document.
- Repository: `pnpm docs:*` run the product command (dogfooding), ADR authoring stays in
  `tools/docs`, agent instructions gain the `search` vs `find` routing rule, `compose.yaml` for a
  local Ollama embedding model.
- ADRs and promotion of the ideas' durable rules into authoritative docs; ideas marked superseded.

## Task graph

| Task                                                                                            | Dependencies           | Kind / implementer        | Planning readiness                               |
| ----------------------------------------------------------------------------------------------- | ---------------------- | ------------------------- | ------------------------------------------------ |
| [B01 ADRs and authoritative contracts](tasks/B01-adrs-and-contracts.md)                         | None (owner decisions) | general / implementer     | Ready for execution once open decisions answered |
| [B02 Semantic search engine core](tasks/B02-semantic-search-core.md)                            | B01                    | backend / implementer     | Planned, dependent                               |
| [B03 Local vector index store](tasks/B03-local-vector-index.md)                                 | B02                    | backend / implementer     | Planned, dependent                               |
| [B04 Documentation capability package](tasks/B04-docs-capability-package.md)                    | B01                    | backend / implementer     | Planned, dependent                               |
| [B05 Semantic docs search and configuration](tasks/B05-semantic-docs-search.md)                 | B03, B04               | backend / implementer     | Planned, dependent                               |
| [B06 Init contribution](tasks/B06-init-contribution.md)                                         | B05                    | integration / implementer | Planned, dependent                               |
| [B07 Runtime docs search endpoint](tasks/B07-runtime-docs-endpoint.md)                          | B05, OpenAPI PR merged | backend / implementer     | Planned, dependent                               |
| [B08 Repository dogfooding and agent routing](tasks/B08-repository-dogfooding.md)               | B04, B05               | general / implementer     | Planned, dependent                               |
| [B09 Promotion, supersession and feature verification](tasks/B09-promotion-and-verification.md) | B01–B08                | general / implementer     | Planned, dependent                               |

`B01 -> (B02 -> B03, B04) -> B05 -> (B06, B07, B08) -> B09` is acyclic. Profiles mean
`nevo-agents:implementer`; independent review uses `nevo-agents:reviewer`. No task is UI work.
These are planning metadata, not workflow manifest keys.

### Parallelism and shared files

- B02/B03 and B04 own disjoint packages and may run in parallel worktrees.
- B06, B07 and B08 may run in parallel but each touches a different shared file:
  B06 `packages/specflow/src/init/cli.ts`; B07 `packages/specflow-runtime/src/config/load.ts`,
  `server/app.ts`, `server/roles.ts`; B08 root `package.json`, `.nevo/**`, CI. B04 owns
  `packages/specflow/src/program.ts` (mounting `docs`); later tasks do not edit it. Land one member,
  rebase the next before its review gate; do not assume no textual overlap in `pnpm-lock.yaml`.
- B05 is the sole owner of the search result contract in `@nevo/specflow-contracts`; B07 consumes it
  unchanged and adds only the `docs` capability definition next to it. A needed contract change goes
  back to B05's owner, not into B07.
- B02 and B04 each add one entry to `tools/eslint/boundaries.mjs`; land one, rebase the other.

## Role separation and review gates

Every task is implemented by its own implementer agent and reviewed by a separate reviewer agent
that did not implement it. A failed gate stops dependent work. Heightened gates:

1. **B01** — ADRs decide the product contract on its own terms (ADR 0005), no plan language in
   authoritative docs, every open decision below answered or explicitly deferred.
2. **B03** — atomic write + single-writer lock on Windows, full rebuild on any manifest mismatch, no
   migration code.
3. **B04** — behavioral parity of `find/get/context/check` and the generated index with today's
   `tools/docs` (agents and `tools/agents` depend on it), correct package direction.
4. **B05** — lexical fallback never fails a command, every result carries `mode`/`reason`, secrets
   never read from project config.
5. **B07** — authorization, ownership validation in Runtime config loading, non-blocking start.
6. **B09** — whole-PR review against all ideas and ADRs.

## Verification policy

Windows workstation: targeted test files only (named per task). Full package suites, lint, build and
the packaged-product smoke run on Linux/CI. No test depends on a real embedding endpoint; unit and
HTTP tests use a deterministic fake embedder. The `semantic eval` command against a local Ollama is a
manual owner check, not CI.

## Open decisions

Answer before B01 is admitted; B01 records the answers in the ADRs and authoritative docs.

| ID    | Decision                                                                                                                                                                                                                                                                                      | Recommendation                                                                                                                                                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-D1  | Where this repository declares its taxonomy. The ideas say `.nevo/config.yaml`, but the repository has none today; its presence is `init`'s "already initialized" marker, and `loadRuntimeConfig` requires a `runtime` section. A `docs`-only file would make `init` refuse and `start` fail. | Commit a complete project `.nevo/config.yaml` for this repository (trusted local loopback Runtime, Git settings, `docs` taxonomy), i.e. the repository becomes a real SpecFlow project — that is the honest dogfooding. If the owner does not want that yet, the fallback is a docs-only file plus an explicit `start`/`init` refusal message, which is weaker. |
| B-D2  | How `pnpm docs:*` "switch to the product CLI". The bundled `nevo-specflow` build requires the UI build first, which is too slow for commands agents run on every task.                                                                                                                        | Root scripts build `@nevo/specflow-docs` and its dependencies only and run a thin launcher in `tools/docs` that mounts the same `createDocsCommand` adapter the product shell mounts. The installed artifact is covered by the packaged/dogfood smoke (`nevo-specflow docs --help`, one `docs get`).                                                            |
| B-D3  | Which vocabulary becomes project configuration.                                                                                                                                                                                                                                               | `docs.root`, `docs.taxonomy.scopes`, `docs.taxonomy.areas` (validated when declared, unrestricted when absent) and a project-owned list of non-authoritative path prefixes replacing the hard-coded `docs/ideas/**` exclusion. Document types, required fields, statuses and inactive statuses stay the product frontmatter contract.                           |
| B-D4  | Which package owns parsing and ownership validation of the shared `ai` namespace.                                                                                                                                                                                                             | `@nevo/specflow-docs` owns `ai.embeddings` parsing now (sole consumer) in a self-contained module; the neutral engine receives a resolved settings object. Move it when a second consumer appears.                                                                                                                                                              |
| B-D5  | Index location. The idea proposes `.nevo/local/cache/docs-index/`; `architecture.runtime.configuration` defines only `.nevo/local/config.yaml` and `.nevo/local/state/`.                                                                                                                      | Add a documented disposable `.nevo/local/cache/` namespace in `architecture.runtime.configuration` (rebuildable, never migrated, safe to delete) and use `.nevo/local/cache/docs-index/`.                                                                                                                                                                       |
| B-D6  | "Owned writes" refresh trigger. Engine-owned document commits (ADR 0016) write Specification documents, which are not under `docs.root`; `docs check --write` writes generated files excluded from the corpus. No SpecFlow writer of corpus documents exists.                                 | Implement Runtime-start and read-time refresh only; the ADR states that any future SpecFlow writer of corpus documents invalidates the affected units. No unused invalidation API now.                                                                                                                                                                          |
| B-D7  | Authorization of `GET /api/docs/search`.                                                                                                                                                                                                                                                      | New resource `docs` with action `search`, granted to `viewer` and therefore every higher role.                                                                                                                                                                                                                                                                  |
| B-D8  | HTTP query parameters. The idea lists `q`, `limit`, `context`; `context` has no defined meaning and belongs to contextual help.                                                                                                                                                               | `q`, `limit` and the same non-authoritative-inclusion switch as the CLI; no `context` until the help UX contract exists.                                                                                                                                                                                                                                        |
| B-D9  | Corpus of the Runtime endpoint (hub open question: product docs, project docs, Specification documents).                                                                                                                                                                                      | The project's own `docs.root` only. The chunk-source port keeps other corpora possible.                                                                                                                                                                                                                                                                         |
| B-D10 | Enabling semantic search in an already initialized project. `init` refuses when `.nevo/config.yaml` exists, so the init contribution only helps fresh projects.                                                                                                                               | Manual config edit documented in the configuration reference, verified with `docs semantic status`; no reconfigure command in this PR.                                                                                                                                                                                                                          |
| B-D11 | Golden set for `docs semantic eval` (location and format).                                                                                                                                                                                                                                    | A required `--golden <file>` option (YAML: query, expected ids); this repository commits its set as repository data under `tools/docs/`, not as product configuration.                                                                                                                                                                                          |

## Exit and cleanup

All task acceptance met, Linux CI green including the packaged product smoke, ideas superseded with
successor links (B09). Retire this plan after merge.
