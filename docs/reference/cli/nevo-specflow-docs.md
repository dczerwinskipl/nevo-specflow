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
nevo-specflow docs get <id...> [--content] [--json]
nevo-specflow docs context <query...> [--limit <n>] [--json]
nevo-specflow docs check [--write]
nevo-specflow docs search <question...> [--limit <n>] [--include-non-authoritative] [--no-refresh] [--snippets] [--json]
nevo-specflow docs semantic status [--json]
nevo-specflow docs semantic index
```

- `list` prints every document, all statuses, ordered by id.
- `find` is a lexical OR search over frontmatter (`id`, `title`, `scope`, `areas`, `tags`,
  `read_when`, `summary`, path, `related`), ranked by matched-term coverage, then field weight,
  then id. Filters narrow the result; every status and every path is visible.
- `get` resolves exact stable ids in the given order. It fails closed: an unknown id or an inactive
  document (`deprecated`, `superseded`) is an error, naming the replacement when `superseded_by` is
  set, and nothing is printed. With `--content` it prints the whole Markdown file of every
  document, frontmatter included, in one call: each document starts with the delimiter line
  `===== <id> — "<title>" [<status>]  <file> =====`, and documents are separated by a blank line.
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
`read_when`, `scope` (when set), `areas` and `tags`, and with `get --content` also `content`, the
whole file.

Errors are reported on stderr in every mode, including `--json`; stdout stays empty when a command
fails, and no error object is printed on stdout.

## `search`

`search` answers a natural-language question with ranked documents, each described by its
frontmatter and the heading paths of its best matching sections, so a reader (often an AI agent)
can choose which documents to open with `get`. It is the only model-dependent command.

| Option                        | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `--limit <n>`                 | Maximum documents (default 10); each shows up to 3 matching sections         |
| `--include-non-authoritative` | Also return documents under the `nonAuthoritative` prefixes of `docs.yaml`   |
| `--no-refresh`                | Embed no documents; answer lexically unless the index is already complete    |
| `--snippets`                  | Add a one-line snippet (about 280 characters) to each matching section       |
| `--json`                      | Print the result contract (`DocsSearchResult` in `@nevo/specflow-contracts`) |

Inactive documents (`deprecated`, `superseded`) are never returned. The corpus frontmatter is
validated as for `context` (document bodies are not checked; links are `check`'s job); an invalid
corpus or configuration fails with exit 1.

**Ranking.** Documents are ranked by reciprocal rank fusion (equal weight, by rank, so the two
scores never mix) of two rankings, each limited to three times `--limit` candidates:

1. the **section ranking**: sections ranked by BM25 over their heading path and text, fused with
   vector similarity in hybrid mode
   ([ADR 0021](../../architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md));
   a document takes the rank of its best section;
2. the **frontmatter ranking**: `find`'s field weights and term normalization (case and English
   plural folding, so `task` and `tasks` match each other) over what a document says it is about:
   `id`, `title`, `scope`, `areas`, `tags`, `read_when` and `summary`, not its path or `related`.
   A question term in the frontmatter of more than a quarter of the searched documents (and of more
   than one) is ignored, so the words most frontmatter shares ("the", "and", "of") rank nothing;
   the rule needs no language-specific stop-word list. A document needs at least one remaining
   term.

A document whose `summary` says "Tasks are handled by the engine" is therefore found by
`search tasks` even when no section says "tasks". A document none of whose sections is among the
section ranking's candidates has no sections. Section text is matched by exact, diacritic-folded words without stemming, because the
engine does not know the corpus language.

**Mode.** With `docs.search.semantic: true` and a reachable `ai.embeddings` endpoint, the section
ranking is hybrid. Otherwise it is BM25 alone and the result states why. Every result carries
`mode`; a lexical result carries `reason.code` and a `reason.message` with the cause. A lexical
answer still exits 0.

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
vectors, for example before the first build, after a model change or after editing many documents,
it embeds nothing and answers lexically with `index-building` at once, and the index is caught up
in the background: unless a writer already holds the index or a catch-up was started less than a
minute ago, the search probes the endpoint and starts `nevo-specflow docs semantic index` as a
detached process of the same executable in the project root (no console window on Windows), with
its output in `.nevo/local/cache/docs-index/catch-up.log`. The reason says so and how to follow it:

```text
mode: lexical (index-building: The index lacks vectors for 40 chunks, more than a search embeds (16); a background `nevo-specflow docs semantic index` is updating it; follow it with `nevo-specflow docs semantic status`.)
```

While it runs, later searches say `process <pid> is updating it in the background (<n>/<total>
chunks since <time>)` instead. A host that mounts the command under another name, such as this
repository's `pnpm docs:*` scripts, names and starts its own command line; the HTTP endpoint
catches up inside the Runtime instead. An unreachable endpoint answers `endpoint-unreachable` and
starts nothing. Search is hybrid only once every current section has a vector. `--no-refresh` skips
the embedding step entirely and starts no catch-up.

Text output: one block per document with its id, title, type and status, the `summary` (cut at a
word boundary after 200 characters; `--json` has all of it), the `read_when` situations and the
matching sections (heading paths, `;`-separated, without a first heading equal to the document
title; `(top)` for the text directly under it). Absent fields are omitted. The last line reads
every listed document in one call with `get --content`, in rank order:

```text
mode: hybrid

