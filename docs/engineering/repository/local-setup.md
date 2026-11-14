---
id: engineering.repository.local-setup
type: engineering
title: Local setup
status: current
read_when:
  - setting up the development environment
  - running standard repository commands
  - understanding Turborepo inputs
  - running a local embedding model for semantic documentation search
summary: >
  Node/Corepack/pnpm prerequisites, standard root commands, the optional local embedding model for
  semantic documentation search, and the repository task graph.
related:
  - reference.configuration.documentation-and-embeddings
  - engineering.repository.ci
  - engineering.repository.git-workflow
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
---

# Local setup

## Prerequisites

| Tool     | Version                                | Notes                                               |
| -------- | -------------------------------------- | --------------------------------------------------- |
| Node.js  | `.nvmrc` / root `engines.node`         | One supported runtime line for contributors and CI. |
| Corepack | current enough to activate pinned pnpm | Do not maintain a separate global pnpm version.     |
| pnpm     | root `packageManager`                  | Deliberately remains on pnpm 10; see ADR 0011.      |
| Git      | recent                                 | Required by repository/product flows.               |

```bash
corepack enable
node -v
pnpm -v
pnpm install --frozen-lockfile
```

## Standard commands

| Command                             | Purpose                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm check`                        | Canonical pre-push gate: quality, typecheck, build and tests.                         |
| `pnpm check:quality`                | Read-only formatting check, lint, docs/agent validation and version transition gate.  |
| `pnpm build` / `test` / `typecheck` | Run package tasks through Turbo.                                                      |
| `pnpm lint`                         | Per-package ESLint through Turbo (cached) plus the root lint and lint-coverage check. |
| `pnpm lint:root`                    | Only the files outside packages and the lint-coverage check.                          |
| `pnpm format`                       | Write formatting fixes.                                                               |
| `pnpm docs:check`                   | Validate docs and generated index.                                                    |
| `pnpm docs:search "<question>"`     | Search the docs in natural language (hybrid with a local model, otherwise lexical).   |
| `pnpm product:pack`                 | Create the installable product tarball.                                               |
| `pnpm dogfood:install`              | Install and smoke the real tarball globally.                                          |
| `pnpm storybook:browsers:install`   | Install local Chromium used by Storybook browser tests.                               |

Lint runs per package, so you rarely need the whole repository:

```bash
pnpm --filter @nevo/specflow-ui lint                # one package (needs its dependencies built)
pnpm turbo run lint --filter=...[origin/main]       # only packages changed since main + dependents
```

`pnpm lint` builds the declarations typed linting needs (`^build`) and caches each package, so a
repeated run replays unchanged packages. No run needs a raised Node heap; do not add
`--max-old-space-size`.

`format:check` is intentionally read-only. A check command must never repair the working tree.

## Semantic documentation search

The `pnpm docs:*` scripts run the product `nevo-specflow docs` command over this repository (its
`.nevo/config.yaml` and `docs/docs.yaml`). `pnpm docs:search` always works:
without an embedding endpoint it answers lexically and says so (`mode: lexical`, reason
`no-endpoint`). The committed configuration opts the project in (`docs.search.semantic: true`);
the endpoint is a workstation choice. To get hybrid results, run the embedding model from the root `compose.yaml` (Ollama on `127.0.0.1:11434`, a
persistent `ollama` volume and a one-shot pull of `qwen3-embedding:0.6b`; it runs on CPU):

```bash
docker compose up -d   # the first run downloads the image and the model
```

Then add the endpoint to the git-ignored `.nevo/local/config.yaml` (create the file if needed):

```yaml
ai:
  embeddings:
    baseUrl: http://127.0.0.1:11434/v1
    model: qwen3-embedding:0.6b
```

Without a local endpoint, `pnpm docs:semantic status` exits 1 (semantic search is enabled but
unavailable) while `pnpm docs:search` keeps answering lexically; that is expected.

Check it, then search:

```bash
pnpm docs:semantic status   # endpoint reachable; exits 1 while it is not
pnpm docs:search "how are document commits owned by the engine"
```

There is no separate build step. The first search answers lexically at once (`index-building`)
and starts `pnpm docs:semantic index` in the background (a detached `node
tools/docs/dist/bin.js semantic index`, without a console window); it embeds the whole corpus into
`.nevo/local/cache/docs-index/` (disposable; delete it to rebuild). On CPU this is slow for a corpus
of this size (about 20 minutes for about 2100 chunks on an 8-core CPU). Watch it with:

```bash
pnpm docs:semantic status   # updating in background: 384/2130 chunks (since …, process …)
```

Its output goes to `.nevo/local/cache/docs-index/catch-up.log`. It writes every slice it embeds, so
an interrupted run resumes where it stopped; a search after that starts it again. Searches re-embed
up to 16 changed sections themselves; after a larger edit they answer lexically and catch the index
up in the background the same way, and they are hybrid again once it is current. Run
`pnpm docs:semantic index` yourself only to build in the foreground (progress on stderr; it exits 1
when the index is not up to date afterwards, for example while the endpoint is down).
`docker compose down` stops the model and keeps the
volume. Keys and their validation:
[documentation and embeddings configuration](../../reference/configuration/documentation-and-embeddings.md).

To measure search quality after changing chunking, ranking or the documents, run
`pnpm docs:eval` against the current index (`pnpm docs:semantic index` first). It searches every
question of `tools/docs/eval/questions.yaml` like `pnpm docs:search`, embeds nothing, and reports
Recall@5, Recall@10, MRR and the proposals in the top 10. It is a manual check,
not part of CI; see [`tools/docs`](../../../tools/docs/README.md#retrieval-eval).

## Running slow tests on Linux

Real-Git integration tests (Engine, Runtime HTTP, CLI) spawn many Git processes and create many
small files. On Windows (process start, antivirus scanning, NTFS) a single test file can take
minutes; on Linux the same file takes seconds. Run them on Linux through Docker:

```bash
tools/dev/linux-test.sh -- 'pnpm turbo run build --filter=@nevo/specflow-engine^... \
  && cd packages/specflow-engine && npx vitest run test/create/create-commit.test.ts --testTimeout=240000'
```

The script clones the **committed** state of the current branch inside the container (not a
bind mount, so it uses the container's own filesystem), installs the pinned pnpm and runs the
command. Uncommitted changes are not included, so commit first. Options: `--ref <branch>`,
`--memory <size>` (default `10g`), `--cpus <n>` (default `6`), `--image <name>` (default
`node:24-bookworm`). Docker Desktop (or any Docker engine) is required; run it from Git Bash on
Windows.

Use the host for fast unit tests and the test you are iterating on; use Linux for real-Git files,
whole package suites and final verification, which is also closer to CI. A failure seen only on
Windows (for example a symlink privilege error) is an environment limit: confirm on Linux.

## Turborepo

Package dependencies and task prerequisites live in `turbo.json` plus package-local overrides.
Pull-request CI uses `--affected`; protected-branch pushes run all package tasks.

Global package-task invalidation includes `tsconfig.base.json`, both product-package tsconfig
profiles, and `tools/build-package.mjs`. The lockfile and root package manifest are hashed by Turbo
automatically.

```bash
pnpm exec turbo ls
pnpm exec turbo run build test typecheck --affected --dry
```
