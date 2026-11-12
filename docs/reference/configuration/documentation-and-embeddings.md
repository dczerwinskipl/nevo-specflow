---
id: reference.configuration.documentation-and-embeddings
type: reference
title: Documentation and embeddings configuration
status: current
scope: specflow
areas: [configuration, docs, ai, security]
read_when:
  - configuring the documentation root, taxonomy, non-authoritative or excluded paths of a project
  - writing or validating a docs/docs.yaml documentation settings file
  - using the docs commands in a project that is not initialized (documentation-only configuration)
  - enabling semantic documentation search or configuring an embedding endpoint
  - changing the semantic search step of nevo-specflow init
  - diagnosing a docs or ai.embeddings configuration error
summary: >
  The docs namespace (root, search.semantic), the documentation settings file <docs.root>/docs.yaml
  (taxonomy, nonAuthoritative, exclude) and the ai.embeddings endpoint (baseUrl, model, optional
  protocol, spaceId, dimensions, apiKeyEnv, queryInstruction, batchSize, timeoutMs): which file
  holds them, how they merge, their validation and defaults, and documentation-only configuration.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - architecture.runtime.configuration
  - reference.cli.nevo-specflow-docs
---

# Documentation and embeddings configuration

The documentation capability (`@nevo/specflow-docs`,
[ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md))
owns two configuration namespaces, `docs` and `ai.embeddings`, and the documentation settings file
`<docs.root>/docs.yaml`. The [`nevo-specflow docs`](../cli/nevo-specflow-docs.md) commands and
Runtime config loading validate the namespaces with the same rules. All three files are optional; a
missing file or key means the default.

| Settings                | `.nevo/config.yaml` (project) | `.nevo/local/config.yaml` (local)    | `<docs.root>/docs.yaml` |
| ----------------------- | ----------------------------- | ------------------------------------ | ----------------------- |
| `docs` (root, search)   | allowed                       | rejected                             | —                       |
| taxonomy, path prefixes | rejected                      | rejected (as part of `docs`)         | allowed                 |
| `ai.embeddings`         | allowed (team default)        | allowed; the local value wins by key | —                       |

The `docs` command reads only these two namespaces and `docs.yaml`; other namespaces (including
`runtime` and other `ai` keys) are neither required nor validated by it.

### Documentation without an initialized project

The `docs` commands do not need an initialized project. A `.nevo/config.yaml` with only a `docs`
section is a complete configuration for them:

```yaml
# .nevo/config.yaml — documentation only
docs:
  search:
    semantic: true
```