guide — Guide (reference, current)
  How to install and configure the widget.
  read when: installing the widget; pointing it at a local model
  sections: Install; Configure

faq — FAQ (hub, current)
  sections: (top)

read all: nevo-specflow docs get --content guide faq
```

With `--snippets`, each section is on its own line with its snippet:

```text
  sections:
    Install: Install the widget with pnpm.
    Configure: Point the embedding endpoint at a local model.
```

Text output, lexical: the first line names the reason, for example

```text
mode: lexical (semantic-disabled: Semantic search is not enabled (docs.search.semantic is not true).)
```

JSON output (`--json`), hybrid:

```json
{
  "mode": "hybrid",
  "results": [
    {
      "id": "guide",
      "title": "Guide",
      "type": "reference",
      "status": "current",
      "scope": "specflow",
      "areas": ["docs"],
      "tags": ["install"],
      "summary": "How to install and configure the widget.",
      "readWhen": ["installing the widget", "pointing it at a local model"],
      "file": "docs/guide.md",
      "score": 0.0328,
      "sections": [
        { "headingPath": ["Guide", "Install"], "score": 0.0325 },
        { "headingPath": ["Guide", "Configure"], "score": 0.0159 }
      ]
    }
  ]
}
```

JSON output, lexical with `--snippets`:

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
      "type": "reference",
      "status": "current",
      "summary": "How to install and configure the widget.",
      "readWhen": ["installing the widget"],
      "file": "docs/guide.md",
      "score": 0.0328,
      "sections": [
        {
          "headingPath": ["Guide", "Install"],
          "score": 1.38,
          "snippet": "Install the widget with pnpm."
        }
      ]
    }
  ]
}
```

`scope`, `areas`, `tags`, `summary` and `readWhen` are present only when the frontmatter has a
non-empty value; `snippet` only with `--snippets`. A document's `score` is its fused rank score; a
section's `score` is BM25 in lexical mode and the section-level reciprocal-rank-fusion score in
hybrid mode. Only the order is meaningful; compare scores only within one result.

## `semantic status` and `semantic index`

`semantic status` reports whether semantic search is enabled, the configured endpoint (never a key),
a connectivity probe (latency and observed dimensions), the index (`missing`, `current`, `stale`
(sections to re-embed), `rebuild` (built with another chunker, protocol, model or dimension) or
`unreadable`) and who is updating it: while a process holds the index writer, `updating in
background: <n>/<total> chunks (since <time>, process <pid>)` for a full refresh (a background
catch-up, `semantic index` or a Runtime refresh), otherwise the outcome of the last full refresh
(`last update: completed <time> (embedded <n>/<total> chunks, generation <g>)`, `failed …` with the
cause, or `interrupted …` when its process ended early). Its last line is the mode `search` would
answer in, with the same reason: an index that lacks vectors for more sections than a search embeds
(16) — missing, to be rebuilt or stale by that much — reports `lexical` with `index-building`. It
exits 1 when semantic search is enabled but unavailable: no endpoint, an unreachable endpoint or
unset key variable, or an unreadable index. An index that only needs building is not a failure
(exit 0): a search catches it up in the background, and embeds a gap of at most 16 sections itself.
It checks configuration, the endpoint and that the index can be read, not that it can be written: a
write failure shows up on `search` as `index-unavailable`. Status only reports; it starts nothing.
`--json` prints the same report as one JSON object, the `DocsStatus` contract of
[`GET /api/docs/status`](../api/docs-search.md#get-apidocsstatus).

```text
semantic search: enabled
endpoint: openai-compatible http://127.0.0.1:11434/v1  model qwen3-embedding:0.6b
reachable: yes (42 ms, 1024 dimensions)
index: stale (40 chunks to update)  generation 20, 812 chunks, qwen3-embedding:0.6b / 1024 dimensions
updating in background: 16/40 chunks (since 2026-11-10T09:12:03.120Z, process 18244)
search mode: lexical (index-building: The index lacks vectors for 40 chunks, more than a search embeds (16); it is being updated in the background (16/40 chunks).)
```

and once it is done:

```text
index: current  generation 21, 812 chunks, qwen3-embedding:0.6b / 1024 dimensions
last update: completed 2026-11-10T09:13:10.554Z (embedded 40/40 chunks, generation 21)
search mode: hybrid
```

`semantic index` updates the index now like a search does, but without its 16-section bound
(everything after a model or chunker change), and prints what it did, for example
`Index refreshed: embedded 4, deleted 1 chunks (generation 4).` It embeds in slices of 128 chunks
and writes each slice to the index as soon as it is embedded, printing `embedded 256/2130 chunks`
to stderr when it starts and after each slice (and recording the same progress for
`semantic status`), so an interrupted or failed run keeps its progress and the next run embeds
only the rest. When semantic search is not configured or the update cannot run, it prints the
reason; it does not fail.

The index is disposable cache in `.nevo/local/cache/docs-index/`; deleting it is always safe. The
CLI and a running Runtime share it; one process writes at a time, and another one answers lexically
meanwhile. Next to it are the progress records of the last full refresh, the catch-up log and the
marker of the last catch-up start.

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
