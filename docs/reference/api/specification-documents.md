---
id: reference.api.specification-documents
type: reference
title: Specification documents HTTP contract
status: current
scope: specflow
areas: [runtime, server, ui]
tags: [specifications, documents, archetypes, contracts]
read_when:
  - implementing or consuming the archetype catalogue, document tree, document read or document operations
  - switching a client from the documents demo endpoints to the real backend
  - mapping document error codes in the UI
summary: >
  Contract of the Specification documents layer shared by the Runtime demo and the real backend:
  endpoints, schema outline, content kinds and raw-content headers, the write contract with asynchronous commit state,
  definition files and their problems, error codes and the explicit
  notes for clients. Exact schemas live in @nevo/specflow-contracts/documents.
related:
  - architecture.runtime.specification-documents
  - product.specflow.specification-documents
  - adr.0016-engine-owned-document-commits
  - adr.0017-definitions-as-project-data
  - adr.0018-engine-commit-policy-and-manual-commit
  - reference.api.specflow-specification-operations
  - reference.api.specification-creation-demo
---

# Specification documents API

The `Documents` group in [OpenAPI](openapi.md) defines Specification and Task
document operations, request schemas, conditional reads, errors and commit results.

## Browse and read

- `GET /api/specs/{specId}/document-tree` lists registered and unclassified files.
- `GET /api/specs/{specId}/documents/{documentId}` reads document metadata and text.
- `GET /api/specs/{specId}/documents/{documentId}/raw` streams the content revision.
- Task documents use the corresponding
  `/api/specs/{specId}/tasks/{taskId}/document-tree` and `.../documents/{documentId}`
  paths.

A requested `revision` identifies exact content, not the most recent file if the
requested revision is unavailable. Raw reads have explicit content and download
headers. See [document read and revision semantics](../../architecture/runtime/document-operation-transport.md).

## Write and observe commits

- `POST /api/specs/{specId}/documents` creates a file;
  `PUT /api/specs/{specId}/documents/{documentId}` updates one.
- `POST /api/specs/{specId}/documents/save` saves a batch;
  `POST /api/specs/{specId}/folders` creates a folder.
- `POST /api/specs/{specId}/document-operations` submits a document operation;
  `GET /api/specs/{specId}/document-operations/{operationId}` inspects its outcome.
- `POST /api/specs/{specId}/document-commits/flush` settles pending commits;
  `GET /api/specs/{specId}/uncommitted` inspects outstanding changes;
  `POST /api/specs/{specId}/commit` requests an explicit commit.

Task document writes use the Task-scoped `.../documents` and
`.../document-operations` routes. Saving content and committing it to Git are
separate states; callers must not treat an accepted save as a completed commit.

For write ownership, path safety, definitions, Git policy and recovery, see
[Specification document architecture](../../architecture/runtime/specification-documents.md)
and [document operation behavior](../../architecture/runtime/document-operation-transport.md).
The [editor interaction contract](../../product/specflow/ui/document-editor-client-behavior.md)
covers user feedback, conflicts and Close warnings.
