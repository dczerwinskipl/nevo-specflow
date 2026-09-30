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
  - streaming
  - recovery
read_when:
  - migrating AI providers into SpecFlow Runtime
  - hardening provider adapters before the MVP implementation settles
summary: >
  Candidate hardening work for provider adapters: lifecycle and recovery fencing, environment and
  diagnostic security, evidence-based errors, output semantics, model/usage/capacity handling,
  resource ownership, liveness, raw diagnostics, and replay tests.
related:
  - ideas.readme
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
  - architecture.runtime.ownership-and-lifecycle
---

# AI adapter hardening ideas

## Goal

Preserve the existing canonical `Session -> Turn -> Work` architecture while making the adapter
boundary less dependent on provider text quirks, process timing, and platform-specific behavior.

These notes are intended to be consumed **while provider functionality is migrated**, so obvious
hardening can land with the migrated feature instead of reproducing known legacy weaknesses first.

## Authority and evidence model

This package mixes three kinds of information and labels them explicitly where ambiguity matters:

- **Current SpecFlow rule** — an invariant already owned by a current authoritative document.
- **Legacy evidence** — behavior, tests, or contracts observed in the legacy Nevo implementation;
  useful migration input, but not automatically approved target design.
- **Candidate design** — a proposed SpecFlow direction that still needs promotion into the
  appropriate architecture, engineering, product, or reference document before it becomes
  authoritative.

When those conflict, current SpecFlow architecture wins. Do not copy a legacy contract solely
because it existed, and do not treat a candidate `AI_*` code, model trait, health field, timeout,
or parser heuristic as already approved target API.

## Priority

Priority answers **when to pick the idea up during migration**, not whether the idea is already an
approved target contract.

| Priority | Meaning |
|---|---|
| **P0 — migrate hardened** | Apply while the corresponding provider/runtime feature is being migrated. Porting the legacy behavior first and fixing it later creates correctness, security, persisted-data, or compatibility debt. |
| **P1 — MVP hardening** | Land before considering the provider layer MVP-stable, but it can follow initial feature parity if necessary. |
| **P2 — supporting / later** | Useful diagnostics, maintainability, richer telemetry, or evidence material. Preserve the direction now; implementation does not need to block MVP provider parity. |

### P0 — migrate hardened

1. [Invocation ownership and late events](invocation-ownership-and-late-events.md) — prevents stale
   callbacks from mutating terminal/replaced Turns.
2. [Provider/session correlation identity](correlation-identity.md) — preserves the existing
   composite provider identity invariant across every lookup/index.
3. [Evidence-based error classification](error-classification.md) — avoids lifecycle decisions from
   arbitrary provider prose.
4. [Provider readiness and authentication](provider-readiness-and-auth.md) — prevents
   installed-but-logged-out providers from being advertised as ready.
5. [Provider process environment boundary](process-environment-boundary.md) — do not port broad
   ambient `process.env` inheritance into the target runtime.
6. [Provider diagnostic sanitization](diagnostic-sanitization.md) — secrets can otherwise leak into
   durable logs/errors as soon as provider execution is migrated.
7. [Provider session resume and recovery](session-resume-and-recovery.md) — avoids unsafe replay,
   stale-session reuse, and context bleed.
8. [Output semantics](output-semantics.md) — reasoning/commentary/tool/final classification is a
   canonical boundary decision and should not be retrofitted after transcripts exist.
9. [Provider usage accounting provenance](usage-accounting.md) — usage basis must be known before
   persisted totals accumulate; fixing double-counted historical data later is expensive.
10. [Model selection and reasoning effort](model-selection-and-effort.md) — migrate model identity
    and effort separately where provider evidence supports it instead of recreating a Cartesian
    model list.

### P1 — MVP hardening

11. [Resource lifetime and settlement](resource-lifetime.md) — centralizes cleanup/partial-start
    failure paths once the concrete migrated resources are known.
12. [Liveness and watchdogs](liveness-watchdog.md) — separates protocol silence, process liveness,
    semantic progress, stall, and hard runtime limits.
13. [Provider capacity and admission](provider-capacity-and-admission.md) — consume trustworthy
    `retryNotBefore` so automatic orchestration does not repeatedly invoke a provider during a
    known quota window.
14. [Raw diagnostics retention](raw-diagnostics-retention.md) — keep raw evidence bounded and
    disposable instead of turning it into a second history store.
15. [Provider diagnostics and replay](diagnostics-and-replay.md) — make protocol bugs deterministic
    fixture/replay tests without requiring a live CLI.
16. [Cross-platform process concerns](cross-platform-process-runtime.md) — preserve working
    Windows/POSIX process-tree behavior and keep platform-specific liveness optional.

### P2 — supporting evidence / later extensions

17. [Provider protocol mapping examples](protocol-examples.md) — implementation/evidence aid; not a
    separate runtime feature.
18. [Provider error and limit evidence](provider-error-examples.md) — evidence pack used by P0/P1
    classifier/readiness/capacity work.
19. [Legacy migration inspection map](migration-inspection-map.md) — discovery router for agents
    porting the legacy implementation.

### Important scope note

P1 does not mean "ignore until after launch". In particular, resource cleanup and watchdog behavior
should move into P0 for a provider whenever the migrated implementation cannot be made safe without
them.

P2 currently contains mostly **documents/evidence**, not deferred production requirements. If a P2
document exposes a concrete bug while migrating a provider, promote that concrete fix into the
relevant P0/P1 implementation work.

## Principles shared by all items

- Canonical state is durable; provider protocol data is adapter input.
- Structured protocol evidence outranks text heuristics.
- Raw stdout/stderr is diagnostic evidence, not application state.
- Terminal Turns are immutable; late callbacks cannot mutate canonical state.
- One invocation owns one set of resources and one settlement path.
- Platform-specific telemetry may improve decisions, but the candidate design should not make it a hidden portability requirement.
- Production protocol bugs worth fixing should normally become minimized replay/regression fixtures.
