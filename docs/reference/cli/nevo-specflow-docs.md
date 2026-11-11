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
nevo-specflow docs get --content <id | id#sectionId...> [--json]
nevo-specflow docs context <query...> [--limit <n>] [--json]
nevo-specflow docs check [--write]
nevo-specflow docs search <question...> [--limit <n>] [--include-non-authoritative] [--no-refresh] [--no-snippets] [--json]
nevo-specflow docs semantic status [--json]
nevo-specflow docs semantic index
```

- `list` prints every document, all statuses, ordered by id.
- `find` is a lexical OR search over frontmatter (`id`, `title`, `scope`, `areas`, `tags`,
  `read_when`, `summary`, path, `related`) with the word normalization of `search`'s frontmatter
  ranking (see Ranking), ranked by matched-term coverage, then field weight, then id. Filters
  narrow the result; every status and every path is visible.
- `get` resolves exact stable ids in the given order. It fails closed: an unknown id or an inactive
  document (`deprecated`, `superseded`) is an error, naming the replacement when `superseded_by` is
  set, and nothing is printed. With `--content` it reads every reference in one call, in the
  given order: a document id prints the whole Markdown file, frontmatter included, after the
  delimiter line `===== <id> — "<title>" [<status>]  <file> =====`; `<id>#<sectionId>` prints one
  section of the document, from its heading line up to the next heading that is not inside it (so
  its subsections are included; `_top` is the text before the first heading), after the delimiter
  line `===== <id>#<sectionId> — "<title>" > <heading path> [<status>]  <file>:<line> =====`.
  References are separated by a blank line. Every reference is checked before anything is printed:
  an unknown or inactive document or a section id that is not one of the document's (the error
  lists the document's section ids) fails the whole call with exit 2 and an empty stdout. A section
  reference without `--content` is a usage error.
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
`read_when`, `scope` (when set), `areas` and `tags`, and with `get --content` also `content`: the
whole file, or for a section reference the section's Markdown and `section` (`sectionId`,
`headingPath` and the heading's `line`).

Errors are reported on stderr in every mode, including `--json`; stdout stays empty when a command
fails, and no error object is printed on stdout. The one exception is `semantic status`, which
prints its whole report and then exits 1 when it found enabled semantic search unavailable.

## `search`

`search` answers a natural-language question with ranked documents, each described by its
frontmatter and its best matching sections (heading path, section id, line and a short excerpt of
what the section says), so a reader (often an AI agent) can choose which documents or sections to
open with `get`. It is the only model-dependent command.

| Option                        | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `--limit <n>`                 | Maximum documents (default 10); each shows up to 3 matching sections         |
| `--include-non-authoritative` | Also return documents under the `nonAuthoritative` prefixes of `docs.yaml`   |
| `--no-refresh`                | Embed no documents; answer lexically unless the index is already complete    |
| `--no-snippets`               | Show no excerpt under each matching section (they are shown by default)      |
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
2. the **frontmatter ranking**: `find`'s field weights and term normalization (the section
   ranking's words, then English plural folding of ASCII words, so `task` and `tasks` match each
   other) over what a document says it is about:
   `id`, `title`, `scope`, `areas`, `tags`, `read_when` and `summary`, not its path or `related`.
   A question term in the frontmatter of more than a quarter of the searched documents (and of more
   than one) is ignored, so the words most frontmatter shares ("the", "and", "of") rank nothing;
   the rule needs no language-specific stop-word list. A document needs at least one remaining
   term.

A document whose `summary` says "Tasks are handled by the engine" is therefore found by
`search tasks` even when no section says "tasks". A document none of whose sections is among the
section ranking's candidates has no sections. Both rankings split text into the same words:
Unicode letter and digit runs after compatibility normalization (NFKD), lower-cased, with
diacritics removed and the letters without a decomposition folded to ASCII (`ł` → `l`, `ø` → `o`,
`ß` → `ss`, `đ` → `d`, `æ` → `ae`, `œ` → `oe`, `þ` → `th`), so `płatności` is one word and
matches `PŁATNOŚCI` and the ASCII-typed `platnosci`. Section text is matched by these exact
words without stemming, because the engine does not know the corpus language; only the frontmatter
ranking folds English plurals, and only of words that are ASCII after normalization.

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

**Freshness.** Before answering, `search` brings the index up to date: it reads and hashes every
document (sizes and modification times are not trusted, so a change that keeps both, such as a
timestamp-preserving copy, is seen), re-chunks only documents whose content hash changed, and
embeds only new or changed sections. A current index costs no endpoint call besides the
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
starts nothing. When the process cannot be started at all (for example a missing executable), the
search says so (``starting a background `nevo-specflow docs semantic index` failed (<cause>); run it
yourself``), appends the cause to the catch-up log, leaves no start marker and still exits 0; the
next search tries again and reports the same failure rather than a catch-up that never runs.
Search is hybrid only once every current section has a vector. `--no-refresh` skips the embedding
step entirely and starts no catch-up.

**Sections.** Each document shows up to three matching sections, best first, one per section. A
section is identified by its `sectionId`: its parent section's id (the nearest enclosing heading of
a higher level), `/` and its heading's slug (the heading's words, normalized like the ranking's
words, joined by `-`; `section` for a heading without words), or just the slug for a top-level
heading; for example `guide/install` for `# Guide` > `## Install`. The text before the first
heading is `_top`. A heading whose slug an earlier sibling under the same parent already has gets
`~2`, `~3`, …, and its subsections inherit that id (`api/endpoint~2/errors`), so an id starts with
another id and `/` exactly when the section is inside the other. An id changes only when a heading
on its path changes (or an earlier sibling takes the same slug), not when other sections are
edited. `line` is the line of the file where the matching text starts: the section's heading, or
for a later part of a long section that part's first line. `get --content <id>#<sectionId>` prints
the section with its subsections.

