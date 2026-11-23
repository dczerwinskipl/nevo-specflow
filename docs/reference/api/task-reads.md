---
id: reference.api.task-reads
type: reference
title: Task and document read API
status: current
scope: specflow
areas: [server, runtime, workflow, security]
tags: [tasks, documents, pagination, compatibility, commands]
read_when:
  - listing Tasks and reading Task details or history
  - understanding Task resource and history responses
  - implementing scoped Task page tokens and continuation
  - creating, editing, removing or deciding the status of a Task over HTTP
summary: >
  Task inventory, detail, history, pagination and mutation endpoints, with
  authorization, revision preconditions and workflow admission rules.
related:
  - architecture.runtime.task-read-composition
  - reference.api.specification-workspace
  - reference.api.authorization
---

# Tasks HTTP API

Use the `Tasks` group in [OpenAPI](openapi.md) for exact query parameters,
request bodies, response schemas and refusal codes.

## Read Tasks

- `GET /api/specs/{specId}/tasks` lists Tasks with Runtime-defined grouping and
  attention information.
- `GET /api/specs/{specId}/tasks/{taskId}` returns a bounded Task detail with
  independent section availability.
- `GET /api/specs/{specId}/tasks/{taskId}/history` returns a bounded history page.

History tokens and cursors are scoped to the caller, Task, data source and read
snapshot. A missing or expired lease requires a new detail read, not an invented
offset or a retry with a different scope. A list or detail read never starts work.

## Edit Tasks

- `POST /api/specs/{specId}/tasks` creates a draft Task.
- `PATCH /api/specs/{specId}/tasks/{taskId}` edits supported fields.
- `PUT /api/specs/{specId}/tasks/{taskId}/status` changes the administrative status.
- `DELETE /api/specs/{specId}/tasks/{taskId}` removes an eligible Task.

Edits and deletes require an expected resource revision. The Engine checks Task
dependencies, workflow admission and authorization at the time of mutation.

The domain rules for pagination, grouping, visibility, blockers and mutations are in
[Task read, history and grouping](../../architecture/runtime/task-read-pagination-and-grouping.md).
For exact document revisions see [Documents API](specification-documents.md);
for start/finish/return use the [Workflow API](specification-workflow.md).
