---
id: reference.api.specification-documents
type: reference
title: Specification documents HTTP contract
status: draft
scope: specflow
areas: [runtime, server, ui]
tags: [specifications, documents, archetypes, contracts]
read_when:
  - implementing or consuming the archetype catalogue, document tree, document read or document operations
  - swapping the documents demo endpoints for the real backend
  - mapping document error codes in the UI
summary: >
  Target contract of the Specification documents layer shared by the Runtime demo and the real backend:
  endpoints, schema outline, content kinds and raw-content headers, operation shape, error codes and the explicit
  UI impact list. Exact schemas live in @nevo/specflow-contracts/documents once D0 lands.
related:
  - architecture.runtime.specification-documents
  - product.specflow.specification-documents
  - adr.0016-engine-owned-document-commits
  - reference.api.specflow-specification-operations
  - reference.api.specification-creation-demo
---

# Specification documents HTTP contract

Draft target contract. D0 of the
[delivery specification](../../ideas/specflow-engine/specification-documents-delivery.md) turns the schemas below
into TypeBox schemas in `packages/specflow-contracts/src/documents` (re-exported to the demo); from then on the
code is the exact contract and this page keeps the narrative, the error table and the UI impact list. Rules are
owned by [the architecture document](../../architecture/runtime/specification-documents.md).

## Principle: one contract for demo and real

The demo (`/api/demo/...`) and the real backend (`/api/...`) use the **same schemas, re-exported under demo
names** (the technique already used for `DemoCreateOptionsSchema`). Swapping demo for real changes the path
prefix and the data source, never a shape. Demo-only data (providers, simulated location, `DEMO_*` codes) stays in
the demo-only part.

## Endpoints

Authorization uses the existing `SpecCapabilities`: `View` for reads, `Manage` for every state change, and the
`create-options` capability for the catalogue.

| Slice | Method | Real path                                      | Demo path (prefix `/api/demo`)            | Capability          | Purpose                                                        |
| ----- | ------ | ---------------------------------------------- | ----------------------------------------- | ------------------- | -------------------------------------------------------------- |
| D2    | GET    | `/api/specs/archetypes`                        | in `GET /api/demo/specification-creation` | as `create-options` | `ArchetypeCatalogue`                                           |
| D2    | POST   | `/api/specs`                                   | `/api/demo/specifications`                | Create              | Create (extended request, below)                               |
| D3    | GET    | `/api/specs/:specId/document-tree`             | same suffix                               | View                | `DocumentTree`                                                 |
| D3    | GET    | `/api/specs/:specId/documents/:documentId`     | same suffix (demo today: fixtures)        | View                | `DocumentContent` (JSON, text kinds)                           |
| D3    | GET    | `/api/specs/:specId/documents/:documentId/raw` | new                                       | View                | Raw bytes with safe headers                                    |
| D4    | PUT    | `/api/specs/:specId/documents/:documentId`     | same suffix                               | Manage              | Save text                                                      |
| D4    | POST   | `/api/specs/:specId/documents`                 | same suffix                               | Manage              | Create documents/folders from template or content (one commit) |
| D4    | POST   | `/api/specs/:specId/folders`                   | same suffix                               | Manage              | Create folder                                                  |
| D4    | POST   | `/api/specs/:specId/document-operations`       | same suffix                               | Manage              | rename / move / delete / classify                              |

All document responses send `Cache-Control: no-store` except `raw` (below). `specId` and `documentId` follow the
existing id pattern `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` (<= 200).

## Shared vocabulary

