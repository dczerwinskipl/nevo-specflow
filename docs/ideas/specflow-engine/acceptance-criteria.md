---
id: ideas.specflow-engine.acceptance
type: reference
title: Open Engine workflow and managed execution acceptance criteria
status: draft
scope: specflow
areas: [testing, docs, cli, workflow, runtime]
tags: [acceptance, proof-of-concept, requirements]
read_when:
  - deciding whether offline workflow coordination or managed execution integration is done
  - approving migration of the remaining legacy workflow behaviour
summary: >
  Open evidence-based acceptance gates: offline workflow coordination (FB01-FB09), the remaining
  managed execution integration criteria (SI04-SI08) and the deferred multi-instance gate.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.test-plan
  - ideas.specflow-engine.decisions
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.execution-scopes
---

# Acceptance criteria — staged proposal

These are **candidate** gates, not adopted production contracts. An implementation is accepted only with executable test IDs, revision/OS evidence and explicit owner sign-off. A `draft` documentation PR cannot claim a passed runtime gate.

Specification create/list/read, Project Home, workspaces, worktrees and Close (former Foundation A
and its lifecycle extension) are implemented; their rules live in
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md) and
[Project Home and workspaces](../../architecture/runtime/project-home-and-workspaces.md). The
workflow kernel exists in the Engine
([Workflow kernel](../../architecture/workflow/workflow-kernel.md)) but no CLI or Runtime surface
calls it yet, so the gates below are still open.

## Foundation B — Execution coordinator + one real minimal Workflow Kernel

**Boundary:** no provider, no full old Nevo workflow; one representative real deterministic step start/finish, actual attempt identity, effects-based admission, and independent CLI processes. Do **not** satisfy these by a mock endpoint with no workflow state.

| ID   | Acceptance                                                                                                                                                                         | Required evidence                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| FB01 | External CLI with Runtime off can inspect/start/finish one real deterministic workflow attempt without fake Session                                                                | W01, W02                                    |
| FB02 | Writer scope is independent of Task/Turn; spec authoring may hold writer without taskId; enforced read-only work does not                                                          | W03, W04, SC01                              |
| FB03 | Claim outlives short CLI process; concurrent writer blocked; nonconflicting worktrees proceed                                                                                      | L03, L04, W05                               |
| FB04 | Release/settlement does not automatically finish Task; explicit finish and attempt-scoped evidence control progression                                                             | W02, W06                                    |
| FB05 | Inspect/reconcile/owner release expose actionable recovery and can automatically clear **proven** settled work; ambiguity escalates rather than blocks silently forever            | L05, L06, W07, W08                          |
| FB06 | External actor trust and human gate provenance are a documented owner decision; arbitrary owner/role/session string cannot self-approve                                            | W09, AG01–AG03, security review             |
| FB07 | Dirty-state admission distinguishes known scaffold from unrelated edits without disabling required clean-tree gates                                                                | SC01, SC02                                  |
| FB08 | No provider/HTTP dependency, import directions and cross-process replay evidence hold after Kernel integration                                                                     | separate-process test run; dependency check |
| FB09 | Workflow attempt is bound to the verified definition revision resolved from its execution workspace; changed HEAD/home/worktree definition cannot silently reinterpret the attempt | W10 + mismatch/recovery evidence            |

**Foundation B pass** means safe offline workflow coordination primitives exist; it does not certify Sessions or provider migrations.

## Managed execution integration (open part)

The Sessions foundation is implemented (canonical Session/Turn/Work, standalone Turns, Engine
[workspace execution claims](../../architecture/runtime/workspace-execution-claims.md) for every
native agent process, positive-evidence settlement). Former SI01-SI03 are therefore met. The rows
below need the workflow kernel to be driven from Sessions.

| ID   | Acceptance                                                                                                                                           | Required evidence |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| SI04 | Terminal Turn or handover does not automatically complete/activate a workflow step; batch retains explicit per-Task scope                            | S03–S05           |
| SI05 | Crash around a workflow finish from a Session does not duplicate unknown effects; claims settle only on proof (dispatch windows: implemented claims) | R06, R07          |
| SI06 | Move/rebind/unavailable worktree invalidates unsafe native resume while preserving authorized Session history                                        | S07               |
| SI07 | Scoped Session and Spec/Workspace reads don't leak records through cross-feature projections                                                         | S08               |
| SI08 | Writer claims can be reconciled independently of provider Session/Turn lifecycle; external work is not fabricated as a managed Session               | W06, W08          |

## Deferred follow-up gate — multi-instance execution

The [multi-instance idea](multi-instance-execution.md) and its [future implementation plan](multi-instance-plan/README.md) are **not** part of FB01–FB09 or SI04–SI08. Foundations must preserve `one workflow attempt != one Session/Turn` without implementing instance orchestration. MI01–MI12 in the [test matrix](test-plan.md) should eventually prove user-defined steps/instructions/result reducers, effect-scoped admission, post-activation input consistency where required, independently recoverable contributions and one aggregate finish. Read-only review is a test case, **not** an Engine step type; task batches do not count as multi-instance proof.

## Deferred rather than falsely accepted

Full provider migration, richer prompts/composer, complete deterministic gate set, Task batch orchestration, automatic Session handover, GitHub/GitLab integration, full finalize, worktree removal UI, multi-machine/network filesystems and strong security against unrestricted same-OS-account adversaries are **not** required by Foundation B. Every deferral must identify the future owner and safety boundary; no exposed feature may claim deferred behavior works.

## Promotion / no-go

Promote workflow coordination to normative architecture only after Foundation B passes and the owner selects claim recovery, local actor/human approval trust and binding rebind behaviour. Migrate managed Sessions only with an agreed handshake contract. No-go: Runtime is needed for ordinary CLI workflow, a duplicate provider invocation is replayed under unknown outcome, an external claim auto-releases on PID/TTL alone, unauthorized human approval is accepted, or a canonical spec silently falls back to stale main data. Link all accepted choices to real tests and PR commits.
