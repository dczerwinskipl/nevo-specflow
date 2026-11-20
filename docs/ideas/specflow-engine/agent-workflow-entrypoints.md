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
  Proposed universal SpecFlow skill and distinct entry points for agent-assisted Specification
  creation, one eligible Specification or Task step, and later full preparation. External CLI and
  the managed Runtime broker use the same Engine operations; MCP is a future adapter.
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

A user should be able to ask a coding agent to **create a Specification**, **execute the
current step**, or later **prepare a complete Specification**, without manually assembling a prompt,
copying Task documents or guessing a transition. These are three different product outcomes,
not interchangeable names for one operation. The agent knows *how to interact with SpecFlow*;
the Engine tells it *what to do now*. Agent archetypes tell it *how to perform that kind of work*.

The underlying pieces already exist:

- `nevo-specflow specs create` and document commands;
- `tasks list|inspect|create|edit|status` and `workflow actions|start|finish|return`, using the
  Engine offline with a **local owner** actor;
- one shared workflow kernel for Specification and Task subjects, an existing `StepContext`,
  Task context authoring, managed Sessions, and project-owned archetypes;
- E6's separate [single-step delegation contract](reusable-workflow-manual-execution/agent-assisted-execution.md).

**Not implemented:** a portable agent entry protocol for both launch modes, an installed
project-mode "Create with an agent" journey, and the managed agent step execution path.
E6 already owns the planned `workflow context` command and step brief (slice 5),
claim-bound CLI routing through a Runtime broker (slice 3), and single-step Finish
(slice 6). **This idea adds the discoverability, bootstrap and cross-mode user journey, not
a competing context renderer, agent identity system or Finish implementation.**

Today's offline CLI attributes operations to the local OS owner. It must **not** be described
as an authenticated agent executor or evidence of human approval. External agent actor
provenance and long-lived claims remain L140. This proposal does not create another Workflow
engine or bypass E6's actor/claim rules.

## Three user intents, one execution contract

| User intent                         | Contract                                                                                                                                                                                                                                           | Delivery boundary                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Execute current step**            | Execute exactly one eligible Specification or Task step and submit its outcome.                                                                                                                                                                    | E6 / P102; explicit owner delegation, no unattended continuation                   |
| **Create Specification with agent** | Create the Specification, bind a managed Session and launch its first eligible authoring step. Creation or the first completed step does **not** mean the Specification is fully prepared.                                                         | Project-mode Create + agent start: L131, using E6 for step execution               |
| **Prepare complete Specification**  | Progress through required authoring, design, breakdown and review steps, pausing for questions, unavailable capabilities and owner decisions. End only at the Workflow's declared prepared/approved position, never after an arbitrary first step. | P103 automatic continuation + L131 entry, respecting human gates; **not** E6 alone |

A full preparation request must not be silently downgraded to "execute one authoring step" and
reported as successful preparation. If only the first-step path is supported, expose that
limitation explicitly before starting it. A completed step is not proof that all mandatory
Specification documents and Tasks have been prepared or approved.

### A. "Create Specification with agent / author the first step"

1. Discover the verified project and selected/created Specification, using the existing
   Create rules and archetypes. Do not infer a workspace from a folder name.
2. If no Specification exists, create it through a supported Engine path. A managed UI
   "Create with an agent" in real project mode remains the separate L131 product gap;
   demo-only behavior is not proof of that feature.
3. Inspect the Specification Workflow. In managed mode **Runtime starts/resumes** the
   permitted current step with the trusted agent identity *before dispatch*. An external
   CLI process follows its separate, explicitly documented local trust contract.
   Requirements gathering may ask the owner questions; an agent cannot manufacture owner
   approval.
4. Retrieve the bound `StepContext` and registered documents; edit them using the
   supported Engine Document operations. When the step produces Tasks, create real Task
   resources of allowed types with substantive descriptions, dependencies and context.
5. Submit the declared result/feedback/artifact references for this exact attempt. Engine
   verifies and publishes its transition. Do not start the next step automatically.

**Current limitation:** this journey starts the *first* eligible authoring step.
It is not the same as "Prepare complete Specification". Finishing the first step must
not set a product-level "Specification prepared" success indicator. P103 continuation
can later reuse exactly the same one-step execution contract, with human decisions
remaining outside agent authority.

### B. "Execute the current step of TASK-03" (Specification steps use the same protocol)

1. Resolve `specId` and `taskId` to one verified checkout; inspect readiness, definition
   revision and current step. Never infer the step from a chat prompt or past Session link.
2. In managed mode, ask Runtime to start/resume the exact attempt with its trusted
   executor binding before the agent Turn begins; an agent tool cannot self-authorize
   a new attempt.
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

## Existing operations and proposed entry contract

Avoid inventing new `workflow_prepare` or `workflow_actions` stateful services:
`workflow actions` already exists; E6 proposes `workflow context` and a
Runtime-rendered brief. The transport can adapt these **same Engine operations**
without defining new transitions or an independent context model:

| Operation      | Agent need                                                | Engine/Runtime responsibility                                          |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Discover       | Identify Project Home, Specification, Task and workspace  | Prove binding; no guessed cwd                                          |
| Inspect        | Learn the only legal next action                          | Project Workflow projection                                            |
| Prepare/start  | Obtain one permitted attempt and its context              | Runtime authorizes managed start; Engine checks gates, actor and claim |
| Read/write     | Obtain and change registered documents and Task resources | Revision, authorization, claim and recovery rules                      |
| Finish         | Propose declared result, feedback and artifacts           | Validate/fence, prove native stop where required, publish transition   |
| Inspect result | Distinguish success, refusal, unknown and recovery        | Idempotent authoritative status                                        |

A preparation response should carry stable subject, step, attempt, effective definition
revision, archetype/profile, Task Type if any, bounded context references with digests,
required gate facts, possible finish results and prior attempt handoff. It must be
versioned, bounded and independent of provider phrasing. Context resolution is
**E6 D13**; do not introduce a second context assembler in a skill.

### CLI, broker and optional MCP

- **External/offline agent:** a portable skill can use existing CLI reads, documents
  and Task commands under the **local OS account's authority**. That is not an agent
  identity, does not prove a human approval and is not a claim-aware E6 attempt.
  An independently attributed external agent execution requires L140's actor,
  durable claim and recovery design, with Runtime allowed to remain off.
- **Runtime-managed agent:** E6 has already selected **CLI routing through a private
  invocation-bound Runtime broker**, with a per-invocation capability and checked
  same-claim operations. Use that path for the first implementation. It does not
  impersonate the owner; E6 owns agent Finish, identity, stop proof and replay.
- **MCP:** optional future adapter over the *same broker operations* if a native
  provider can safely support it. Do not make E6 dependent on native MCP/extensions,
  introduce a global arbitrary-write server or quietly enable unsupported tools.
- **UI/HTTP:** owner launches the delegated attempt through Runtime, not an
  agent-supplied owner credential. API endpoints remain adapters.

The first supported tool path is therefore **CLI + Runtime broker** for managed
execution, CLI with explicit local trust for external agents. MCP is not a second
implementation and is not a prerequisite for this scope.

## Product bootstrap, portable skill and archetypes

Provide **one small, versioned product skill** (candidate name `nevo-specflow`)
that teaches: detect the project; inspect before acting; use an authorized adapter;
retrieve the context; never directly modify Engine execution state; submit Finish;
stop. The skill is an **offline/external entry point**, not the only way for a
managed Turn to learn the protocol.

The managed Claude and Codex adapters currently **disable configured native
skills/MCP** and enforce fixed tool inventories. They cannot be assumed to discover
an installed project skill. For managed Turns, Runtime must **inject a bounded,
versioned, product-owned protocol brief** alongside the Engine's StepContext,
with the exact CLI/broker commands and permissions available *to this invocation*.
E6 slice 5 already plans the brief; validate discovery and supported tools in
each native adapter before advertising "Ask agent". Do not silently turn on native
extensions or treat instructions as a security boundary.

For external agents, provide a provider-neutral source and generated or linked
provider-specific wrappers when the provider supports them. Document the
manual invocation/fallback when auto-discovery is unsupported. Never make a
provider's private skill filename authoritative over the Engine definition.

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

1. External CLI agent with Runtime stopped can discover the project, create a
   Specification and register draft Tasks with existing owner-attributed CLI operations,
   while the UI/README **clearly labels the OS-user trust limit**. Agent-attributed
   start/finish and an external execution claim are separate L140 acceptance work;
   neither is assumed working or authorized by this skill alone.
2. Managed Claude or Codex agent receives a protocol brief *without loading native
   skills or MCP*, one pinned Specification step and a working broker-backed CLI
   adapter. It finishes through E6 with a genuine agent actor. No owner's local
   CLI identity is substituted.
3. A managed Task implementation receives its Task context and a failed Review's
   feedback, finishes attempt 2, and **does not** launch Review automatically.
4. Task creation, dependencies and document registration are visible immediately in
   UI/CLI; owner-created drafts are not removed by an agent's Breakdown Finish.
5. Stale attempt, wrong worktree, missing document, forged approval, unregistered
   artifact and unknown native stop all refuse safely with useful diagnostics.
6. A normal ad-hoc Specification Session does not implicitly become a Workflow
   attempt; its historical Task association conveys no execution authority.
7. At least one installed real-project journey works without copying this repo's
   personal agent rules or manually injecting context into a prompt. When a provider
   cannot accept the required invocation-bound tools, Ask agent explicitly refuses,
   rather than silently downgrading to ad-hoc chat.
8. In project mode, **Create Specification with agent** creates and binds a Specification
   and first agent attempt, but does not claim that the entire preparation Workflow is done
   (L131 and E6 are both required).
9. **Prepare complete Specification** is accepted only once P103 can drive consecutive
   eligible steps and stop at every owner-only decision. Tests must distinguish a complete
   prepared/approved Workflow result from a successful first authoring step.

Not part of this idea: generic automatic step continuation, automatic Task selection,
multi-Task batches, scheduler, parallel Task worktrees, GitHub PR automation or a
new independent approval engine. See [sequential automation](sequential-agent-orchestration.md).