Nothing adds the `.nevo/local/` entry to `.gitignore` in such a project, and the semantic index is
local cache below it. The CLI and the Runtime check with an uncached `git check-ignore` that Git
ignores `.nevo/local/cache/docs-index/` when they open the index (only with `ai.embeddings`
configured) and again immediately before every write batch of it (the writer lock, each slice of
a refresh, a refresh already running included, the chunk cache, the start of a background
catch-up). In a Git work tree that does not, nothing is written below `.nevo/local/`: searches
answer lexically with `index-unavailable` (``Git does not ignore .nevo/local/cache/docs-index/, so
the index is not written there; add `.nevo/local/` to the project's .gitignore.``), and
`semantic index` and `semantic status` exit 1 with the same reason. While a check has refused,
each search and status checks again, so search recovers once the path is ignored again. Add the
entry:

```gitignore
.nevo/local/
```

Outside a Git work tree the check does not apply.

Such a project is not initialized: `nevo-specflow start` and `nevo-specflow project bootstrap`
refuse it and name `nevo-specflow init`, which adds the `runtime` and `git` sections and keeps the
existing ones (see [Enabling it in `nevo-specflow init`](#enabling-it-in-nevo-specflow-init)).

## `docs`

```yaml
# .nevo/config.yaml
docs:
  root: docs # documentation root, relative to the project root
  search:
    semantic: true # opt in to hybrid `search`; also needs `ai.embeddings`
```

| Key                    | Meaning                                                         | Default |
| ---------------------- | --------------------------------------------------------------- | ------- |
| `docs.root`            | Relative directory with `/` separators; no `.` or `..` segments | `docs`  |
| `docs.search.semantic` | `true` or `false`                                               | `false` |

An unknown key under `docs` or `docs.search` is an error; the taxonomy and path prefixes belong in
`<docs.root>/docs.yaml`.

## `<docs.root>/docs.yaml`

The documentation settings file describes the documentation itself and is committed next to it.

```yaml
# docs/docs.yaml
taxonomy:
  scopes: [shared, specflow] # allowed `scope` values
  areas: [cli, docs, testing] # allowed `areas` values
nonAuthoritative: [ideas/] # path prefixes under `docs.root` that `context` and `search` skip
exclude: [templates/] # path prefixes under `docs.root` that are not part of the corpus at all
```

| Key                | Meaning                                                                   | Default      |
| ------------------ | ------------------------------------------------------------------------- | ------------ |
| `taxonomy.scopes`  | Non-empty list of distinct values; any other `scope` is a `check` problem | unrestricted |
| `taxonomy.areas`   | Non-empty list of distinct values; any other area is a `check` problem    | unrestricted |
| `nonAuthoritative` | Directory prefixes relative to `docs.root` (a trailing `/` is optional)   | none         |
| `exclude`          | Directory prefixes relative to `docs.root`, validated the same way        | none         |

An absent or empty file means all defaults. An unknown key at the top level or under `taxonomy` is
an error naming the file. The file is not part of the corpus: only `*.md` files are scanned,
validated and indexed. It is read whenever a corpus is opened (every `docs` command, and a running
Runtime when it first uses the corpus). Document types, required fields and statuses are the
product frontmatter contract and are not configurable.

`context` never returns documents under a non-authoritative prefix; `search` skips them unless
`--include-non-authoritative` is given; `list`, `find` and `get` return them.

Symbolic links (and Windows junctions) below `docs.root` are skipped by every command, whether
they point to a directory or a file, inside or outside `docs.root`: a link never loops the scan and
never adds files from elsewhere to the corpus. Put a document in the documentation tree itself
instead of linking it there.

Files under an excluded prefix are not scanned by any command: they need no frontmatter, are not
validated, indexed or searched. Use it for copy-me templates and similar non-documents. A relative
Markdown link into an excluded directory still resolves when the target exists (its `#fragment` is
not checked).

## `ai.embeddings`

The endpoint serves an embedding model, not a chat model: search returns document sections and the
agent composes answers from them. Any host with the OpenAI-compatible `POST /embeddings` call works
(Ollama, LM Studio, vLLM, llama.cpp server, Hugging Face TEI, OpenAI, Azure OpenAI), local or
remote.

```yaml
# .nevo/config.yaml — team default
ai:
  embeddings:
    baseUrl: http://127.0.0.1:11434/v1
    model: qwen3-embedding:0.6b
    queryInstruction: "Instruct: Given a question, retrieve documentation that answers it\nQuery: "
```

```yaml
# .nevo/local/config.yaml — this workstation's endpoint
ai:
  embeddings:
    baseUrl: https://embeddings.example.com/v1
    model: text-embedding-3-small
    apiKeyEnv: EMBEDDINGS_API_KEY
```

An endpoint in the committed project configuration is used as it is, with no local confirmation:
once `docs.search.semantic` is `true` and the endpoint is set (in either file), the first `search`,
`semantic index` or Runtime start sends document sections (their text with the document's title, id,
summary, scope, areas, tags and read_when) to it to embed them, and every search sends the query.
Configure in `.nevo/config.yaml` only an endpoint every contributor may send the documentation to; a
workstation that must not use it sets its own `baseUrl` and `model` in `.nevo/local/config.yaml`
(`docs.search.semantic` is a project setting and cannot be turned off locally).

The two files merge key by key, the local value winning; the example resolves to the remote
endpoint and model with the project's `queryInstruction`. Either file alone may configure the
endpoint. After merging, `baseUrl` and `model` are required; a minimal endpoint is
`ai.embeddings: { baseUrl, model }`.

| Key                | Meaning                                                                                   | Default             |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------------- |
| `protocol`         | `openai-compatible` (`POST {baseUrl}/embeddings`), the only protocol                      | `openai-compatible` |
| `baseUrl`          | Absolute `http` or `https` URL without credentials, query or fragment                     | required            |
| `model`            | Model id sent to the endpoint                                                             | required            |
| `spaceId`          | Declared embedding space of the index (see Embedding space)                               | fingerprint         |
| `dimensions`       | Expected vector dimension; a different observed dimension is an endpoint error            | observed by probe   |
| `apiKeyEnv`        | Name of the environment variable holding the API key (upper-case letters, digits and `_`) | no key sent         |
| `queryInstruction` | Prefix added to queries only, for instruction-tuned models                                | none                |
| `batchSize`        | Texts per request when embedding documents                                                | 16                  |
| `timeoutMs`        | Per-request timeout for document embedding; query embedding uses at most 3000 ms of it    | 60000               |

### Embedding space

The index records which embedding space its vectors belong to. By default that is a fingerprint of
the protocol, the normalized `baseUrl` (lower-case scheme and host, default port and trailing
slash dropped) and the `model`, so pointing the same model name at another server, or another model
at the same server, rebuilds the index on the next refresh, and searches answer lexically
(`index-building`) until it is rebuilt. Set `spaceId` (any non-empty string) when several servers
serve the same weights and should share one index, for example a team endpoint and a local copy
of the same model; it then replaces the fingerprint, and changing it rebuilds the index. The
fingerprint is deliberately conservative: it compares the configured text, not what the server
resolves it to, so `qwen3-embedding` and `qwen3-embedding:latest`, `localhost` and `127.0.0.1`, or
the same query parameters in another order are different spaces and cost one rebuild; declare a
`spaceId` to treat such spellings as one space.

A model whose weights change under the same name and server (an updated model tag, for example) is
caught by a probe: every full refresh (`semantic index`, the background catch-up a search starts
and the Runtime's refresh) embeds one fixed probe text and compares the vector with the one the
index recorded when it was built (every build records it, also one a search makes); a cosine
similarity below 0.999, or an index without a recorded probe, rebuilds the index. A search's own
bounded refresh does not compare the probe, so a weight change is noticed by the next full
refresh.

### Secrets

The API key is never stored in configuration. `apiKeyEnv` names the variable; the command reads it
when it calls the endpoint and sends it as a bearer token. These are rejected when the file is
loaded, with a message naming the file and key:

- a key that would hold a secret (`apiKey`, `key`, `token`, `accessToken`, `secret`, `password`,
  `authorization`, `bearer`);
- an `apiKeyEnv` value that is not an upper-case variable name (a pasted key is never one);
- credentials, a query string or a fragment in `baseUrl`.

Endpoints that need a query string are therefore not supported, including classic Azure OpenAI
deployments (an `api-version` query parameter and an `api-key` header); use an endpoint that accepts
`POST {baseUrl}/embeddings` with a bearer token.

A named variable that is not set is not a configuration error: `search` answers lexically with
reason `endpoint-unreachable` and `semantic status` reports it.

## Enabling it in `nevo-specflow init`

`init` of a new project asks, after the Git questions and before the review, **Enable semantic
documentation search?** (choices **No (default)** and **Yes**). Declining writes no `docs` or `ai` section; the review
shows `Semantic docs search: off`. On **Yes** it asks:

| Prompt                                                                                    | Default                     | Written as                        |
| ----------------------------------------------------------------------------------------- | --------------------------- | --------------------------------- |
| Embedding endpoint (OpenAI-compatible base URL)                                           | `http://127.0.0.1:11434/v1` | `ai.embeddings.baseUrl` (local)   |
| Embedding model                                                                           | `qwen3-embedding:0.6b`      | `ai.embeddings.model` (local)     |
| Environment variable holding the API key (the key itself is never stored; empty for none) | empty (no key sent)         | `ai.embeddings.apiKeyEnv` (local) |

The key itself is never asked for or written. The answers are validated with the same rules as
above before anything else happens; an invalid answer (for example a pasted key instead of a
variable name) is explained and the three questions are asked again, at most three times. Init then
writes:

```yaml
# .nevo/config.yaml
docs:
  search:
    semantic: true
```

```yaml
# .nevo/local/config.yaml
ai:
  embeddings:
    baseUrl: http://127.0.0.1:11434/v1
    model: qwen3-embedding:0.6b
    apiKeyEnv: EMBEDDINGS_API_KEY # only when a variable was named
```

Before the review it probes the endpoint once (one document embedding with the configured timeout)
and shows the latency and vector dimension, or why it failed (unreachable, timeout, HTTP status, or
the named variable not set). A failed probe does not fail `init`: the configuration is still written
and the review says `Semantic docs search: configured but unavailable, lexical for now (...)`;
`search` answers lexically until `docs semantic status` reports the endpoint available. On success
the review says `Semantic docs search: enabled (<model> at <baseUrl>, <n> dimensions)`. The probe
writes no index; the first `search` starts building it in the background (a `search` embeds at most
16 sections itself and leaves a larger gap to a background `docs semantic index`).

In a project whose `.nevo/config.yaml` has no `runtime` section yet (for example a
documentation-only configuration), `init` completes the existing files instead of refusing: it adds
its sections and keeps the existing ones and their comments. When the project configuration already
has a `docs` section or the local configuration an `ai` section, `init` does not ask the question
above and the review says `Documentation: the existing configuration is kept`. A section `init`
writes that already exists (`git` in either file) is refused before the first question, so no answer
is lost. A project
configuration with `runtime` is an initialized project; `init` refuses it.

Enabling semantic search in an already initialized project is not offered by any command: edit
the two files as shown.

## Effective search mode

`search` answers in `hybrid` mode only when `docs.search.semantic` is `true`, an endpoint is
configured and reachable, and the index is current; otherwise it answers `lexical` with a reason
(see the [CLI reference](../cli/nevo-specflow-docs.md#search)). Configuration problems fail every
`docs` command with exit 1; an unavailable endpoint or index never fails `search`, only the
explicit `semantic status` and `semantic index` (see the
[exit codes](../cli/nevo-specflow-docs.md#exit-codes)).

## Local cache

The semantic index lives in `.nevo/local/cache/docs-index/` below the project root: the vectors
(`vectors/`), the parsed chunks of each document (`units.json`), the progress records of the last
full refresh (`progress-*.json`) and the log and start marker of the background catch-up
(`catch-up.log`, `catch-up.started`). It is disposable cache
([project configuration and local state](../../architecture/runtime/configuration.md)): deleting it
costs only re-embedding. `search` writes nothing there while semantic search is not enabled. A
running Runtime shares the same index for
[`GET /api/docs/search`](../api/docs-search.md), refreshes it in the background on start and
catches a larger gap up in process.