**Excerpts.** Under each section, `search` shows a short excerpt (`snippet`, one line, at most
280 characters) taken from the section's own text, never generated: the section body is split
into pieces (the sentences of each paragraph, and every line of a list, table, quote or code block
on its own) and the piece with the most query words wins, each word weighted by how few pieces of
the section contain it (words of at least four letters also match by a long common prefix, so
`taski` matches `taskami` and `session` matches `sessions`); the following and then the
preceding pieces are added while they fit, and `…` marks text left out. When no piece contains a
query word (a section found by its meaning only), the excerpt is the first sentences after the
heading, which may not be the part that matched: the excerpt says what the section is about, not
why it was chosen, so read the section before relying on it. `--no-snippets` leaves them out.

Text output: one block per document with its id, title, type and status, the `summary` (cut at a
word boundary after 200 characters; `--json` has all of it), the `read_when` situations and the
matching sections, one per line with its heading path (without a first heading equal to the document
title), `[<sectionId>, line <n>]` and the excerpt on the next line. The section of the title heading
itself is `(document)`, since with its subsections it is the whole document; the text before the
first heading is `(before the first heading)`. Absent fields are omitted. The last line, `read
all:`, is one `get --content` command that reads every listed result in rank order, checked as a
whole (it fails before printing anything when a reference is no longer valid): a `reference`
document with matching sections as `<id>#<sectionId>` references, any other document whole.
Reference documents are lookup material (routes, options, keys) whose matching sections answer the
question; documents of every other type are read whole. Since a section includes its subsections, a
matching section inside another matching one is not named again, and a reference document whose
matching sections include a top-level section (for example `(document)`) is read whole.

```text
mode: hybrid

guide — Guide (reference, current)
  How to install and configure the widget.
  read when: installing the widget; pointing it at a local model
  sections:
    Install  [guide/install, line 10]
      Install the widget with pnpm.
    Configure  [guide/configure, line 14]
      Point the embedding endpoint at a local model.

faq — FAQ (hub, current)
  sections:
    (document)  [faq, line 8]
      Ask anything.

read all: nevo-specflow docs get --content guide#guide/install guide#guide/configure faq
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
        {
          "headingPath": ["Guide", "Install"],
          "sectionId": "guide/install",
          "line": 10,
          "score": 0.0325,
          "snippet": "Install the widget with pnpm."
        },
        {
          "headingPath": ["Guide", "Configure"],
          "sectionId": "guide/configure",
          "line": 14,
          "score": 0.0159,
          "snippet": "Point the embedding endpoint at a local model."
        }
      ]
    }
  ]
}
```

JSON output, lexical with `--no-snippets`:

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
          "sectionId": "guide/install",
          "line": 10,
          "score": 1.38
        }
      ]
    }
  ]
}
```

`scope`, `areas`, `tags`, `summary` and `readWhen` are present only when the frontmatter has a
non-empty value; `snippet` is left out with `--no-snippets`. A document's `score` is its fused rank
score; a section's `score` is BM25 in lexical mode and the section-level reciprocal-rank-fusion
score in hybrid mode. Scores only order the results of one search: they are not a confidence or a
probability, do not compare across searches, and a high score does not mean the document answers
the question (a search always returns its best candidates, also when none is relevant).

## `semantic status` and `semantic index`

`semantic status` reports whether semantic search is enabled, the configured endpoint (never a key),
a connectivity probe (latency and observed dimensions; with the query timeout, so an endpoint that
does not answer is reported unreachable within 3000 ms; not sent while `docs.search.semantic` is
off, when the report has no reachability line), the index (`missing`, `current`, `stale`
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
only the rest. It always probes the endpoint first (the endpoint may have changed its dimension
under the same model name), so with the endpoint down it fails even for an index that is otherwise
current. It succeeds (exit 0, the result on stdout) only when the index is up to date afterwards:
`Index current …`, `Index refreshed …` or `Index rebuilt …`. Otherwise it exits 1 with the reason on
stderr and nothing on stdout: `Index not built (<code>): <message>` when nothing was attempted
(semantic search not enabled, no endpoint, unset key variable, an index directory that must not be
written) and `Index not updated (<code>): <message>` when the update failed (endpoint failure,
index not writable or unreadable, another process writing the index, which reads
`index-building: Another process is updating the index: …`), so
`nevo-specflow docs semantic index && …` runs the next step only after a successful build.

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

| Code | Meaning                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success (also `--help`); `search` in either mode; `semantic status` while semantic search is off, available or only needs its index built; `semantic index` that leaves the index current.                 |
| 1    | The corpus or the configuration is invalid, `check` found a problem or a stale index, `semantic status` found enabled semantic search unavailable, or `semantic index` did not bring the index up to date. |
| 2    | Usage error: bad arguments or options, an unknown or inactive id for `get`.                                                                                                                                |

Results go to stdout; problems and error messages go to stderr. An unavailable embedding endpoint or
index never makes `search` exit non-zero: it answers lexically with the reason.
