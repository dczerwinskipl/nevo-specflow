---
id: engineering.repository.local-setup
type: engineering
title: Local setup
status: current
read_when:
  - setting up the development environment
  - running standard repository commands
  - understanding Turborepo inputs
summary: >
  Node/Corepack/pnpm prerequisites, standard root commands, and the repository task graph.
related:
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

## Running slow tests on Linux

Real-Git integration tests (Engine, Runtime HTTP, CLI) spawn many Git processes and create many
small files. On Windows (process start, antivirus scanning, NTFS) a single test file can take
minutes; on Linux the same file takes seconds. Run them on Linux through Docker:

```bash
tools/dev/linux-test.sh -- 'pnpm turbo run build --filter=@nevo/specflow-engine^... \
  && cd packages/specflow-engine && npx vitest run test/create-commit.test.ts --testTimeout=240000'
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
