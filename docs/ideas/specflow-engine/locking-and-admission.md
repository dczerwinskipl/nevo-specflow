---
id: ideas.specflow-engine.locking
type: architecture
title: Workflow step claims, external agent liveness and lock ordering
status: draft
scope: specflow
areas: [workflow, runtime, cli, testing]
tags: [locking, admission, race-condition, claim]
read_when:
  - designing writer claims for workflow steps or Spec Writer work
  - deciding how long an external agent's claim lives and how it is recovered
  - adding an operation that needs more than one lock
summary: >
  Open proposals on top of the implemented control lock and execution claims: writer claims for
  workflow steps and Spec Writer work, external agent liveness, lock ordering, and operator release
  and takeover.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.ownership
  - ideas.specflow-engine.offline-agents
  - ideas.specflow-engine.recovery
  - ideas.specflow-engine.execution-scopes
  - architecture.workflow.deterministic-workflow
  - architecture.runtime.workspace-execution-claims
---

# Workflow step claims, external agent liveness and lock ordering

Two mechanisms exist today. The short **Project Home control lock**
(`<stateRoot>/engine/control.lock`, `withProjectControlLock`) serializes every Engine decision
across processes and is never stolen. Durable journals are the claim records: Create, Close,
document changes, manual commits and
[workspace execution claims](../../architecture/runtime/workspace-execution-claims.md) for managed
agent processes. The parts below are not implemented.

## Claims for workflow steps and Spec Writer work (plan 06 F05)

A writable workflow step (an agent step that edits, or Spec Writer authoring without a `taskId`)
admits a claim before dispatch and settles it after the step ends (finish, return or failure).
Enforced read-only steps skip the writer claim only when the provider technically enforces
read-only; a declared intent is not proof. The claim is not the workflow position: settling a claim
never finishes a step, and finishing a step never settles a claim by itself.

Today a managed agent's claim is project-wide (`project-write:<projectId>`), because a native CLI
agent can touch any ref or worktree. Per-Task or per-worktree claims (plan 06 F08) need real
containment of the agent first; separate worktrees may then run independently while project-wide
Git/ref operations keep their own coordination.

## The hard part: external agent liveness

A `step start` CLI process exits while the agent keeps editing. Its PID is irrelevant to the claim's
continued logical ownership. A lease heartbeat might be unavailable while an uninstrumented external
agent is working, so a short TTL is dangerous. Candidate MVP choice: explicit owner release/finish
plus an **unknown state requiring recovery when absence of liveness cannot be proven**. Time alone
never establishes that writes are safe to preempt. Heartbeats or supervised shell wrappers can be
evaluated separately.

If owner capabilities are stored or returned, specify OS file permissions, no leakage into public
JSON logs, secure comparison and rotation; a guessable `executionId` is not proof.

## Lock ordering

Today every Engine decision takes one lock, the control lock, so there is no ordering problem. If
a second lock is ever introduced (for example a per-workspace control lock), define one hierarchy
(project control -> specific workspace control -> operation record) or design operations to avoid
holding several locks at once. Forbid cycles, and make sure retry and reconciliation never acquire
locks in reverse order. Multi-stage Git operations stay journaled intents, not long critical
sections.

## Operator release and takeover

A long-lived claim must expose actionable `inspect`, `reconcile`, owner-verified `release`, and
authorization-gated intervention. Inspect lists verified scope, operation, last observed evidence,
and whether the original writer may still execute. Reconcile uses positive evidence of settlement,
replayable stage checkpoints and compare-and-set under the control lock. Only after provable
settlement may ownership be released automatically; an ambiguous external writer stays blocked
with explicit safe options. Expiring a TTL, losing the last CLI PID or observing no heartbeat does
**not** revoke OS-level write capability. The protocol is detailed in
[execution scopes](execution-scopes-and-recovery.md).

## Failure matrix (open cases)

| Condition                                      | Required behavior                                        |
| ---------------------------------------------- | -------------------------------------------------------- |
| Runtime write collides with external CLI claim | Fail according to contract, never silently execute       |
| CLI terminates after `step start`              | Claim stays until proven settled or recovered            |
| Claim expiry without proof of end              | State becomes uncertain, not automatically free          |
| Two claim-release attempts race                | CAS/owner check means only the real owner wins           |
| Two independent worktrees are claimed          | Both proceed only once claims are scoped below a project |

## Test requirement

Use **separate OS processes**, not just Promise concurrency or an in-memory fake. Inject a crash
between lock and journal stages. Assert that no conflicting operation enters the critical mutation
region and that machine-readable blockers are stable across adapters (L03–L06, W05–W08).
