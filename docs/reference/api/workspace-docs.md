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

The `Documentation` operations in [OpenAPI](openapi.md) provide documentation
for a registered workspace:

- `GET /api/workspaces/{workspaceId}/docs` lists documents and their active state.
- `GET /api/workspaces/{workspaceId}/docs/documents/{documentId}` reads one document.
- `GET /api/workspaces/{workspaceId}/docs/search` searches the workspace's corpus.

All three use the trusted workspace binding. Access requires `docs.view` at project
scope. Each response reports `corpusRevision` so clients can detect a changed
documentation corpus. Search can return lexical results when semantic indexing is
unavailable; this is not automatically an HTTP error.

For corpus identity, index freshness, error interpretation, access isolation and
search behavior, see
[Workspace documentation corpus](../../architecture/runtime/workspace-documentation-corpus.md).
For the reader UI see
[Documentation reader](../../product/specflow/ui/documentation-reader.md).
