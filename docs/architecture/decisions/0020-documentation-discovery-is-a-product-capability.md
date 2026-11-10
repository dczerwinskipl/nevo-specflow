---
id: adr.0020-documentation-discovery-is-a-product-capability
type: adr
title: Documentation discovery is a product capability
status: current
date: 2026-11-09
summary: >
  Documentation discovery is deliberately promoted into the product as `@nevo/specflow-docs`: it
  owns the frontmatter contract, deterministic discovery and optional semantic search, takes its
  taxonomy from a settings file next to the documentation, works without an initialized project,
  is exposed as the ordinary CLI command `nevo-specflow docs`
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

Current. The decisions below were taken by the product owner on 2026-11-09; where the taxonomy lives
(section 2), documentation without an initialized project (section 3) and the init interaction
(section 7) on 2026-11-10.

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

### 2. Taxonomy lives next to the documentation

What differs between projects is split by what it describes.

The project-owned `docs` namespace of `.nevo/config.yaml` says where the documentation is and how
the project searches it:

- `docs.root` — the documentation root, relative to the project root (default `docs`);
- `docs.search.semantic` — the semantic search opt-in (section 4).

The **documentation settings file** `<docs.root>/docs.yaml` describes the documentation itself. It
is optional and is versioned with the documents it describes:

- `taxonomy.scopes` and `taxonomy.areas` — when declared, `scope` and `areas` values outside them
  are validation errors; when absent, the values are unrestricted;
- `nonAuthoritative` — a list of **non-authoritative path prefixes** under `docs.root`. `context`
  always excludes documents under them. `search` (CLI and HTTP) excludes them unless the caller
  sets its include switch, which is the only such switch. `list`, `find` and `get` still return
  them;
- `exclude` — a list of **excluded path prefixes** under `docs.root`. Files below them (for example
  copy-me templates without frontmatter) are not part of the corpus and are never scanned; relative
  links into them still resolve.

The corpus is what physically lies below `docs.root`: the scan follows no symbolic link (or Windows
junction), to a directory or a file, so a link can neither loop the scan nor add files from
elsewhere.

`docs.yaml` is not part of the corpus: only `*.md` files are scanned and indexed. Unknown keys in it
are rejected, and these keys in the `docs` namespace of `.nevo/config.yaml` are rejected with an
error that names `<docs.root>/docs.yaml`.

Document types, required fields, statuses and inactive statuses are the product frontmatter
contract and MUST NOT become configuration.

**Defaults.** These are the defaults of the `docs`, `docs.yaml` and `ai.embeddings` settings, stated
only here:

| Setting                                | Default when absent              |
| -------------------------------------- | -------------------------------- |
| `docs.root`                            | `docs`                           |
| `docs.search.semantic`                 | off (`search` answers lexically) |
| `<docs.root>/docs.yaml`                | all of its defaults below        |
| `taxonomy.scopes` and `taxonomy.areas` | unrestricted                     |
| `nonAuthoritative` (non-authoritative) | none                             |
| `exclude` (excluded path prefixes)     | none                             |
| `ai.embeddings`                        | no endpoint configured           |
| `ai.embeddings.protocol`               | `openai-compatible`              |

The exact keys are defined by the configuration reference; ownership rules are in
[project configuration and local state](../runtime/configuration.md).

### 3. Command surface

`nevo-specflow docs` is an ordinary CLI command. It MUST NOT start Runtime, require a running
Runtime, load UI assets or require the UI build.

Every `docs` command MUST work in a Git repository without `.nevo/config.yaml`, without
`.nevo/local/config.yaml` and without `<docs.root>/docs.yaml`; a missing file means the defaults
above. When the files exist, the command reads and validates only the `docs` and `ai.embeddings`
namespaces and `docs.yaml`. It MUST NOT require the `runtime` section or validate other
capabilities' namespaces.

Using the documentation capability MUST NOT require initializing the project (Runtime, users,
roles). A `.nevo/config.yaml` that contains only a `docs` section is a complete configuration for
the `docs` commands.

```text
nevo-specflow docs list | find | get | context | check
nevo-specflow docs search <question>
nevo-specflow docs semantic status
nevo-specflow docs semantic index
```

- `find`, `get`, `context` and `check` are deterministic and do not depend on a model. `get` fails
  closed on inactive documents.
- `search` is the only model-dependent command. Its results are documents, described by their
  frontmatter (id, title, type, status, taxonomy, summary, read_when) so a reader can choose which to
  open, with the heading paths of their best matching sections and a score; section snippets only on
  request. Documents are ranked by fusing the section ranking with the frontmatter ranking of
  `find`, so a document whose frontmatter matches the question is found even when no section
  repeats its words. Every result carries a top-level `mode` (`hybrid` or `lexical`) and, when
  `lexical`, a `reason`. Inactive documents are always excluded; documents under non-authoritative
  prefixes are excluded unless the include switch is set.
- `semantic status` reports whether semantic search is enabled, the endpoint's reachability, the
  model and dimensions, and index freshness. It exits non-zero when semantic search is enabled but
  unavailable.
