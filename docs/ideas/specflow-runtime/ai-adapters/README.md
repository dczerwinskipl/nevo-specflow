---
id: ideas.specflow-runtime.ai-adapters
type: hub
title: AI adapter hardening ideas
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - lifecycle
  - recovery
read_when:
  - hardening provider adapters beyond the implemented driver contract
summary: >
  Open provider-adapter hardening ideas: liveness and watchdogs, quota/transient classification,
  capacity-aware admission, readiness diagnose lane, resume/recovery follow-ups, diagnose/replay
  tooling, and the provider error evidence pack.
related:
  - ideas.readme
  - architecture.ai.provider-boundary
  - reference.protocols.session-provider-driver
  - architecture.ai.provider-process-ownership
---

# AI adapter hardening ideas

Implemented adapter behavior is owned by the
[driver protocol](../../../reference/protocols/session-provider-driver.md),
[provider process ownership](../../../architecture/ai/provider-process-ownership.md) and the
[provider references](../../../reference/providers/README.md). These notes cover only what is still
open; current architecture wins on any conflict. Provider capability parity (tools, MCP, platforms,
discovery, telemetry coverage) is tracked in the
[provider capability backlog](../provider-migration-plan.md).

- [Liveness and watchdogs](liveness-watchdog.md) — separate protocol silence, output and process
  activity, semantic progress, stall and hard runtime limits.
- [Quota versus transient rate-limit classification](error-classification.md) — evidence-based
  classes and `retryNotBefore`.
- [Provider capacity and admission](provider-capacity-and-admission.md) — let fresh capacity
  evidence defer automatic Turns.
- [Readiness and authentication follow-ups](provider-readiness-and-auth.md) — explicit diagnose lane
  and quota-exhausted readiness.
- [Session resume and recovery follow-ups](session-resume-and-recovery.md) — native-session-not-found
  reset, context rotation, positive reconciliation.
- [Diagnose API and protocol replay](diagnostics-and-replay.md) — `diagnose()` and the
  capture-to-replay fixture harness.
- [Provider error and limit evidence](provider-error-examples.md) — evidence pack for the items
  above.

Shared principles: structured protocol evidence outranks text heuristics; raw output is diagnostic
evidence, not application state; terminal Turns are immutable; platform-specific telemetry may
improve decisions but never becomes a hidden portability requirement; protocol bugs worth fixing
become minimized replay fixtures.
