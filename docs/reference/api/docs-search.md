---
id: reference.api.docs-search
type: reference
title: Documentation search HTTP API
status: current
scope: specflow
areas: [runtime, server, docs, security]
tags: [semantic-search, authorization]
read_when:
  - calling the Runtime documentation search endpoint
  - changing GET /api/docs/search, its query or the Runtime start refresh of the docs index
  - diagnosing why a Runtime documentation search answers lexically or 503
summary: >
  GET /api/docs/search answers ranked documents of the project's own documentation, with their
  frontmatter and best sections, in the result contract of nevo-specflow docs search --json: query
  parameters (including snippets), the docs.search capability,
  errors, the read-time refresh and the background index refresh on Runtime start.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - reference.cli.nevo-specflow-docs
  - reference.configuration.documentation-and-embeddings
  - architecture.runtime.authorization
  - reference.api.openapi
---

# Documentation search HTTP API

The Runtime serves the same documentation search as
[`nevo-specflow docs search`](../cli/nevo-specflow-docs.md#search)
([ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)).
The result contract is `DocsSearchResult` in `packages/specflow-contracts/src/docs/index.ts`; the
feature is `packages/specflow-runtime/src/features/docs/`.

## Endpoint

```http
GET /api/docs/search?q=<question>&limit=<n>&includeNonAuthoritative=<true|false>&snippets=<true|false>
```

| Parameter                 | Required | Value                                                                       |
| ------------------------- | -------- | --------------------------------------------------------------------------- |
| `q`                       | yes      | the question, 1 to 500 characters with at least one non-space character     |
| `limit`                   | no       | maximum documents, `1` to `50`; default `10` (the CLI default)              |
| `includeNonAuthoritative` | no       | `true` also returns documents under the non-authoritative prefixes; `false` |
| `snippets`                | no       | `true` adds a one-line `snippet` to each section (the CLI's `--snippets`)   |

Other parameters are rejected. There is no `context` parameter.

- **Corpus:** the project's own `docs.root` (the Runtime's project root). Specification documents
  and product documentation are not searched.
- **Response:** `200` with `DocsSearchResult`, unchanged from the CLI's `--json` output: `mode`
  `hybrid` or `lexical`, the ranked `results` (each document's frontmatter and best sections,
  ranked as described in [`search`](../cli/nevo-specflow-docs.md#search)) and, when lexical, the
  `reason`. A lexical answer is a normal result, never an error.
- **Caching and admission:** `Cache-Control: no-store`; the shared default rate limit of the
  [endpoint policy](../../architecture/runtime/endpoint-policy.md).

## Authorization

The capability is `docs.search` (resource `docs`, action `search`), admitted when the principal holds
it in any scope: an assignment scoped to a project, Specification or Session is enough, because the
project's documentation has no narrower scope. The built-in `viewer`, `developer` and `admin` roles
carry it
([authorization configuration](../configuration/authorization.md#current-roles)).

| Status | Body                                     | When                                                 |
| ------ | ---------------------------------------- | ---------------------------------------------------- |
| `401`  | `{ "error": "authentication_required" }` | required authentication and no authenticated session |
| `403`  | `{ "error": "forbidden" }`               | the principal holds `docs.search` in no scope at all |

## Errors

| Status | Body / code              | Meaning                                                                                                                                |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Fastify validation error | `q` missing, empty or too long; `limit` outside `1..50`; `includeNonAuthoritative` or `snippets` not `true`/`false`; unknown parameter |
| `503`  | `DOCS_UNAVAILABLE`       | `docs.root` is not a directory, the corpus fails validation, or the Runtime serves demo data                                           |

The `503` body is `{ "error": "Documentation search is unavailable.", "code": "DOCS_UNAVAILABLE" }`:
`error` is for people, `code` is the stable value to branch on.

A `503` for the project's documentation is logged on the server with its cause and answered again
on the next request; fixing the documents is enough, no restart is needed. Embedding endpoint or
index problems never fail the endpoint: they answer `lexical` with their reason.

## Index freshness

The Runtime holds one index per process in `.nevo/local/cache/docs-index/`, shared with the CLI.

- **Read-time refresh:** every request re-embeds the changed sections before answering, at most a
  small bounded number; a larger gap answers `lexical` with `index-building`. The HTTP endpoint
  always refreshes (the CLI's `--no-refresh` has no HTTP counterpart).
- **Start refresh:** when the project enables `docs.search.semantic` and an embedding endpoint is
  configured, the Runtime refreshes the whole index in the background once it is ready. Start and
  readiness do not wait for it; searches meanwhile answer `lexical` with `index-building`. Closing
  the Runtime stops the refresh's endpoint requests and waits for it to release the index; sections
  embedded so far stay stored. A refresh that cannot run (endpoint unreachable, index busy or
  unreadable) is logged as a warning.
- With semantic search off or no endpoint configured, nothing is refreshed, nothing is logged and
  nothing is written below `.nevo/`.

Configuration (`docs`, `ai.embeddings`) is validated by Runtime config loading with the rules of the
[documentation configuration](../configuration/documentation-and-embeddings.md); an invalid section
fails Runtime start.
