---
id: adr.0010-toolchain-policy-and-version-sources
type: adr
title: Toolchain policy and version sources
status: current
date: 2026-10-03
summary: >
  Toolchain choices and upgrade constraints are durable architecture decisions, while exact
  installed versions are mutable dependency data owned by repository manifests, .nvmrc,
  workspace configuration, and the lockfile.
related:
  - adr.0002-toolchain-selection
  - adr.0009-product-package-build-model
  - architecture.repository-structure
  - engineering.repository.local-setup
  - engineering.repository.dependencies-and-security
---

# 0010 — Toolchain policy and version sources

## Status

Current.

## Context

ADR 0002 correctly established the repository toolchain and the reasons for deliberate version
constraints, but it also copied exact package versions into the ADR. Those values drift as normal
dependency upgrades land, creating a second authoritative-looking version registry beside
`package.json`, `.nvmrc`, workspace settings, package manifests, and `pnpm-lock.yaml`.

That is especially risky for coding agents: historical rationale and mutable dependency state need
different sources of truth.

## Decision

- ADRs record **toolchain choices, compatibility constraints, and upgrade policy**, not a mutable
  table of currently installed patch/minor versions.
- The canonical current Node contributor/runtime version is `.nvmrc`; the private workspace
  support range is `package.json#engines.node`.
- The canonical pnpm version is `package.json#packageManager`; the supported pnpm major range is
  `package.json#engines.pnpm` together with workspace pnpm settings.
- Exact TypeScript, ESLint, Prettier, Turborepo, Vitest, Commander, build-tool, and plugin versions
  are owned by the relevant package manifests and `pnpm-lock.yaml`.
- Node remains on the deliberately adopted LTS major until the repository explicitly moves to a
  new major. Product-package Node build targets are derived from `.nvmrc` so compiler/bundler
  output cannot silently lag the adopted runtime major.
- pnpm stays on a lockfile format that GitHub Dependency Graph and Dependabot can consume. Moving
  to a newer major requires verifying that integration first.
- TypeScript upgrades must stay inside the supported range of the repository's type-aware lint
  stack; the installed manifests express the current compatible versions.
- Dependency upgrades remain ordinary reviewed changes unless they alter one of these durable
  constraints, in which case this ADR is superseded by a new decision.

## Consequences

- Humans and agents have one place to read **why** the toolchain is constrained and separate
  machine-readable files for **what exact versions are installed now**.
- Routine dependency updates no longer make architecture documentation stale.
- Build tooling follows the adopted Node version automatically instead of carrying an independent
  hard-coded Node major.
- ADR 0002 remains available as the historical record of the original toolchain selection.
