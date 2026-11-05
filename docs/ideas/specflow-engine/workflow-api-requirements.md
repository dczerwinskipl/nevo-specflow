---
id: ideas.specflow-engine.workflow-api-requirements
type: engineering
title: Draft requirements for the workflow API (not a design)
status: draft
scope: specflow
areas: [workflow, runtime, server]
tags: [requirements, draft, workflow, attention]
read_when:
  - designing the Runtime HTTP API, CLI or MCP surface of Specification and Task execution
  - designing the attention quick-start screen
summary: >
  What a workflow API must allow, collected while the kernel was built. No endpoints, payloads or
  status codes are designed here on purpose: requirements may still change and the design follows them.
related:
  - architecture.workflow.workflow-kernel
  - ideas.specflow-engine.plan-06
  - adr.0019-workflow-kernel-and-automatic-continuation
---

# Workflow API — draft requirements

This is a requirements list, not a design. Each item names the Engine operation it maps to today.

## Reads

- **R1.** Show the execution of a Specification: its run (step, attempt, position), every Task with its
  type, workflow, position, readiness (ready / blocked / waiting for dependencies) and handoff, and the
  open attention items. Maps to `inspectExecution`.
- **R2.** Show the step context of an active attempt, the same context the agent gets: purpose,
  instructions, allowed results, handoff and archetype. Maps to `StartResult.context` and must also be
  readable without starting.
- **R3.** List the attention items of a project across Specifications, for overview badges and
  notifications.
- **R4.** List workflows, agent archetypes and task types with their problems. The generic definitions
  listing must cover the new kinds.

## Commands

- **C1.** Start Specification execution and start Task execution. Both are idempotent: starting an
  active step resumes it. The executor identity comes from the authenticated caller or the Session
  binding, never from the payload.
- **C2.** Finish an attempt with `result`, `feedback`, `artifacts` and, for producing steps, `tasks`.
  The caller must name the attempt (step + attempt number). A human finish carries the human actor; an
  agent can never finish a human step.
- **C3.** Return to a declared step with feedback.
- **C4.** Quick start from an attention item:
  - prefill the provider and model from `suggestion`;
  - when `blocker` or the reason is `model-missing` / `provider-not-chosen`, let the owner choose them;
  - start through C1, so the item disappears in the same way for every path.
- **C5.** Remember a choice: set the model (and optionally the preferred provider) of an agent
  archetype. Maps to `rememberArchetypeModel`. It changes a definition file, which must become
  committable through the definitions commit flow.

## Behaviour that the API must not break

- **B1.** No surface infers progression or decides the next step. Every surface calls the same
  operations.
- **B2.** Errors are the machine-readable `WorkflowErrorCode`s, so a client can tell a conflict, a
  stale attempt, a blocked Task and invalid input apart.
- **B3.** A `continue` decision is executed only by the Runtime orchestrator. Clients only observe it.
- **B4.** Attention updates are pushed (SSE or equivalent), and the item disappears after any start.
- **B5.** Agents receive only an acceptance and a short continuation summary after their finish, never
  the attention internals or a question about models.

## Open questions (to decide before the design)

- **Q1.** Should a human be able to finish an agent step (manual takeover)? The kernel allows it today.
- **Q2.** Should project-level notifications (beyond the UI) be required for attention?
- **Q3.** Should the remember choice be per project (a committed definition) only, or also per user
  (a local override)?
