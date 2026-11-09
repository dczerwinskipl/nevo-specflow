---
id: ideas.specflow-engine.execution-plans
type: hub
title: Remaining SpecFlow Engine execution plans
status: draft
scope: specflow
areas: [workflow, runtime, cli, testing]
tags: [execution-plan, temporary, batching, implementation]
read_when:
  - planning the remaining offline workflow, managed execution integration or workflow kernel work
  - understanding the gates between those plans
summary: >
  Index of the temporary plans still open: 03 offline workflow surface and claims, 05 managed
  execution integration, and 06 workflow kernel follow-ups.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.plan-03
  - ideas.specflow-engine.plan-05
  - ideas.specflow-engine.plan-06
  - architecture.runtime.specflow-engine
  - architecture.workflow.workflow-kernel
---

# Remaining execution plans

Implemented stages have been retired: the Engine foundation, Specification lifecycle, the managed
Sessions foundation and the workflow kernel live in current architecture
([Engine](../../../architecture/runtime/specflow-engine.md),
[Specification lifecycle](../../../architecture/runtime/specification-lifecycle.md),
[Session storage and lifecycle](../../../architecture/ai/session-storage-and-lifecycle.md),
[workspace execution claims](../../../architecture/runtime/workspace-execution-claims.md),
[Workflow kernel](../../../architecture/workflow/workflow-kernel.md)).

| Plan                                                  | Scope                                                                                        | Gate                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Plan 03](03-offline-workflow-execution/README.md)    | Verification boundary, writer admission, recovery, human gates, CLI and Runtime read surface | Foundation B (FB01–FB09)                            |
| [Plan 05](05-managed-execution-integration/README.md) | Workflow steps driven from managed Sessions: readiness, finish, batch and handover           | After Plan 03; SI04–SI08                            |
| [Plan 06](06-workflow-kernel/README.md)               | Kernel follow-ups F01–F09, F11–F20 (orchestrator, CLI/MCP, gates, commits, admission, UI, …) | Each follow-up independent unless it says otherwise |

Plan 06 F01, F02, F05 and F09 overlap Plan 03 and Plan 05; pick the follow-up, then check the plan
task for its acceptance evidence. High-risk identity, security, journal and recovery changes require
solo independent review. [Multi-instance execution](../multi-instance-execution.md) and its
[future plan](../multi-instance-plan/README.md) are separate and not part of these gates.

## Cleanup policy

Temporary plans are deleted **by implemented stage**, after tests and independent review, once their
lasting rules are promoted to authoritative documents. Run `pnpm docs:check --write`,
`pnpm docs:check` and CI after any promotion; do not merge temporary task lists as a permanent
product specification format.
