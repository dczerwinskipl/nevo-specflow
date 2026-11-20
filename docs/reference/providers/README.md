---
id: docs.reference-providers-readme
type: hub
title: Session provider reference
status: current
summary: >
  Implemented Session provider adapters, their enablement, supported profiles and limits,
  and the shared build compatibility policy.
---

# Session provider reference

All adapters implement the [Session provider driver](../protocols/session-provider-driver.md) and
run under [provider process ownership](../../architecture/ai/provider-process-ownership.md).
Future provider capabilities live in the
[provider capability backlog](../../ideas/specflow-runtime/provider-migration-plan.md).

- [Build compatibility and admission](compatibility.md)
- [Executable discovery and unavailability reasons](executable-discovery.md)
- [Claude](claude-provider.md)
- [Codex](codex-provider.md)
- [Antigravity](antigravity-provider.md)

A provider runs when the project allows it (`sessions.providers.<provider>.allowed: true` in
`.nevo/config.yaml`) and the workstation does not turn it off (`enabled: false` in
`.nevo/local/config.yaml`, which also holds the optional `executable`); an allowed provider is
enabled by default. The split, its refusals and the default are in
[project configuration](../../architecture/runtime/configuration.md#session-providers-project-and-workstation).

The controlled mock provider is described in the driver protocol.
