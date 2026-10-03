---
id: adr.0009-product-package-build-model
type: adr
title: Product package build model
status: current
date: 2026-10-03
summary: >
  Product packages use extensionless TypeScript source imports and explicit neutral or
  Node package profiles. Reusable package JavaScript and declaration surfaces are bundled
  together with one tsdown-based library build, while repository tools keep raw NodeNext
  tsc output and the final nevo-specflow distribution remains governed by ADR 0011.
related:
  - adr.0010-toolchain-policy-and-version-sources
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
  - engineering.shared.code-organization
  - engineering.repository.product-packaging
---

# 0009 — Product package build model

## Status

Current.

## Context

Product code under `packages/**` uses extensionless relative TypeScript imports for normal
authoring ergonomics. TypeScript's `moduleResolution: Bundler` models that source style, but raw
`tsc` ESM output is not safe for native Node resolution and separately emitted declaration files
can preserve extensionless relative imports that fail for NodeNext consumers.

The repository also has both platform-neutral libraries consumed by Runtime/UI and Node-only
product packages. A package build must make that runtime boundary explicit and must not rely on
agents copying a long sequence of compiler and bundler flags correctly.

This decision is separate from [ADR 0011](0011-product-artifact-packaging-and-pnpm-compatibility.md),
which records how the final public `nevo-specflow` distribution is assembled.

## Decision

- **Product package source uses bundler resolution and extensionless relative imports.**
  Product packages extend one of the repository-owned package tsconfig profiles instead of
  reconstructing those compiler options locally.
- **Platform-neutral packages extend `tsconfig.package-neutral.json`.** They receive no Node
  ambient types and do not declare `engines.node`. A neutral package may opt into additional
  standard libraries such as DOM APIs explicitly in its own tsconfig when its public API requires
  them.
- **Node-only product packages extend `tsconfig.package-node.json`.** They explicitly receive
  Node ambient types and declare their supported Node runtime through `engines.node`.
- **The tsconfig package profile is the platform source of truth.** The builder resolves the
  direct `extends` target, rejects packages that bypass the repository profiles, and fails when
  profile and manifest metadata disagree. `engines.node` is an assertion for a Node profile,
  not a second platform-classification mechanism.
- **Reusable package output is built through one repository entrypoint,
  `tools/build-package.mjs`.** The entrypoint uses tsdown to bundle ESM JavaScript and bundled
  declaration files from the same source surface. Package dependencies remain external.
- **`package.json#exports` is the package build surface.** The generic builder derives source
  entries from each `exports.*.default/types` pair instead of maintaining a second manual list
  of entrypoints.
- **Every package build validates source and emitted surfaces.** All declared runtime/type export
  targets must exist, every runtime target must be importable, declaration output must not contain
  extensionless relative module specifiers, and a synthetic NodeNext consumer must typecheck the
  generated declaration surface. Neutral **production** source and output are also rejected if
  their TypeScript/JavaScript syntax imports Node builtin modules, including explicit `node:*`
  imports that `types: []` alone would not prevent. Co-located development artifacts with explicit
  `.test.`, Vitest-reserved `.spec.`, `.stories.`, or `.test-support.` naming are excluded from the source-platform scan
  because they are not package entrypoints or shipped output. The enforcement walks the TypeScript
  AST rather than matching source text, so comments cannot create false positives and
  type-only/dynamic imports in production source are covered.
- **The generic builder has fixture-based contract tests.** The tests cover a valid neutral package,
  neutral Node-builtin leakage (including type imports), exclusion of explicitly named co-located
  development artifacts from production-source validation, comment false positives, valid Node
  output, and profile/manifest mismatches so future packages inherit an executable contract rather
  than copied build folklore.
- **The Node package build target is derived from the repository `.nvmrc`.** Package
  `engines.node` remains the package compatibility assertion, while the adopted contributor/runtime
  major cannot drift from a separate hard-coded builder target.
- **`@nevo/specflow` distribution packaging remains separate.** ADR 0011 owns the final
  self-contained CLI artifact; its distribution-only build logic is package-owned under
  `packages/specflow/packaging/`.
- **Repository tooling under `tools/**` remains raw NodeNext `tsc` output** unless a later ADR
  deliberately changes the tooling build model.

## Consequences

- Extensionless source imports do not leak into runtime ESM or consumer declaration files.
- Neutral libraries cannot accidentally rely on Node globals or explicit Node builtin imports
  merely because the monorepo has `@types/node` installed.
- `@nevo/http-client`, `@nevo/authorization`, `@nevo/specflow-contracts`, and future reusable
  product libraries follow the same build contract instead of accumulating package-specific
  pipelines.
- Adding or changing a public package entry requires changing `package.json#exports`; the generic
  builder and surface validation fail if source/output metadata drift.
- Build-tool versions remain mutable dependency data in the root package manifest and lockfile;
  this ADR records the policy and boundaries, not a duplicated version table.
