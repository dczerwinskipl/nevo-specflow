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
documentation-only `.nevo/config.yaml` and `docs/docs.yaml`). `pnpm docs:search` always works:
without an embedding endpoint it answers lexically and says so (`mode: lexical`, reason
`no-endpoint`). The committed configuration opts the project in (`docs.search.semantic: true`);
the endpoint is a workstation choice.

To get hybrid results, run an embedding model. `tools/docs-embeddings/compose.yaml` runs only that
model (Ollama on `127.0.0.1:11434` with a one-shot pull of `qwen3-embedding:0.6b` into the
`nevo-specflow_ollama` volume); Nevo SpecFlow itself does not run in Docker:

```bash
pnpm docs:embeddings:up         # CPU, works everywhere; the first run downloads the image and model
pnpm docs:embeddings:up --gpu   # NVIDIA GPU (Windows or Linux)
pnpm docs:embeddings:down       # stops the model and keeps the volume
pnpm docs:embeddings:status     # the containers and the models pulled into the volume
```

- CPU works on every machine with Docker; indexing this repository takes a while (below).
- `--gpu` reserves the NVIDIA GPUs (`compose.gpu.yaml`). It needs an NVIDIA GPU and Docker GPU
  support: Docker Desktop with the WSL 2 backend on Windows, the NVIDIA Container Toolkit on Linux.
  `up` with or without `--gpu` recreates the container in that mode; the model stays in the volume.
  `docker exec nevo-specflow-docs-embeddings-ollama-1 ollama ps` shows `100% GPU` after the first
  request.
- On a Mac, Docker cannot use the Apple GPU. The fast option is the native Ollama app (Metal):
  install it, run `ollama pull qwen3-embedding:0.6b` and use the same `baseUrl` and `model` below;
  the container is the CPU fallback. Run only one of the two, both listen on port 11434.
- The container sets `OLLAMA_KEEP_ALIVE=-1`, so the model stays loaded: reloading it can take
  longer than a search's 3 s query timeout, and the aborted request cancels the load. Set the same
  for the native Ollama app (on a Mac: `launchctl setenv OLLAMA_KEEP_ALIVE -1`, then restart the
  app).
- If the former root compose project (`nevo-specflow`) still runs, stop it first, because it holds
  port 11434:
  `docker compose -p nevo-specflow -f tools/docs-embeddings/compose.yaml down` (the old project
  name with the current service definitions; without `-v` it keeps the volume, which is reused as
  is).
- `up` returns once the server is healthy, not once the model is pulled; the first run downloads it
  in the background. `pnpm docs:embeddings:status` lists `qwen3-embedding:0.6b` once it is there
  (the pull's progress: `docker compose -f tools/docs-embeddings/compose.yaml logs ollama-pull`).
  With the endpoint configured (below), `pnpm docs:semantic status` reports `reachable: yes` once the
  model answers, and `reachable: no` with `model '…' not found` while the pull still runs.

Then add the endpoint to the git-ignored `.nevo/local/config.yaml` (create the file if needed):

```yaml
ai:
  embeddings:
    baseUrl: http://127.0.0.1:11434/v1
    model: qwen3-embedding:0.6b
```

Optionally, for this model only, add the query instruction and a relevance cutoff, so that a query
nothing in the documentation answers (a random string, a typo of nothing) returns no documents
found by meaning only. This is a local, model-specific choice measured on this repository (issue
#156), not a product default and not part of the committed configuration; it has to be measured
again for another model or instruction
([choosing a cutoff](../../reference/configuration/documentation-and-embeddings.md#relevance-cutoff-minsimilarity)):

```yaml
ai:
  embeddings:
    baseUrl: http://127.0.0.1:11434/v1
    model: qwen3-embedding:0.6b
    queryInstruction: "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: "
    minSimilarity: 0.36
```

Measured with `pnpm docs:eval --random 150` (60 answerable questions and terms, 178 without an
answer: 10 real questions and 168 nonsense strings, 150 of them generated), top 10:

| Setting                                     | Recall@10 | MRR   | Partial words R@10 | Correct questions MRR | Without an answer, with a vector-only result |
| ------------------------------------------- | --------- | ----- | ------------------ | --------------------- | -------------------------------------------- |
| no instruction, no floor                    | 0.753     | 0.592 | 0.400              | 0.717                 | 167 of 178                                   |
| earlier instruction (`Given a question, …`) | 0.850     | 0.625 | 0.650              | 0.708                 | 168 of 178                                   |
| earlier instruction, floor 0.52             | 0.825     | 0.635 | 0.550              | 0.736                 | 32 of 178                                    |
| instruction above, no floor                 | 0.925     | 0.707 | 0.900              | 0.740                 | 167 of 178                                   |
| **instruction above, floor 0.36**           | 0.875     | 0.708 | 0.600              | 0.757                 | 19 of 178 (no real question)                 |
| instruction above, floor 0.42               | 0.833     | 0.655 | 0.500              | 0.734                 | 0 of 178                                     |

The instruction above (the model's own retrieval task line, then a line break and `Query: `) ranks
best on its own; with it the similarity scale is about 0.1 lower than with the earlier one, so a
floor from another instruction does not apply. Floor 0.36 keeps correct questions and typos as
they are and removes nine in ten nonsense results; its cost is partial words: two of the ten lose every expected document, and from 0.38 on more of
them do. 0.42 removes every nonsense result but loses six questions, mostly partial words. Without
a floor, everything stays as before: every query gets results found by meaning.

These numbers are optimistic: the instruction and the floor were chosen on the same questions they
are reported on. The margin below 0.38 rests on only ten partial-word questions.

A held-out set written afterwards (`tools/docs/eval/questions-holdout.yaml`: 20 answerable, 5
without an answer, 150 nonsense strings of another seed) confirms the instruction (Recall@10 0.675
without it, 0.800 with it) and the floor's trade-off, with a larger cost for partial words: at 0.36
correct questions and typos keep their documents, nonsense with a vector-only result falls from 148
to 15 of 150, and two of eight partial words lose every expected document (Recall@10 0.800 to
0.775). 0.42 does worse there (six lost, three of them typos), so it is not a safe stricter
choice; 0.32 loses one partial word and leaves 41 of 150.

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
when the index is not up to date afterwards, for example while the endpoint is down). Keys and their validation:
[documentation and embeddings configuration](../../reference/configuration/documentation-and-embeddings.md).

To measure search quality after changing chunking, ranking or the documents, run
`pnpm docs:eval` against the current index (`pnpm docs:semantic index` first). It searches every
question of `tools/docs/eval/questions.yaml` like `pnpm docs:search`, embeds nothing, and reports
Recall@5, Recall@10, MRR per language and question class, the false positives of questions without
an answer and the proposals in the top 10; `--min-similarity`, `--query-instruction` and `--random`
calibrate a relevance cutoff. It is a manual check,
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
