---
id: ideas.specflow-engine.decisions
type: architecture
title: Open Engine workflow decisions
status: draft
scope: specflow
areas: [docs, workflow, runtime, cli, configuration]
tags: [decision-record, alternatives, adr, migration]
read_when:
  - deciding external writer claims, local actor trust or lock ordering for workflow steps
  - preparing an ADR for offline workflow coordination
summary: >
  Proposal backlog of the still open Engine decisions (external claims, offline actor
  attribution, filesystem scope, lock ordering, read-only enforcement, human approval trust,
  dirty-baseline admission) with the evidence each needs before promotion.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.ownership
  - ideas.specflow-engine.test-plan
  - ideas.specflow-engine.acceptance
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.local-actors
  - ideas.specflow-engine.multi-instance
---

# Open Engine workflow decisions

The Engine, Project Home, workspace registry, worktrees, Create/Close, Engine-owned commits,
managed Session dispatch claims and the workflow kernel are decided and implemented; their rules
live in [Engine boundaries](../../architecture/runtime/specflow-engine.md),
[workspace execution claims](../../architecture/runtime/workspace-execution-claims.md),
[Workflow kernel](../../architecture/workflow/workflow-kernel.md) and the ADRs. The decisions below
are still open. Multi-instance decisions are in [multi-instance execution](multi-instance-execution.md).

Owner constraints that still apply: agents may run outside Runtime and work through skills and the
CLI, without their native Sessions appearing in Runtime; deterministic workflow must work without a
running Runtime, with cross-process file-based coordination where proven safe.

## Open decision register

| ID  | Question / alternatives                                                                             | Proposed experiment or evidence                                                        |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D07 | External execution claim identity, proof, renewal and release when CLI ends?                        | Two-process conflict, invisible provider, no heartbeat, dead PID, unknown claim        |
| D08 | How does offline CLI actor attribution/authorization relate to Runtime HTTP Auth?                   | Document local trust boundary; reject untrusted owner/session handles                  |
| D14 | Is local filesystem-only coordination a documented constraint or do we need shared/network support? | Initial support only local supported filesystems; defer network/multi-host             |
| D15 | Where to run two-level lock coordination and what order?                                            | Cross-process deadlock and crash scenarios                                             |
| D20 | Does read-only provider transport actually prevent writes?                                          | Derive effect scope from enforced capabilities, not 'readOnly' request flag            |
| D21 | How are human approvals trusted if agent has local CLI/file access?                                 | Distinguish cooperative OS account model versus authenticated human channel; AG01–AG03 |
| D23 | How is Engine-produced dirty scaffold admitted to authoring without global gate bypass?             | SC01–SC02, owner decision on auto-commit versus declared baseline                      |

**Do not silently decide D07, D08 or D21 while implementing a workflow surface.** They determine
actual correctness. An implementation may narrow its supported cases explicitly.

## Alternatives already rejected for claims

- **Short lock only:** insufficient while an external agent edits after the CLI exits.
- **Every agent must register a Runtime Session:** not possible for an arbitrary externally launched
  agent without losing offline independence.
- **Database daemon for the lock registry:** introduces a process dependency; filesystem
  coordination is used instead.

See [recovery scopes](execution-scopes-and-recovery.md), [locking](locking-and-admission.md) and
[human gates](local-actor-and-human-gates.md).
