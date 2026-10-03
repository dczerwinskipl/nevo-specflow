---
id: engineering.repository.ci
type: engineering
title: Continuous integration
status: current
read_when:
  - understanding what CI runs on a pull request
  - a required check is failing or missing
  - reproducing a CI failure locally
  - changing the CI workflow or required checks
summary: >
  What the CI workflows run, how affected-package execution is scoped on PRs, which
  checks are required to merge, and what invalidates the whole graph.
related:
  - engineering.repository.local-setup
  - architecture.repository-structure
  - engineering.repository.commit-conventions
---

# Continuous integration

Workflows under [`.github/workflows/`](../../../.github/workflows/):

| Workflow                                         | Trigger                                | Does                                                                                                                 |
| ------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pr-title`                                       | PR opened / edited / synchronized      | Validates the PR title against [Conventional Commits](commit-conventions.md) — `<type>(<scope>): …`, scope required. |
| `ci`                                             | PRs; pushes to `main` and `release/v*` | The quality gate, then typecheck / test / build.                                                                     |
| `chromatic`                                      | PRs; pushes to `main`                  | Publishes the shared Storybook and runs visual regression tests when its project token is available.                 |
| `CodeQL`                                         | PRs; protected-branch pushes; weekly   | Analyzes JavaScript and TypeScript for security vulnerabilities.                                                     |
| `cut-release-line`, `promote-release`, `release` | `workflow_dispatch`                    | See [releasing](releasing.md).                                                                                       |

## `ci` jobs

| Job            | Steps                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`      | `pnpm check:quality` (builds `tools/*`, then format, lint, `docs:check`, `version:check-transition`), `pnpm version:print`, an affected-graph dry-run, then `turbo run typecheck --affected`. |
| `plan tests`   | Resolves `turbo run test --affected --dry=json` into one independent test job per selected workspace.                                                                                         |
| `test (...)`   | Runs the selected workspace's `test` task. Product packages keep their package name; repository tools render as `tool/<name>` for readability.                                                |
| `verify tests` | Required aggregate status. It fails when test planning or any selected workspace test fails.                                                                                                  |
| `build`        | `turbo run build --affected`.                                                                                                                                                                 |

`check:quality` is the **same script contributors run** (`pnpm check` = `check:quality`

- the package graph), so local and CI cannot drift. Its steps run **repository-wide** —
  one Prettier config, one ESLint config, one doc corpus, one `version.json` — so package
  filtering has no meaning for them.

Typecheck, test and build are **package-scoped**:

- On a **pull request** they run with `--affected`, comparing
  `pull_request.base.sha`…`pull_request.head.sha`. Checkout uses `fetch-depth: 0` so
  the full history is present — a shallow clone would make every package look affected.
- On **`main` and `release/v*` pushes** they run over **all** packages (no `--affected`).
  Post-merge validation is deliberately more conservative than PR validation.

Affected execution includes a changed package and its **dependents**, because that comes
from declared workspace `dependencies` — not a hard-coded matrix. It does **not** select
a dependency's tests merely because one of its consumers changed. Task prerequisites may
still build through Turbo's `^build` edges.

For example, if `@nevo/specflow-runtime` declares a dependency on
`@nevo/http-client`, changing the HTTP client selects the client, Runtime, and any
further dependents for testing; changing Runtime does not select the HTTP client's tests.
The same rule applies to repository tools: `@nevo/specflow` declares
`nevo-repo-product` as a development dependency because its build invokes that tool, so
a product-tool change selects both workspaces while a SpecFlow change only requires the
tool's `build` prerequisite, not its tests.

The `quality` job prints `turbo run … --dry=text` so you can see exactly which
workspaces were selected and why.

Concretely, for the product graph:

| Change                                          | Affected `build` / `test`                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tools/release/**` only                         | `nevo-repo-release` — **not** the `@nevo/*` product packages.                               |
| `packages/specflow/**` (the CLI)                | `@nevo/specflow` (+ its build prerequisites `@nevo/specflow-runtime`, `nevo-repo-product`). |
| `packages/specflow-runtime/**` (the capability) | `@nevo/specflow-runtime` **and** its dependent `@nevo/specflow`.                            |

`quality:build-tools` stays scoped to `nevo-repo-agents` + `nevo-repo-docs` +
`nevo-repo-release` (what the quality gate itself needs). Product packaging never runs as an install/`prepare` script,
so it cannot reintroduce a repo-wide pre-build.

## Product packaging (not a CI job)

`pnpm product:pack` (→ `.artifacts/nevo-specflow-<version>.tgz`) and `pnpm dogfood:install`
are developer commands, not CI jobs — see [product packaging](product-packaging.md) and
[dogfooding](dogfooding.md). The packed artifact is proven in CI by
`packages/specflow/test/packaging.smoke.test.ts`, which runs inside the normal `test` job.

## Required checks

The branch rulesets (`protected-main`, `protected-release-lines`) require these exact
check names — kept stable even if the steps inside them change:

```text
pr-title
quality
verify tests
build
CodeQL
```

They are applied by
[`tools/github (nevo-repo-github)`](../../../tools/github/README.md). A job whose
`--affected` run selected nothing still exits 0 and reports its check green, so a PR is
never left permanently pending.

The `release` workflow separately re-checks that a release branch's HEAD has `quality` +
`verify tests` + `build` + `CodeQL` green (not `pr-title` — that only runs on PRs) before
it cuts a tag.

Concurrency: a new commit on a PR cancels the previous PR run; `main` / `release/v*`
runs always finish.

## Visual regression with Chromatic

The `chromatic` workflow publishes the single shared Storybook owned by
`tools/storybook/`. It uses the version-pinned workspace CLI through `pnpm chromatic`
and reads its credential only from the `CHROMATIC_PROJECT_TOKEN` repository Actions
secret. The secret value comes from the Chromatic project's **Manage → Configure** page
and must never be committed or added to a local environment file in the repository.

The workflow skips cleanly when the secret is unavailable, including on pull requests
from forks. The `chromatic` job is informational while the first baseline is being
established; add it to the branch ruleset only after that baseline has been reviewed and
the team wants visual approval to block merges.

## What invalidates everything

Turbo hashes `pnpm-lock.yaml` and root `package.json` automatically, plus every file in
`turbo.json#globalDependencies` — deliberately just `tsconfig.base.json`, which every
package's `tsconfig` extends. A lockfile bump or a base-tsconfig change rebuilds and
retests the whole graph. These repository-global inputs are the intentional exception to
changed-package + dependents selection.

Prettier / EditorConfig / ESLint config are **not** global inputs: they only change
the repo-wide `format` / `lint` results, which run outside Turbo, so changing them does
not invalidate unrelated package builds.

## Reproducing locally

```bash
pnpm check                                             # the full gate (= what CI runs)
pnpm check:quality                                     # just the repo-wide gate
pnpm exec turbo run build test typecheck --affected --dry   # what a PR would select
pnpm exec turbo run test --filter nevo-repo-release    # one internal tool
```
