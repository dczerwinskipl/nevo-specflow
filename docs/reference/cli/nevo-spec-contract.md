---
id: reference.cli.nevo-spec-contract
type: reference
title: nevo-spec public CLI contract
status: draft
read_when:
  - checking which nevo-spec commands actually exist today
  - describing the product CLI to a user or in product copy
  - planning a new nevo-spec command
summary: >
  The currently-implemented public surface of the nevo-spec CLI — --help, --version and
  the dashboard bootstrap command — and an explicit statement that no other command
  (init, status, workflow, install, update) exists yet.
related:
  - docs.product-specflow-cli-readme
  - engineering.cli.node-tooling-guidelines
  - engineering.repository.product-packaging
---

# `nevo-spec` public CLI contract

|                |                  |
| -------------- | ---------------- |
| **Product**    | Nevo SpecFlow    |
| **Package**    | `@nevo/specflow` |
| **CLI**        | `nevo-spec`      |
| **Repository** | `nevo-specflow`  |

## Implemented today

```bash
nevo-spec --help        # usage and the command list; exit 0
nevo-spec --version     # the installed product version, carried in the artifact; exit 0
nevo-spec dashboard     # bootstrap proof (see below); exit 0
```

- `--version` prints the version baked into the installed build (from the repository's
  release model). It does not depend on any file outside the installed package.
- An unknown command or bad usage exits non-zero with usage on stderr.
- `dashboard` is defined by the dashboard vertical (`@nevo/specflow-dashboard/cli`) and
  composed into the shell. It currently **only routes into that vertical's capability
  and prints a deterministic marker** (`Nevo SpecFlow dashboard command is available.`).
  It does **not** start the dashboard server, UI, or runtime — those are not migrated
  yet.

## Not implemented

`init`, `status`, `workflow`, `install`, `update` and any other command are **not**
present — not in `--help`, not as hidden commands. They are future direction only.
Product copy and docs must not describe them as available.

## Stability

Pre-1.0: the surface above can still change, but changes are intentional, marked, and
documented (see [pre-1.0 policy](../../architecture/repository-structure.md#0x-policy)).
The output contract (clean stdout, diagnostics on stderr, `0` / non-zero exit) follows
[Node tooling guidelines §10](../../engineering/cli/node-tooling-guidelines.md).
