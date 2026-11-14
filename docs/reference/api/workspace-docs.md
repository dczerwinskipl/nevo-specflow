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

The Runtime serves the documentation of one **registered workspace** (Project Home or a registered
linked worktree, as [`GET /api/workspaces`](workspaces.md) lists them), read from that checkout's
own `docs.root` with that checkout's `docs` settings and `docs.yaml`
([ADR 0022](../../architecture/decisions/0022-workspace-scoped-documentation-reader.md), amending
[ADR 0020](../../architecture/decisions/0020-documentation-discovery-is-a-product-capability.md)).
The search is the one of [`nevo-specflow docs search`](../cli/nevo-specflow-docs.md#search) run in
that checkout. The contracts are in `packages/specflow-contracts/src/docs/workspace/`; the feature is
`packages/specflow-runtime/src/features/docs/` (`tree/`, `article/`, `search/` over
`workspace-corpus/`). In the [OpenAPI document](openapi.md) the operations are in the
`Documentation` group, with `WorkspaceDocsError` as a shared component.

```http
GET /api/workspaces/:workspaceId/docs
GET /api/workspaces/:workspaceId/docs/documents/:documentId
GET /api/workspaces/:workspaceId/docs/search?q&limit&snippets&includeProposals
```

`workspaceId` is the registry UUID. The Runtime resolves it through the Engine's verified read path
on every request; it never accepts a path, Git ref or directory from the caller.

## Common rules

- **Paths** (`path`, a search hit's `file`, and paths inside a skip reason) are relative to the
  checkout's `docs.root`, with `/` separators. The CLI reports them relative to the checkout.
- **`corpusRevision`** is in every `200` answer and in every document refusal (`410` and the
  document `404`s, with `workspaceId`): an opaque digest of the effective documentation
  settings and of the included paths and their content hashes, the same for the tree, an article
  and a search of one unchanged corpus. It is not a Git revision and not an index generation.
  There are no preconditions: no `ETag`, `If-None-Match`, `If-Match` or `412`; a client compares
  revisions and, on a difference, reads the tree, the article and the search again.
- **Skipped documents** (`skipped`, `[{ path, error }]`, in every `200` answer): a document whose own
  frontmatter is invalid, and every file of a duplicated id, is left out with the reason. An
  unresolved `related` or `superseded_by` does not skip a document. `nevo-specflow docs check` is
  the strict gate that fails on them.
- **Fresh settings:** each request re-reads the checkout's `docs` namespace of `.nevo/config.yaml`
  and its `docs.yaml`, and reopens the corpus when they changed; no restart is needed. A checkout
  whose `docs.root`, `.nevo/config.yaml` or `docs.yaml` is a symbolic link or junction answers
  `503 DOCS_UNAVAILABLE`.
- **Caching and admission:** every answer, refusals included, is `Cache-Control: no-store`; the
  shared default rate limit of the [endpoint policy](../../architecture/runtime/endpoint-policy.md).

## GET /api/workspaces/:workspaceId/docs

The tree of the workspace's documentation, from one read of the corpus. `200` with
`WorkspaceDocsTree`:

| Field                 | Value                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspaceId`         | the requested workspace                                                                                                                                                              |
| `corpusRevision`      | see [Common rules](#common-rules)                                                                                                                                                    |
| `docsRoot`            | the configured `docs.root`, relative to the checkout (for example `docs`): the base of every `path`, so a client can name a repository path for a link that leaves the documentation |
| `rootIndexDocumentId` | the id of `<docs.root>/README.md` when it is an active, readable document; absent otherwise                                                                                          |
| `documents`           | the active documents: `documentId`, `title`, `type`, `status`, `path`, `summary` (empty when none), `proposal`                                                                       |
| `inactive`            | the `deprecated` and `superseded` documents: `documentId`, `path`, `status` and `supersededBy` when the frontmatter names one                                                        |
| `skipped`             | the skipped documents                                                                                                                                                                |

`proposal` is `true` below one of the `proposals` path prefixes of `docs.yaml`: the document is a
proposal (an idea or plan, not a current rule).

## GET /api/workspaces/:workspaceId/docs/documents/:documentId

One article. The metadata and the body come from one read of the file. `200` with
`WorkspaceDocsArticle`:

| Field            | Value                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceId`    | the requested workspace                                                                                                                                                |
| `corpusRevision` | the revision of the corpus the id was looked up in                                                                                                                     |
| `document`       | `documentId`, `title`, `type`, `status`, `path`, `summary`, `proposal`, `scope` (when set), `areas`, `tags` and `related`                                              |
| `related`        | the frontmatter `related`, in order: `{ documentId, title?, state }`, `state` one of `active`, `inactive` (both with `title`), `skipped`, `missing`                    |
| `body`           | the Markdown after the frontmatter                                                                                                                                     |
| `sections`       | the headings of `body` in order: `sectionId` (the id search reports, `_top` before the first heading), `headingPath`, `line` (1-based line in `body`, not in the file) |
| `skipped`        | the skipped documents of the same corpus                                                                                                                               |

A section is opened by its `sectionId`. Search `line`s count in the file (frontmatter included);
article `sections[].line` counts in `body`.

The document refusals:

| Status | Code                      | When                                                                                                                                                                                    |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `410`  | `DOCS_DOCUMENT_INACTIVE`  | the document is `deprecated` or `superseded`: `{ error, workspaceId, corpusRevision, code, status, supersededBy? }`, `supersededBy` `{ documentId, title }` when its successor is known |
| `404`  | `DOCS_DOCUMENT_SKIPPED`   | the id belongs to a skipped document: `{ error, workspaceId, corpusRevision, code, skipped }`, `skipped` listing every file that declares the id with its reason                        |
| `404`  | `DOCS_DOCUMENT_NOT_FOUND` | `{ error, workspaceId, corpusRevision, code }`: no document of the workspace has the id, or its file changed or vanished while it was read                                              |

A document may exist only in another workspace; a `404` names nothing about the others.

## GET /api/workspaces/:workspaceId/docs/search

| Parameter          | Required | Value                                                                             |
| ------------------ | -------- | --------------------------------------------------------------------------------- |
| `q`                | yes      | the question, 1 to 500 characters with at least one non-space character           |
| `limit`            | no       | maximum documents, `1` to `50`; default `10` (the CLI default)                    |
| `includeProposals` | no       | `true` also returns proposals (documents under the `proposals` prefixes); `false` |
| `snippets`         | no       | `false` leaves out each section's excerpt (the CLI's `--no-snippets`)             |

Other parameters are rejected. `200` with `WorkspaceDocsSearch`: the fields of the CLI's `--json`
result (`DocsSearchResult`: `mode` `hybrid` or `lexical`, the `reason` when lexical, the ranked
`results` with each document's frontmatter and best sections, their `sectionId`, `line` and, unless
`snippets=false`, a query-aware `snippet`, ranked as described in
[`search`](../cli/nevo-specflow-docs.md#search)), with a hit's `file` relative to `docs.root`, plus
the fields below. A hit names its document `id`, as in the CLI's result, where the tree and the
article say `documentId`.

| Field              | Value                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceId`      | the requested workspace                                                                                                                   |
| `corpusRevision`   | the revision of the corpus the search ranked                                                                                              |
| `proposalsLeftOut` | the proposals the same query returns with `includeProposals=true` and the same `limit` (one query embedding); `0` when they were included |
| `indexProgress`    | `{ embedded, total }` while the Runtime's background refresh of this workspace's index embeds; absent otherwise                           |
| `skipped`          | the skipped documents                                                                                                                     |

A lexical answer is a normal result, never an error. There is no status endpoint; the index state
travels with the search (`reason` and `indexProgress`). `nevo-specflow docs semantic status` reports
a checkout's index in detail.

## Authorization

The capability is `docs.view` (resource `docs`, action `view`), checked at the Runtime's project
scope `{ projectId }`: a global or project assignment admits the documentation of every registered
workspace, an assignment bounded to a Specification or a Session admits none. The built-in
`viewer`, `developer` and `admin` roles carry it
([authorization configuration](../configuration/authorization.md#current-roles)).

The check runs before the workspace is looked up, so a denied caller learns nothing about which
workspaces exist:

| Status | Body                                     | When                                                             |
| ------ | ---------------------------------------- | ---------------------------------------------------------------- |
| `401`  | `{ "error": "authentication_required" }` | required authentication and no authenticated session             |
| `503`  | `DOCS_UNAVAILABLE`                       | the Runtime has no project (no Engine)                           |
| `403`  | `{ "error": "forbidden" }`               | the principal holds `docs.view` at no scope covering the project |

## Errors

| Status | Code                         | Meaning                                                                                                                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | Fastify validation error     | `workspaceId` not a UUID; `q` missing, empty or too long; `limit` outside `1..50`; a switch not `true`/`false`; an unknown query parameter |
| `404`  | `DOCS_WORKSPACE_NOT_FOUND`   | the workspace is not registered                                                                                                            |
| `409`  | `DOCS_WORKSPACE_UNAVAILABLE` | the workspace is registered but its checkout cannot be read now (missing, moved, being closed, or the Runtime is closing)                  |
| `503`  | `DOCS_NOT_CONFIGURED`        | the checkout's `docs.root` is not a directory; the body adds `docsRoot`, the configured value                                              |
| `503`  | `DOCS_UNAVAILABLE`           | the checkout's `docs` settings or `docs.yaml` are invalid or a link, reading the documentation failed, or the Runtime serves demo data     |

The body is `WorkspaceDocsError`, `{ "error": "<for people>", "code": "<code>" }`, with `docsRoot`
(relative to the checkout, for example `docs`) only for `DOCS_NOT_CONFIGURED`; `code` is the stable
value to branch on, and `error` never names a path or the cause. A `503` is logged on the
server with its cause and answered again on the next request; fixing the documents or settings is
enough. Embedding endpoint or index problems never fail a request: the search answers `lexical`
with its reason.

## Index freshness

Each checkout has its own index in `<checkout>/.nevo/local/cache/docs-index/`, shared with the CLI
run in that checkout.

- **Semantic search** is on for a workspace only when that checkout's `docs.search.semantic` is
  `true` and the Runtime's own (trusted) configuration has `ai.embeddings`. The Runtime never reads
  `ai.embeddings` from a workspace; a checkout can only turn semantic search off for itself.
- **Read-time refresh:** every search re-embeds the changed sections before answering, at most 16.
  The HTTP search always refreshes (the CLI's `--no-refresh` has no HTTP counterpart).
- **Catch-up:** a larger gap answers `lexical` with `index-building` at once and, after a
  successful endpoint probe, starts the Runtime's background refresh of the whole index unless it
  already runs (`the Runtime started updating it in the background`). Another process
  holding the index (a CLI `semantic index`) is reported, not raced. After a refresh that failed
  (for example an index that cannot be written), the next one starts no sooner than 60 s later;
  until then the reason says `the Runtime's last background update failed; it retries within a
minute`.
- **While a refresh runs:** while any background job of the Runtime runs (a refresh or seed of
  any workspace's index; they all use the Runtime's one endpoint), a search embeds nothing, neither
  changed sections nor the query, so it does not wait behind the job's requests to the endpoint.
  It answers `lexical` at once with `index-building`:
  - in a linked worktree whose seed has not run yet (also while no job runs): `The
documentation index is being prepared from Project Home; searches are lexical until then.`;
  - while this workspace's job runs: `The Runtime is updating the documentation index in the
background (<n>/<total> chunks); searches are lexical until it has finished.` (the count, and
    `indexProgress`, once it embeds);
  - while another workspace's job runs: `The Runtime is updating another checkout's documentation
index; searches are lexical until it has finished.`

  Once the job has ended, searches are hybrid again. A job that starts while a search is already
  embedding its query can still delay that one query, up to the query timeout.

- **One refresh at a time:** the Runtime runs at most one background job across all workspaces;
  searches meanwhile answer as above and start nothing, and a search after it has ended starts this
  workspace's catch-up when its gap needs one. It keeps at most four workspace corpora open (the
  least recently used one is stopped and closed), and closing a workspace or Specification releases
  its workspace's corpus before its worktree is deleted.
- **Seeding:** a linked worktree without an index is first seeded with a copy of Project Home's
  index when their identity matches (embedding model, dimensions, probe and documentation
  settings); searches meanwhile answer `lexical` with `index-building`. Then the normal refresh
  embeds only what differs.
- **Write admission:** before every index write, an uncached `git check-ignore` checks that the
  index is ignored in that checkout; when it is not, nothing is written and the search answers
  lexically.
- **Start refresh:** when the Runtime's own checkout has semantic search on and the Runtime has an
  embedding endpoint, the Runtime starts the same background refresh of that checkout's index once
  it is ready. Start and readiness do not wait for it; searches meanwhile answer `lexical` with
  `index-building`. While another process (a CLI `semantic index`) updates the index, an endpoint
  that times out or refuses the connection is reported as `index-building`, not as
  `endpoint-unreachable`. Other workspaces
  refresh on search only.
- Closing the Runtime stops every running refresh and waits for it to release its index; sections
  embedded so far stay stored. A refresh that cannot run is logged as a warning; one that finds
  another process writing the index is not.
- With semantic search off or no endpoint, nothing is refreshed, nothing is logged and nothing is
  written below `.nevo/`.

The Runtime's own `docs` and `ai.embeddings` settings are validated at start with the rules of the
[documentation configuration](../configuration/documentation-and-embeddings.md); an invalid section
fails Runtime start. A workspace's `docs` settings are validated on each request and answer
`503 DOCS_UNAVAILABLE` while invalid.
