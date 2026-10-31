---
id: ideas.specflow-runtime.session-telemetry-delivery
type: engineering
title: Session telemetry backend delivery plan
status: draft
scope: specflow
areas: [ai, runtime, server, security, testing]
tags: [sessions, telemetry, planning, implementation]
read_when:
  - implementing or reviewing the Session telemetry API delivery
summary: >
  Dependency-complete backend implementation and verification plan for live Session
  telemetry, without UI or Task/Specification/Workflow dependencies.
related:
  - reference.api.session-telemetry
  - ideas.specflow-runtime.ai-adapters.usage-accounting
---

# Session telemetry backend delivery

Owner authorized implementation of the proposed API on 2026-10-31. Exact wire
semantics belong to [the API contract](../../reference/api/session-telemetry.md).
No UI rendering/client composition, new model pricing service, workflow binding
or paid automated acceptance belongs to this delivery. Keep this work on the
current feature branch/PR; do not merge automatically.

| Task                      | Kind / recommended profile | Outcome and owner                                                                                                                                                            | Dependencies                              | Verification                                                                                         |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| T1 Contracts and access   | backend / implementer      | Closed bounded snapshot/readings, refresh receipt and SSE invalidation schemas; Session account-limit permission; validation exports in contracts                            | Existing Sessions/Auth resources          | Schema boundary/cross-field validation; no raw identities or unknown-as-zero                         |
| T2 Durable projections    | backend / implementer      | Single-worker telemetry projection, materialized usage/cost coverage, explicit schema migration, bounded migration batches, refresh journal/state and committed invalidation | T1                                        | Replay/restart/dedupe/baseline/overflow; O(1) reads with no transcript scan; existing data migration |
| T3 Provider observations  | backend / implementer      | Verified money/context/token dimensions and optional read-only limits source, with native identity/credential fencing                                                        | T1, internal fact boundary agreed with T2 | Controlled protocol fixtures; no real CLI/login/subscription; missing evidence stays unavailable     |
| T4 HTTP and live refresh  | backend / implementer      | Authorized conditional GET, explicit idempotent refresh, bounded account-coalesced reads, SSE wake/replay/freshness and cleanup through existing stream                      | T1–T3                                     | 304/403 isolation; race/reconnect/resync; refresh timeout/429/dedupe; idle 32-client activity        |
| T5 Independent acceptance | integration / reviewer     | Review final diff against contract, repository checks and cross-platform lifecycle/packaged-worker verification                                                              | T1–T4                                     | Report final SHA and exact PASS/FAIL/SKIP/not-executed; no paid test runner                          |

T1 and T3 can proceed with a jointly fixed internal observation contract; T2 and
T4 integrate sequentially at that boundary. SQLite keeps one owner and transaction
coordinator; account refresh is read-only provider work, not a second Session
lifecycle authority. Tests live beside each owner except actual cross-boundary
HTTP/installed-artifact verification.

Provider-dependent fields are independently enabled. Claude cost semantics need
native cumulative scope and a trustworthy baseline. Codex limits can be refreshed
without starting/resuming a thread; current context is push-only. Antigravity
bare numeric cost has no proven currency and remains unavailable. Effort/mode
selection behavior remains the existing native provider contract.

Readiness: ready for implementation of the defined bounded projection and refresh
flow. Any additional native dimension needs verified source semantics, not an
invented estimate or UI fixture. Implementation/CI outcomes are recorded in the
feature PR; this plan alone does not certify completion.
