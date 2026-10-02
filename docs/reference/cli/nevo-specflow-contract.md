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
  The currently-implemented public surface of the nevo-specflow CLI — --help, --version,
  the Runtime server command, and the password-hash auth utility — plus the commands that
  do not exist yet.
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
nevo-specflow start                                      # start the configured Runtime HTTP server; exit 0 after shutdown
nevo-specflow auth hash-password --password-stdin         # hash one password line from stdin
```

- `--version` prints the version baked into the installed build (from the repository's
  release model). It does not depend on any file outside the installed package.
- An unknown command or bad usage exits non-zero with usage on stderr.
- `start` is defined by the Runtime vertical (`@nevo/specflow-runtime/cli`) and
  composed into the shell. It loads Runtime configuration, starts the Fastify HTTP server,
  reports the listening address, and owns graceful shutdown through the CLI process signal.
- `auth hash-password --password-stdin` is owned by the Runtime auth feature. It reads
  exactly one password line from stdin and prints a supported scrypt hash for the local
  Runtime configuration; the plaintext password is not accepted as a command argument.
- UI hosting and product capabilities beyond the current Runtime HTTP/auth foundation
  remain separate work.

## Not implemented

`init`, `status`, `workflow`, `install`, `update` and any other command are **not**
present — not in `--help`, not as hidden commands. They are future direction only.
Product copy and docs must not describe them as available.

## Stability

Pre-1.0: the surface above can still change, but changes are intentional, marked, and
documented (see [pre-1.0 policy](../../architecture/repository-structure.md#0x-policy)).
The output contract (clean stdout, diagnostics on stderr, `0` / non-zero exit) follows
[CLI architecture](../../engineering/cli/architecture.md).