```ts
ContentKind   = 'text' | 'image' | 'binary'
Classification = 'registered' | 'unclassified'
// Reasons an action is unavailable. Kebab-case; replaces the demo's `root_protected` / `required_document_path`.
ActionReason  = 'protected'          // overview: cannot be deleted/renamed/moved
              | 'root'               // the root folder
              | 'archived'           // Specification is in archive/
              | 'branch-protected'   // git.commits.protectedBranches matches the current branch
              | 'branch-not-allowed' // git.commits.allowedBranches does not match
              | 'commit-blocked'     // (emitted from D4; reads never report it) detached HEAD, merge/rebase in progress, unmerged paths, held index lock
              | 'git-policy-invalid' // project Git configuration invalid (fail closed)
              | 'busy'               // (emitted from D4) Close/Create/another write in progress for this Specification
              | 'not-editable'       // kind/extension is not editable in this release
              | 'dangling'           // registry entry without file (only delete=remove registration)
              | 'not-implemented'    // write actions and capabilities reported by D3 before the D4 routes exist; removed when D4 lands
Action        = { available: boolean; reason?: ActionReason }
```

`reason` is advisory in reads and authoritative in write errors (same vocabulary, as `details.reason`).

## D2 - Archetype catalogue and Create request

```ts
DocumentTypeInfo = { id; title; description; useWhen; instructions: string; defaultFilename?: string }   // all text mandatory except defaultFilename
ArchetypeCatalogue = {
  revision: string                     // sha256 of the catalogue content; changes when the catalogue changes
  defaultArchetypeId?: string          // absent in the real backend (the UI chooses); optional in demo
  documentTypes: DocumentTypeInfo[]
  problems?: Array<{ source: string; code: string; message: string }>   // reserved for D-config; absent/empty for built-ins
  archetypes: Array<{
    id: string; version: integer >= 1  // demo today: string
    title: string; description: string; useWhen: string      // description and useWhen mandatory
    instructions?: string                                    // how to work with the archetype (built-ins carry it)
    requirements: Array<{ documentType: string; minCount: integer >= 0 }>
    documents: Array<{                 // templates: scaffolded and suggested
      id: string                       // template id, unique within the archetype (several templates per document type are allowed)
      type: string; title: string; filename: string   // title defaults to the document type's title
      include: 'always' | 'optional'   // replaces the template flag `required`; always = scaffolded, optional = suggested
      preselected?: boolean            // optional templates: default tick in clients, a recommendation only
      instructions?: string            // how to fill this template
      content: string                  // template text (template limit: architecture document, Limits)
    }>
    workflow?: { phases; requiredDocuments; suggestedDocuments }   // optional, demo-only; the real backend omits it
  }>
}
```

`POST /api/specs` (`CreateSpecRequest`) gains, all **required** (no default archetype in the contract):

```ts
archetypeId: string; archetypeVersion: integer; catalogueRevision: string
optionalDocumentIds?: string[]                       // suggested template ids; unique
addedDocuments?: Array<{ path: string; type?: string; content: string }>   // counts and bytes: Limits; no `title`
folders?: string[]                                   // unique; count: Limits
```

`catalogueRevision` / `archetypeVersion` not matching the Engine catalogue -> `CATALOGUE_STALE` (409). Unknown
archetype or template id -> `ARCHETYPE_UNKNOWN` (422). `addedDocuments` without `type` are created unclassified.
The response `CreatedSpec` keeps its existing fields and gains `documentIds: string[]` (registered ids; the demo
result already has it). `POST /api/specs` sets its own `bodyLimit` (value: architecture document, Limits); the server
has no global body-limit override. Content sizes are UTF-8 bytes. Content is not stored in the Create journal (see
the delivery specification, D2).

### Definition schema (declarative, built-in and user-defined)

One schema (`schemaVersion: 1`) describes archetypes, document types, templates and requirements; the entities and
rules are owned by the architecture document ("Definitions"). The catalogue above is its **resolved** form plus
`revision`. A file in this schema looks like:

```yaml
schemaVersion: 1
documentTypes:
  - id: runbook
    title: Runbook
    description: Operational steps for running or recovering a system.
    useWhen: The change adds something that operators must run or recover.
    instructions: List preconditions, numbered steps and the expected result of each step.
    defaultFilename: runbook.md
archetypes:
  - id: operations-change
    version: 1
    title: Operations change
    description: A change with an operational impact.
    useWhen: The work changes how a system is operated.
    requirements:
      - { documentType: overview, minCount: 1 }
    templates:
      - {
          id: overview,
          documentType: overview,
          filename: overview.md,
          include: always,
          content: "# {{specificationTitle}}\n",
        }
      - {
          id: runbook,
          documentType: runbook,
          filename: runbook.md,
          include: optional,
          preselected: true,
          content: "# {{specificationTitle}} - Runbook\n",
        }
```

