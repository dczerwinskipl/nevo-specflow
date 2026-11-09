---
id: ideas.specflow-engine.plan-05
type: engineering
title: Temporary execution plan 05 — Managed Execution Integration
status: draft
scope: specflow
areas: [workflow, runtime, ai, security, testing]
tags: [execution-plan, temporary, managed-execution, handover, recovery]
read_when:
  - executing the temporary Engine migration proof of concept
  - reviewing implementation tasks, verification and dependency gates
summary: >
  Disposable implementation plan to integrate the real Engine coordinator and mock-provider Runtime Turns with crash-safe invocation and explicit workflow settlement.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.acceptance
  - ideas.specflow-engine.test-plan
  - architecture.principles.enforceable-invariants
---

# Plan 05 — Managed Execution Integration

**Lifecycle: temporary implementation plan.** Final integration slice of the first testable program. Requires Plan 03's **real** Engine workflow surface; the Runtime Session/Turn persistence, mock provider and the Session-level dispatch intent, dispatch phases and claim settlement (former T03–T05) are implemented, see [workspace execution claims](../../../../architecture/runtime/workspace-execution-claims.md). The mock is a deliberate constraint, not a substitute for native-adapter certification.

## Demonstration boundary

In a **single verified, fixed execution checkout** (typically the primary workspace), an authenticated Session requests a writable Turn for a real Task step. Runtime resolves canonical target through Engine, checks workflow readiness, obtains an effect-scoped writer claim, durably records invocation intent and dispatches a controllable mock provider. After Turn termination, Engine reconciles/relinquishes the exact claim; **the Task remains unfinished until an explicit workflow `finish`**. Another conflicting writer cannot enter during an ambiguous dispatch. Handover and a small explicit batch preserve Task attempt ownership and never spawn the next Session automatically. (This limit belongs to this first slice only: [ADR 0019](../../../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md) allows `continuation: auto` transitions to continue automatically; see plan 06, F01.)

A path/workspace identity may be recorded for audit, but **do not launch/resume an actual provider in another worktree**, switch `cwd` for existing provider-native Sessions, or test session relocation via fake provider capability. Worktree-aware provider Session integration is a later adapter-gated plan.

## Execution order, task files and review checkpoints

Each task has its own Markdown file. **Batch** means sequential tasks in one agent session; **parallel** means independent workers writing disjoint owners; **solo** means separately executed and reviewed. The task-level dependency links are executable prerequisites, not only documentation. For cross-plan ordering see the [program runbook](../README.md).

### Recommended waves

1. T01 solo (shared contract)
2. T02 solo (auth/admission; Session-level admission exists, the workflow-readiness part is open)
3. T06 solo (workflow finish)
4. T07 solo (batch/handover)
5. T08 solo (fault regression; Session-level restart and auth regressions exist, workflow cases are open)
6. T09 solo (architecture review)

### Tasks

| Task                                                                                                 | Depends on             | Run mode |
| ---------------------------------------------------------------------------------------------------- | ---------------------- | -------- |
| [E5.T01 — Cross-owner contract](tasks/T01-cross-owner-contract.md)                                   | E3.T10                 | Solo     |
| [E5.T02 — Preparation and authorization](tasks/T02-preparation-and-authorization.md)                 | E5.T01                 | Solo     |
| [E5.T06 — Explicit workflow interaction](tasks/T06-explicit-workflow-interaction.md)                 | E5.T02                 | Solo     |
| [E5.T07 — Bounded batch and handover](tasks/T07-bounded-batch-and-handover.md)                       | E5.T06                 | Solo     |
| [E5.T08 — Restart and auth regressions](tasks/T08-restart-and-auth-regressions.md)                   | E5.T02, E5.T06, E5.T07 | Solo     |
| [E5.T09 — Architecture audit + promotion backlog](tasks/T09-architecture-audit-promotion-backlog.md) | E5.T08                 | Solo     |

**Batch policy:** never auto-batch a high-risk solo gate with dependent tasks; re-evaluate shared file ownership at dispatch. In particular, lock/claim, security, HTTP scopes, durability/recovery and dispatch uncertainty need an explicit review checkpoint. If a task uncovers an architecture conflict, stop dependent tasks but continue unaffected, disjoint work.

## Hard invariants to review

1. `Execution Claim != Workflow Attempt != Runtime Turn != Provider Session`.
2. No unproven replay after the mock indicates “spawned but not correlated”; the same uncertainty rule must later be proven against each real provider.
3. Runtime cancel/terminal outcome is **not** proof that all external side effects are settled.
4. Handover is an explicit new managed execution request; does not inherit an active claim or advance workflow.
5. All code-changing managed execution uses a verified Engine admission; a read-only Turn can skip claim only with enforced non-writing capabilities.
6. External CLI agents remain unregistered as managed Runtime Sessions unless a later explicit feature does so.

**Orthogonal future capability:** Multi-instance execution means several independently attributed contributions from **one user-defined step attempt**, unlike this plan's multiple-Task batch. Keep E5.T07 bounded; no instance scheduling, per-run retries or aggregation here. The user defines step instructions, result schemas and effect policy; offline Engine result aggregation is deliberately scheduled before managed orchestration in the [future plan](../../multi-instance-plan/README.md).

## Integration acceptance — what is demonstrable now

Use real Engine + Runtime + controlled mock provider to prove **SI04, SI05, SI07 and SI08** and the S03–S05, S08 and R06 cases (SI01–SI03 and the dispatch crash cuts are covered by the implemented Session foundation and claims). Validate basic S04 sequential batch and S05 explicit handover without broad production orchestration.

**Deliberately deferred:** **SI06/S07** (provider-native resume or moved/rebound worktree during a managed Session), real adapter timeouts and side-effect fencing, cross-worktree provider execution, active-Session rebind cleanup (B03), full provider parity, nontrivial auto-batch routing and complete workflow catalogue. A mock passing the dispatch crash cuts does not imply real provider replay safety.

Plan 02's optional **non-session** rebind/cleanup can use real Git evidence separately. Do not call this integration complete for provider/worktree behavior that was deliberately not tested.

## Verification demo

```text
1. Real Engine Task ready; Runtime Session created using mock.
2. Start writable Turn -> claim acquired + dispatch intent durable.
3. Concurrent offline CLI writer denied for same workspace.
4. Mock emits Work then completes -> Turn terminal; Task still active.
5. Explicit workflow finish -> deterministic Task progression.
6. Restart/kill at spawn-before-correlation -> unknown outcome, no duplicate Turn/tool effect.
7. Reconcile only with positive evidence; inspect returns actionable blocker otherwise.
8. Request next Session via explicit handover; batch Task identities stay distinct.
```

No live provider sessions are required to execute any of these steps.

## Sources and end-of-program cleanup

- [Managed handshake](../../managed-session-integration.md), [execution scopes](../../execution-scopes-and-recovery.md), [durable operations](../../durable-operations-and-recovery.md), [local trust](../../local-actor-and-human-gates.md), [test plan](../../test-plan.md), [acceptance](../../acceptance-criteria.md).
- [Canonical Session model](../../../../architecture/ai/canonical-session-turn-work.md), [deterministic workflow](../../../../architecture/workflow/deterministic-workflow.md).

When the verified implementation and owner architectural review are accepted, record lasting invariants/contracts in authoritative architecture, reference or ADR files, then **delete the remaining E3–E5 temporary execution plans after their own implementation and review, and regenerate the docs indexes**. E1/E2 temporary worklists were retired during E1/E2 promotion. Keep tests, evidence, and any accepted ADRs. Do not promote untested mock assumptions as provider-native guarantees.
