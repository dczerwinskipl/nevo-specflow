---
id: ideas.specflow-engine.plan-04
type: engineering
title: Temporary execution plan 04 — Managed Sessions Foundation
status: draft
scope: specflow
areas: [runtime, ai, security, testing, ui]
tags: [execution-plan, temporary, sessions, turns, mock-provider, pagination]
read_when:
  - implementing the independent managed Session foundation
  - selecting the next dependency-complete Session task
summary: >
  Implementation-ready decomposition of independent Session core, worker SQLite,
  bounded tail/history, authorized HTTP/SSE and a real UI with a no-effect mock.
related:
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-engine.execution-plans
---

# Plan 04 — Managed Sessions Foundation

## Ready handoff and branch

Preparation is complete for this bounded delivery; implementation is not done. Start on
`feature/managed-sessions-foundation`, based on `origin/main`
`4d51e12a09e5bfd19f4ea9f254931c1cd2c6c663`, in the dedicated managed worktree.
Do not implement on the old dirty `codex/specification-creation-demo` checkout.
Tasks are reviewable checkpoints, not obligatory separate branches.

The [delivery specification](../../../specflow-runtime/managed-sessions-delivery.md) owns scope,
owner decisions and MS01–MS12. The [storage/lifecycle design](../../../../architecture/ai/session-storage-and-lifecycle.md),
[API reference](../../../../reference/api/sessions.md) and
[driver reference](../../../../reference/protocols/session-provider-driver.md) own exact contracts.
Previous identity/persistence/concurrency/auth/tail gaps are resolved. Reopen only a newly
evidenced material contradiction. Draft design status avoids claiming unimplemented software
is current; existing current invariants win. Execution admission remains workflow-owned.

## Scope and result

An authorized user creates an independent Session without Spec/Task/workflow, runs an explicitly
labelled no-effect mock, sees conversation/Work, answers interactions and cancels, reloads/restarts,
and reads history without hydrating the transcript. Worker SQLite, one local Runtime owner,
bounded API, durable retry and restart recovery are foundation work. Production wiring uses real
persistence, not demo sources. Mock is opt-in and cannot execute external tool effects.

## Task graph

| Task                                                                    | Dependencies                      | Kind / implementer        | Planning readiness                         |
| ----------------------------------------------------------------------- | --------------------------------- | ------------------------- | ------------------------------------------ |
| [E4.T01 Characterization](tasks/T01-session-contract-reconnaissance.md) | Implemented E1/E2 context on base | general / implementer     | Ready for execution as planning assessment |
| [E4.T02 Contracts](tasks/T02-canonical-identities.md)                   | T01                               | backend / implementer     | Planned, dependent                         |
| [E4.T03 Storage](tasks/T03-durable-runtime-state.md)                    | T02                               | backend / implementer     | Planned, dependent                         |
| [E4.T04 Driver/mock](tasks/T04-provider-neutral-test-driver.md)         | T02                               | backend / implementer     | Planned, dependent                         |
| [E4.T05 Coordinator](tasks/T05-turn-coordinator.md)                     | T03, T04                          | backend / implementer     | Planned, dependent                         |
| [E4.T06 HTTP/composition](tasks/T06-http-stream-contracts.md)           | T05                               | backend / implementer     | Planned, dependent                         |
| [E4.T07 UI](tasks/T07-ui-integration-slice.md)                          | T06                               | ui / implementer-ui       | Planned, dependent                         |
| [E4.T08 Acceptance](tasks/T08-lifecycle-security-tests.md)              | T03, T04, T05, T06, T07           | integration / implementer | Planned, dependent                         |

Profiles mean nevo-agents:implementer and nevo-agents:implementer-ui. Independent review uses
nevo-agents:reviewer. These are planning metadata, not invented workflow manifest keys.
T01 -> T02 -> (T03, T04) -> T05 -> T06 -> T07 -> T08 is acyclic.
T03/T04 are the only parallel-safe code pair after T02; shared barrels belong to T05.
This is a future scheduling option, not an instruction to spawn agents during preparation.

## Review and verification

Independent review gates: after T02 (contract), T03 (durability/owner), T05 (recovery),
T06 (auth/stream), T08 (whole delivery). Stop dependent work at a failed gate.
Each task reports changed owners, PASS/FAIL/SKIP, intentional legacy changes and unresolved risk.
Source-owned tests/stories stay co-located; process/public/installed tests use package test/.
Follow repository OS guidance, including Linux-only real-Git/SIGKILL suites where applicable.
This preparation claims no implementation tests or independent review.

## Dependencies and later stages

E4 does not wait for E3 workflow, #95 UI merge or D4 writes. T07 uses independent core routes
on this base, comparing current main/#95 before shared-router/service edits. Existing demo and
Specification entry points remain usable. Spec/Task/Document associations are later integration,
with no inherited specId requirement in IDs, persistence or HTTP.

[Real provider packages](../../../specflow-runtime/provider-migration-plan.md) follow E4.T08:
process boundary and Claude/Codex/Antigravity adapters with native fixture/live acceptance.
E5 writable integration needs real Engine admission/claim/settlement; plans do not prove APIs
exist. Standalone writable dispatch also needs that shared capability. No automatic workflow
finish or provider relaunch follows Turn termination.

## Exit and cleanup

All MS01–MS12 must pass, including 64 MiB cold-tail bounds, cursor/live merge, singleton owner,
scoped commands/content/events, auth revocation, interaction expiry and installed worker startup.
Validate representative API payloads and connected Full Session at wide/narrow widths.
After implementation and independent review promote proven guarantees and retire this worklist;
preserve stable task IDs meanwhile. Mock acceptance does not finish real-provider migration.

## Preparation verification (2026-10-25)

The documentation corpus passes docs:check (229 documents); changed authored files pass Prettier
and git diff --check. A local-link audit checked 86 links with zero broken targets; task graph
validation found all eight tasks and no cycles. Node 24.20.0 on this Windows host exposes built-in
DatabaseSync. These are preparation checks only: no product implementation, independent code
review, SQLite worker acceptance or provider certification is claimed.
