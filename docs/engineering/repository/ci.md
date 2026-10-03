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
  CodeQL, and the stable checks required by protected branches.
related:
  - engineering.repository.local-setup
  - engineering.repository.dependencies-and-security
  - architecture.repository-structure
---

# Continuous integration

## Workflows

- `ci.yml`: repository quality, affected typecheck/tests/build, Dependency Review on pull requests,
  and the packaged-product smoke matrix.
- `codeql.yml`: JavaScript/TypeScript CodeQL on pull requests, protected-branch pushes, and weekly.
- `pr-title.yml`: Conventional Commit PR-title validation.
- release workflows: see [releasing](releasing.md).

## Main CI jobs

`quality` runs the canonical repository gate and affected typecheck. Test planning resolves the
Turbo test graph into independent package jobs; `verify tests` is their stable aggregate status.
`build` runs affected builds.

On pull requests, Turbo compares the PR base/head and selects changed packages plus downstream
dependents. On pushes to `main` and `release/v*`, package tasks run across the full graph.

Repository-wide formatting, lint, docs/agent validation and version transition checks are not
affected-filtered.

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

## CodeQL

CodeQL uses no-build JavaScript/TypeScript analysis. The stable check name is `codeql`.
Pull-request-triggered analysis uploads SARIF through GitHub's supported pull-request path for
same-repository, fork and Dependabot pull requests; the workflow does not use
`pull_request_target`. Protected-branch rulesets also require CodeQL code-scanning results and
block generic errors or security alerts at high severity or above.

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

Changing any of those intentionally invalidates package build/test/typecheck caches. Prettier,
EditorConfig and ESLint configuration affect repository-wide checks outside Turbo and therefore are
not global package-task inputs.

## Local reproduction

```bash
pnpm check
pnpm check:quality
pnpm exec turbo run build test typecheck --affected --dry
pnpm --filter @nevo/specflow test:packaged
```
