---
id: engineering.cli.architecture
type: engineering
title: CLI architecture
status: current
read_when:
  - creating or restructuring a CLI command
  - changing the Nevo SpecFlow CLI shell
  - deciding command ownership, output, or exit behavior
summary: >
  CLI-specific architecture: Commander for command trees, thin bin/handlers,
  command-local options, shell composition, capability-owned adapters, and stable
  stdout/stderr/exit contracts.
related:
  - engineering.cli.testing
  - engineering.shared.code-organization
  - engineering.shared.effects-and-io
  - engineering.shared.async-and-lifecycle
  - product.specflow.cli.interaction-model
---

# CLI architecture

## Settled choices

- Use **Commander** directly for multi-command CLIs. Do not build a custom router or
  wrapper framework over it.
- Repository tools use strict TypeScript and `tsc`; the product distributable is the
  deliberate esbuild exception because it ships as one bundled artifact.
- Use one executable with subcommands rather than multiple `bin` entries.
- Declare arguments/options on the command that owns them.

Shared code-organization, effects, async, and testing rules live under
[`../shared/`](../shared/) and apply here too.

## Thin executable and handlers

`bin.ts` constructs dependencies, builds the Commander program, parses argv, and maps
errors to exit codes. It owns no product/application behavior.

A command adapter maps:

```text
CLI args → application operation → typed result → CLI presentation
```

Use `.exitOverride()` so help/version/usage exits are testable without
`process.exit()`.

## Product CLI composition

`@nevo/specflow` owns the **Nevo SpecFlow CLI shell**: root program, version/global
conventions, output/error/exit behavior, and command composition.

A capability owns the semantics of its command and exposes a Commander adapter from a
dedicated boundary. For example, `@nevo/specflow-runtime/cli` owns
`createStartCommand()`; the shell only registers it.

Do not invent a plugin/descriptor framework for this. Plain Commander composition and
ordinary functions are sufficient.

## Output is a public contract

- **stdout** — primary result; clean human text or stable machine-readable output.
- **stderr** — progress, warnings, diagnostics, error detail.
- **exit 0** — success.
- **exit non-zero** — failure/usage error according to the command contract.

Machine-readable stdout must contain no decorative or diagnostic chatter.
