---
id: reference.api.task-reads
type: reference
title: Task and document read API
status: current
scope: specflow
areas: [server, runtime, workflow, security]
tags: [tasks, documents, pagination, compatibility, commands]
read_when:
  - implementing the Task read ownership refactor
  - migrating Task schemas out of Specification Workspace
  - implementing scoped Task page tokens and continuation
  - creating, editing, removing or deciding the status of a Task over HTTP
summary: >
  Compatible Task and Document HTTP ownership, application outcomes, page lease
  semantics, the Engine-backed project-mode reads and the owner's Task commands (create, edit,
  remove, status) with their refusal statuses.
related:
  - architecture.runtime.task-read-composition
  - reference.api.specification-workspace
  - reference.api.authorization
---

# Task and document read API

Task HTTP contracts are generated from TypeBox in `packages/specflow-contracts/src/tasks/`
and feature routes in `packages/specflow-runtime/src/features/tasks/`. See
[Runtime OpenAPI](openapi.md), tag `Tasks`, for Task detail/history, grouped inventory,
Task create/edit/delete/status and typed responses.

Ownership, scope, page-lease security, task presentation grouping, exact-version document reads,
and command constraints are described in
[Task read composition, pagination and grouping](../../architecture/runtime/task-read-pagination-and-grouping.md).
The workflow projection is a separate source:
[Owner workflow action projections](../../architecture/workflow/workflow-action-projections.md).

This reference retains its discovery ID and historic section anchors, not a duplicate wire schema.

## Status and compatibility

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-source-and-authority) and the generated OpenAPI `Tasks` operations.

## Shared contract ownership

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-source-and-authority) and the generated OpenAPI `Tasks` operations.

## Detail success and availability

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-source-and-authority) and the generated OpenAPI `Tasks` operations.

## Page wire format

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#history-leases-and-continuation) and the generated OpenAPI `Tasks` operations.

## Token and cursor semantics

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#history-leases-and-continuation) and the generated OpenAPI `Tasks` operations.

## Authorization and typed application outcomes

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#visibility-and-errors) and the generated OpenAPI `Tasks` operations.

## Project mode: Engine reads

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-source-and-authority) and the generated OpenAPI `Tasks` operations.

## Tasks page

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-list-and-runtime-grouping) and the generated OpenAPI `Tasks` operations.

### Dashboard grouping

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-list-and-runtime-grouping) and the generated OpenAPI `Tasks` operations.

### Attention items

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-list-and-runtime-grouping) and the generated OpenAPI `Tasks` operations.

## Task commands

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#task-commands-and-inputs) and the generated OpenAPI `Tasks` operations.

## Versioned document read

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#versioned-document-reads) and the generated OpenAPI `Tasks` operations.

## Production admission evidence

See [Task read composition](../../architecture/runtime/task-read-pagination-and-grouping.md#verification-boundary) and the generated OpenAPI `Tasks` operations.
