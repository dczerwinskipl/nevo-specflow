---
id: reference.cli.nevo-specflow-contract
type: reference
title: nevo-specflow public CLI contract
status: current
read_when:
  - checking which nevo-specflow commands actually exist today
  - describing the product CLI to a user or in product copy
  - planning a new nevo-specflow command
summary: >
  The currently-implemented public surface of the nevo-specflow CLI — --help, --version and
  the runtime bootstrap command — and an explicit statement that no other command
  (init, status, workflow, install, update) exists yet.
related:
  - docs.product-specflow-cli-readme
  - engineering.cli.architecture
  - engineering.repository.product-packaging
---

# `nevo-specflow` public CLI contract

|                |                  |
| -------------- | ---------------- |
| **Product**    | Nevo SpecFlow    |
| **Package**    | `@nevo/specflow` |
| **CLI**        | `nevo-specflow`  |
| **Repository** | `nevo-specflow`  |

## Implemented today

```bash
nevo-specflow --help        # usage and the command list; exit 0
nevo-specflow --version     # the installed product version, carried in the artifact; exit 0
nevo-specflow start         # Runtime bootstrap proof (see below); exit 0
```

- `--version` prints the version baked into the installed build (from the repository's
  release model). It does not depend on any file outside the installed package.
- An unknown command or bad usage exits non-zero with usage on stderr.
- `start` is defined by the Runtime vertical (`@nevo/specflow-runtime/cli`) and
  composed into the shell. It currently **only routes into that vertical's capability
  and prints a deterministic marker** (`Nevo SpecFlow runtime bootstrap is available.`).
  It does **not** start the real Runtime or UI — those are not migrated
  yet.

## Not implemented

`init`, `status`, `workflow`, `install`, `update` and any other command are **not**
present — not in `--help`, not as hidden commands. They are future direction only.
Product copy and docs must not describe them as available.

## Stability

Pre-1.0: the surface above can still change, but changes are intentional, marked, and
documented (see [pre-1.0 policy](../../architecture/repository-structure.md#0x-policy)).
The output contract (clean stdout, diagnostics on stderr, `0` / non-zero exit) follows
[CLI architecture](../../engineering/cli/architecture.md).
