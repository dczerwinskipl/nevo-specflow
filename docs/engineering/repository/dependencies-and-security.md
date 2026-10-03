---
id: engineering.repository.dependencies-and-security
type: engineering
title: Dependencies and security
status: current
read_when:
  - reviewing a Dependabot pull request
  - reporting or triaging a vulnerability
  - deciding how to pin a GitHub Action
  - checking dependency-review or CodeQL policy
summary: >
  Dependency update, lockfile compatibility, dependency review, CodeQL, action pinning,
  vulnerability reporting, and repository security policy.
related:
  - engineering.repository.local-setup
  - engineering.repository.ci
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
---

# Dependencies and security

## Dependency versions

Package versions are exact: `pnpm-workspace.yaml` sets `savePrefix: ""`. Exact current versions
live in manifests and `pnpm-lock.yaml`; durable toolchain policy is in
[ADR 0010](../../architecture/decisions/0010-toolchain-policy-and-version-sources.md).

## Why the repository remains on pnpm 10

pnpm 11+ uses a multi-document lockfile shape that GitHub Dependabot/Dependency Graph does not yet
reliably consume. The upstream tracker is
[`dependabot/dependabot-core#14794`](https://github.com/dependabot/dependabot-core/issues/14794).
Keeping a newer package manager while GitHub reports an incomplete dependency tree would weaken
security automation, so the repository stays on pnpm 10.

The exact acceptance criteria for revisiting this and the product-packaging consequence are recorded
in [ADR 0011](../../architecture/decisions/0011-product-artifact-packaging-and-pnpm-compatibility.md).

`.gitattributes` marks the lockfile as generated for display purposes but keeps it diffable.
After a lockfile/toolchain change, verify that the file stays in the supported shape and that
GitHub's dependency graph contains the real dependency set.

## Dependabot

[`.github/dependabot.yml`](../../../.github/dependabot.yml) runs weekly. npm minor/patch updates are
grouped, majors remain individual, and security updates remain independent. GitHub Actions updates
are grouped separately. `@types/node` major tracks the supported Node runtime major and is changed
only together with that runtime decision.

The `dependabot-pr-title` workflow only normalizes Dependabot's generated Conventional Commit
subject after the normal title check rejects it. It never checks out or executes PR content with a
write-capable token.

## Dependency Review

Pull requests run GitHub's official Dependency Review Action. A newly introduced dependency with a
known vulnerability of **moderate severity or higher** fails the `dependency review` check.
This is deliberately a change-time gate; Dependabot alerts/security updates continue to cover
vulnerabilities discovered after a dependency is already on the default branch.

## CodeQL

`.github/workflows/codeql.yml` analyzes JavaScript/TypeScript on pull requests, pushes to protected
branches, and weekly. It uses CodeQL's no-build mode and the stable `codeql` check name. GitHub
reduces `GITHUB_TOKEN` write permissions for fork and Dependabot pull requests, so those runs keep
the analysis/check but set CodeQL upload to `never`; trusted same-repository/push runs upload SARIF.
The workflow never switches to `pull_request_target` to regain write access to untrusted PR code.

## GitHub Action pinning

Every third-party `uses:` reference is pinned to a full commit SHA. Dependabot keeps those pins
current. The current list is in
[`.github/workflows/README.md`](../../../.github/workflows/README.md).

## Vulnerability reports

Use private vulnerability reporting through the repository Security tab; see
[`SECURITY.md`](../../../SECURITY.md). Do not open a public issue.

## Repository security features

The repository uses Dependabot alerts/security updates, secret scanning with push protection,
private vulnerability reporting, Dependency Review, and CodeQL. Repository/plan-level features
should be re-verified after governance changes rather than assumed from documentation.
