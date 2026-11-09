---
id: adr.0020-documentation-discovery-is-a-product-capability
type: adr
title: Documentation discovery is a product capability
status: current
date: 2026-11-09
summary: >
  Documentation discovery is deliberately promoted into the product as `@nevo/specflow-docs`: it
  owns the frontmatter contract, deterministic discovery and optional semantic search, takes its
  taxonomy from project configuration, is exposed as the ordinary CLI command `nevo-specflow docs`
  and as the Runtime endpoint `GET /api/docs/search`, and keeps its index fresh on Runtime start and
  on read without a file watcher.
related:
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0007-documentation-architecture-and-taxonomy
  - adr.0012-product-package-topology-and-dependency-direction
  - adr.0021-product-neutral-ai-semantic-search-engine
  - architecture.runtime.configuration
  - architecture.runtime.authorization
  - architecture.repository-structure
---

# 0020 — Documentation discovery is a product capability

## Status

Current. The decisions below were taken by the product owner on 2026-11-09.

## Context

- **Discovery already works, but only as repository tooling.** `tools/docs` (`nevo-repo-docs`)
  validates frontmatter, builds the generated index and answers `list`, `find`, `get`, `context` and
  `check`. Agents load repository knowledge through it on every task. Its vocabulary (`scope`
  values, `areas`, the `docs/ideas/**` exclusion) is hard-coded for this repository.
- **ADR 0005 forbids implicit promotion.** A repository tool becomes a product surface only through
  its own decision, with the product contract defined on its own terms. ADR 0005 anticipates this
  case explicitly.
- **Agents need natural-language retrieval.** Deterministic lexical OR search over frontmatter
  requires the caller to know the vocabulary. An agent asking a question in its own words needs
  semantic retrieval over document content, which depends on an embedding model that is not always
  available.
- **Projects other than this repository have their own taxonomy.** A product capability cannot ship
  this repository's `scope` and `areas` values as fixed vocabulary.
- **Commands agents run on every task must be cheap.** Starting Runtime, loading UI assets or
  requiring the UI build for a documentation lookup is not acceptable.
- **No SpecFlow component writes corpus documents.** Engine-owned document commits write
  Specification documents, which are not under the documentation root; `check --write` writes
  generated files that are not part of the corpus.

## Decision

### 1. Package and ownership

`@nevo/specflow-docs` (`packages/specflow-docs`) is the documentation capability. It owns:

- the **frontmatter contract**: document types, required fields per type, statuses and the inactive
  statuses (`deprecated`, `superseded`), and the optional `scope`, `areas` and `tags` fields;
- **deterministic discovery**: `list`, `find`, `get`, `context` and `check`, including the generated
  index written by `check --write`;
- **semantic search** over document content, built on `@nevo/ai-semantic-search`
  ([ADR 0021](0021-product-neutral-ai-semantic-search-engine.md));
- the configuration namespaces `docs` and, until a second consumer exists, `ai.embeddings` (parsing
  and ownership validation in a self-contained module; the engine receives resolved settings);
- the Commander adapter at `./cli`, which `@nevo/specflow` mounts as `nevo-specflow docs`.

Like `@nevo/specflow-runtime`, the package is `private: true` and bundled into the `@nevo/specflow`
artifact; it is not published on its own.

Dependency direction (ADR 0012): `@nevo/specflow-docs` MAY depend on `@nevo/ai-semantic-search`,
`@nevo/specflow-contracts` and neutral foundations. It MUST NOT depend on `@nevo/specflow-runtime`,
`@nevo/specflow-engine`, `@nevo/specflow-ui` or `@nevo/specflow`. `@nevo/specflow-runtime` MAY
depend on `@nevo/specflow-docs`; `@nevo/specflow` composes it.

ADR authoring (`adr new`) and validation rules that exist only for this repository are not product
behavior. They stay in `tools/docs`, which consumes `@nevo/specflow-docs` through its package
exports.

### 2. Taxonomy is project configuration

The vocabulary that differs between projects is configuration in the project-owned `docs`
namespace:

- `docs.root` — the documentation root, relative to the project root (default `docs`);
- `docs.taxonomy.scopes` and `docs.taxonomy.areas` — when declared, `scope` and `areas` values
  outside them are validation errors; when absent, the values are unrestricted;
- a list of **non-authoritative path prefixes** under `docs.root`. `context` always excludes
  documents under them. `search` (CLI and HTTP) excludes them unless the caller
  sets its include switch, which is the only such switch. `list`, `find` and `get` still return
  them.

Document types, required fields, statuses and inactive statuses are the product frontmatter
contract and MUST NOT become configuration.

**Defaults.** These are the defaults of the `docs` and `ai.embeddings` settings, stated only here:

| Setting                             | Default when absent              |
| ----------------------------------- | -------------------------------- |
| `docs.root`                         | `docs`                           |
| `docs.taxonomy.scopes` and `.areas` | unrestricted                     |
| non-authoritative path prefixes     | none                             |
| `docs.search.semantic`              | off (`search` answers lexically) |
| `ai.embeddings`                     | no endpoint configured           |

The exact keys are defined by the configuration reference; ownership rules are in
[project configuration and local state](../runtime/configuration.md).

### 3. Command surface

`nevo-specflow docs` is an ordinary CLI command. It MUST NOT start Runtime, require a running
Runtime, load UI assets or require the UI build.

Every `docs` command MUST work in a Git repository without `.nevo/config.yaml` and without
`.nevo/local/config.yaml`; a missing file means the defaults above. When the files exist, the
command reads and validates only the `docs` and `ai.embeddings` namespaces. It MUST NOT require the
`runtime` section or validate other capabilities' namespaces.

