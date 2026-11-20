---
id: ideas.specflow-engine.agent-workflow-entrypoints
type: engineering
title: Agent workflow entry points and portable SpecFlow skill
status: draft
scope: specflow
areas: [ai, workflow, cli, runtime, docs, security]
tags: [agent-skill, cli, mcp, entrypoint, specification, task, execution]
read_when:
  - designing an agent-facing write-specification or execute-current-step command
  - deciding how a portable skill uses CLI or MCP without duplicating Engine rules
  - connecting agent profiles, StepContext and Task context to a delegated attempt
summary: >
  Proposed universal SpecFlow skill and explicit agent entry points for writing a Specification
  or executing one current Specification or Task step. CLI and MCP adapt the same Engine operations;
  managed authorization and agent finish remain owned by E6, with automation deferred.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.offline-agents
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - ideas.specflow-engine.sequential-agent-orchestration
  - ideas.definition-starter-packs
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - adr.0024-tasks-are-resources
---

# Agent workflow entry points and portable SpecFlow skill

## Problem and boundary

A user should be able to tell a coding agent **"write a Specification"** or **"execute the current
step"** without manually assembling the prompt, copying Task documents, guessing a transition or
running a separate owner Finish in the UI. The agent knows *how to interact with SpecFlow*;
the Engine tells it *what to do now*. Agent archetypes tell it *how to perform that kind of work*.

The underlying pieces already exist:

- `nevo-specflow specs create` and document commands;
- `tasks list|inspect|create|edit|status` and `workflow actions|start|finish|return`, using the
  Engine offline with a **local owner** actor;
- one shared workflow kernel for Specification and Task subjects, an existing `StepContext`,
  Task context authoring, managed Sessions, and project-owned archetypes;
- E6's separate [single-step delegation contract](reusable-workflow-manual-execution/agent-assisted-execution.md).

**Not implemented:** a portable SpecFlow execution skill, one authoritative agent entry point,
full resolution of step/Task inputs into the delegated Turn, and a managed agent completion
transport. Offline CLI commands do not make their caller a Runtime-bound agent, and CLI
`finish` currently records a local owner action. This proposal does **not** create another
Workflow engine or bypass E6's claim/actor rules.

## Two user journeys, one execution contract

### A. "Write the specification for this change"

1. Discover the verified project and selected/created Specification, using the existing
   create rules and archetypes. Do not infer a workspace from a folder name.
2. If no Specification exists, create it through a supported Engine path. A managed UI
   "Create with an agent" in real project mode remains the separate L131 product gap;
   demo-only behavior is not proof of that feature.
3. Inspect the Specification Workflow. Start or resume **only** the permitted current step,
   as the actual executor. Requirements gathering may ask the owner questions; an agent
   cannot manufacture owner approval.
4. Retrieve the bound `StepContext` and registered documents; edit them using the
   supported Engine Document operations. When the step produces Tasks, create real Task
   resources of allowed types with substantive descriptions, dependencies and context.
5. Submit the declared result/feedback/artifact references for this exact attempt. Engine
   verifies and publishes its transition. Do not start the next step automatically.

"Write the specification" does not promise that every future requirement, architectural
approval, Task review and owner acceptance can be completed without a person.

### B. "Execute the current step of TASK-03"

1. Resolve `specId` and `taskId` to one verified checkout; inspect readiness, definition
   revision and current step. Never infer the step from a chat prompt or past Session link.
2. Start/resume the exact attempt with its trusted executor binding.
3. Receive **step purpose, instructions, archetype, Task Type, Task description and context,
   dependencies, gate requirements, allowed results and preceding handoff/feedback**.
4. Read registered references with digests/revisions rather than blindly injecting all
   repository files into a huge prompt. Read required documents before editing.
5. Work within the selected checkout and supported provider tool policy.
6. Submit a structured finish proposal: exact subject/step/attempt, result,
   feedback when required and registered artifacts. A completed chat Turn is not a
   Workflow completion. If a gate or dependency blocks Finish, explain the blocker and
   leave the attempt active instead of fabricating success.

A Specification step and a Task step follow this **same** protocol. Their domain inputs
differ, not their execution mechanism.

## Proposed interaction contract

`workflow_actions` / `workflow_prepare` are logical operations, **not existing tool names**.
The transport may expose them differently, but both use the same Engine services:

