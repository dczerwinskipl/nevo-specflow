# `nevo-repo-docs` (`nevo-docs`)

This repository's documentation commands. Private, never published, not the `nevo-specflow`
product CLI (ADR 0005).

Documentation discovery is a product capability
([ADR 0020](../../docs/architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)):
`@nevo/specflow-docs` owns the frontmatter contract, `list`, `find`, `get`, `context`, `check`,
`search`, `semantic` and the generated index. This package is a thin launcher that mounts the same
`createDocsCommand` adapter `nevo-specflow docs` mounts, with this repository as the project
(`.nevo/config.yaml` declares the taxonomy, `ideas/` as non-authoritative and `templates/` as
excluded). It adds only what is not product behavior:

- `adr new` — create the next-numbered ADR as a draft and regenerate the index;
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

## Layout

```
src/
  domain/adr.ts         ADR planning, rendering and the repository ADR rules (pure)
  app/create-adr.ts     plan → write → re-validate → roll back on failure → regenerate the index
  infra/adr-files.ts    list/write/remove files in the ADR directory
  cli/program.ts        createDocsCommand + repository rules + `adr`
  bin.ts                resolve the repository root, run the program, map errors to exit codes
```

Tests use a small temporary fixture project; none reads this repository's `docs/`. The index
currency check (`pnpm docs:check` in `check:quality`) covers the real corpus.
