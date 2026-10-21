---
id: ideas.specflow-engine
type: hub
title: Future Engine proposals and E1-E2 historical evidence
status: draft
scope: specflow
areas: [workflow, runtime, cli, configuration]
tags: [engine, worktree, offline, migration]
read_when:
  - evaluating deferred E3 E4 E5 work
  - distinguishing implemented E1 E2 from old candidate designs
summary: >
  Deferred E3-E5 proposals and dated E1-E2 design evidence; accepted foundations now have current architecture and reference docs.
related:
  - ideas.readme
  - architecture.runtime.specflow-engine
  - architecture.runtime.specflow-project-home
  - architecture.runtime.specflow-lifecycle
---

# Future Engine ideas and historical E1/E2 evidence

**Implemented E1/E2 authority has been promoted** to [Engine architecture](../../architecture/runtime/specflow-engine.md), [Project Home/workspaces](../../architecture/runtime/project-home-and-workspaces.md), [Specification lifecycle](../../architecture/runtime/specification-lifecycle.md), [HTTP API](../../reference/api/specflow-specification-operations.md), [configuration](../../reference/configuration/specflow-git-worktrees.md) and [durable recovery](../../engineering/shared/specflow-git-recovery.md).

Remaining **draft, not implemented** stages:

- [E3 Offline Workflow](execution-plans/03-offline-workflow-execution/README.md): deterministic step execution, claims, local actors and gates.
- [E4 Managed Sessions](execution-plans/04-managed-sessions-foundation/README.md): canonical Session/Turn/Work and mocked provider.
- [E5 Managed execution integration](execution-plans/05-managed-execution-integration/README.md): provider dispatch, claim settlement, explicit workflow finish.
- [Future multi-instance design](multi-instance-execution.md) and its [separate tasks](multi-instance-plan/README.md).

[Remaining runbook](execution-plans/README.md) includes only E3–E5. Historical proposal documents in this folder are **non-authoritative** and can contain obsolete API payloads or earlier lifecycle assumptions; current documentation and code win. Do not implement a future workflow or Session capability merely because E1/E2 established Engine infrastructure.
