---
id: docs.product-specflow-cli-readme
type: hub
title: CLI product documentation
status: current
summary: >
  The nevo-spec command-line product — who uses it and how it should behave. Node CLI
  implementation guidance is under development/cli/.
---

# CLI product (`nevo-spec`)

Product behavior of the `nevo-spec` command-line tool. How Node CLIs are _built_ is in
[`../../../engineering/cli/`](../../../engineering/cli/).

| Doc                                          | Covers                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Public CLI contract](../../../reference/cli/nevo-spec-contract.md) | The commands that actually exist today (`--help`, `--version`, `dashboard`) and what is explicitly not implemented yet. |
| [Personas](personas.md)                      | Who runs `nevo-spec` and what they need from it.                                                                        |
| [Interaction model](interaction-model.md)    | Command shape, output contract, human vs. agent vs. CI use.                                                             |

`@nevo/specflow` is packaged and installed as a single artifact — see
[product packaging](../../../engineering/repository/product-packaging.md) and
[dogfooding](../../../engineering/repository/dogfooding.md).
