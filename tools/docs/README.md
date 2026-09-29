# `nevo-repo-docs` (`nevo-docs`)

Repository-internal documentation discovery. Private, never published, not the
`nevo-specflow` product CLI (ADR 0005).

It reads the structured frontmatter on every `docs/**/*.md` file and answers
"which document should I read for this task?" deterministically — no product
knowledge is baked into the code.

## Commands

Run from the repository root:

```bash
pnpm docs:list                         # every indexed document (all statuses)
pnpm docs:find git react testing       # every doc matching any term; ranked deterministically
pnpm docs:get engineering.shared.testing # exact stable-id lookup
pnpm docs:context "react tailwind"     # every active match; deprecated/superseded excluded
pnpm docs:adr new "Use X for Y"        # create the next-numbered ADR as a draft
pnpm docs:check                        # validate the whole corpus + verify the index
pnpm docs:check --write                # also regenerate docs/index.generated.{md,json}
```

`find` uses lexical OR semantics across the supplied terms. With no `--limit`, it returns every
matching document; use `--scope`, `--area`, or `--tag` when a deterministic taxonomy filter is
useful. `get` is not search: it resolves exact stable IDs in caller-provided order and fails if
any ID is unknown.

`context` feeds an AI agent, so it never recommends a `deprecated` or `superseded`
document and, like `find`, returns every matching active document unless `--limit` is supplied.
`list` and `find` can expose historical statuses for inspection. `get` resolves exact active
stable IDs and fails closed for `deprecated` or `superseded` documents.

`adr new` writes the file at `status: draft` with `TODO:` placeholders and
regenerates the index. Fill the sections in, then set `status: current` when the
decision is adopted — `docs:check` rejects a `current` ADR that still has a TODO
placeholder summary. Titles are serialized through the YAML library, so `:`
/ `#` / quotes / accents in a title cannot corrupt the frontmatter; the slug is
still ASCII-only and deterministic.

Each command owns its own options (`nevo-docs find --help`, `nevo-docs adr new --help`):
`find` takes `--type` / `--status` / `--scope` / `--area` / `--tag` / `--limit` / `--json`;
`get` takes `--json`; `context` takes `--limit` / `--json`; `adr new` takes `--dry-run` /
`--json`; `check` takes `--write`.

`list` / `find` / `get` / `context` / `adr` load a **fully validated corpus** — if the docs are
inconsistent they fail loudly rather than serve partial context. `pnpm docs:check` is
what CI runs; it exits non-zero on any authored file missing frontmatter, invalid
frontmatter, an unresolved `related` id, an ADR whose filename and `id` disagree or
whose date is not ISO, a `current` ADR still carrying a generated `TODO` placeholder
**anywhere** (summary or body), or a stale index. The generated index carries no
timestamp, so `--write` twice with no source change leaves the tree clean.

## Architecture

TypeScript, `tsc` → `dist/`; the `nevo-docs` executable is `dist/bin.js`. Same layered
split as the other `tools/*` packages:

```
src/
  domain/     frontmatter contract · ADR authoring/validation · search · index build  (all pure)
  app/        load-corpus · find-documents · get-context · validate-documentation · create-adr
  infra/      doc-repository — the filesystem boundary (scan docs/, read/write index, write/remove ADR)
  cli/        thin Commander wiring; commands own their own options
  bin.ts      executable boundary — build deps, run the program, map errors to exit codes
```

The use cases run against a `DocRepository` port: `create-adr` (plan → validate in
memory → write → re-validate → roll the file back on failure → regenerate the index) is
driven by an in-memory repository in tests; a temp-dir test covers the real adapter.

## Frontmatter contract

```yaml
---
id: engineering.repository.git-workflow # stable concept id, unique across docs/
type: engineering # hub | architecture | adr | engineering | product | reference | instruction
title: Git workflow
status: current # current | draft | deprecated | superseded
scope: repo # optional: shared | repo | specflow | nevo-ui
areas: # optional controlled major concerns from ADR 0007
  - release
tags: # optional, extensible, lowercase kebab-case vocabulary
  - git
  - github
read_when: # non-empty for non-hub guidance/reference docs
  - creating a branch
  - preparing a pull request
summary: >
  One or two sentences describing what the document covers.
related: # optional; each id must resolve
  - engineering.repository.commit-conventions
---
```

An authored `docs/**/*.md` file with **no** frontmatter block is a `docs:check`
failure — it must not silently disappear from discovery. Only two things are exempt:
`docs/templates/**` (copy-me starters) and `*.generated.*` (owned by the generator).
