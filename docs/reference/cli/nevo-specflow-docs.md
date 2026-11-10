---
id: reference.cli.nevo-specflow-docs
type: reference
title: nevo-specflow docs commands
status: current
scope: specflow
areas: [cli, docs, configuration]
read_when:
  - using nevo-specflow docs list, find, get, context, check, search or semantic
  - checking the output, search mode or exit codes of documentation discovery
summary: >
  The documentation commands of nevo-specflow docs: deterministic list, find, get, context and check,
  semantic search with its hybrid or lexical mode and reasons, semantic status and index, their
  output and exit codes.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - adr.0007-documentation-architecture-and-taxonomy
  - reference.cli.nevo-specflow-contract
  - reference.configuration.documentation-and-embeddings
  - architecture.runtime.configuration
---

# `nevo-specflow docs` commands

`nevo-specflow docs` is the documentation capability (`@nevo/specflow-docs`,
[ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)).
It is an ordinary command: it does not start Runtime, need a running Runtime or load UI assets. It
runs in a Git repository and reads the documents under the project's documentation root: every
`.md` file below `docs.root` except the generated index files and directories listed in
`exclude` of `<docs.root>/docs.yaml`. The project does not need to be initialized: a
`.nevo/config.yaml` with only a `docs` section is enough.

```bash
nevo-specflow docs list [--type <type>] [--status <status>] [--json]
nevo-specflow docs find <query...> [--type] [--status] [--scope] [--area] [--tag] [--limit <n>] [--json]
nevo-specflow docs get <id...> [--json]
nevo-specflow docs context <query...> [--limit <n>] [--json]
nevo-specflow docs check [--write]
nevo-specflow docs search <question...> [--limit <n>] [--include-non-authoritative] [--no-refresh] [--json]
nevo-specflow docs semantic status [--json]
nevo-specflow docs semantic index
```

- `list` prints every document, all statuses, ordered by id.
- `find` is a lexical OR search over frontmatter (`id`, `title`, `scope`, `areas`, `tags`,
  `read_when`, `summary`, path, `related`), ranked by matched-term coverage, then field weight,
  then id. Filters narrow the result; every status and every path is visible.
- `get` resolves exact stable ids in the given order. It fails closed: an unknown id or an inactive
  document (`deprecated`, `superseded`) is an error, naming the replacement when `superseded_by` is
  set.
- `context` lists the files to load for a task: like `find`, but inactive documents and documents
  under non-authoritative prefixes are never returned.
- `check` validates the whole corpus (frontmatter contract, taxonomy, unique ids, resolvable
  `related` / `supersedes` / `superseded_by`, relative Markdown links and their `#fragment`
  headings) and verifies that `<root>/index.generated.json` and `<root>/index.generated.md` are
  current. `--write` regenerates both when the corpus is valid; broken links are reported but do
  not block regeneration. The index is deterministic, so writing it twice changes nothing, and its
  content does not depend on how the command was invoked: it always names
  `nevo-specflow docs check --write`.

With `--json`, stdout holds one JSON document and nothing else. A `list` or `find` result carries
the document's frontmatter, `file` and `body` (and, for `find`, `score`, `matchedTerms` and
`matchedFields`); a `get` or `context` entry carries `id`, `file`, `title`, `status`, `summary`,
`read_when`, `scope` (when set), `areas` and `tags`.

Errors are reported on stderr in every mode, including `--json`; stdout stays empty when a command
fails, and no error object is printed on stdout.

## `search`

`search` answers a natural-language question with document sections ranked by content, not
frontmatter. It is the only model-dependent command.

| Option                        | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `--limit <n>`                 | Maximum documents (default 10); each shows up to 3 matching sections         |
| `--include-non-authoritative` | Also return documents under the `nonAuthoritative` prefixes of `docs.yaml`   |
| `--no-refresh`                | Embed no documents; answer lexically unless the index is already complete    |
| `--json`                      | Print the result contract (`DocsSearchResult` in `@nevo/specflow-contracts`) |

