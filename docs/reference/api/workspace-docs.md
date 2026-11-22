---
id: reference.api.workspace-docs
type: reference
title: Workspace documentation HTTP API
status: current
scope: specflow
areas: [runtime, server, docs, security]
tags: [semantic-search, authorization, workspace]
read_when:
  - calling or changing GET /api/workspaces/:workspaceId/docs, its documents or its search
  - building a client of the documentation reader (tree, article, search, corpus revision)
  - changing the docs.view capability or the Runtime start refresh of the docs index
  - diagnosing why a Runtime documentation search answers lexically, 404, 409, 410 or 503
summary: >
  The Runtime serves the documentation of each registered workspace: GET
  /api/workspaces/:workspaceId/docs lists its documents (active, inactive, skipped),
  .../docs/documents/:documentId reads one article (body without frontmatter, sections, related
  states; 410 for an inactive one) and .../docs/search ranks documents in the result of
  nevo-specflow docs search --json, with the proposals left out and the index
  progress. Every answer carries a corpusRevision; docs.view at the project scope, errors, the
  read-time refresh, the background catch-up and the start refresh.
related:
  - adr.0022-workspace-scoped-documentation-reader
  - adr.0020-documentation-discovery-is-a-product-capability
  - reference.api.workspaces
  - reference.cli.nevo-specflow-docs
  - reference.configuration.documentation-and-embeddings
  - architecture.runtime.authorization
  - product.specflow.ui.documentation-reader
  - reference.api.openapi
---

# Workspace documentation HTTP API

The transport contract is generated from `packages/specflow-contracts/src/docs/workspace/`
and Fastify routes in `packages/specflow-runtime/src/features/docs/`. Its OpenAPI operations
are `getWorkspacesByWorkspaceIdDocs`, `getWorkspacesByWorkspaceIdDocsDocumentsByDocumentId`,
and `getWorkspacesByWorkspaceIdDocsSearch` in [Runtime OpenAPI](openapi.md).

The behavior behind authorization, corpus revision, index freshness, lexical fallback and
workspace isolation is described in
[Workspace documentation corpus](../../architecture/runtime/workspace-documentation-corpus.md).
The [product reader](../../product/specflow/ui/documentation-reader.md) owns UI behavior.
This page retains the stable discovery ID, not a second manually maintained HTTP schema.

## Common rules

See [Workspace identity, access and corpus](../../architecture/runtime/workspace-documentation-corpus.md#workspace-identity-access-and-corpus).

## GET /api/workspaces/:workspaceId/docs

See OpenAPI `getWorkspacesByWorkspaceIdDocs` and
[Documents and search projections](../../architecture/runtime/workspace-documentation-corpus.md#documents-and-search-projections).

## GET /api/workspaces/:workspaceId/docs/documents/:documentId

See OpenAPI `getWorkspacesByWorkspaceIdDocsDocumentsByDocumentId` and
[Documents and search projections](../../architecture/runtime/workspace-documentation-corpus.md#documents-and-search-projections).

## GET /api/workspaces/:workspaceId/docs/search

See OpenAPI `getWorkspacesByWorkspaceIdDocsSearch` and
[Semantic refresh](../../architecture/runtime/workspace-documentation-corpus.md#semantic-refresh-and-concurrency-policy).

## Authorization

See [Workspace identity, access and corpus](../../architecture/runtime/workspace-documentation-corpus.md#workspace-identity-access-and-corpus) and
[Runtime authorization](../../architecture/runtime/auth/authorization.md).

## Errors

Codes and response shapes are generated in OpenAPI. Their domain meaning is explained in
[Workspace identity, access and corpus](../../architecture/runtime/workspace-documentation-corpus.md#workspace-identity-access-and-corpus).

## Index freshness

See [Semantic refresh and concurrency policy](../../architecture/runtime/workspace-documentation-corpus.md#semantic-refresh-and-concurrency-policy).