**Published JSON Schema.** The contracts package derives `archetype-definitions.schema.json` (`$id`
`urn:nevo:specflow:archetype-definitions:1`, draft 2020-12) from the TypeBox definition types and commits it at
`packages/specflow-contracts/schema/archetype-definitions.schema.json`; a unit test fails when the committed file
differs from the generated one, and it equals the generator output byte for byte (prettier ignores the folder; regenerate with `pnpm --filter @nevo/specflow-contracts schema:generate`). Users and AI generate files against it. The loader that reads user files is D-config.

The `schema/` folder is **not** in the package `exports`: it is published as a package file (`files`), so consumers read it from the installed package directory (`node_modules/@nevo/specflow-contracts/schema/archetype-definitions.schema.json`) or from the repository path above, and may reference it from a definition file with `$schema`. Importing it as a module subpath is not supported; the TypeBox types (`ArchetypeDefinitionFileSchema`) are exported from `@nevo/specflow-contracts/documents`.

## D3 - Tree, read, raw

```ts
DocumentTree = {
  revision: string                     // changes when the manifest or any listed file/stat signature changes
  archetype: { id; version; title?: string }
  folders: Array<{ path: string; actions: { rename: Action; move: Action; delete: Action } }>  // root path ''
  documents: Array<{
    id: string; path: string
    classification: Classification
    type?: string                      // present iff registered
    kind: ContentKind; mediaType: string; size: integer
    revision: string                   // content hash or stat signature (rule and size threshold: architecture document, Limits)
    protected: boolean                 // true only for overview
    editable: boolean                  // md, txt in the first release
    satisfiesRequirement: boolean      // registered and its type has a requirement with minCount > 0
    actions: { rename: Action; move: Action; delete: Action; classify: Action }
  }>
  dangling: Array<{ id; path; type: string; actions: { delete: Action } }>   // delete = remove registration
  completeness: {
    complete: boolean
    requirements: Array<{ documentType: string; minCount: integer; count: integer; satisfied: boolean }>
  }
  capabilities: {                      // advisory
    createFile: Action; createFolder: Action; import: Action; classify: Action
    formats: string[]                  // extensions creatable/editable as text: ['md','txt']
  }
  issues: Array<{ code: 'dangling' | 'unclassified' | 'requirement-unmet' | 'skipped-entry' | 'path-case-collision' | 'archive-limit'; path?: string; documentType?: string }>
  truncated: boolean; skippedEntries: integer
}
```

Replaces the demo's `DemoDocumentTree`: removed `documents[].required`, `reason: 'required_document_path'`,
folder reason `required_document_path`; added `protected`, `type`, `classification`, `kind`, `mediaType`, `size`,
`editable`, `satisfiesRequirement`, `dangling`, `completeness`, `archetype`, `truncated`, `skippedEntries`.
Listing limits and `truncated`: architecture document, Limits. `issues` lists `dangling`, `unclassified`,
`requirement-unmet`, `skipped-entry`, `path-case-collision` and `archive-limit` entries as
`{ code; path?: string; documentType?: string }` with `code` a closed enum of exactly these six values; the last two mean Close archive will refuse.

```ts
DocumentContent = {                    // GET /documents/:documentId
  id; path; title: string              // title derived (first H1 of markdown, else file stem)
  classification; type?: string; kind; mediaType; size; revision; editable
  content?: string                     // present for kind 'text' within the JSON read limit; absent otherwise
}
```

Replaces `SpecificationDocumentResponse` (`filename` is replaced by `path`; `title` stays; new fields above). The
`?revision=` query is kept: a revision other than the current one -> `DOCUMENT_REVISION_UNAVAILABLE` (409); there
is no history read. Text above the JSON read limit -> `DOCUMENT_TOO_LARGE` (413) with the hint to use `raw`. A dangling id ->
`DOCUMENT_FILE_MISSING` (404). Unknown id -> `DOCUMENT_NOT_FOUND` (404).

