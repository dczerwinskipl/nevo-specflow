---
id: adr.0011-product-artifact-packaging-and-pnpm-compatibility
type: adr
title: Product artifact packaging and pnpm compatibility
status: current
date: 2026-10-03
supersedes: adr.0006-product-ships-as-a-single-bundled-artifact
summary: >
  Nevo SpecFlow keeps pnpm 10 while GitHub's documented Dependabot support stops at pnpm 10
  and Dependency Graph still has an open multi-document-lockfile parsing gap, while keeping
  only the package-owned custom logic needed to build the self-contained product artifact
  and delegating archive creation to pnpm pack.
related:
  - adr.0006-product-ships-as-a-single-bundled-artifact
  - adr.0010-toolchain-policy-and-version-sources
  - engineering.repository.product-packaging
  - engineering.repository.dependencies-and-security
---

# 0011 — Product artifact packaging and pnpm compatibility

## Status

Current. Supersedes [ADR 0006](0006-product-ships-as-a-single-bundled-artifact.md).

## Context

Nevo SpecFlow ships as one installable tarball whose runtime does not depend on the source
workspace or on separately published internal packages. The source repository still uses real
workspace boundaries such as `@nevo/specflow-runtime`.

Modern pnpm releases have improved workspace-aware packing, so the previous standalone
`nevo-repo-product` workspace was reviewed rather than retained by inertia.

Dependabot's pnpm 11 updater work in
[dependabot/dependabot-core#14794](https://github.com/dependabot/dependabot-core/issues/14794)
was closed as completed, but that is not sufficient evidence for this repository to upgrade.
GitHub's published Dependabot support matrix still lists pnpm only through v10. Separately,
[dependabot/dependabot-core#15904](https://github.com/dependabot/dependabot-core/issues/15904)
remains open for Dependency Graph parsing of pnpm's multi-document lockfile shape. That failure mode
is especially dangerous because the first document can be parsed successfully while omitting the
project dependency graph, causing dependency/security visibility to fail green.

A package-manager upgrade that depends on an officially unsupported major or can make dependency
visibility incomplete is not an acceptable trade for simpler packaging.

The remaining packaging responsibilities are not all archive-format concerns. Nevo must still
produce one self-contained executable bundle, inject the release-model version, derive third-party
notices from code actually embedded in that bundle, and prove the installed artifact in isolation.

## Decision

- Keep the repository on the pnpm 10 line until GitHub Dependabot and Dependency Graph reliably
  support the lockfile format produced by the pnpm major we intend to adopt.
- Remove the standalone `tools/product` / `nevo-repo-product` workspace.
- Make product-artifact build logic owned by `packages/specflow/packaging/`, next to the package whose
  artifact it creates.
- Use standard `pnpm pack` for the final tarball/archive operation.
- Keep custom package-owned logic only for responsibilities that `pnpm pack` does not satisfy for
  the current distribution contract:
  - bundle the public CLI, internal workspace capabilities, and runtime third-party dependencies
    into one executable ESM file;
  - inject the canonical version resolved from the release model;
  - create a minimal install manifest with no workspace/runtime dependency leakage;
  - generate `THIRD_PARTY_NOTICES.txt` from the actual CLI/Runtime bundle inputs plus the
    production dependency closure of embedded browser UI assets, and fail closed when license
    information is unavailable;
  - support fresh-state, isolated-install, dogfood, and release-artifact verification.
- Do not duplicate pnpm's archive implementation or create another repository-level packaging
  framework.

## Revisit trigger

Revisit both the pnpm major and the remaining custom packaging logic when all of the following are
true:

1. GitHub's published Dependabot support matrix explicitly includes the target pnpm major.
2. GitHub Dependency Graph can correctly consume the lockfile shape produced by that major,
   including multi-document lockfiles; in particular, the failure tracked by
   `dependabot/dependabot-core#15904` is resolved or an equivalent real-repository verification
   proves the graph is complete.
3. On this repository, GitHub Dependency Graph reports the real dependency set after regenerating
   the target pnpm lockfile.
4. Dependabot version and security updates can update that lockfile correctly in a real pull request.
5. The target pnpm `pack` behavior can preserve the Nevo artifact contract without unpublished
   workspace dependencies or registry requirements.

At that point, prefer deleting package-owned custom packaging code that has become redundant rather
than preserving compatibility layers.

## Consequences

- Supply-chain visibility remains correct today instead of being traded for a newer package-manager
  major.
- Packaging ownership is simpler: there is no repository tool whose only consumer is the product
  package.
- The project still carries a small amount of custom product build logic, but each retained part has
  a product-specific responsibility and regression coverage.
- A future pnpm upgrade has an objective acceptance test rather than a date-based reminder.
