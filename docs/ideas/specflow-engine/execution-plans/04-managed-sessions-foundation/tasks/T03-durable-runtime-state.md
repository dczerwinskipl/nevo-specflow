---
id: ideas.specflow-engine.plan-04.task-03
type: engineering
title: 'E4.T03 — Durable Runtime state'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T03 on feature/managed-sessions-foundation
summary: >
  Dependency-complete durable runtime state task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T03 — Durable Runtime state

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Implement asynchronous worker SQLite, singleton ownership, durable records/idempotency/outbox and indexed tail/history/content sources.

- Kind/profile: backend / nevo-agents:implementer.
- Owner paths: Runtime features/sessions/persistence/** and reads/**; Worker packaging; test/sessions process integration.
- Prerequisites: [E4.T02](T02-canonical-identities.md).
- Minimal context: storage/lifecycle design, API paging/content semantics, delivery MS06/MS09/MS11.
- Acceptance coverage: MS01/MS02/MS06/MS09/MS11.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Inject absolute verified state home; enforce schema/version, one nonterminal Turn, atomic request/state/outbox and immutable terminal data.
- Singleton UUID/epoch row checked on writes: refuse live/reused/uncertain PID; only positively dead owner permits acquisition; no timeout-based theft.
- Tail/history read <=40 preview rows plus lookahead with no full content/scan/count/fold. Huge Turn/content stays pageable even after cold restart.
- Use DatabaseSync only inside Worker; bounded busy handling, public async store port, transactional migrations, explicit corrupt/unsupported store and no old JSON loader.
- Provide packaged Worker entry and clean close; do not create routes or execute provider from persistence.

## Verification and review

Real temp SQLite restart, transaction crash cuts, process competition and query/index/content-read instrumentation on supported Windows/Linux. Worker build smoke; full tarball in T08.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
