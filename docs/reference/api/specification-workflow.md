---
id: reference.api.specification-workflow
type: reference
title: Specification and Task workflow action HTTP API
status: current
scope: specflow
areas: [runtime, server, workflow, security]
tags: [workflow, tasks, openapi]
read_when:
  - implementing a client of the manual Specification or Task workflow actions
  - changing the workflow action projection, a workflow command or its refusal codes
  - rendering Close blockers or the Abandon action
summary: >
  The workflow action projection of a Specification and of a Task, the owner commands start, finish,
  return and abandon, the stable refusal codes with their HTTP status, and the blockers of a refused
  exit.
related:
  - reference.api.openapi
  - reference.api.specflow-specification-operations
  - reference.api.authorization
  - reference.cli.specflow-specification-commands
---

# Specification and Task workflow action HTTP API

The exact HTTP contract, errors, body shapes and paths are generated from
`packages/specflow-contracts/src/workflow/` and
`packages/specflow-runtime/src/features/workflow/routes.ts`.
See [OpenAPI](openapi.md), operations with tag `Workflow`. Both Specification and
Task routes use these schemas; the demo Runtime executes the same Engine rules in memory.

The interpretation of owner actions, projections, gates, draft Tasks, replay and refusals
is now owned by [Owner workflow action projections](../../architecture/workflow/workflow-action-projections.md).
The underlying deterministic workflow invariants remain with
[Workflow kernel](../../architecture/workflow/workflow-kernel.md). Rendering is
a [product behavior](../../product/specflow/ui/workflow-execution.md), not a second HTTP contract.

## Routes

Use generated OpenAPI's `Workflow` tag to retrieve the ten Specification/Task workflow routes.

## Actor

See [Owner actor and read boundary](../../architecture/workflow/workflow-action-projections.md#owner-actor-and-read-boundary).

## Projection

See [Position and outline](../../architecture/workflow/workflow-action-projections.md#position-outline-and-next-step-certainty),
[Gates and relations](../../architecture/workflow/workflow-action-projections.md#gates-and-document-relations),
and [Task authoring](../../architecture/workflow/workflow-action-projections.md#task-context-and-dependency-authoring).

## Commands

See [Start, finish, return, wait and Abandon](../../architecture/workflow/workflow-action-projections.md#start-finish-return-wait-and-abandon).

## Refusals

See [Refusals and authoritative sources](../../architecture/workflow/workflow-action-projections.md#refusals-and-authoritative-sources)
and the generated OpenAPI response schemas.
