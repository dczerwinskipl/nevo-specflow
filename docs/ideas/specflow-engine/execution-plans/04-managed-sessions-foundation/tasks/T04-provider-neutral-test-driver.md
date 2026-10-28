---
id: ideas.specflow-engine.plan-04.task-04
type: engineering
title: 'E4.T04 — Provider-neutral test driver'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T04 on feature/managed-sessions-foundation
summary: >
  Dependency-complete provider-neutral test driver task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T04 — Provider-neutral test driver

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Implement the no-effect controllable mock and driver conformance suite through the fixed protocol.

- Kind/profile: backend / nevo-agents:implementer.
- Owner paths: Runtime features/sessions/providers/** and co-located conformance fixtures; no shared barrels before T05.
- Prerequisites: [E4.T02](T02-canonical-identities.md).
- Minimal context: driver reference, provider boundary and mock scope.
- Acceptance coverage: MS03–MS05/MS12.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Explicit test descriptor, read-only only; no spawn/filesystem executor. Synthetic tool output is data.
- Direct injected controls pause correlation/interaction/outcome, emit duplicate/late/oversize facts and withhold settlement; no public HTTP/prompt backdoors.
- Honor awaitable emission/backpressure, typed interactions, usage basis, idempotent cleanup/partial startup and honest unsupported capabilities.
- Ordinary production mock message emits bounded commentary/answer; configuration must explicitly enable it.

## Verification and review

Deterministic no-effect/driver conformance tests with injected clock/control; no real provider credentials/install required.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
