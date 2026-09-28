---
id: docs.product-specflow-cli-readme
type: hub
title: CLI product documentation
status: current
summary: >
  The nevo-specflow command-line product — who uses it and how it should behave. Node CLI
  implementation guidance is under engineering/cli/.
---

# CLI product (`nevo-specflow`)

Product behavior of the `nevo-specflow` command-line tool. How Node CLIs are built is in
[`../../../engineering/cli/`](../../../engineering/cli/).

- [Public CLI contract](../../../reference/cli/nevo-specflow-contract.md) — commands that exist today.
- [Personas](personas.md) — who runs `nevo-specflow` and what they need.
- [Interaction model](interaction-model.md) — command shape, output contract, and human/agent/CI use.

`@nevo/specflow` is packaged and installed as a single artifact. See
[product packaging](../../../engineering/repository/product-packaging.md) and
[dogfooding](../../../engineering/repository/dogfooding.md).