| Operation      | Agent need                                                | Engine/Runtime responsibility                                        |
| -------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Discover       | Identify Project Home, Specification, Task and workspace  | Prove binding; no guessed cwd                                        |
| Inspect        | Learn the only legal next action                          | Project Workflow projection                                          |
| Prepare/start  | Obtain one permitted attempt and its context              | Pin/check definition, gates, actor and claim                         |
| Read/write     | Obtain and change registered documents and Task resources | Revision, authorization, claim and recovery rules                    |
| Finish         | Propose declared result, feedback and artifacts           | Validate/fence, prove native stop where required, publish transition |
| Inspect result | Distinguish success, refusal, unknown and recovery        | Idempotent authoritative status                                      |

A preparation response should carry stable subject, step, attempt, effective definition
revision, archetype/profile, Task Type if any, bounded context references with digests,
required gate facts, possible finish results and prior attempt handoff. It must be
versioned, bounded and independent of provider phrasing. Context resolution is
**E6 D13**; do not introduce a second context assembler in a skill.

### CLI versus MCP

- **External/offline agent:** use the product CLI plus a portable skill. Preserve the
  offline-without-Runtime path and explicit local trust limitation from
  [offline external agents](offline-cli-and-external-agents.md). A durable external
  execution identity/claim is still an open part of that path.
- **Runtime-managed agent:** prefer an invocation-scoped MCP/tool adapter or local broker
  over E6's exact authenticated operations. The agent does not gain owner permissions
  by running the ordinary offline CLI in the same worktree. E6 owns claim-bound writes,
  agent Finish, identity, positive-stop evidence and replay.
- **UI/HTTP:** an owner launches the delegated attempt through Runtime. API endpoints
  are adapters; no business rule or transition is defined by the UI or skill.
- Tool names and transport details may differ. They return one common result model and
  invoke one source of truth.

Neither MCP nor CLI creates a separate Task lifecycle. Avoid a global unscoped MCP server
with arbitrary file mutation or impersonation of the owner.

## Portable skill and archetypes

Provide **one small, versioned product skill** (candidate name `nevo-specflow`) discoverable
from normal agent entry instructions. It teaches: detect the project; inspect before
acting; use the authorized tool adapter; retrieve context; never directly modify
Engine execution state; submit Finish; stop. Generate provider-specific wrappers
when necessary without duplicating the protocol.

Keep these responsibilities separate:

- Universal skill: **how to use** SpecFlow, regardless of the current step or stack.
- Engine-provided StepContext: **what** to do, which subject/attempt/results, and which
  materials are authoritative *for this invocation*.
- Agent archetype/role instructions: **how to execute** implementation, review,
  discovery or Specification authoring; the project's existing definitions remain
  authoritative for profile selection.
- Stack-specific definition packs: additional guidance and verification, not another
  workflow protocol ([starter packs](../definition-starter-packs.md)).

A managed invocation that binds `reviewer` starts with that selected role; it must not
auto-switch to `implementer` just because the content mentions implementation.

## Acceptance and non-goals

Acceptance scenarios:

1. External CLI agent with Runtime stopped creates a Specification and registers draft
   Tasks without hand-editing Engine manifests; start/finish behavior matches local trust.
2. Managed Claude or Codex agent receives one pinned Specification step and finishes it
   through E6 with a genuine agent actor. No owner's local CLI identity is substituted.
3. A managed Task implementation receives its Task context and a failed Review's
   feedback, finishes attempt 2, and **does not** launch Review automatically.
4. Task creation, dependencies and document registration are visible immediately in
   UI/CLI; owner-created drafts are not removed by an agent's Breakdown Finish.
5. Stale attempt, wrong worktree, missing document, forged approval, unregistered
   artifact and unknown native stop all refuse safely with useful diagnostics.
6. A normal ad-hoc Specification Session does not implicitly become a Workflow
   attempt; its historical Task association conveys no execution authority.
7. At least one installed real-project journey works without copying this repo's
   personal agent rules or manually injecting context into a prompt.

Not part of this idea: generic automatic step continuation, automatic Task selection,
multi-Task batches, scheduler, parallel Task worktrees, GitHub PR automation or a
new independent approval engine. See [sequential automation](sequential-agent-orchestration.md).