### Raw content

`GET .../raw[?download=1]` streams the file bytes (up to the raw limit, else `DOCUMENT_TOO_LARGE` 413; no `Range` in D3).

| Header                         | Value                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Type`                 | Engine table by extension. All text kinds, including `html` and `xml`, are `text/plain; charset=utf-8` (markdown `text/markdown; charset=utf-8`); images: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, `image/svg+xml`; binary: `application/octet-stream` |
| `X-Content-Type-Options`       | `nosniff`                                                                                                                                                                                                                                                                         |
| `Content-Security-Policy`      | `default-src 'none'; style-src 'unsafe-inline'; sandbox` (blocks script in SVG and any document)                                                                                                                                                                                  |
| `Content-Disposition`          | `inline` for text and image; `attachment; filename*=UTF-8''<encoded basename>` for binary or `download=1`                                                                                                                                                                         |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                                                                                                                                                                                     |
| `Cache-Control` / `ETag`       | `private, no-cache` and `ETag: "<revision>"`; `If-None-Match` -> 304                                                                                                                                                                                                              |
| `Content-Length`               | file size                                                                                                                                                                                                                                                                         |

SVG is served with the image media type only so `<img src>` works; the sandbox CSP prevents script execution if the URL is opened
directly. The UI MUST NOT inline SVG markup.

## D4 - Operations (shape only; design level)

All state changes share the Create operation shape: `operationId` (UUID, idempotency key) replaces the demo's
`requestId`. Replays with an equal body return the stored result; a different body -> `DOCUMENT_OPERATION_CONFLICT`.

```ts
SaveInput  = { operationId; content: string(UTF-8 bytes <= the save limit); expectedRevision: string }
// route bodyLimit and content cap: architecture document, Limits
SaveResult = { operationId; revision: string; committed: boolean; commit?: { sha: string } }

