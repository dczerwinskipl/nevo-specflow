---
id: engineering.cli.testing
type: engineering
title: CLI testing
status: current
read_when:
  - testing a CLI command or packaged executable
  - adding a CLI smoke test
summary: >
  CLI-specific testing guidance: test command adapters in-process and keep a small
  subprocess/packaged smoke suite for help, version, usage errors, routing, and clean
  machine-readable output.
related:
  - engineering.cli.architecture
  - engineering.shared.testing
---

# CLI testing

General test strategy lives in [shared testing](../shared/testing.md).

## Command tests

Test Commander adapters in-process with injected stdout/stderr sinks. Verify command
names/options that are part of the product contract and verify that the adapter calls
the application capability correctly.

Do not duplicate Commander's own parser test suite.

## Executable smoke tests

Keep a small subprocess suite against the built executable:

- `--help`;
- `--version`;
- unknown command / invalid usage exits non-zero;
- one representative happy path;
- one machine-readable path if the CLI exposes JSON/YAML.

For the distributable product, retain an isolated pack/install/run smoke test so the
test exercises the generated executable shim rather than importing workspace code.
