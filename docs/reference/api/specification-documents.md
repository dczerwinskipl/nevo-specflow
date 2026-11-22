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

# Specification documents HTTP contract

**Authoritative transport:** [Runtime OpenAPI](openapi.md) (tag `Documents`), generated
from `packages/specflow-contracts/src/documents/` and the Runtime feature routes.
The generated specification owns endpoints, DTO fields, preconditions, status/error
responses, cache headers, revision conditions and examples.

**Authoritative behavior:** [Document architecture](../../architecture/runtime/specification-documents.md)
for registry, archetypes, path safety, commit queue, Git policy, Task documents and
invariants; [Document API and transport behavior](../../architecture/runtime/document-operation-transport.md)
for HTTP-visible result semantics and safe raw streams; and
[Document editor client behavior](../../product/specflow/ui/document-editor-client-behavior.md)
for the editor, recovery and Close UX.

**Demo:** temporary `/api/demo/**` writes still exist and are excluded from the
committed OpenAPI; see [demo convergence proposal](../../ideas/demo-api-convergence.md).
They are not a second target contract. This reference retains its stable ID and
historic headings while the demo routes converge.

## Principle: one contract for demo and real

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Endpoints

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Shared vocabulary

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Archetype catalogue and Create request

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

### Definition files (project data, one per definition)

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Tree, read, raw

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

### Raw content

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Write operations and commit state

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Commit policy, uncommitted changes and manual commit

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Task documents

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Errors

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.

## Notes for clients

Refer to generated OpenAPI and the domain owners linked above; this section no longer duplicates the HTTP contract.
