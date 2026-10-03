---
id: docs.architecture-decisions-readme
type: hub
title: Architecture Decision Records
status: current
summary: >
  Index of ADRs. Each ADR captures one durable, cross-cutting decision, its context,
  and its consequences.
---

# Architecture Decision Records

An ADR records a decision that is durable and cross-cutting. Routine local choices do not get
an ADR. Use [`../../templates/adr-template.md`](../../templates/adr-template.md).

- [0001 — Record architecture decisions](0001-record-architecture-decisions.md)
- [0002 — Toolchain selection](0002-toolchain-selection.md) — superseded by [0010](0010-toolchain-policy-and-version-sources.md)
- [0003 — Branch and release model](0003-branch-and-release-model.md)
- [0004 — MIT license](0004-mit-license.md)
- [0005 — Repository tooling is separate from the product API](0005-repository-tooling-is-separate-from-the-product-api.md)
- [0006 — The product ships as a single bundled artifact](0006-product-ships-as-a-single-bundled-artifact.md) — superseded by [0011](0011-product-artifact-packaging-and-pnpm-compatibility.md)
- [0007 — Documentation architecture and taxonomy](0007-documentation-architecture-and-taxonomy.md) — draft
- [0008 — Product naming and surfaces](0008-product-naming-and-surfaces.md)
- [0009 — Product package build model](0009-product-package-build-model.md)
- [0010 — Toolchain policy and version sources](0010-toolchain-policy-and-version-sources.md)
- [0011 — Product artifact packaging and pnpm compatibility](0011-product-artifact-packaging-and-pnpm-compatibility.md)
- [0012 — Product package topology and dependency direction](0012-product-package-topology-and-dependency-direction.md)