Inactive documents (`deprecated`, `superseded`) are never returned. The corpus frontmatter is
validated as for `context` (document bodies are not checked; links are `check`'s job); an invalid
corpus or configuration fails with exit 1.

**Mode.** With `docs.search.semantic: true` and a reachable `ai.embeddings` endpoint, ranking is
hybrid: BM25 over section text fused with vector similarity
([ADR 0021](../../architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md)).
Otherwise the same call ranks by BM25 alone and states why. Every result carries `mode`; a lexical
result carries `reason.code` and a `reason.message` with the cause. A lexical answer still exits 0.

| `reason.code`          | When                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `semantic-disabled`    | `docs.search.semantic` is absent or `false`                                                                                                               |
| `no-endpoint`          | semantic search is enabled but `ai.embeddings` is not configured                                                                                          |
| `endpoint-unreachable` | the endpoint failed, timed out or returned unusable vectors, or the `apiKeyEnv` variable is not set                                                       |
| `index-building`       | the index does not cover the current documents yet: another process is updating it, or more sections lack vectors than a search embeds, or `--no-refresh` |
| `index-unavailable`    | the index cannot be read or written (for example a permission problem); waiting does not help                                                             |

**Freshness.** Before answering, `search` brings the index up to date: unchanged files (same size
and modification time) are not read, changed files are re-chunked only when their content changed,
and only new or changed sections are embedded. A current index costs no endpoint call besides the
query. When the index needs work, a short reachability probe runs first, so an unreachable endpoint
falls back to lexical within the query timeout (at most 3000 ms) instead of the document timeout.
A search embeds at most 16 sections (one request at the default batch size). When more lack
vectors, for example before the first build, after a model change or while a build was
interrupted, it embeds nothing, answers lexically with `index-building` and names
`nevo-specflow docs semantic index`, which builds the rest (a host that mounts the command under
another name, such as this repository's `pnpm docs:*` scripts, names its own command line; the
HTTP endpoint always names the product command). Search is hybrid only once every current
section has a vector. `--no-refresh` skips the embedding step entirely.

Text output, hybrid:

```text
mode: hybrid

guide — "Guide"  docs/guide.md  (score 0.0328)
  in: Guide > Install
    Install the widget with pnpm.
  read: nevo-specflow docs get guide
```

Text output, lexical: the first line names the reason, for example

```text
mode: lexical (semantic-disabled: Semantic search is not enabled (docs.search.semantic is not true).)
```

JSON output (`--json`), lexical:

```json
{
  "mode": "lexical",
  "reason": {
    "code": "endpoint-unreachable",
    "message": "Query embedding failed (unreachable): ..."
  },
  "results": [
    {
      "id": "guide",
      "title": "Guide",
      "file": "docs/guide.md",
      "score": 1.38,
      "chunks": [
        {
          "headingPath": ["Guide", "Install"],
          "snippet": "Install the widget with pnpm.",
          "score": 1.38
        }
      ]
    }
  ]
}
```

A hybrid result has `"mode": "hybrid"` and no `reason`. Scores are BM25 in lexical mode and
reciprocal-rank-fusion scores in hybrid mode; compare them only within one result.

## `semantic status` and `semantic index`

`semantic status` reports whether semantic search is enabled, the configured endpoint (never a key),
a connectivity probe (latency and observed dimensions) and the index: `missing`, `current`, `stale`
(sections to re-embed), `rebuild` (built with another chunker, protocol, model or dimension) or
`unreadable`. Its last line is the mode `search` would answer in, with the same reason: an index
that lacks vectors for more sections than a search embeds (16) — missing, to be rebuilt or stale
by that much — reports `lexical` with `index-building` and names the index build command. It exits
1 when semantic search is enabled but unavailable: no endpoint, an unreachable endpoint or unset
key variable, or an unreadable index. An index that only needs building is not a failure (exit 0):
`semantic index` builds it, and a search embeds a gap of at most 16 sections itself.
It checks configuration, the endpoint and that the index can be read, not that it can be written: a
write failure shows up on `search` as `index-unavailable`.
`--json` prints the same report as one JSON object.

```text
semantic search: enabled
endpoint: openai-compatible http://127.0.0.1:11434/v1  model qwen3-embedding:0.6b
reachable: yes (42 ms, 1024 dimensions)
index: current  generation 3, 812 chunks, qwen3-embedding:0.6b / 1024 dimensions
search mode: hybrid
```

`semantic index` updates the index now like a search does, but without its 16-section bound
(everything after a model or chunker change), and prints what it did, for example
`Index refreshed: embedded 4, deleted 1 chunks (generation 4).` It embeds in slices of 128 chunks
and writes each slice to the index as soon as it is embedded, printing `embedded 256/2130 chunks`
to stderr after each, so an interrupted or failed run keeps its progress and the next run embeds
only the rest. When semantic search is not configured or the update cannot run, it prints the
reason; it does not fail.

The index is disposable cache in `.nevo/local/cache/docs-index/`; deleting it is always safe. The
CLI and a running Runtime share it; one process writes at a time, and another one answers lexically
meanwhile.

## Configuration

The commands work without `.nevo/config.yaml`, without `.nevo/local/config.yaml` and without
`<docs.root>/docs.yaml`, and they do not need an initialized project (no `runtime` section). They
read and validate only the `docs` and `ai.embeddings` namespaces and `docs.yaml` (the taxonomy and
path prefixes); `docs` is project-owned and rejected in the local file. The keys, their defaults and the secret rules are in the
[documentation and embeddings configuration reference](../configuration/documentation-and-embeddings.md).

## Exit codes

| Code | Meaning                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success (also `--help`).                                                                                                                              |
| 1    | The corpus or the configuration is invalid, `check` found a problem or a stale index, or `semantic status` found enabled semantic search unavailable. |
| 2    | Usage error: bad arguments or options, an unknown or inactive id for `get`.                                                                           |

Results go to stdout; problems and error messages go to stderr. An unavailable embedding endpoint or
index never makes `search` or `semantic index` exit non-zero.
