---
id: reference.cli.nevo-specflow-docs
type: reference
title: nevo-specflow docs commands
status: current
scope: specflow
areas: [cli, docs, configuration]
read_when:
  - using nevo-specflow docs list, find, get, context or check
  - configuring the documentation root, taxonomy or non-authoritative paths of a project
  - checking the output or exit codes of documentation discovery
summary: >
  The deterministic documentation commands of nevo-specflow docs (list, find, get, context, check),
  the docs configuration keys they read, their output and their exit codes.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0007-documentation-architecture-and-taxonomy
  - reference.cli.nevo-specflow-contract
  - architecture.runtime.configuration
---

# `nevo-specflow docs` commands

`nevo-specflow docs` is the documentation capability (`@nevo/specflow-docs`,
[ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)).
It is an ordinary command: it does not start Runtime, need a running Runtime or load UI assets. It
runs in a Git repository and reads the documents under the project's documentation root.

```bash
nevo-specflow docs list [--type <type>] [--status <status>] [--json]
nevo-specflow docs find <query...> [--type] [--status] [--scope] [--area] [--tag] [--limit <n>] [--json]
nevo-specflow docs get <id...> [--json]
nevo-specflow docs context <query...> [--limit <n>] [--json]
nevo-specflow docs check [--write]
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
  not block regeneration. The index is deterministic, so writing it twice changes nothing.

With `--json`, stdout holds one JSON document and nothing else. A `list` or `find` result carries
the document's frontmatter, `file` and `body` (and, for `find`, `score`, `matchedTerms` and
`matchedFields`); a `get` or `context` entry carries `id`, `file`, `title`, `status`, `summary`,
`read_when`, `scope` (when set), `areas` and `tags`.

## Configuration

The commands work without `.nevo/config.yaml` and without `.nevo/local/config.yaml`. When the
project file exists, only its `docs` namespace is read and validated; other namespaces are not.
`docs` is project-owned: a `docs` section in `.nevo/local/config.yaml` is rejected.

```yaml
docs:
  root: docs # documentation root, relative to the project root
  taxonomy:
    scopes: [shared, specflow] # allowed `scope` values
    areas: [cli, docs, testing] # allowed `areas` values
  nonAuthoritative: [ideas/] # path prefixes under `root` that `context` never returns
```

| Key                     | Meaning                                                                   | Default      |
| ----------------------- | ------------------------------------------------------------------------- | ------------ |
| `docs.root`             | Relative directory with `/` separators; no `.` or `..` segments           | `docs`       |
| `docs.taxonomy.scopes`  | Non-empty list of distinct values; any other `scope` is a `check` problem | unrestricted |
| `docs.taxonomy.areas`   | Non-empty list of distinct values; any other area is a `check` problem    | unrestricted |
| `docs.nonAuthoritative` | Directory prefixes relative to `docs.root` (a trailing `/` is optional)   | none         |

An unknown key under `docs` or `docs.taxonomy` is an error. Document types, required fields and
statuses are the product frontmatter contract and are not configurable.

## Exit codes

| Code | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| 0    | Success (also `--help`).                                                                 |
| 1    | The corpus or the configuration is invalid, or `check` found a problem or a stale index. |
| 2    | Usage error: bad arguments or options, an unknown or inactive id for `get`.              |

Results go to stdout; problems and error messages go to stderr.
