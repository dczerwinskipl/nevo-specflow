---
id: adr.0022-workspace-scoped-documentation-reader
type: adr
title: Workspace-scoped documentation reader
status: current
date: 2026-11-12
summary: >
  Amends ADR 0020 sections 3, 5 and 6: the Runtime serves each registered workspace's documentation
  under /api/workspaces/:workspaceId/docs with docs.view at project scope, replacing /api/docs/*;
  every checkout has its own index, embedded only through the Runtime's trusted ai.embeddings; and
  invalid documents are skipped everywhere except docs check.
related:
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - architecture.runtime.authorization
  - architecture.runtime.configuration
  - architecture.runtime.specflow-project-home
  - reference.api.docs-search
  - reference.configuration.documentation-and-embeddings
  - reference.configuration.specflow-git-worktrees
  - reference.cli.nevo-specflow-docs
  - product.specflow.ui.documentation-reader
---

# 0022 — Workspace-scoped documentation reader

## Status

Current. The decisions below were taken by the product owner on 2026-11-11 and 2026-11-12. This ADR
**amends** [ADR 0020](0020-documentation-discovery-is-a-product-capability.md) sections 3 (command
surface), 5 (index freshness) and 6 (Runtime endpoint); where they differ, this ADR wins. ADR 0020's
other sections and [ADR 0021](0021-product-neutral-ai-semantic-search-engine.md) are unchanged.
Language follows [normative language](../principles/normative-language.md). The API, CLI,
configuration and authorization references are brought in line with this ADR by the change that
implements it.

## Context

- **One corpus per Runtime.** ADR 0020 gives the Runtime one documentation corpus, the Runtime's own
  checkout. A Specification bound to a linked worktree therefore reads the Project Home
  documentation over HTTP, while the CLI run inside that worktree already reads the worktree's.
- **A reader needs more than search.** The documentation reader
  ([UX contract](../../product/specflow/ui/documentation-reader.md)) lists, reads and searches the
  documentation of a chosen workspace, and needs the body without frontmatter, sections, related
  documents and a revision that keeps tree, article and search coherent.
- **A worktree is untrusted input to the Runtime.** Its branch decides its `.nevo/config.yaml` and
  `docs.yaml`; taking `ai.embeddings` from it would let a checked-out branch redirect the
  documentation to another endpoint.
- **Ignore rules change with the branch.** A cached `git check-ignore` answer can become stale after
  a checkout or a `.gitignore` change, so an index could be written into a tracked path.
- **`.nevo/local/` is ignored.** A newly created worktree has no local configuration and therefore no
  workstation endpoint.
- **One invalid document made the whole corpus unavailable**, which a reader of the other documents
  does not need.
- **Pre-production.** There are no external consumers of `/api/docs/*`; no compatibility layer is
  kept.

## Decision

### 1. Routes keyed by `workspaceId` (amends section 6)

The Runtime serves the documentation of one **registered workspace** (Project Home or a registered
linked worktree), identified by its registry `workspaceId`:

```http
GET /api/workspaces/:workspaceId/docs
GET /api/workspaces/:workspaceId/docs/documents/:documentId
GET /api/workspaces/:workspaceId/docs/search?q&limit&snippets&includeNonAuthoritative
```

- The **tree** lists the active documents (id, title, type, status, path under `docs.root`, summary,
  non-authoritative flag), the root index document when there is one, the inactive documents with
  their status and successor, and the paths of skipped documents.
- The **article** returns the document's metadata with its `related` documents resolved to a state
  (active, inactive, skipped, missing), the Markdown body without frontmatter and its sections
  (section id, heading path, body-relative line). Metadata and body MUST come from one read of the
  file. An inactive document answers `410 DOCS_DOCUMENT_INACTIVE` with its status and, when known,
  its successor.
- **Search** returns ADR 0020's result contract plus the number of non-authoritative documents left
  out (counted by the same query with the include switch, the same limit and the same query vector)
  and, while an index is being built, its progress. Search result lines stay file-relative.
- There is no HTTP status endpoint; index progress travels with the search answer.
  `nevo-specflow docs semantic status` is unchanged.
- The Runtime MUST resolve the workspace through the Engine's verified read path on every request
  and MUST NOT accept a path, Git ref or directory from the caller. Unknown workspaces answer
  `404 DOCS_WORKSPACE_NOT_FOUND`, unavailable ones `409 DOCS_WORKSPACE_UNAVAILABLE`.
- `GET /api/docs/search` and `GET /api/docs/status` are removed, with their contracts.

A generic `GET /api/workspaces` lists the registered workspaces (id, kind, name, folder (absolute path; the UI shortens it),
availability with reason, whether it is the Runtime's own checkout, bound Specifications, dirty when
Git is enabled). It serves the reader's picker and Create Specification alike; Create
Specification's options keep only Create-specific facts keyed by `workspaceId`. The Specification
workspace response carries the bound `workspaceId`.

### 2. Access (amends section 6)

- The `docs` resource's capability is **`docs.view`** (list, read, search), replacing `docs.search`
  without an alias. It MUST be checked at the Runtime's project scope `{ projectId }`, not in any scope:
  a grant bounded to a Specification or a Session admits no project documentation.
- The check MUST run before the registry lookup, so a denied caller learns nothing about which
  workspaces exist (`401`, then `403`).
- A new resource `workspace` with capability **`workspace.view`**, checked at `{ projectId }`, admits
  the workspace list. Bound Specification titles are filtered by `spec.view` per Specification,
  silently.
- The built-in `viewer`, `developer` and `admin` roles carry both capabilities.
- Docs responses MUST be `Cache-Control: no-store`.

### 3. Search and indexing per checkout (amends sections 3 and 5)

- **Own index.** Every checkout has its own index in `<checkout>/.nevo/local/cache/docs-index/`,
  shared by the CLI and the Runtime for that checkout. Indexes are never shared between checkouts.
- **Runtime egress.** The Runtime MUST embed only through the `ai.embeddings` of its own (trusted)
  configuration, and MUST NOT read `ai.embeddings` from a selected worktree. Semantic search is on
  for a workspace only when that checkout's `docs.search.semantic` is `true` and the Runtime's
  trusted configuration has `ai.embeddings`; Project Home's `docs.search.semantic` plays no role for
  other checkouts. A checkout can therefore switch semantic search off for itself but never
  redirect it; a branch without the opt-in stays lexical.
- **CLI.** `nevo-specflow docs` always uses the configuration of the checkout it runs in, with no
  fallback to Project Home. The CLI keeps ADR 0020's local trust model.
- **Seeding.** When a checkout has no index, the CLI and the Runtime seed it with a copy of
  Project Home's index when the identity matches, and MUST NOT copy it otherwise. The identity is
  ADR 0021's index identity, the probe fingerprint and the fingerprint of the effective
  documentation settings. The normal incremental refresh then
  re-embeds only what differs.
- **Write admission.** Before every write of the index (vectors, chunk cache, a seed copy), the
  CLI and the Runtime MUST check with an uncached `git check-ignore` that the index path is ignored
  in that checkout, including writes of a refresh already running. When it is not, nothing is written and
  search answers lexically.
- **New worktrees.** When the Engine creates a linked worktree, it copies Project Home's
  `.nevo/local/config.yaml` into the new worktree if the worktree has none, so the CLI there has
  the workstation endpoint.

### 4. Corpus behaviour (amends sections 3, 5 and 6)

- **Skip invalid documents.** A document whose own frontmatter is invalid, and every file of a
  duplicate id, is **skipped** with a warning by `list`, `find`, `get`, `context`, `search` and the
  Runtime; an unresolved `related` or `superseded_by` does not skip. The CLI warns on stderr and
  lists skipped documents in `--json`; the Runtime lists them in every response. `docs check`
  stays strict and fails on them. Host corpus rules (the repository's own ADR rules, ADR 0020)
  apply to `docs check` only; they never skip a document on read.
- **Revision without preconditions.** Every docs response carries the workspace's opaque
  `corpusRevision`: a digest of the effective documentation settings and of the included paths and
  their content hashes. It is not a Git revision and not an index generation. There are no
  `ETag`, `If-Match`, `412` or `409` corpus-change semantics; clients compare revisions.
- **Fresh settings.** The Runtime MUST re-read the checkout's `docs` namespace and `docs.yaml` on
  every request and reopen the corpus when their fingerprint changes. It MUST refuse a checkout whose
  `docs.root`, `.nevo/config.yaml` or `docs.yaml` is a symbolic link or junction.
- **Bounded instances.** The Runtime MUST keep at most four open workspace corpora (least recently
  used evicted) and run at most one background index refresh across all workspaces. Eviction stops,
  awaits and disposes an instance; an unregistered workspace's instance is evicted; closing the
  Runtime stops all of them. Closing a workspace or Specification MUST release that workspace's
  instance before its worktree is deleted. ADR 0020's start refresh applies to the Runtime's own
  checkout; other workspaces refresh on read, under the same one-refresh rule.

## Consequences

- A Specification's documentation is read and searched where its work happens, over HTTP as in the
  CLI, without cross-worktree disclosure.
- Project-scoped access is a tightening: Specification- or Session-scoped users who could search the
  documentation no longer can.
- A worktree's branch cannot change where the Runtime sends documentation; it can only turn
  semantic search off. The CLI in a worktree still uses that worktree's configuration, as everywhere
  else.
- Each worktree costs a disk copy of the index; re-embedding is limited to what differs from
  Project Home when the identity matches.
- An invalid document no longer hides the rest of the documentation, and `docs check` remains the
  gate that reports it.
- The CLI and the Runtime in one checkout share its index. They agree while the checkout's local
  configuration is the copy the Engine placed there from Project Home; when either side is changed
  so that their embedding identities differ, whichever writes next rebuilds the index. This is
  accepted and visible as `index-building`; there is no coordination mechanism for it.
- The CLI and the Runtime spawn one `git check-ignore` per index write batch; this is accepted for
  correctness.
- Worktrees created before this change have no copied local configuration; their CLI searches have
  no workstation endpoint until it is added.
- Deferred: related suggestions, live filesystem events, Specification and code corpora, a shared
  embedding cache, an HTTP status endpoint and detailed status, local images, `ETag`/`304`, and a
  branch label in the picker.
