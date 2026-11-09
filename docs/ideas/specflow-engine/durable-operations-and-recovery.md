---
id: ideas.specflow-engine.recovery
type: architecture
title: Workflow finish Git stages and external writer recovery
status: draft
scope: specflow
areas: [workflow, runtime, testing]
tags: [recovery, idempotency, journal, persistence]
read_when:
  - adding commit or push stages to the workflow finish journal
  - designing recovery for an external CLI writer that holds a workflow claim
summary: >
  Open proposals for the durable-operation work that is not implemented: Git stages in the workflow
  finish journal (plan 06 F04) and the recovery protocol for external CLI writers.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.locking
  - ideas.specflow-engine.ownership
  - ideas.specflow-engine.plan-06
  - architecture.workflow.deterministic-workflow
  - architecture.workflow.workflow-kernel
  - engineering.shared.specflow-git-recovery
---

# Workflow finish Git stages and external writer recovery

The durable-operation discipline (intent before an irreversible effect, idempotency by evidence,
replay only of proven-safe stages, no optimistic cleanup) is implemented for Create, Close, document
commits and manual commits; see [durable Engine Git mutations](../../engineering/shared/specflow-git-recovery.md).
The workflow kernel writes one `ExecutionChange` through a per-Specification journal
([Workflow kernel](../../architecture/workflow/workflow-kernel.md), "State and storage"). Managed
agent processes are fenced by
[workspace execution claims](../../architecture/runtime/workspace-execution-claims.md). Two parts are
still open.

## Git stages in the workflow finish journal (plan 06 F04)

Today a finish publishes the `.execution/` records and deletes the journal; the files stay ordinary
working-tree changes. The proposal extends the same journal with stages after the record writes:

```text
records-written -> commit-recorded (optional) -> pushed (optional) -> completed
```

- Commit `.execution/**` with the Engine-owned commit capability and policy (ADR 0013, 0016, 0018),
  path-limited to the Specification's execution records. An optional per-step
  `finalize: [commit, push]` follows the legacy semantics.
- Each stage records the intent before it runs and the proof after it (commit id, pushed ref).
  Replay continues only uncompleted stages whose preconditions still hold; an unknown Git outcome
  stays recovery-required, as for other Engine Git mutations.
- Journal identity, workspace claim and workflow attempt stay distinct: a finished step does not
  settle a claim, and a settled claim does not finish a step.

## Recovery for external CLI writers

An external agent started outside Runtime holds no managed Session, so the Runtime cannot prove
that its process stopped. When its workflow claim (see [locking](locking-and-admission.md)) is
ambiguous, `recovery-required` should carry proof requirements and an action plan:

- inspect the claim and the Git/current artifacts;
- reconcile idempotent stages;
- release verified terminal work explicitly;
- escalate when the agent may still write.

Never delete the only available worktree or forge a successful human review to clear a blocked
state. An ambiguous write may block conflicting actions until reconciliation succeeds; external
claims are never removed on Runtime shutdown. The operator protocol is proposed in
[execution scopes and recovery](execution-scopes-and-recovery.md).

## Protected branches for Close (deferred)

Close keeps its own archive commit and integration code, so the protected-branch guard of the commit
capability does not cover it: integration into a protected target branch is not forbidden today
(ADR 0013, decision 7). The follow-up moves the archive commit onto the commit capability so the
guard applies, and decides whether integration into a protected target is refused or offered as a
branch for the person to merge.

## Merge-conflict resolution after Close (deferred)

Close reports a known integration conflict and fences it: the Specification settles as
`archived-linked-awaiting-integration` (or `requires-resolution`), and a later CloseWorktree
integrates once the conflict is resolved outside the Engine. A resolution capability itself does
not exist. The owner direction for it:

- the UI may offer **Resolve manually** and **Ask agent**, but the Engine never launches an agent
  or picks changes; it only emits typed conflict evidence;
- resolution is a separate, separately authorized operation with its own resolution checkout; it
  never mutates the settled CloseSpecification intent;
- the following CloseWorktree re-verifies source ancestry and the current target before
  integrating.

## Verification

Kill a subprocess at each stage and start **a fresh process** to recover. Assert no duplicate
commit, no lost record update, the same canonical result for the same operation, a structured
conflict if the filesystem diverges, and no requirement to start the HTTP Runtime. See the
[test plan](test-plan.md) (R07, W07, W08).