- `semantic index` (re)builds the index explicitly. It exits non-zero when the index is not up to
  date afterwards (nothing attempted, endpoint failure, write failure, another writer).

The exact options and output shapes are defined by the CLI reference.

### 4. Semantic search is optional and never fails a search

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

The fallback MUST NOT fail `search`. Only the two explicit administrative commands turn an
unavailable configured mode into a failure exit: `semantic status`, and `semantic index` when it
could not bring the index up to date. Callers do not need to know in advance whether semantic mode
is on, because every result states its `mode`.

### 5. Index freshness without a watcher

The index is refreshed incrementally, never rebuilt on every run (rebuild rules are in
[ADR 0021](0021-product-neutral-ai-semantic-search-engine.md)). Two triggers keep it fresh:

1. **Runtime start** refreshes in the background. Startup MUST NOT wait for it; until the index is
   complete, the endpoint answers `mode: lexical` with reason "index building".
2. **On read**: every `search` (CLI and HTTP) checks the corpus for changes and re-embeds only the
   changed units before answering. The embedding a search does is bounded (a few sections), so the
   answer never waits for a long refresh. A larger gap (a first build, a model change, many edited
   documents) is caught up in the background instead: the search answers `mode: lexical` with
   reason "index building" at once and, unless a full refresh already runs, starts one. The CLI
   starts a detached `semantic index` process of the same executable; a running Runtime starts its
   own background refresh, at most one at a time, stopped when the Runtime closes. The index's
   single-writer lock keeps concurrent refreshes from both writing, and a recently started catch-up
   is not started again by the searches that follow it. A search does not rank with a partial
   index: hybrid ranking needs a vector for every current section. A CLI caller MAY skip the
   re-embedding explicitly; it then starts no catch-up either.

A full refresh records its progress next to the index, so `semantic status` and the Runtime's
status endpoint show who is updating the index and how far it got, and the outcome of the last
refresh.

There is no file watcher and no invalidation API: every read hashes the content of every document
and re-chunks and re-embeds only those whose hash changed, so every change is detected, whoever
wrote it and whatever it did to the file's size and modification time.

The CLI and a running Runtime share one index in `.nevo/local/cache/docs-index/`; the index is
disposable cache, not state ([project configuration and local state](../runtime/configuration.md)).

### 6. Runtime endpoint

Runtime exposes `GET /api/docs/search` with the same result contract as the CLI, and
`GET /api/docs/status` with the contract of `semantic status --json`. The contract types and schemas
live in `@nevo/specflow-contracts`.

- **Parameters:** `q` (the question), `limit`, and the switch that includes documents under
  non-authoritative prefixes. There is no `context` parameter; contextual input is defined only when
  a contextual help UX contract exists.
- **Corpus:** the project's own `docs.root`. Specification documents and product documentation are
  not part of it; the engine's chunk-source port keeps other corpora possible.
- **Authorization:** a feature-owned resource `docs` with action `search` (capability
  `docs.search`, for both endpoints), admitted when held in any scope, because project documentation has no narrower
  scope. The built-in `viewer`, `developer` and `admin` roles carry it.

### 7. Configuration and init

- The `docs` namespace is project-only; a `docs` section in local configuration is rejected.
- `ai.embeddings` may appear in project and local configuration; the local value wins per key. The
  embedding API key is never stored in either file: configuration names the environment variable
  that holds it.
- The `runtime` section marks an initialized project. A project configuration without it (for
  example only `docs`) is not initialized: `nevo-specflow init` completes it, adding its sections
  and keeping the existing ones (and the existing sections of a local configuration without
  `runtime`); it refuses only a configuration that has `runtime`, and, before the first question, a
  section it writes that already exists. Runtime config loading and `nevo-specflow project bootstrap` refuse a project
  configuration without `runtime` and name `nevo-specflow init`.
- `nevo-specflow init` contributes an optional step for a new project: it asks whether to enable
  semantic search, asks for the endpoint and model, runs a connectivity probe and shows the result,
  writes `docs.search.semantic` to project configuration and the endpoint settings (`baseUrl`,
  `model` and an optional `apiKeyEnv`) to local configuration. A failed probe does not fail `init`;
  the summary reports the configured but unavailable mode. When the project configuration already
  has a `docs` section or the local configuration an `ai` section, the step is skipped and the
  existing documentation configuration is kept.
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
- This repository dogfoods the capability without being an initialized SpecFlow project: it commits
  a `.nevo/config.yaml` with only the `docs` section (the semantic search opt-in) and a
  `docs/docs.yaml` that declares its taxonomy — the current `scope` and `areas` vocabulary,
  `ideas/` as the non-authoritative prefix and `templates/` as an excluded prefix. Its root
  `pnpm docs:*` scripts build only `@nevo/specflow-docs` and its dependencies and run the same
  `docs` command adapter the product shell mounts, so agent lookups stay fast and do not need the
  UI build.
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
