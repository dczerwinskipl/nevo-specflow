---
id: engineering.repository.ci
type: engineering
title: Continuous integration
status: current
read_when:
  - understanding what CI runs on a pull request
  - a required check is failing or missing
  - reproducing a CI failure locally
  - changing CI or required checks
summary: >
  Repository quality, affected package execution, dependency review, cross-platform artifact smoke,
  CodeQL, Chromatic visual regression, and the stable checks required by protected branches.
related:
  - engineering.repository.local-setup
  - engineering.repository.dependencies-and-security
  - architecture.repository-structure
---

# Continuous integration

## Workflows

- `ci.yml`: repository quality, affected typecheck/tests/build, Dependency Review on pull requests,
  and the packaged-product smoke matrix.
- `windows-smoke.yml`: small Windows slice on pull requests that touch Create/persistence code
  (see [Windows smoke](#windows-smoke)).
- `chromatic.yml`: shared Storybook publishing and visual regression on demand, plus automatic baseline publishing on `main`.
- `codeql.yml`: JavaScript/TypeScript CodeQL on pull requests, protected-branch pushes, and weekly.
- `pr-title.yml`: Conventional Commit PR-title validation.
- release workflows: see [releasing](releasing.md).

## Main CI jobs

`quality` runs the canonical repository gate and affected typecheck. Test planning resolves the
Turbo test graph into independent package jobs; `verify tests` is their stable aggregate status.
`build` runs affected builds.

On pull requests, Turbo compares the PR base/head and selects changed packages plus downstream
dependents. On pushes to `main` and `release/v*`, package tasks run across the full graph.

Repository-wide formatting, docs/agent validation and version transition checks are not
affected-filtered.

Lint is a per-package Turbo task (`lint`, see [Lint](#lint)). The `quality` job runs it for every
package through `pnpm check:quality`, but each package result is cached by its inputs, so unchanged
packages replay from the restored Turbo cache instead of re-running ESLint.

## Lint

`pnpm lint` is `turbo run lint //#lint:root`:

- every workspace package (`packages/*`, `tools/*`, `examples/*`) has its own `eslint.config.mjs`
  and a `lint` script (`eslint .`). The config composes the shared base `eslint.base.mjs` and the
  reusable fragments in `tools/eslint/` (package direction rules, SpecFlow UI module ownership,
  i18n copy rule, React Hooks, Runtime ownership, test/story relaxations) and scopes typed linting
  to the package (`tsconfigRootDir`), so one run never builds a TypeScript program over other
  packages' sources and stays well inside the default Node heap;
- the `lint` task depends on `^build` (typed linting resolves workspace dependencies through their
  declarations or, for UI packages, source path mappings) and hashes the package files plus
  `eslint.base.mjs` and `tools/eslint/*.mjs`, so a shared rule change re-lints every package and a
  package change re-lints only that package and its dependents;
- `//#lint:root` (`pnpm lint:root`, not cached) lints the files that belong to no package (root
  config, `eslint.base.mjs`, repository scripts and `tools/eslint`) and runs
  `tools/eslint/check-coverage.mjs`, which fails when a tracked source file is not linted by
  exactly one config or a package lacks its config or `lint` script. Adding a package therefore
  requires an `eslint.config.mjs` and a `lint` script.

## Dependency Review

Pull requests run the official Dependency Review Action and fail when a newly introduced dependency
has a known vulnerability of moderate severity or higher. Its stable check name is
`dependency review`.

## Packaged product smoke

A dedicated matrix runs `packages/specflow/test/packaging.smoke.test.ts` on:

- Ubuntu;
- Windows;
- macOS.

It packages and installs the actual tarball outside the workspace and executes the installed CLI and
Runtime. `product smoke` is the aggregate required check. The full package test suite is not
duplicated across operating systems.

## Windows smoke

The full Windows suite (`engine-filesystem.yml`, shards of about 15 minutes) runs on `main`,
nightly and on pull requests labelled `ci:full-platform`. Ordinary pull requests otherwise never ran
Windows, so Windows-only breakage in Create (real Git, worktrees, file locks, path separators)
surfaced only after merge. The `windows smoke` check (`windows-smoke.yml`) closes that gap with a
small slice: it runs only the tests listed in `tools/ci-windows-smoke-tests.json` (the tests that
failed on `main` after the Create merge), with one worker, no file parallelism and a 120 s test
timeout, in a job limited to 10 minutes. Expected duration is 5 to 7 minutes including install and
build; the tests themselves take about 1 to 2 minutes when green.

- It runs on pull requests only when files that affect Create, its journal or Git/worktree handling
  change (engine `specs`, `git`, `version-control`, `project`, Runtime `features/specs`,
  `features/operations`, `server`, contracts `specs`/`operations`, the smoke tests and tooling, the
  workflow). UI-only and unrelated changes do not start a Windows runner.
- It does not run on push or nightly (the full suite does) and is not a required check. It can be
  started manually through **Actions → Windows smoke → Run workflow**.
- A failure lists every failing test name in the log and the job summary. A listed test whose title
  no longer exists fails the run instead of silently shrinking the slice.

Add a test by appending its exact `it(...)` title to an entry in `tools/ci-windows-smoke-tests.json`
(or a new entry with `package`, `dir`, `file`, `tests`), and add its source path to the workflow
`paths` if it is not covered. Keep the list small; broad coverage belongs to the full suite. Check
the path filter with `node tools/ci-windows-smoke-paths.mjs` (built-in cases: an engine Create
journal change triggers, a UI-only change does not) or pass files to see their result.

Run the same command locally on Windows:

```bash
pnpm exec turbo run build --filter=@nevo/specflow-runtime^...
node tools/ci-windows-smoke.mjs        # add --list to audit the list only
```

## CodeQL

CodeQL uses no-build JavaScript/TypeScript analysis. The stable check name is `codeql`.
Pull-request-triggered analysis uploads SARIF through GitHub's supported pull-request path for
same-repository, fork and Dependabot pull requests; the workflow does not use
`pull_request_target`. Protected `main` also requires native CodeQL code-scanning results and
blocks generic errors or security alerts at high severity or above. Release lines keep the stable
`codeql` status gate without the native code-scanning rule so their branch-creating push remains
possible.

## Visual regression with Chromatic

The `chromatic` workflow publishes the single shared Storybook owned by `tools/storybook/`. It
uses the version-pinned workspace CLI through `pnpm chromatic` and reads its credential only from
the `CHROMATIC_PROJECT_TOKEN` repository Actions secret. The secret value comes from the Chromatic
project's **Manage → Configure** page and must never be committed or added to a repository-local
environment file.

Pull requests do not publish Storybook automatically. Run **Actions → Chromatic → Run workflow**
for the PR branch when visual review is useful. Pushes to `main` always publish automatically so
the shared baseline stays current. Repeated manual runs on the same branch cancel the older run.

Visual snapshots are opt-in through the Storybook `visual` profile. Capture/tooling stories do not
consume snapshots. Chromatic runs with TurboSnap, so ordinary source changes re-test only visual
stories reachable from the changed dependency graph. Changes to shared UI/Product CSS, Storybook
configuration, or `pnpm-lock.yaml` deliberately disable the optimization and re-test every visual
baseline.

The workflow skips cleanly when the secret is unavailable. `chromatic` remains informational and
is not a protected-branch required check.

## Required checks

Protected `main` and `release/v*` use these stable required checks:

```text
pr-title
quality
dependency review
verify tests
build
product smoke
codeql
```

`pr-title` and `dependency review` are pull-request checks. The release tool separately verifies
the release-branch HEAD checks that exist on protected-branch pushes:

```text
quality
verify tests
build
product smoke
codeql
```

Repository policy is declared in `tools/github/repository-policy.json`.

## Cache invalidation

Turbo already hashes `pnpm-lock.yaml` and the root `package.json`. In addition,
`turbo.json#globalDependencies` contains all repository-wide package-build inputs:

- `tsconfig.base.json`;
- `tsconfig.package-neutral.json`;
- `tsconfig.package-node.json`;
- `tools/build-package.mjs`.

Changing any of those intentionally invalidates package build/test/typecheck caches. Prettier and
EditorConfig affect repository-wide checks outside Turbo and are not global package-task inputs.
ESLint configuration is an explicit input of the `lint` task only (`eslint.base.mjs`,
`tools/eslint/*.mjs` and each package's own `eslint.config.mjs`).

## Local reproduction

```bash
pnpm check
pnpm check:quality
pnpm lint
pnpm turbo run lint --filter=...[origin/main]
pnpm --filter @nevo/specflow-ui lint
pnpm exec turbo run build test typecheck --affected --dry
pnpm --filter @nevo/specflow test:packaged
```
