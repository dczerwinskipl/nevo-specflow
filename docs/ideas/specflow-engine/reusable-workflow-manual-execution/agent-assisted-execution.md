---
id: ideas.specflow-engine.reusable-workflow.agent-execution
type: engineering
title: Agent-assisted deterministic Specification and Task execution
status: draft
scope: specflow
areas: [workflow, runtime, ai, ui, cli, security, testing]
tags: [agent-execution, task-authoring, managed-sessions, deterministic]
read_when:
  - adding an Ask agent action beside manual Workflow execution
  - implementing agent-written Specification documents and Task resources
  - integrating Managed Sessions with Workflow start and finish
summary: >
  Owner-delegated execution of one declared Workflow step by an agent, including
  Specification authoring, Task descriptions, dependencies and context, with
  durable Session and attempt correlation and shared Engine validation.
related:
  - ideas.specflow-engine.reusable-workflow
  - ideas.specflow-engine.reusable-workflow.delivery
  - ideas.specflow-engine.reusable-workflow.boundaries
  - ideas.specflow-engine.task-resource-and-context
  - ideas.specflow-engine.plan-06
  - architecture.workflow.workflow-kernel
---

# E6 — Agent-assisted deterministic Workflow (proposal)

## Product scenario

For an eligible step, a user can choose **Do it myself** or **Ask agent**. They may alternate from step to step inside the same Specification or Task workflow. Human-only steps and owner approval remain human-only. Agent execution does **not** require another workflow definition or an AI-specific orchestration engine.

The owner may create a Specification, write some documents, delegate a specification-writing step, manually create some Tasks, delegate further decomposition, review generated drafts, and execute or delegate selected Task steps. A Task Type selects the Task's user-defined workflow, not a hard-coded implementation/review template.

**Default is one explicitly requested step.** A transition marked auto does not automatically authorize a new Managed Session. Full unattended F01 chaining and F12 automatic Task batches remain future decisions.

## Protocol and owners

~~~text
Owner selects subject + step + Ask agent in UI
 -> Runtime authenticates, Engine validates readiness and executor policy
 -> durable Run/attempt-to-Session/Turn binding and writer admission
 -> Managed Session receives pinned StepContext and resolved F20 context
 -> agent performs permitted Document/Task operations through Engine APIs
 -> agent submits declared finish input (result, feedback, artifacts)
 -> Engine validates same attempt, transition and effects, writes one recoverable result
 -> Runtime settles Turn/claim; UI shows next action; agent stops
~~~

The neutral Workflow coordinator decides allowed transitions and emits intents. Engine owns Specification and Task state, resource mutations, claims and journal, and Runtime owns Session/Turn dispatch. A message saying done is **not** a successful workflow finish. Agents do not choose transition targets, fabricate actor identities, edit .execution directly, or approve Tasks as the human owner.

This adapts legacy Nevo's authoritative StepContext/finishContract with start, bounded work, finish and stop. Reuse current Engine contracts and Git/document operations rather than copying the legacy finalize saga.

## Specification and documentation work

An eligible agent may inspect and update Specification documents with the existing Engine Document operations and revision checks, not an ad hoc provider-specific file writer. Available repository docs tools provide exact docs:get and lexical docs:find/docs:context discovery. These are **not proof of vector/semantic RAG**; F20 explicit context references, required/optional semantics, document hashes and scope still govern what the agent receives. Additional permitted reading does not grant additional write permission.

## Task creation and editing

For a step declared as producing Tasks, the agent must have access to the **same** Task Resource create/edit commands as the UI (through CLI+skill, scoped API or a thin MCP adapter). The generated Task is a real resource, not a chat response or a summary in the Specification.

| Field           | Agent capability and Engine validation                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity        | Stable id, title, summary, allowed Task Type and its workflow binding                                                                                 |
| Primary content | Real editable task.md describing purpose, work, expected artifacts, acceptance criteria and verification                                              |
| Documents       | Add/edit registered Task-scoped files using revision and journaling rules                                                                             |
| Dependencies    | dependsOn links across existing/generated Tasks, rejecting missing ids, self-dependencies and cycles                                                  |
| Context         | F20 typed, ordered required/optional document, specification-document, repository-document, path, instructions and path-hint entries; enforce budgets |
| Provenance      | Trusted source attempt and actor, no duplication on retry                                                                                             |
| Lifecycle       | Agent proposes draft; owner reviews/edits and approves; no forged human sign-off                                                                      |

D06 must prevent materializeTasks' complete-list behavior from silently cancelling drafts owned by another attempt or a human. Decide whether incremental Task editing or an atomic producing-step finish is authoritative, and keep both transports consistent. A single logical change must safely publish the Task index, task.yaml, task.md, documents, dependencies and any affected Workflow state. Agent file access is not permission to patch Task/index/execution records instead of validated Engine operations.

For a selected Task step the agent receives the pinned Task workflow, its StepContext, context documents, dependency/readiness facts and previous feedback. It only performs that step, reports one allowed result and stops. Review failure/rework, escalation and wait settlement stay deterministic.

## Delivery and recovery

E6a: owner-triggered agent writes a Specification document and finishes one step, using a narrow slice of F01, F02, F05/F09 and F16. This can be scheduled before Task Resource E2 if authenticated one-step launch and document mutation/recovery are already proven.

E6b: once F20 is implemented, an agent drafts full Task resources and typed contexts. E6c: selected Task step execution shares the E6a Session/finish path. E6d: mixed manual/agent UI shows attempts, actor, Session, outputs and next action; cancellation/takeover uses F13/F17 rather than changing executor silently.

## Acceptance

1. Owner creates a Specification and requests a permitted agent step. Agent writes real documents and finishes; **no next Session appears without authorization**.
2. Agent creates three Tasks (for example discovery, backend depending on discovery, UI depending on backend), each with full task.md, acceptance checks, allowed type and explicit context. They appear in UI as drafts and remain editable/approvable.
3. Existing manual drafts survive an agent breakdown finish. Cycles, invalid types, missing required context, stale revisions and cross-Specification writes fail without partial publication.
4. User handles one Task step manually and delegates another. Review-fail/rework and human-only approval preserve the same Workflow semantics.
5. Lost launch response, Runtime restart, duplicate finish, active Session cancellation and late provider callback do not duplicate Sessions/Tasks, bypass claims or advance an unauthorized attempt.
6. The existing offline CLI+skill path uses the same Engine mutations, with its independently documented local trust limitations.

**Deferred:** unattended step chaining, automatic Task selection/batches, scheduled automation, arbitrary action/plugin registry, parallel Task worktrees and unverified assumptions about automatic gates or vector RAG.
