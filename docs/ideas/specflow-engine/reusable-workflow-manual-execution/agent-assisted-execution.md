---
id: ideas.specflow-engine.reusable-workflow.agent-execution
type: engineering
title: Agent execution of workflow steps (superseded contract)
status: superseded
superseded_by: adr.0026-agent-step-execution
scope: specflow
areas: [workflow, runtime, ai]
tags: [superseded, agent-execution]
read_when:
  - following an old link to the "Ask agent" contract or its decisions D11 to D21
summary: >
  Superseded working contract of agent execution (PR #169, E6). Implemented as agent step
  execution: the decisions are ADR 0026, the Runtime side is the agent step execution architecture
  page, the Engine side the workflow kernel's agent attempts.
related:
  - adr.0026-agent-step-execution
  - architecture.runtime.agent-step-execution
  - architecture.workflow.workflow-kernel
---

# Agent execution of workflow steps (superseded)

Implemented, with the owner's changes of 2026-11-20 and 2026-11-21 (no device pairing, naming
"agent step execution" / "Run with agent", the attempt commit at finish also for a result that waits
for confirmation). The authoritative documents are:

| Part of the former contract                                                                    | Now                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Decisions D11 to D20, D21 superseded, trust model, rejected options                            | [ADR 0026](../../../architecture/decisions/0026-agent-step-execution.md)                                                                                           |
| Lifecycle, capability, broker, scope, CLI routing, refusals, redaction, allowlist, recovery    | [Agent step execution](../../../architecture/runtime/agent-step-execution.md)                                                                                      |
| Agent attempts, proposal, attribution, finalize, owner confirmation, Take over, attempt commit | [Workflow agent attempts](../../../architecture/workflow/workflow-agent-attempts.md)                                                                               |
| Owned-claim admission, F05                                                                     | [Workspace execution claims](../../../architecture/runtime/workspace-execution-claims.md#the-project-wide-resource)                                                |
| Ledger authors, agent document writes                                                          | [Document commit policy](../../../architecture/runtime/document-commit-policy.md#uncommitted-ledger)                                                               |
| Close and uncommitted agent work (D16)                                                         | [Specification Close](../../../architecture/runtime/specification-close-lifecycle.md#specification-exit-gate-and-abandon-d07)                                      |
| Routes and CLI                                                                                 | [Workflow HTTP API](../../../reference/api/specification-workflow.md), [CLI](../../../reference/cli/specflow-specification-commands.md#task-and-workflow-commands) |

Its delivery plan was working material and was removed after implementation.
