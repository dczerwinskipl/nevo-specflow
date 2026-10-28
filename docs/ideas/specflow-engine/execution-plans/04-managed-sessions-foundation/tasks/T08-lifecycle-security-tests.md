---
id: ideas.specflow-engine.plan-04.task-08
type: engineering
title: 'E4.T08 — Lifecycle/security tests'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T08 on feature/managed-sessions-foundation
summary: >
  Dependency-complete lifecycle/security tests task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T08 — Lifecycle/security tests

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Prove the complete foundation from installed startup to independent chat/restart/bounded history and scoped security; report evidence and request independent review.

- Kind/profile: integration / nevo-agents:implementer.
- Owner paths: Runtime test/sessions/**, specflow installed artifact smoke, connected UI acceptance; fixes with their feature owners.
- Prerequisites: [E4.T03](T03-durable-runtime-state.md), [E4.T04](T04-provider-neutral-test-driver.md), [E4.T05](T05-turn-coordinator.md), [E4.T06](T06-http-stream-contracts.md), [E4.T07](T07-ui-integration-slice.md).
- Minimal context: delivery MS01–MS12, all technical references and repository testing/OS rules.
- Acceptance coverage: MS01–MS12.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Exercise every MS01–MS12; cold 1/64 MiB histories with same tail, huge one-Turn text, concurrent paging/live, stale responses and cursor expiry.
- Record response bytes, rows/chunks read, query plans, timings/p95 and peak memory. Assert deterministic bounds and explain target timing misses.
- Real competing process/kill/shutdown verifies owner/epoch/recovery; tarball locates SQLite Worker on Windows/Linux without workspace paths.
- Prove scoped API/content/events and stream revocation, wrong/stale interaction and no-effect mock; no false PASS for skipped environment or real provider.
- Run appropriate targeted tests/typecheck/build/lint, docs and impacted Storybook; independent reviewer checks dependencies/coverage. Promote only proven guarantees.

## Verification and review

Cross-boundary Runtime+UI+installed artifact proof and final report with commands, versions, PASS/FAIL/SKIP and risks. Independent review is a separate gate, not a self-check claim.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
