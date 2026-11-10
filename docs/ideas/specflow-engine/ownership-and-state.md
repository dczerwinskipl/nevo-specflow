---
id: ideas.specflow-engine.ownership
type: architecture
title: Human approval provenance and external claim reconciliation
status: draft
scope: specflow
areas: [workflow, runtime, security]
tags: [ownership, authority, approval, reconciliation]
read_when:
  - recording a human approval or verification in workflow state
  - deciding what Runtime or the CLI reconciles on start-up for claims it did not create
summary: >
  Open proposals on state authority: verifiable provenance for human approvals and how external
  claims are reconciled on boot without a daemon or a fabricated Session. The rest of the authority
  split is current architecture.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.offline-agents
  - ideas.specflow-engine.locking
  - ideas.specflow-engine.local-actors
  - architecture.ai.canonical-session-turn-work
  - architecture.runtime.ownership-and-lifecycle
---

# Human approval provenance and external claim reconciliation

The authority split is current: Engine owns Specifications, documents, the workflow kernel state
(`.execution/` in Git, change journals locally) and durable operation journals; Runtime owns managed
Sessions, live provider processes and HTTP authorization
([Engine boundaries](../../architecture/runtime/specflow-engine.md),
[Runtime ownership](../../architecture/runtime/ownership-and-lifecycle.md),
[Workflow kernel](../../architecture/workflow/workflow-kernel.md)). **Workflow ownership is not AI
Session ownership**: an external agent can progress the workflow through the CLI without a Runtime
Session. Two parts are still open.

## Human approval provenance

Do not equate the existence of a locally persisted `humanVerification` record with an
authenticated human decision. Human-gate evidence is per Specification/Task/step/attempt/gate and
carries verifiable actor provenance under an adopted trust model. The kernel already requires a
human executor from trusted context for human steps and owner operations; it does not yet record
how that human was authenticated. Under an unrestricted shared OS account, a CLI argument
`--role owner` or a claim token is not strong proof of a human. Offline agents may request review
but must not self-approve through their execution identity; see
[local actors and human gates](local-actor-and-human-gates.md).

## External claim reconciliation on boot

- Engine reconciliation runs when any process next accesses the project; no always-running daemon
  is assumed.
- Runtime start-up may request Engine reconciliation of claims it created (managed Turns are
  reconciled through their workspace execution claims), but it cannot override an unresolved
  external claim merely because it did not spawn the agent.
- Loss of a provider process is not loss of a durable workflow attempt; an incomplete workflow can
  resume later, and releasing a claim never marks a step finished.
- Diagnostics distinguish `blocked`, `recoverable`, `unknown/ambiguous` and `settled` without
  fabricating a live Session. Records that reference missing worktrees stay diagnosable, and
  Runtime transcript history stays readable when a workspace is moved or unavailable.
