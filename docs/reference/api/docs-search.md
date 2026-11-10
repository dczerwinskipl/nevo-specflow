---
id: reference.api.docs-search
type: reference
title: Documentation search and status HTTP API
status: current
scope: specflow
areas: [runtime, server, docs, security]
tags: [semantic-search, authorization]
read_when:
  - calling the Runtime documentation search endpoint
  - changing GET /api/docs/search, its query or the Runtime start refresh of the docs index
  - calling or changing GET /api/docs/status
  - diagnosing why a Runtime documentation search answers lexically or 503
summary: >
  GET /api/docs/search answers ranked documents of the project's own documentation, with their
  frontmatter and best sections, in the result contract of nevo-specflow docs search --json: query
  parameters (including snippets), the docs.search capability, errors, the read-time refresh, the
  in-process catch-up of a larger gap and the refresh on Runtime start. GET /api/docs/status reports
  the semantic search status and refresh progress in the contract of docs semantic status --json.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - reference.cli.nevo-specflow-docs
  - reference.configuration.documentation-and-embeddings
  - architecture.runtime.authorization
  - reference.api.openapi
---

# Documentation search and status HTTP API

The Runtime serves the same documentation search as
[`nevo-specflow docs search`](../cli/nevo-specflow-docs.md#search) and the same status as
[`nevo-specflow docs semantic status`](../cli/nevo-specflow-docs.md#semantic-status-and-semantic-index)
([ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)).
The contracts are `DocsSearchResult` and `DocsStatus` in
`packages/specflow-contracts/src/docs/index.ts`; the feature is
`packages/specflow-runtime/src/features/docs/`. In the [OpenAPI document](openapi.md) both operations are in the
`Documentation` group, with `DocsSearchResult` and `DocsStatus` as shared components.

## Endpoint

```http
GET /api/docs/search?q=<question>&limit=<n>&includeNonAuthoritative=<true|false>&snippets=<true|false>
```

| Parameter                 | Required | Value                                                                       |
| ------------------------- | -------- | --------------------------------------------------------------------------- |
| `q`                       | yes      | the question, 1 to 500 characters with at least one non-space character     |
| `limit`                   | no       | maximum documents, `1` to `50`; default `10` (the CLI default)              |
| `includeNonAuthoritative` | no       | `true` also returns documents under the non-authoritative prefixes; `false` |
| `snippets`                | no       | `false` leaves out each section's excerpt (the CLI's `--no-snippets`)       |

Other parameters are rejected. There is no `context` parameter.

- **Corpus:** the project's own `docs.root` (the Runtime's project root). Specification documents
  and product documentation are not searched.
- **Response:** `200` with `DocsSearchResult`, unchanged from the CLI's `--json` output: `mode`
  `hybrid` or `lexical`, the ranked `results` (each document's frontmatter and best sections with
  their `sectionId`, `line` and, unless `snippets=false`, a query-aware `snippet`, ranked as
  described in [`search`](../cli/nevo-specflow-docs.md#search)) and, when lexical, the `reason`. A
  section is read with `nevo-specflow docs get <id> --section <sectionId>`. A lexical answer is a
  normal result, never an error.
- **Caching and admission:** `Cache-Control: no-store`; the shared default rate limit of the
  [endpoint policy](../../architecture/runtime/endpoint-policy.md).

## GET /api/docs/status

```http
GET /api/docs/status
```

No parameters. `200` with `DocsStatus`, unchanged from `nevo-specflow docs semantic status --json`:

| Field          | Value                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`         | `hybrid` or `lexical`: the mode a search answers in now; `lexical` carries `reason` (the search reasons above)                                                                                                                                                                                    |
| `enabled`      | `docs.search.semantic`                                                                                                                                                                                                                                                                            |
| `endpoint`     | `protocol`, `baseUrl`, `model`, `dimensions` and the name of the `apiKeyEnv` variable, or `null` without `ai.embeddings`; never a key                                                                                                                                                             |
| `reachability` | a probe of the endpoint with the query timeout (at most 3000 ms), shared by the status requests of one Runtime for 5 s: `{ reachable: true, latencyMs, dimensions }` or `{ reachable: false, message }`; `null` without an endpoint or while `docs.search.semantic` is off (nothing is sent then) |
| `index`        | `missing`, `unreadable` (with `message`), or `current`/`stale`/`rebuild` with `generation`, `chunks` (stored vectors), `model`, `dimensions` and `changed` (chunks to embed or delete)                                                                                                            |
| `activity`     | `updating` (with the writer's `pid` and, for a full refresh, `progress`: `startedAt`, `updatedAt`, `embedded`, `total`) or `idle` (with `last`: `outcome` `completed`/`failed`/`interrupted`, times, counts, `generation`, `message`)                                                             |
| `failed`       | semantic search is enabled but cannot work until the configuration, endpoint or index is fixed; an index that only needs building is not a failure                                                                                                                                                |

The status only reports: it starts no refresh. It sees every writer of the shared index, a CLI
`semantic index` as well as the Runtime's own refresh. Authorization, `Cache-Control`, `503` and its
cases are those of the search.

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

- **Read-time refresh:** every request re-embeds the changed sections before answering, at most 16.
  The HTTP endpoint always refreshes (the CLI's `--no-refresh` has no HTTP counterpart).
- **Catch-up:** a larger gap answers `lexical` with `index-building` at once and, after a
  successful endpoint probe, starts the Runtime's background refresh of the whole index unless it
  already runs (`the Runtime started updating it in the background; GET /api/docs/status reports its
progress`, later `the Runtime is updating it in the background (<n>/<total> chunks)`). Another
  process holding the index (a CLI `semantic index`) is reported, not raced. The Runtime runs at
  most one refresh at a time. After a refresh that failed (for example an index that cannot be
  written), the next one starts no sooner than 60 s later; until then the reason says `the Runtime's
last background update failed (<cause>); it retries within a minute`.
- **Start refresh:** when the project enables `docs.search.semantic` and an embedding endpoint is
  configured, the Runtime starts the same background refresh once it is ready. Start and readiness
  do not wait for it; searches meanwhile answer `lexical` with `index-building`.
- Closing the Runtime stops the running refresh's endpoint requests and waits for it to release the
  index; sections embedded so far stay stored. A refresh that cannot run (endpoint unreachable, index
  unreadable) is logged as a warning; one that finds another process writing the index is not.
- With semantic search off or no endpoint configured, nothing is refreshed, nothing is logged and
  nothing is written below `.nevo/`.

Configuration (`docs`, `ai.embeddings`) is validated by Runtime config loading with the rules of the
[documentation configuration](../configuration/documentation-and-embeddings.md); an invalid section
fails Runtime start.
