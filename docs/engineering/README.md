---
id: docs.engineering-readme
type: hub
title: Engineering documentation
status: current
summary: >
  Entry point for shared implementation guidance, repository engineering, CLI,
  and future Runtime, UI, AI, and workflow engineering rules.
---

# Engineering documentation

Implementation guidance for contributors and coding agents working on Nevo SpecFlow.

- [Shared engineering](shared/) — code organization, effects/I/O, async lifecycle, and testing.
- [Repository engineering](repository/) — local setup, Git/PR workflow, CI, release, packaging,
  dogfooding, dependencies, and security.
- [CLI engineering](cli/) — Commander shell/adapter architecture and CLI-specific testing.

Product behavior belongs under [`../product/`](../product/). Durable system invariants belong
under [`../architecture/`](../architecture/). Reusable UI guidance belongs under
[`../design-system/`](../design-system/).
