# `nevo-repo-docs` (`nevo-docs`)

This repository's documentation commands. Private, never published, not the `nevo-specflow`
product CLI (ADR 0005).

Documentation discovery is a product capability
([ADR 0020](../../docs/architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)):
`@nevo/specflow-docs` owns the frontmatter contract, `list`, `find`, `get`, `context`, `check`,
`search`, `semantic` and the generated index. This package is a thin launcher that mounts the same
`createDocsCommand` adapter `nevo-specflow docs` mounts, with this repository as the project
(`docs/docs.yaml` declares the taxonomy, `ideas/` as non-authoritative and `templates/` as
excluded; `.nevo/config.yaml` holds only the semantic search opt-in). It adds only what is not product behavior:

- `adr new` — create the next-numbered ADR as a draft and regenerate the index;
- `eval` — the manual retrieval eval of `search` (see below);
- the repository's ADR rules, run by `check` (and every corpus read) through
  `corpusRules.validate`: filename/id agreement, ISO `date`, gap-free numbering, resolvable
  `supersedes`/`superseded_by`, and no generated `TODO` placeholder in a `current` ADR;
- hints that name the repository scripts (`pnpm docs:check --write`, `pnpm docs:get`).

## Commands

Run from the repository root. Each script builds only `@nevo/specflow-docs`, its dependencies and
this launcher (Turbo, cached; build output goes to stderr), never the bundled product or the UI.

```bash
pnpm docs:search "how are document commits owned by the engine"  # natural-language question
pnpm docs:find git react testing       # known terms; lexical OR, ranked deterministically
pnpm docs:get engineering.shared.testing # exact stable-id lookup
pnpm docs:context "react tailwind"     # active, authoritative matches only
pnpm docs:list                         # every indexed document (all statuses)
pnpm docs:check                        # validate corpus, links and ADR rules; verify the index
pnpm docs:check --write                # also regenerate docs/index.generated.{md,json}
pnpm docs:semantic status              # semantic search configuration and availability
pnpm docs:adr new "Use X for Y"        # create the next-numbered ADR as a draft
pnpm docs:eval                         # retrieval eval of search (manual; local index)
```

Options and output shapes are those of the product command:
[`nevo-specflow docs`](../../docs/reference/cli/nevo-specflow-docs.md). Configuration keys:
[documentation and embeddings configuration](../../docs/reference/configuration/documentation-and-embeddings.md).
Semantic search is a local opt-in; see
[local setup](../../docs/engineering/repository/local-setup.md#semantic-documentation-search).

`adr new` writes the file at `status: draft` with `TODO:` placeholders and regenerates the index.
Fill the sections in, then set `status: current` when the decision is adopted — `docs:check`
rejects a `current` ADR that still has a TODO placeholder. Titles are serialized through the YAML
library, so `:` / `#` / quotes / accents in a title cannot corrupt the frontmatter; the slug is
ASCII-only and deterministic. `--dry-run` prints the file and writes nothing; `--json` emits the
plan.

## Retrieval eval

`pnpm docs:eval` runs every question of [`eval/questions.yaml`](eval/questions.yaml) (25–30
realistic agent questions in English and Polish, each with the 1–3 document ids a good answer must
return) through the same `search` as `pnpm docs:search`, with this repository's configuration and
local index, the top 10 documents per question and no embedding (`--no-refresh`). It prints each
question's Recall@5, Recall@10, the rank of its first expected document and what is missing, then
the means: Recall@5, Recall@10, MRR (mean of 1 / rank of the first expected document in the top
10, 0 when none) and the number of non-authoritative documents in all top-10 lists (expected 0).
A question answered lexically is flagged; build the index first (`pnpm docs:semantic index`).
`--json` emits the full report, `--questions <file>` another set. It is a manual measurement for
chunking and ranking changes, not a CI check: results depend on the local embedding model.

## Layout

```
src/
  domain/adr.ts         ADR planning, rendering and the repository ADR rules (pure)
  app/create-adr.ts     plan → write → re-validate → roll back on failure → regenerate the index
  infra/adr-files.ts    list/write/remove files in the ADR directory
  domain/retrieval-metrics.ts  Recall@k, reciprocal rank and their means (pure)
  app/run-eval.ts       run the question set through `search` over the local index
  infra/eval-questions.ts  read and validate eval/questions.yaml
  cli/program.ts        createDocsCommand + repository rules + `adr` + `eval`
  bin.ts                resolve the repository root, run the program, map errors to exit codes
```

Tests use a small temporary fixture project; none reads this repository's `docs/`. The index
currency check (`pnpm docs:check` in `check:quality`) covers the real corpus.
