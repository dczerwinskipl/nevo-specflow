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

| Command                             | Purpose                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm check`                        | Canonical pre-push gate: quality, typecheck, build and tests.                        |
| `pnpm check:quality`                | Read-only formatting check, lint, docs/agent validation and version transition gate. |
| `pnpm build` / `test` / `typecheck` | Run package tasks through Turbo.                                                     |
| `pnpm format`                       | Write formatting fixes.                                                              |
| `pnpm docs:check`                   | Validate docs and generated index.                                                   |
| `pnpm product:pack`                 | Create the installable product tarball.                                              |
| `pnpm dogfood:install`              | Install and smoke the real tarball globally.                                         |

`format:check` is intentionally read-only. A check command must never repair the working tree.

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
