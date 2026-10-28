---
id: ideas.specflow-engine.execution-plans
type: hub
title: Remaining SpecFlow Engine E3-E5 execution plans
status: draft
scope: specflow
areas: [workflow, runtime, cli, testing]
tags: [execution-plan, temporary, batching, implementation]
read_when:
  - planning unimplemented E3 E4 E5 stages
  - understanding the future workflow and managed Session integration gates
summary: >
  Temporary remaining plans for E3 offline workflow, E4 managed Sessions and E5
  integration, after E1 E2 promotion.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.plan-03
  - ideas.specflow-engine.plan-04
  - ideas.specflow-engine.plan-05
  - architecture.runtime.specflow-engine
---

# Temporary execution plans — E3, E4 and E5

**E1/E2 implementation tasks, Q00–Q07 and I01–I03 have been retired.** Their implemented invariants live in [current Engine architecture](../../../architecture/runtime/specflow-engine.md), [Specification lifecycle](../../../architecture/runtime/specification-lifecycle.md) and [exact HTTP reference](../../../reference/api/specflow-specification-operations.md). Do not interpret the remaining plans as already implemented.

| Future phase             | Plan                                                  | Gate                                                                                              |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| E3 — Offline Workflow    | [Plan 03](03-offline-workflow-execution/README.md)    | Real deterministic workflow, external CLI, claim admission and recovery                           |
| E4 — Managed Sessions    | [Plan 04](04-managed-sessions-foundation/README.md)   | Durable Session/Turn/Work and enforced read-only mock provider                                    |
| E5 — Managed Integration | [Plan 05](05-managed-execution-integration/README.md) | **Only after E3 and E4 acceptance**: safe dispatch, claims, handover and explicit workflow finish |

Plan 03 and Plan 04 can be developed independently if code ownership is disjoint. High-risk identity, security, journal and recovery changes require solo independent review. E5 remains blocked on E3 and E4. [Multi-instance execution](../multi-instance-execution.md) and its [future plan](../multi-instance-plan/README.md) remain separate and are **not** part of the E5 gate.

## Cleanup policy

Plan 04 now has a decision-complete independent Session foundation and implementation tasks on
`feature/managed-sessions-foundation`; its linked delivery/storage/API/driver documents own the
resolved contracts. [Real provider migration](../../specflow-runtime/provider-migration-plan.md)
is explicit follow-on work. This does not unblock E5 claims before real E3/Engine acceptance.

Temporary plans are deleted **by implemented stage**, after tests and independent review. E3–E5 worklists stay in this branch as drafts until their corresponding stage is completed and promoted. This supersedes the old proposal to delete all five plans together before the Create branch merges. Run `pnpm docs:check --write`, `pnpm docs:check` and CI after any promotion; do not merge temporary task lists as permanent product specification format.