DocumentOperationInput = {            // rename | move | delete | classify
  operationId; action: 'rename'|'move'|'delete'|'classify'; kind: 'document'|'folder'
  documentId?: string; path?: string  // document by id, folder by path
  name?: string; targetFolder?: string; type?: string      // type: classify only
  expectedRevision: string            // document: its revision; folder: tree revision
}
DocumentOperationResult = {           // as today, plus operationId / committed / commit
  operationId; revision; documents: Array<{ id; path; revision; type? }>; removedDocumentIds: string[]
  folders: string[]; committed: boolean; commit?: { sha: string }
}
CreateDocumentsInput = { operationId; documents: Array<{ path; type?; templateId?; content?: string }>; folders?: string[] }  // <= 10 / <= 100; templateId xor content
```

`committed` is false only when Git is disabled. Every operation is one Engine-owned commit (ADR 0016). A failed
commit after files were written is `DOCUMENT_RECOVERY_REQUIRED` and the operation is resumed, not retried with a new id.

## Errors

`DocumentErrorCode` (the exported `as const` array in the contracts package) holds **every code in the table below**, including codes that Create already emits as free strings. The Create `code` field stays a plain string in this release (it does not narrow to the array).

Every document endpoint answers `{ error: <CODE>, code: <CODE>, details?: { reason?: ActionReason; blockedBy?: string; cause?: string } }` (the shape
of the Create errors; `details` is new and optional: the shared error schema is a superset of `CreateSpecErrorSchema`, and Create keeps answering without it). 401/403 keep the existing authentication/authorization bodies.

| Code                            | HTTP | Meaning                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCUMENT_NOT_FOUND`            | 404  | Unknown document or Specification id (replaces `specification_document_not_found`)                                                                                                                                                                                                                                                 |
| `DOCUMENT_FILE_MISSING`         | 404  | Registered document without file (dangling)                                                                                                                                                                                                                                                                                        |
| `SPEC_SOURCE_UNAVAILABLE`       | 503  | Workspace or manifest unreadable/invalid (replaces `specification_source_unavailable`)                                                                                                                                                                                                                                             |
| `DOCUMENT_REVISION_UNAVAILABLE` | 409  | Requested `?revision=` is not current (replaces `document_revision_unavailable`)                                                                                                                                                                                                                                                   |
| `DOCUMENT_REVISION_CONFLICT`    | 409  | `expectedRevision` differs from the file on disk                                                                                                                                                                                                                                                                                   |
| `DOCUMENT_PATH_INVALID`         | 400  | Path breaks the portable path rules or is reserved (`specification.yaml`)                                                                                                                                                                                                                                                          |
| `DOCUMENT_PATH_CONFLICT`        | 409  | Target path (case-insensitive) already exists or collides with a file/folder                                                                                                                                                                                                                                                       |
| `DOCUMENT_PROTECTED`            | 409  | Delete/rename/move of `overview` (`details.reason: 'protected'`)                                                                                                                                                                                                                                                                   |
| `DOCUMENT_TYPE_INVALID`         | 400  | Type id breaks the pattern                                                                                                                                                                                                                                                                                                         |
| `DOCUMENT_ALREADY_CLASSIFIED`   | 409  | Classify of a registered document                                                                                                                                                                                                                                                                                                  |
| `DOCUMENT_NOT_EDITABLE`         | 415  | Save to a kind/extension that is not editable                                                                                                                                                                                                                                                                                      |
| `DOCUMENT_TOO_LARGE`            | 413  | Above the JSON, raw or save limits                                                                                                                                                                                                                                                                                                 |
| `DOCUMENT_OPERATION_INVALID`    | 400  | Malformed combination of fields, or an added document type that cannot be registered                                                                                                                                                                                                                                               |
| `DOCUMENT_OPERATION_CONFLICT`   | 409  | `operationId` reused with a different body                                                                                                                                                                                                                                                                                         |
| `DOCUMENT_RECOVERY_REQUIRED`    | 503  | Files written, commit not made; operation must be resumed                                                                                                                                                                                                                                                                          |
| `SPEC_MANIFEST_DIRTY`           | 409  | Registry change requested while `specification.yaml` has uncommitted changes                                                                                                                                                                                                                                                       |
| `SPEC_ARCHIVED`                 | 409  | Specification is in `archive/` (`details.reason: 'archived'`)                                                                                                                                                                                                                                                                      |
| `SPEC_BUSY`                     | 409  | Close/Create/other write in progress                                                                                                                                                                                                                                                                                               |
| `BRANCH_PROTECTED`              | 422  | Engine must not commit on this branch; `details.reason` is `branch-protected` or `branch-not-allowed`                                                                                                                                                                                                                              |
| `COMMIT_BLOCKED`                | 409  | Checkout cannot take a commit now; `details.reason: 'commit-blocked'` and `details.blockedBy` is the Engine commit port's own reason (`detached`, `branch-changed`, `git-busy`, `index-locked`, `unmerged-paths`, `path-ignored`, `no-commits`, `intent-to-add`, `git-path-unreadable`, `ignore-check-failed`, `index-unreadable`) |
| `COMMIT_FAILED`                 | 503  | Only as `details.cause` of `DOCUMENT_RECOVERY_REQUIRED` (and of Create recovery): the Git commit failed after files existed. Document endpoints do not return it directly                                                                                                                                                          |
| `GIT_POLICY_INVALID`            | 503  | Project Git configuration invalid (existing code)                                                                                                                                                                                                                                                                                  |
| `CREATE_JOURNAL_UNSUPPORTED`    | 503  | A Create journal written by an older format is read by operation id (inspection or replay). It never blocks Create or Close admission (see delivery D2)                                                                                                                                                                            |
| `CATALOGUE_STALE`               | 409  | Create with an outdated catalogue revision/archetype version                                                                                                                                                                                                                                                                       |
| `ARCHETYPE_UNKNOWN`             | 422  | Unknown archetype or optional template id                                                                                                                                                                                                                                                                                          |