```text
nevo-specflow docs list | find | get | context | check
nevo-specflow docs search <question>
nevo-specflow docs semantic status
nevo-specflow docs semantic index
```

- `find`, `get`, `context` and `check` are deterministic and do not depend on a model. `get` fails
  closed on inactive documents.
- `search` is the only model-dependent command. Its results are content chunks grouped by
  document: document id, title, heading path, snippet and score. Every result carries a top-level
  `mode` (`hybrid` or `lexical`) and, when `lexical`, a `reason`. Inactive documents are always
  excluded; documents under non-authoritative prefixes are excluded unless the include switch is
  set.
- `semantic status` reports whether semantic search is enabled, the endpoint's reachability, the
  model and dimensions, and index freshness. It exits non-zero when semantic search is enabled but
  unavailable.
- `semantic index` (re)builds the index explicitly.

The exact options and output shapes are defined by the CLI reference.

### 4. Semantic search is optional and never fails a command

Semantic search is enabled by the project-owned opt-in `docs.search.semantic` and requires a
configured embedding endpoint (`ai.embeddings`). When vectors cannot be obtained, `search` answers
lexically and reports why:

| Condition                                   | Mode    | Reason                           |
| ------------------------------------------- | ------- | -------------------------------- |
| `docs.search.semantic` absent or `false`    | lexical | semantic search not enabled      |
| no `ai.embeddings` endpoint configured      | lexical | no embedding endpoint configured |
| endpoint unreachable, error or timeout      | lexical | endpoint unreachable, with cause |
| index not yet complete for the current data | lexical | index building                   |
| index cannot be read or written             | lexical | index unavailable, with cause    |
| otherwise                                   | hybrid  | —                                |

The fallback MUST NOT fail `search`; only `semantic status` turns an unavailable configured mode
into a failure exit. Callers do not need to know in advance whether semantic mode is on, because
every result states its `mode`.

### 5. Index freshness without a watcher

The index is refreshed incrementally, never rebuilt on every run (rebuild rules are in
[ADR 0021](0021-product-neutral-ai-semantic-search-engine.md)). Two triggers keep it fresh:

1. **Runtime start** refreshes in the background. Startup MUST NOT wait for it; until the index is
   complete, the endpoint answers `mode: lexical` with reason "index building".
2. **On read**: every `search` (CLI and HTTP) checks the corpus for changes and re-embeds only the
   changed units before answering. A CLI caller MAY skip this check explicitly.

There is no file watcher and no invalidation API. A SpecFlow component that writes corpus documents
MUST invalidate the units it changes.

The CLI and a running Runtime share one index in `.nevo/local/cache/docs-index/`; the index is
disposable cache, not state ([project configuration and local state](../runtime/configuration.md)).

### 6. Runtime endpoint

Runtime exposes `GET /api/docs/search` with the same result contract as the CLI. The contract types
and schemas live in `@nevo/specflow-contracts`.

- **Parameters:** `q` (the question), `limit`, and the switch that includes documents under
  non-authoritative prefixes. There is no `context` parameter; contextual input is defined only when
  a contextual help UX contract exists.
- **Corpus:** the project's own `docs.root`. Specification documents and product documentation are
  not part of it; the engine's chunk-source port keeps other corpora possible.
- **Authorization:** a feature-owned resource `docs` with action `search` (capability
  `docs.search`). The built-in `viewer`, `developer` and `admin` roles carry it.

### 7. Configuration and init

- The `docs` namespace is project-only; a `docs` section in local configuration is rejected.
- `ai.embeddings` may appear in project and local configuration; the local value wins per key. The
  embedding API key is never stored in either file: configuration names the environment variable
  that holds it.
- `nevo-specflow init` contributes an optional step for a new project: it asks whether to enable
  semantic search, asks for the endpoint and model, runs a connectivity probe and shows the result,
  writes `docs.search.semantic` to project configuration and the endpoint settings to local
  configuration. A failed probe does not fail `init`; the summary reports the configured but
  unavailable mode.
- **Deferred:** enabling semantic search in an already initialized project is not provided by any
  command. Re-running setup and a UI Settings screen are the intended future paths.

### 8. Not decided here

- **Retrieval quality evaluation is deferred.** There is no evaluation command and no golden query
  set. Evaluation is a tuning tool for choosing the embedding model and chunking parameters and gets
  its own decision when it is needed.
- **Contextual help in the UI** needs its own UX contract before any endpoint parameter or UI
  surface is added for it.

## Consequences

- Documentation discovery is a product contract defined here, not inherited from `tools/docs`;
  changing it is a product change.
- This repository dogfoods the capability: it commits a complete project `.nevo/config.yaml` (it is
  a real SpecFlow project) that declares its taxonomy — the current `scope` and `areas` vocabulary
  and `ideas/` as the non-authoritative prefix. Its root `pnpm docs:*` scripts build only
  `@nevo/specflow-docs` and its dependencies and run the same `docs` command adapter the product
  shell mounts, so agent lookups stay fast and do not need the UI build.
- `find`, `get`, `context`, `check` and the generated index keep their behavior, including
  `context` excluding non-authoritative documents; agents and
  `tools/agents` that depend on them keep working.
- Agents route natural-language questions to `search`, known vocabulary to `find`, and always read
  selected documents in full with `get`.
- Projects without an embedding model lose nothing: `search` still answers lexically over content.
- A manual edit appears in the next search without a background process; the cost is a freshness
  check on every read.
- An existing project that wants semantic search has no assisted path until re-running setup or a
  Settings screen exists.
- Revisit the `ai.embeddings` ownership when a second capability needs embeddings, and the no-watcher
  rule if contextual help needs pushed updates.
