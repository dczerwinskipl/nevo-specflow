---
id: docs.engineering-cli-readme
type: hub
title: CLI engineering
status: current
summary: >
  CLI-specific engineering guidance for command composition, external contracts,
  and executable testing.
---

# CLI engineering

This area owns CLI-specific implementation guidance. Cross-cutting rules for code
organization, effects, async lifecycle, and testing live under
[`../shared/`](../shared/).

| Doc | Covers |
| --- | --- |
| [CLI architecture](architecture.md) | Commander, thin executable/handlers, command ownership, shell composition, stdout/stderr/exit contracts. |
| [CLI testing](testing.md) | In-process command tests and packaged/subprocess smoke tests. |

Product behavior of `nevo-specflow` lives under
[`../../product/specflow/cli/`](../../product/specflow/cli/).