Demo-only codes (`DEMO_WORKSPACE_UNAVAILABLE`, `DEMO_INVALID_SCENARIO`) stay; the demo's `demo_*` lowercase document
errors are replaced by the codes above (demo emits the same codes).

## UI impact (explicit list for the parallel UI work)

The UI is not changed by this specification. Each item below is a contract change the UI adapts to when it
integrates D2/D3/D4; items marked _demo_ also change the demo contract and the demo endpoints.

1. _demo_ Tree: `documents[].required` removed. Use `protected` (overview only) and `satisfiesRequirement`. The
   "required" badge (`documents.tree.required`) becomes a "counts toward <type>" hint or is dropped.
2. _demo_ Reasons: `required_document_path` and `root_protected` removed; new kebab-case `ActionReason` set
   (`protected`, `root`, `archived`, `branch-protected`, ...). `documentTreePolicy.ts` messages are re-keyed.
   The error `demo_document_required` becomes `DOCUMENT_PROTECTED`.
3. _demo_ Tree gains `type`, `classification`, `kind`, `mediaType`, `size`, `editable`, `dangling[]`,
   `completeness`, `archetype`, `truncated`: the tree must render unclassified files (with a classify action),
   dangling entries (with a remove-registration action) and completeness (requirement results).
4. _demo_ Archetype catalogue: `version` string -> integer; template `required` -> `include: 'always'|'optional'`;
   mandatory `description` and `useWhen` on archetypes and document types, mandatory `instructions` on document types, optional `instructions` on archetypes and templates, `preselected` on optional templates (show the instructions as guidance; they are not stored in the Specification); `workflow` is optional and absent in
   the real backend (`ArchetypeSummary` already falls back); `archetype.requirements` is new. Real catalogue is
   served by `GET /api/specs/archetypes`; the demo keeps embedding it in `GET /api/demo/specification-creation`.
5. _demo_ Create request: `addedDocuments[].title` removed (title is derived), `addedDocuments[].type` optional;
   (Create already uses `operationId`.) Separately, the demo's document endpoints (save, tree operations, add,
   folders) rename `requestId` to `operationId`.
6. _demo_ Save: result gains `operationId`, `committed`, optional `commit`; body gains `operationId`.
7. Document read: `SpecificationDocumentResponse.filename` -> `path`; new fields `classification`, `type`, `kind`,
   `mediaType`, `size`, `editable`; `content` is absent for `image` and `binary`; the UI chooses the viewer from
   `kind` and loads `raw` for images (`<img src>`) and downloads.
8. Read errors: the lowercase bodies `specification_document_not_found`, `specification_source_unavailable`,
   `document_revision_unavailable` are replaced by `{error, code}` with `DOCUMENT_NOT_FOUND`,
   `SPEC_SOURCE_UNAVAILABLE`, `DOCUMENT_REVISION_UNAVAILABLE`.
9. Unclassified documents have derived ids prefixed `u-`; after classification the id changes, so the open tab and
   the route `documents/$documentId` MUST follow the returned `documents[].id`.
10. Protected branch: write errors and `actions[].reason` expose `branch-protected` / `branch-not-allowed` /
    `commit-blocked`; the editor MUST present a read-only state with that reason rather than failing on Save.
11. Operations are synchronous commits; Save latency includes a Git commit. A saved draft is only clean once the
    response arrives; a `DOCUMENT_REVISION_CONFLICT` MUST keep the draft.
12. Display titles are derived by the Engine (first H1 or file stem); there is no stored per-document title.
13. D2 changes the real Create contract (required `archetypeId`, `archetypeVersion`, `catalogueRevision`). The
    project-mode Create client (`features/specs/creation/api/api.project.ts`), the error map
    (`errors/createSpecErrors.ts`, which gains `CATALOGUE_STALE`, `ARCHETYPE_UNKNOWN`, `DOCUMENT_PATH_*` and
    `CREATE_JOURNAL_UNSUPPORTED`) and their tests are adapted **inside D2** (owner decision), not at D5.
14. The tree gains `issues[]` (including `skipped-entry`, `path-case-collision`, `archive-limit`); the UI shows
    those that make Close refuse.
