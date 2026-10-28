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
  endpoints, schema outline, content kinds and raw-content headers, the write contract with asynchronous commit state,
  definition files and their problems, error codes and the explicit
  UI impact list. Exact schemas live in @nevo/specflow-contracts/documents once D0 lands.
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

| Slice | Method | Real path                                                                 | Demo path (prefix `/api/demo`)            | Capability          | Purpose                                                      |
| ----- | ------ | ------------------------------------------------------------------------- | ----------------------------------------- | ------------------- | ------------------------------------------------------------ |
| D2    | GET    | `/api/specs/archetypes`                                                   | in `GET /api/demo/specification-creation` | as `create-options` | `ArchetypeCatalogue`                                         |
| D2    | POST   | `/api/specs`                                                              | `/api/demo/specifications`                | Create              | Create (extended request, below)                             |
| D3    | GET    | `/api/specs/:specId/document-tree`                                        | same suffix                               | View                | `DocumentTree`                                               |
| D3    | GET    | `/api/specs/:specId/documents/:documentId`                                | same suffix (demo today: fixtures)        | View                | `DocumentContent` (JSON, text kinds)                         |
| D3    | GET    | `/api/specs/:specId/documents/:documentId/raw`                            | new                                       | View                | Raw bytes with safe headers                                  |
| D4    | PUT    | `/api/specs/:specId/documents/:documentId`                                | same suffix                               | Manage              | Save text (written at once, commit queued)                   |
| D4    | POST   | `/api/specs/:specId/documents/save`                                       | new                                       | Manage              | Batch save (all-or-nothing preconditions, one commit)        |
| D4    | POST   | `/api/specs/:specId/documents`                                            | same suffix                               | Manage              | Create documents from template or content                    |
| D4    | POST   | `/api/specs/:specId/folders`                                              | same suffix                               | Manage              | Create folder                                                |
| D4    | POST   | `/api/specs/:specId/document-operations`                                  | same suffix                               | Manage              | rename / move / delete / classify                            |
| D4    | GET    | `/api/specs/:specId/document-operations/:operationId`                     | new                                       | View                | Operation status incl. commit state                          |
| D4    | POST   | `/api/specs/:specId/document-operations/:operationId/retry` or `/abandon` | new                                       | Manage              | Resolve a failed commit batch                                |
| D4    | POST   | `/api/specs/:specId/document-commits/flush`                               | new                                       | Manage              | Commit everything queued for the checkout now                |
| D4    | GET    | `/api/specs/:specId/uncommitted`                                          | new                                       | View                | Uncommitted ledger entries, policy, queue summary (ADR 0018) |
| D4    | POST   | `/api/specs/:specId/commit`                                               | new                                       | Manage              | Manual commit of the ledger paths of a scope (ADR 0018)      |

**Routes.** The document tree, document content and raw rows and the write, status, retry, abandon, flush, `uncommitted` and `commit` rows are served by the Runtime through the Engine, which is the source of record in project mode; the document operations list is `GET /api/specs/document-operations`. The write routes are registered only outside demo mode. The Engine reads the catalogue from the project's `.nevo/definitions` (nothing is compiled in), and Create answers `DEFINITIONS_MISSING` without definitions; the catalogue route reports `problems`, `problemsTruncated` and `unstableRead` (its ETag covers them) and the `definitions` commands exist.

All document responses, including their error responses, send `Cache-Control: no-store` except a successful `raw`
(below). `specId` and `documentId` follow the
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
              | 'commit-blocked'     // (from D4, evidence-based: a failed batch of this checkout with a permanent blocker; a read never runs Git) detached HEAD, branch changed, ...
              | 'git-policy-invalid' // project Git configuration invalid (fail closed)
              | 'busy'               // a write or a claimed commit batch holds the path (a retry helps), a batch awaits operator recovery, or the checkout's queue is full (`Action.retryAfterMs` says when a retry helps; absent when it does not)
              | 'not-editable'       // kind/extension is not editable in this release
              | 'dangling'           // registry entry without file (only delete=remove registration)
Action        = { available: boolean; reason?: ActionReason; retryAfterMs?: integer }   // retryAfterMs: with reason 'busy' only
```

`reason` is advisory in reads and authoritative in write errors (same vocabulary, as `details.reason`).

## D2 - Archetype catalogue and Create request

```ts
DocumentTypeInfo = { id; title; description; useWhen; instructions: string; defaultFilename?: string }   // all text mandatory except defaultFilename
ArchetypeCatalogue = {
  revision: string                     // sha256 of the VALID catalogue content (problems excluded); changes when it changes
  defaultArchetypeId?: string          // absent in the real backend (the UI chooses); optional in demo
  documentTypes: DocumentTypeInfo[]
  problems?: DefinitionProblem[]; problemsTruncated?: boolean   // invalid definition files (below); absent when none; real backend only
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

`catalogueRevision` / `archetypeVersion` not matching the Engine catalogue -> `CATALOGUE_STALE` (409). The revision is a
precondition checked when a NEW operation is admitted; it is not part of the idempotency fingerprint, so a retry of an
existing `operationId` after the catalogue changed replays the stored result (the archetype version stays part of it). Unknown
archetype or template id -> `ARCHETYPE_UNKNOWN` (422). `addedDocuments` without `type` are created unclassified.
The response `CreatedSpec` keeps its existing fields and gains `documentIds: string[]` (registered ids; the demo
result already has it). `POST /api/specs` sets its own `bodyLimit` (value: architecture document, Limits); the server
has no global body-limit override. Content sizes are UTF-8 bytes. Content is not stored in the Create journal (see
the delivery specification, D2).

### Definition files (project data, one per definition)

Governing decision: [ADR 0017](../../architecture/decisions/0017-definitions-as-project-data.md); rules:
[architecture, "Definitions as project data"](../../architecture/runtime/specification-documents.md). A definition is
a YAML file `.nevo/definitions/<kind>/<id>.yaml` in the Project Home. Each kind has its own schema and
`schemaVersion`. The catalogue above is the **resolved** form of the valid files plus `revision`.

```yaml
# .nevo/definitions/document-type/runbook.yaml
kind: document-type
schemaVersion: 1
id: runbook
title: Runbook
description: Operational steps for running or recovering a system.
useWhen: The change adds something that operators must run or recover.
instructions: List preconditions, numbered steps and the expected result of each step.
defaultFilename: runbook.md
```

```yaml
# .nevo/definitions/specification-archetype/operations-change.yaml
kind: specification-archetype
schemaVersion: 1
id: operations-change
version: 1
title: Operations change
description: A change with an operational impact.
useWhen: The work changes how a system is operated.
requirements:
  - { documentType: overview, minCount: 1 }
templates:
  - id: overview
    documentType: overview
    filename: overview.md
    include: always
    contentFile: templates/overview.md # relative to the kind directory; or inline `content`
  - id: runbook
    documentType: runbook
    filename: runbook.md
    include: optional
    preselected: true
    content: "# {{specificationTitle}} - Runbook\n"
```

Rules of a file: `kind` equals the directory, `id` equals the file name (`^[a-z][a-z0-9-]{0,31}$`), unknown keys are
rejected, `$schema` (a string) is allowed and ignored, a template has exactly one of `content` and `contentFile`
(`^templates/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,7}$`, no `..`, regular UTF-8 file, template size limit), an
`optional` template may set `preselected`, an `always` template may not. There is no version stamp or hash in a
file (no existing projects, no upgrade path). `contentFile` bytes are normalised to LF when loaded. Mandatory and
optional fields per entity: architecture document, "Declarative
schemas".

**Published JSON Schemas.** The contracts package derives one JSON Schema per kind and `schemaVersion` from the TypeBox
types and commits it under `packages/specflow-contracts/schema/definitions/`
(`document-type.v1.schema.json`, `specification-archetype.v1.schema.json`; `$id`
`urn:nevo:specflow:definition:<kind>:<schemaVersion>`, draft 2020-12). A unit test fails when a committed file differs
from the generated one (prettier ignores the folder; regenerate with `pnpm --filter @nevo/specflow-contracts
schema:generate`). The folder is not in the package `exports`; it is published as package files.

**Problems (`ArchetypeCatalogue.problems[]`).**

```ts
DefinitionProblem = {
  source: string                       // path relative to .nevo/definitions, e.g. 'specification-archetype/feature.yaml'; '' for a directory-level problem
  kind?: string                        // the definition kind when known
  code: 'file-unreadable' | 'file-too-large' | 'yaml-invalid' | 'schema-invalid' | 'kind-mismatch'
      | 'id-filename-mismatch' | 'id-duplicate' | 'reference-missing' | 'reference-invalid'
      | 'template-file-invalid' | 'limit-exceeded' | 'requirement-overview-missing'
      | 'overview-template-invalid' | 'directory-unsafe' | 'unexpected-entry' | 'unknown-kind-directory'
      | 'unsupported-schema-version'
  severity: 'error' | 'warning'        // warning: the file is ignored but nothing depends on it (unexpected-entry, unknown-kind-directory)
  message: string                      // plain text, at most 300 characters, never an absolute path
  location?: string                    // JSON pointer inside the file, e.g. '/templates/1/documentType'
}
```

At most 50 problems are returned (errors first, then by `source`); `problemsTruncated: true` marks more. `catalogue.revision`
covers the valid catalogue only; the route's ETag covers revision, problems, truncation and `unstableRead`
(`unstableRead: true` means the files kept changing while they were read, so the catalogue may be out of date; a
Create in that state is refused as `CATALOGUE_STALE` with `details.cause: 'catalogue-unstable'`). The Create error
body carries `details` when the Engine names a cause (`definitions-missing`, `archetype-invalid`,
`archetype-not-defined`, `catalogue-unstable`). A catalogue with no valid archetype
is `{ archetypes: [], documentTypes: [...], problems: [...] }` with status 200: the absence of definitions is data,
not a server error.

**CLI** (`nevo-specflow definitions ...`, thin adapters over the Engine, `--project-root`, `--json`):

| Command                                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definitions list [--kind <kind>]`                                           | Ids, versions, titles and the problems summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `definitions show <kind>/<id>`                                               | The resolved definition (and its problems if invalid)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `definitions validate [<path>...]`                                           | Runs the same loader over the project or the given files/directories; exit code non-zero on any `error` problem; agrees with the Runtime by construction                                                                                                                                                                                                                                                                                                                                                                                             |
| `definitions install [<kind>/<id>...] [--add-missing] [--force] [--dry-run]` | Bootstrap only when the project has no definitions (`init` uses it); otherwise names what to add or `--add-missing`; never resurrects a deleted definition silently; never overwrites an existing file without `--force`; installing an archetype installs its document types; atomic writes; with Git enabled the written files are committed through the Engine commit capability (a protected or not-allowed branch refuses before writing), with Git disabled it is a plain write. Resolves to the Project Home (or refuses and prints its path) |

`nevo-specflow init` runs `definitions install` for all seeds unless `--no-definitions`. Installing an archetype
installs the document types it needs.

## D3 - Tree, read, raw

```ts
DocumentTree = {
  revision: string                     // changes when the manifest, any listed file/stat signature or any other response field changes
  archetype: { id; version; title?: string; defined: 'defined' | 'invalid' | 'absent' }   // invalid: a definition file exists but is in problems[]; absent: no file; the persisted snapshot still governs
  folders: Array<{ path: string; revision?: string; actions: { rename: Action; move: Action; delete: Action } }>  // root path '' (no revision); revision = the FOLDER revision a folder operation sends as expectedRevision
  documents: Array<{
    id: string; path: string
    classification: Classification
    type?: string                      // present iff registered
    kind: ContentKind; mediaType: string; size: integer
    revision: string                   // content hash or stat signature (rule and size threshold: architecture document, Limits)
    protected: boolean                 // true only for overview
    editable: boolean                  // md, txt in the first release
    satisfiesRequirement: boolean      // registered and its type has a requirement with minCount > 0
    actions: { save?: Action; rename: Action; move: Action; delete: Action; classify: Action }   // save: the text can be saved (editable, nothing refuses a write)
    commit?: { state: 'pending' | 'failed' | 'uncommitted'; operationId: string; recoveryRequired?: boolean; reason?: string; blockedBy?: string; attempts?: integer; nextAttemptAt?: string; queuedAt?: string }   // while an operation that has not settled covers the path (pending: queued, committing or still writing; failed: waits for a decision, recoveryRequired when only the operator can resolve it); 'uncommitted' = the path is in the uncommitted-changes ledger (reason auto-commit-off or abandoned), kept until a commit holds the path; reason/blockedBy/attempts/nextAttemptAt as in CommitInfo; a committed operation never appears
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
  commits: { pending: integer; failed: integer; recoveryRequired: integer; uncommitted?: integer; policy?: 'auto' | 'manual'; oldestPendingAt?: string }   // operations of THIS Specification that have not settled, from the journals (no lock, no Git), covered by revision; uncommitted = paths of this Specification in the ledger; policy = the effective git.commits.auto.documents ('manual' = auto-commit off), absent while Git is disabled; failed includes recoveryRequired (the subset only the operator can resolve); oldestPendingAt = the queue time of the oldest pending one
  truncated: boolean; skippedEntries: integer
}
```

**Implemented behaviour of the tree (D3).** The tree is the Engine's projection of one manifest read, a directory
listing and a stat/hash of the files; it is not an atomic snapshot (architecture invariant 7). `documents` is sorted
by the case-folded path, `dangling` keeps registry order, `folders` starts with the root `''` and is sorted by the
case-folded path. The response carries `ETag: "<revision>"`; a matching `If-None-Match` answers `304`. The revision covers every
input of the response: the manifest bytes, every listed file's path and revision, the location, `truncated`, the
skipped entries (count and reported paths), the archive-limit fact, the advisory policy reason of the write actions
the archetype title and (D4) the pending and failed commit batches, so a `304` never hides a changed issue, count, action reason or commit state.
`truncated` is `true` when the listing stopped at the file cap, the depth cap or the entries budget (the same budget as the
archive count traversal, so a Specification with a huge number of folders is read in bounded time); registered documents beyond the cap are
still stat'ed and listed (a registered file is never reported dangling because of the cap). A registered document whose
file is present but not safely readable (replaced by a symlink, below a symlinked folder, an unreadable entry) is reported
only as `skipped-entry`: it is not `dangling` (the file is not missing, so no remove-registration action applies), has no
`documents` node and does not count toward its requirement. `issues` lists, in this
order, `dangling`, `unclassified`, `requirement-unmet`, then `skipped-entry` (one per reported path, at most 50;
`skippedEntries` is the count the archive traversal found: a lower bound once that traversal reached its own bound,
which `archive-limit` then reports), `path-case-collision` (one per colliding path) and `archive-limit` (with
`path` when a single file above the archive per-file limit is the cause). Besides symlinks and special files,
`skipped-entry` also reports names the layer cannot address or display safely (control, format, line and paragraph
separator characters such as bidi overrides, C1 controls, zero-width characters and U+2028, a backslash, or bytes that are
not UTF-8) and folders that cannot be read.

Every write action and capability is available unless one reason applies. The reason is, in order of precedence (the first that applies wins; one rule for every node, action and capability):

1. `archived`: the Specification is in `archive/`.
2. The subject itself: `protected` (`overview`: delete, rename, move; a folder that holds it: delete), `root` (the root folder), `not-editable` (`save` of anything that is not editable text). `classify` of a registered document is `{ available: false }` without a reason (nothing to classify).
3. The advisory Git policy reason that applies to the checked-out branch (`branch-protected`, `branch-not-allowed`, `git-policy-invalid`; omitted when Git is disabled or the branch is not known; the branch is read from the checkout's `HEAD` without starting a Git process).
4. `commit-blocked`, from the journals and never from a Git process: a failed commit of this Specification names a blocker of the whole checkout (`detached`, `no-commits`, `index-unreadable`: every write, capability included), or of the very paths it covers (`branch-changed`, `path-ignored`: those paths and the folders above them), or a journal file cannot be read.
5. `busy`: the checkout's queue is full (`retryAfterMs`) or holds too many operations that wait for a person (no hint); an operation is still writing the path, or a commit batch that has claimed it is committing (`retryAfterMs`); a commit batch or a write of the path awaits operator recovery (no hint). A folder is busy when anything under it is held. A pending, failed or abandoned commit that is not claimed holds nothing: the document can be saved again.

No action is offered that admission refuses for a reason a read can know (the same rules, one test pins the agreement); what only a write can find out (`SPEC_MANIFEST_DIRTY`, a stale `expectedRevision`, a Create or Close that holds the checkout, an invalid name or target) is refused by the write. `editable` is true only for `text` kind with an `md` or `txt` extension, within the save limit, in an active Specification; `actions.save` is `editable` with the reasons above.

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

Implemented behaviour: a registered id answers from the manifest; a `u-` id is recomputed over the listed files
and never answers for a registered path; any other id is `DOCUMENT_NOT_FOUND`, as is a Specification id that cannot
name a Specification. A text-extension file is `text` when its first 8 KiB hold no NUL byte and are valid UTF-8,
and, when the whole file is within the 1 MiB hash limit, the whole file is valid UTF-8 (otherwise `binary`); so
`content` never contains a replacement character the file did not have. `title` is the first level-1 heading of a
markdown file outside a YAML frontmatter block and outside fenced code, else the file stem; it is at most 200
characters. The `revision` and
`content` returned come from the same bytes. The current revision is the hash of the content up to 1 MiB, else
`stat:<size>-<mtimeNs>`.

The response carries `path` (not `filename`) and `title`, with the fields above. The
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

Implemented behaviour of `raw`: `download` accepts `0` or `1` only (anything else is a validation error, `400`).
Every refusal (`404`, `413`, `503`) is answered before the first byte with the `{ error, code }` body. The media
type sent is always one of the closed set of the table (a text kind is only ever `text/plain` or `text/markdown`,
never an HTML or XML type, whatever the Engine reports). The `304` answer carries `ETag`, `Cache-Control`,
`X-Content-Type-Options` and `Cross-Origin-Resource-Policy` and no body. The stream is released when the client
aborts and when the file becomes shorter than announced (the response is aborted, never padded). The filename in
`Content-Disposition` is the percent-encoded UTF-8 basename (`filename*`); no other form is sent.

SVG is served with the image media type only so `<img src>` works; the sandbox CSP prevents script execution if the URL is opened
directly. The UI MUST NOT inline SVG markup.

## D4 - Write operations and commit state

Governing decision: [ADR 0016](../../architecture/decisions/0016-engine-owned-document-commits.md). All state changes
share the Create operation shape: `operationId` (UUID, idempotency key) replaces the demo's `requestId`. A **write
answers `200` when the content is durable on disk and the commit is durably queued**; it does not wait for Git. The
request body limits are in the architecture document, Limits. Replays with an equal body return the stored result
with the **current** commit state; a different body -> `DOCUMENT_OPERATION_CONFLICT`.

```ts
CommitState = 'pending' | 'committed' | 'failed' | 'uncommitted' | 'not-applicable'
CommitInfo = {
  state: CommitState                   // not-applicable: Git disabled, or nothing to commit (reason 'nothing-to-commit')
  sha?: string                         // known only when committed
  queuedAt?: string; settledAt?: string                    // ISO
  batchId?: string; coalescedWith?: integer                // operations that share the commit (>= 0)
  reason?: string                      // open kebab-case: why pending is waiting or why failed (below)
  blockedBy?: string                   // the commit port's own reason when a Git blocker is the cause
  attempts?: integer; nextAttemptAt?: string; overdue?: boolean   // pending only; overdue: pending longer than 5 minutes
  recoveryRequired?: boolean           // failed and only the operator (CLI) can resolve it
}
WrittenDocument = { id: string; path: string; revision: string; type?: string }

SaveInput  = { operationId; content: string(UTF-8 bytes <= the save limit); expectedRevision: string }
SaveResult = { operationId; document: WrittenDocument; commit: CommitInfo }

BatchSaveInput  = { operationId; documents: Array<{ documentId: string; content: string; expectedRevision: string }> }   // 1..25, unique ids, total bytes: Limits
BatchSaveResult = { operationId; documents: WrittenDocument[]; commit: CommitInfo }   // one commit for the whole batch

DocumentOperationInput = {            // rename | move | delete | classify
  operationId; action: 'rename'|'move'|'delete'|'classify'; kind: 'document'|'folder'
  documentId?: string; path?: string  // document by id, folder by path
  name?: string; targetFolder?: string; type?: string      // type: classify only
  expectedRevision: string            // document: its revision; folder: the FOLDER revision = sha256 over the sorted path:revision of the files under it and their registry entries (commit state excluded; the tree revision also changes with commit state and is not used)
}
CreateDocumentsInput = { operationId; documents: Array<{ path; type?; templateId?; content?: string }>; folders?: string[]; catalogueRevision?: string }   // <= 10 / <= 100; templateId xor content; catalogueRevision REQUIRED when any templateId is used (precondition, CATALOGUE_STALE); text import = content
FolderInput = { operationId; path: string }
DocumentOperationResult = {           // create | folder | rename | move | delete | classify
  operationId; revision: string       // tree revision after the write
  documents: WrittenDocument[]; removedDocumentIds: string[]; folders: string[]
  commit: CommitInfo
}
DocumentOperationStatus = {           // GET .../document-operations/:operationId
  operationId; specId: string
  action: 'save'|'save-all'|'create'|'folder'|'rename'|'move'|'delete'|'classify'|'manual-commit'
  documentIds: string[]; createdAt: string; commit: CommitInfo
  stage?: 'reserved' | 'files-writing' | 'queued' | 'committing' | 'completed' | 'failed' | 'commit-failed' | 'recovery-required'   // 'failed': refused after reservation, nothing written
  updatedAt?: string                  // ISO; the last change (the settle time of a settled operation)
  batchMembers?: string[]             // operations that share the commit batch, itself included, in order (<= 50); absent outside a batch
  executor?: { state: 'alive' | 'dead' | 'unknown' }   // the process writing or committing, judged without a lock; a hint, never a proof of work; 'dead' is proven (same host and PID namespace, or another boot)
  actions?: { retry: Action; abandon: Action; recover: Action }   // retry and abandon: only commit-failed; recover: recovery-required, or a write whose process is dead (the operator, CLI)
}
FlushInput  = { waitMs?: integer }    // 0..30000, default 10000
FlushResult = { settled: boolean; pending: integer; failed: integer; committed: integer }   // counts of this Specification's batches touched
```

Routes (all `Cache-Control: no-store`, capability Manage unless stated; every success is `200`; the capability is checked before the body is read; the request body is a JSON object with no field the schema does not name, and `retry`, `abandon` and `flush` take an absent body as `{}`):

| Method | Route                                                         | Body / result                                                                                                                                           |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PUT    | `/api/specs/:specId/documents/:documentId`                    | `SaveInput` -> `SaveResult`                                                                                                                             |
| POST   | `/api/specs/:specId/documents/save`                           | `BatchSaveInput` -> `BatchSaveResult` (a literal segment; the method differs from the PUT of a document)                                                |
| POST   | `/api/specs/:specId/documents`                                | `CreateDocumentsInput` -> `DocumentOperationResult`                                                                                                     |
| POST   | `/api/specs/:specId/folders`                                  | `FolderInput` -> `DocumentOperationResult`                                                                                                              |
| POST   | `/api/specs/:specId/document-operations`                      | `DocumentOperationInput` -> `DocumentOperationResult`                                                                                                   |
| GET    | `/api/specs/:specId/document-operations/:operationId`         | View -> `DocumentOperationStatus` (404 `DOCUMENT_OPERATION_NOT_FOUND`)                                                                                  |
| POST   | `/api/specs/:specId/document-operations/:operationId/retry`   | -> `DocumentOperationStatus`; only for `failed` without `recoveryRequired` (else `DOCUMENT_OPERATION_STATE_INVALID`)                                    |
| POST   | `/api/specs/:specId/document-operations/:operationId/abandon` | -> `DocumentOperationStatus`; same precondition; the files stay on disk as uncommitted working-tree changes                                             |
| POST   | `/api/specs/:specId/document-commits/flush`                   | `FlushInput` -> `FlushResult`; commits everything queued for this Specification now, bypassing the settle period (counts are this Specification's only) |

**Body limits.** A body above the limit of its route (Save 2 MiB, batch save 8 MiB, create documents 2 MiB, every other write 256 KiB) is answered `413` `{ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' }` before it is parsed; content bytes, document counts and totals are the Engine's admission rules and answer the same code. The limit is per route: no other route changes.

**Status read.** `GET .../document-operations/:operationId` answers an `ETag` over the status (`If-None-Match` gives `304`); an operation id that is malformed or belongs to another Specification is `DOCUMENT_OPERATION_NOT_FOUND`. `retry` and `abandon` answer the status after the action. `flush` commits the queue of the Specification's checkout (other Specifications of the same checkout are committed too), waits at most `waitMs`, and counts only this Specification's operations; `committed` is the number of its operations that left the unsettled set.

**Recovery is the operator's.** `recover` (resume, adopt, abandon of a batch that needs recovery, and `confirmExecutorStopped`) has no HTTP route: it is `nevo-specflow specs documents recover` (the whole `specs documents` command set is in the [offline CLI reference](../cli/specflow-specification-commands.md#document-commands)).

**Templates.** An entry of `CreateDocumentsInput` with `templateId` is rendered by the Engine from the project's definitions (`.nevo/definitions`) and created as an ordinary document. `catalogueRevision` is required and is a precondition: it must equal the current revision of the resolved catalogue (`CATALOGUE_STALE` otherwise). The Specification's archetype must be defined (`ARCHETYPE_UNKNOWN`, `details.cause` `archetype-not-defined` or `archetype-invalid`; `DEFINITIONS_MISSING` when the project has no usable archetype) and must have the template (`ARCHETYPE_UNKNOWN`, `details.cause: 'template-unknown'`). The registered type is the template's `documentType`; a different `type` in the entry is `DOCUMENT_OPERATION_INVALID`. Placeholders are the ones of Create (architecture: Template rendering) with these values: `{{specificationTitle}}` and `{{slug}}` from the manifest, `{{created}}` the manifest's creation date, `{{goal}}` the empty string and `{{goalOrPrompt}}` the fixed prompt, because the goal is not stored. The operation pins the template id and the sha256 of the rendering in its plan: a replay of the same `operationId` returns the stored rendering even when the template changed afterwards, and the catalogue revision is not part of the request identity.

**Batch save semantics.** All `expectedRevision`s are checked before anything is written. If any differs, nothing
is written and the answer is `DOCUMENT_REVISION_CONFLICT` with `details.conflicts: Array<{ documentId; revision }>`
(the current revisions, at most 25). Then all files are written and **one** commit request is queued for the whole
batch (the trailer lists the operations and documents). A batch cannot mix actions; structural operations are
separate requests.

**Commit state and consolidation (client contract).**

- `pending`: queued or retrying. `reason` explains a wait (`settling`, `index-locked`, `git-busy`, `unmerged-paths`,
  `waiting-for-earlier-commit`). It never means the content is at risk: it is on disk and journaled.
- `committed`: `sha` set. Several operations may share one `sha` (consecutive saves of a document, a batch, two
  creates); `coalescedWith` says how many others.
- `failed`: the Engine cannot commit without a decision; files stay on disk. `reason` is one of `branch-changed`,
  `branch-protected`, `branch-not-allowed`, `detached`, `no-commits`, `path-ignored`, `index-unreadable`,
  `commit-failed`, `content-changed`, `history-changed`, `uncertain`; `blockedBy` carries the
  port reason where applicable. `recoveryRequired` is true for `history-changed` and `uncertain`.
- `uncommitted`: the files are on disk and recorded in the uncommitted-changes ledger, not in Git. `reason` is `auto-commit-off` (policy) or `abandoned` (the abandon action; there is no separate `abandoned` state). Resolved by a manual commit, a later operation that commits the path, or a hand commit (ADR 0018).
- `not-applicable`: Git is disabled (plain write), or every path of a delete was never tracked (`nothing-to-commit`).
- A client learns the final state by polling `GET .../document-operations/:operationId`, the tree (`commits`,
  `documents[].commit`, ETag), or the operations list (ADR 0014, kind `document-change`, only non-settled rows). The
  response of the write itself is a snapshot.
- Idempotent replay: the same `operationId` and body returns the original written revisions and the current
  `commit`; it never writes again. A refusal at admission (conflict, policy) creates nothing and is not stored: a retry
  is evaluated again.

**Refusals before any write (nothing changed):** `DOCUMENT_REVISION_CONFLICT`, `DOCUMENT_PATH_*`,
`DOCUMENT_PROTECTED`, `DOCUMENT_NOT_EDITABLE`, `DOCUMENT_TOO_LARGE`, `DOCUMENT_ALREADY_CLASSIFIED`,
`SPEC_MANIFEST_DIRTY`, `SPEC_ARCHIVED`, `SPEC_BUSY`, `BRANCH_PROTECTED`, `COMMIT_BLOCKED`.

**Operations list (ADR 0014).** The documents feature owns its own feature-owned list route
`GET /api/specs/document-operations` (View per row; same ETag/304, `status` and `limit` query as
`GET /api/specs/operations`, which stays Create-only; the UI panel merges the two). It is registered with
`registerOperationListRoute` and a document-change adapter that reads the active journal directory only (no Git, no
control lock, settled records excluded). **Contract:** `OPERATION_LIST_KINDS` gains
`document-change`; `OPERATION_LIST_RESERVED_STATUSES` does not reserve `queued` (it is produced); the source row
`state` gains `queued` and `failed`; `staleAfterMs` (5 min idle means interrupted) MUST NOT apply to
document operations (a pending batch can legitimately wait); rows carry `operationId`, `kind`, `status`,
`subject {specId, slug}`, `updatedAt`, `code?` and the additive `action` and `documentCount`; no paths. Listed: `failed`,
`recovery-required` (also a `manual-commit`)
and `pending` only when older than 30 s (`queued`); `committed`, `uncommitted` and `not-applicable` are never listed (not failures). A write
still in `reserved`/`files-writing` with a dead executor is `recovery-required` (`OPERATION_INTERRUPTED`).
The Engine produces the rows (`listDocumentOperationRows`): the contract fields above plus the source `state` (`queued`,
`failed`, `recovery-required`) and `staleExempt: true` on every row, which tells the list service never to apply
`staleAfterMs` to it; an abandoned or uncommitted operation is not listed, and a journal file that cannot be read is a `recovery-required` row with the code
`DOCUMENT_RECOVERY_REQUIRED`. A `failed` row carries `COMMIT_BLOCKED`, `BRANCH_PROTECTED` or `COMMIT_FAILED` from the reason of
the failure. Rows never carry a path.

## Commit policy, uncommitted changes and manual commit

Governing decision: [ADR 0018](../../architecture/decisions/0018-engine-commit-policy-and-manual-commit.md).

**Configuration** (reference: `reference.configuration.specflow-git-worktrees` when implemented):

```yaml
# .nevo/config.yaml (committed)
git:
  commits:
    auto:
      documents: true # default; false = documents are saved but not committed by the Engine
# .nevo/local/config.yaml (per machine; the only git.commits key allowed locally)
git:
  commits:
    auto:
      documents: false
```

The local value wins; the Create scaffold commit and the commits of `init`/`definitions install` are not governed. An
invalid value or an unknown capability key is `GIT_POLICY_INVALID` (project or local file).

**Reads.**

```ts
UncommittedEntry = { path: string; documentId?: string; reason: 'auto-commit-off' | 'abandoned'; recordedAt: string; operations: integer }
UncommittedView = {                    // GET /api/specs/:specId/uncommitted   (View)
  ledgerRevision: string
  policy: { documents: 'auto' | 'manual'; source: 'project' | 'local' | 'default' }
  entries: UncommittedEntry[]          // <= 200
  queue: { pending: integer; failed: integer; recoveryRequired: integer }   // why a manual commit may be unavailable
}
// DocumentTree.commits gains: uncommitted: integer; policy: 'auto' | 'manual'
```

**Manual commit** (Manage):

```ts
ManualCommitInput = {                  // POST /api/specs/:specId/commit
  operationId: string
  scope?: 'specification' | 'all'      // default 'specification'; 'all' = every ledger owner of this Specification's checkout that the caller may Manage
  message?: string                     // first line 1-100 characters; body <= 2000; default 'spec(docs): manual commit <slug>'
  paths?: string[]                     // a subset of entries[].path, closed under shared operations (else MANUAL_COMMIT_SUBSET_INVALID); once an entry has forgotten operation ids (more than 50), only the whole scope is accepted
  ledgerRevision?: string              // precondition (MANUAL_COMMIT_STALE)
}
ManualCommitResult = {
  operationId: string
  commit: CommitInfo                   // state 'committed' with sha, or 'not-applicable' (reason 'nothing-to-commit')
  paths: string[]                      // the files the commit holds (empty for not-applicable)
  remaining: { entries: integer; ledgerRevision: string }   // what the ledger of the scope still holds
}
```

Answers `200` after the commit (the request is synchronous); the same `operationId` replays the stored result (another body under it is
`DOCUMENT_OPERATION_CONFLICT`). A manual commit commits **only** the ledger paths of the scope (and of `paths`) that differ from
`HEAD`, never another change. The scope `definitions` is CLI-only; over HTTP `all` covers the Specification owners of the checkout
of `:specId` and leaves the definitions out. The route authorizes `Manage` of `:specId` only, so `all` additionally drops every owner whose
Specification the caller cannot `Manage`: those entries are not committed, not named in `paths` and stay in the ledger (the answer's
`remaining` counts only the owners the caller may manage). The operator's assertion that an executor stopped (`confirmExecutorStopped`) is not a
field of this route. With auto-commit on it is refused unless the scope's queue is empty after a flush (the person
retries or abandons failed batches first); with it off it is always available once queued work has drained. A manual
commit is read with `GET .../document-operations/:operationId` (`action: 'manual-commit'`; `retry` and `abandon` of the queue answer
`DOCUMENT_OPERATION_STATE_INVALID` for it). One in `recovery-required` is listed (kind `manual-commit`, code
`MANUAL_COMMIT_RECOVERY_REQUIRED`) and resolved with `nevo-specflow specs documents recover`; so is one that holds the checkout
(`reserved`, `committing`) with a provably dead executor, or with no sign of life for five minutes (code `OPERATION_INTERRUPTED`).
While a manual commit holds the checkout, another one answers `SPEC_BUSY` (`cause: commit-in-progress`) with `details.operationId` of
the holder, the id `recover` and the status route take. Changes saved on a protected branch with auto-commit off cannot be committed by
the Engine (`BRANCH_PROTECTED`; after a switch to another branch `branch-changed`): switch back or commit by hand ([ADR 0018](../../architecture/decisions/0018-engine-commit-policy-and-manual-commit.md), consequences).

**Order of the checks** (the first that fails answers; nothing is reserved by a refusal): Git enabled; the document queue of the scope at rest
after a flush of at most 10 s (`MANUAL_COMMIT_UNAVAILABLE`); the ledger of the scope not empty; `ledgerRevision`; `paths` (unknown path or
open closure: `MANUAL_COMMIT_SUBSET_INVALID`); the branch the ledger pinned; the commit port's preflight (`BRANCH_PROTECTED`,
`COMMIT_BLOCKED`); the selected paths unedited since their post-image (`MANUAL_COMMIT_CONFLICT`). The same checks run again at execution.

**CLI** (resolved to the Project Home or the Specification's checkout):
`nevo-specflow commit [--scope specification|definitions|all] [--spec <slug|id>] [-m <message>] [--path <p>...]
[--ledger-revision <r>] [--json]` and `nevo-specflow commit status [--scope ...]` (prints the ledger); the exit code is
non-zero on any refusal. `nevo-specflow specs documents resolve <operation>` drops the entries of an operation that the
operator dealt with by hand (HEAD holds the path, or the file was edited and is no longer the Engine's content);
content the Engine wrote and nobody touched stays listed. The CLI is described in the
[offline CLI reference](../cli/specflow-specification-commands.md#manual-commit).

**Errors** (added to the table below): `MANUAL_COMMIT_UNAVAILABLE` 409 (`details.cause`: `queue-not-empty`, `ledger-empty`, `git-disabled`);
`MANUAL_COMMIT_CONFLICT` 409 (`details.paths` <= 25: ledger paths edited since their post-image; `details.cause:
'branch-changed'` when the branch differs from the ledger's); `MANUAL_COMMIT_SUBSET_INVALID` 422 (`details.paths`: the
required closure); `MANUAL_COMMIT_STALE` 409; `MANUAL_COMMIT_MESSAGE_INVALID` 400; `MANUAL_COMMIT_RECOVERY_REQUIRED` 503;
`DOCUMENT_UNCOMMITTED_LIMIT` 409. Reused: `BRANCH_PROTECTED`, `COMMIT_BLOCKED`, `DOCUMENT_OPERATION_CONFLICT`,
`GIT_POLICY_INVALID`. `DocumentErrorDetails` gains `paths?: string[]` (<= 25).

## Errors

`DocumentErrorCode` (the exported `as const` array in the contracts package) holds **every code in the table below**, including codes that Create already emits as free strings. The Create `code` field stays a plain string in this release (it does not narrow to the array).

Every document endpoint answers `{ error: <CODE>, code: <CODE>, details?: DocumentErrorDetails }` where `DocumentErrorDetails = { reason?: ActionReason; blockedBy?: string; cause?: string; retryAfterMs?: integer; operationId?: string; conflicts?: Array<{ documentId: string; revision: string }> }` (`reason` is only the `ActionReason` vocabulary, `cause` is an open kebab-case string; `conflicts` <= 25; the shared schema is additive and strict) (the shape
of the Create errors; `details` is new and optional: the shared error schema is a superset of `CreateSpecErrorSchema`, and Create keeps answering without it). 401/403 keep the existing authentication/authorization bodies.

| Code                               | HTTP | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCUMENT_NOT_FOUND`               | 404  | Unknown document or Specification id (replaces `specification_document_not_found`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `DOCUMENT_FILE_MISSING`            | 404  | Registered document without file (dangling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SPEC_SOURCE_UNAVAILABLE`          | 503  | Workspace or manifest unreadable/invalid (replaces `specification_source_unavailable`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `DOCUMENT_REVISION_UNAVAILABLE`    | 409  | Requested `?revision=` is not current (replaces `document_revision_unavailable`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `DOCUMENT_REVISION_CONFLICT`       | 409  | `expectedRevision` differs from the file on disk, or a foreign edit was found while nothing of the write was on disk (nothing changed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `DOCUMENT_PATH_INVALID`            | 400  | Path breaks the portable path rules, is reserved (`specification.yaml`), or (win32) the absolute path exceeds the Windows bound: `details.cause: 'path-too-long'` (architecture, "Windows-hosted paths"; applies to Create too)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `DOCUMENT_PATH_CONFLICT`           | 409  | Target path (case-insensitive) already exists or collides with a file/folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DOCUMENT_PROTECTED`               | 409  | Delete/rename/move of `overview` (`details.reason: 'protected'`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `DOCUMENT_TYPE_INVALID`            | 400  | Type id breaks the pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `DOCUMENT_ALREADY_CLASSIFIED`      | 409  | Classify of a registered document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DOCUMENT_NOT_EDITABLE`            | 415  | Save to a kind/extension that is not editable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DOCUMENT_TOO_LARGE`               | 413  | Above the JSON, raw or save limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `DOCUMENT_OPERATION_INVALID`       | 400  | Malformed combination of fields, an added document type that cannot be registered, or a type that is not the type of the template                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DOCUMENT_OPERATION_CONFLICT`      | 409  | `operationId` reused with a different body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `DOCUMENT_RECOVERY_REQUIRED`       | 503  | The WRITE phase of an operation is ambiguous (files may be partly written, not queued); only on replay of that `operationId`. `details.cause: 'write-conflict'` is a foreign edit found while part of the write was already in place (`details.conflicts` names the documents; the client keeps its draft). Operator recovery: `specs documents recover`. A commit that fails after the acknowledgement is never an error: it is `commit.state: failed`                                                                                                                                                                                                                                                       |
| `SPEC_MANIFEST_DIRTY`              | 409  | Registry change requested while `specification.yaml` has uncommitted changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SPEC_ARCHIVED`                    | 409  | Specification is in `archive/` (`details.reason: 'archived'`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `SPEC_BUSY`                        | 409  | Create/Close in progress for the checkout, or (D4) a commit in flight for the same paths, a full queue or a batch awaiting recovery: `details.reason: 'busy'`, `details.cause` one of `commit-in-progress` (`details.operationId` names the manual commit when one holds the checkout), `queue-full`, `recovery-required`, `create-or-close`, `manifest-changed` (the registry moved between planning and reservation twice, or another write of it is in flight), `write-in-progress` (another operation is still writing the same paths, or the writer of this `operationId` is running or cannot be proven stopped), `retryAfterMs`; the response also carries `Retry-After` in whole seconds (at least 1) |
| `BRANCH_PROTECTED`                 | 422  | Engine must not commit on this branch; `details.reason` is `branch-protected` or `branch-not-allowed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `COMMIT_BLOCKED`                   | 409  | Checkout cannot take a commit now; `details.reason: 'commit-blocked'` and `details.blockedBy` is the Engine commit port's own reason (`detached`, `branch-changed`, `git-busy`, `index-locked`, `unmerged-paths`, `path-ignored`, `no-commits`, `intent-to-add`, `git-path-unreadable`, `ignore-check-failed`, `index-unreadable`)                                                                                                                                                                                                                                                                                                                                                                            |
| `COMMIT_FAILED`                    | 503  | Only as `commit.reason` or `details.cause` (Create recovery): the Git commit failed after files existed. Document endpoints do not return it directly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GIT_POLICY_INVALID`               | 503  | Project Git configuration invalid (existing code)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CREATE_JOURNAL_UNSUPPORTED`       | 503  | An unreadable Create journal (not JSON, or without a numeric `version`) is read by operation id (inspection or replay). It never blocks Create or Close admission (see delivery D2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CATALOGUE_STALE`                  | 409  | Create with an outdated catalogue revision/archetype version, or a document create from a template with an outdated revision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ARCHETYPE_UNKNOWN`                | 422  | Unknown archetype or template id. `details.cause`: `archetype-not-defined` (no such file), `archetype-invalid` (the file is in `problems[]`) or `template-unknown` (a template create names a template the archetype lacks)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `DEFINITIONS_MISSING`              | 422  | Create when the project has no usable archetype (definitions directory absent, empty or all invalid). `details.cause: 'definitions-missing'`. Remedy: `nevo-specflow definitions install`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `DOCUMENT_COMMITS_PENDING`         | 409  | Close (or integration) refused: after a bounded flush, document commits are still pending, failed, awaiting recovery or uncommitted (ledger). `details.cause`: `commit-pending`, `commit-failed` or `commit-uncommitted`. Precedence on Close: this error, then `CLOSE_CONFLICT`, then `CLOSE_PREFLIGHT`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DOCUMENT_OPERATION_NOT_FOUND`     | 404  | Unknown `operationId` for this Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DOCUMENT_OPERATION_STATE_INVALID` | 409  | `retry` or `abandon` of an operation that is not `failed`, or is `recoveryRequired`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `DOCUMENT_WRITE_FAILED`            | 503  | The write phase failed after the first file changed (disk full, I/O error). The Engine keeps rolling forward under the claim; retry the same `operationId`. `details.cause`: `no-space`, `io-error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `MANUAL_COMMIT_UNAVAILABLE`        | 409  | Manual commit while the scope's queue holds pending, failed or recovery-required work after a flush (`details.cause: 'queue-not-empty'`), when nothing is uncommitted (`ledger-empty`) or while Git is disabled (`git-disabled`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `MANUAL_COMMIT_CONFLICT`           | 409  | A ledger path was edited since its post-image, or the branch changed; nothing is committed (`details.paths`, `details.cause`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `MANUAL_COMMIT_SUBSET_INVALID`     | 422  | `paths` is not closed under shared operations; `details.paths` lists the closure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `MANUAL_COMMIT_STALE`              | 409  | `ledgerRevision` differs from the current ledger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `MANUAL_COMMIT_MESSAGE_INVALID`    | 400  | Message empty, too long, contains NUL or is otherwise invalid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `MANUAL_COMMIT_RECOVERY_REQUIRED`  | 503  | The Git outcome of a manual commit is ambiguous; operator recovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `DOCUMENT_UNCOMMITTED_LIMIT`       | 409  | Writing would add more than 200 distinct uncommitted paths; commit the pending changes first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Read endpoints emit `DOCUMENT_NOT_FOUND`, `DOCUMENT_FILE_MISSING`, `DOCUMENT_REVISION_UNAVAILABLE`,
`DOCUMENT_TOO_LARGE` and `SPEC_SOURCE_UNAVAILABLE`. An invalid manifest, an unavailable workspace, a registry or
Project Home failure, a Specification directory that is not a canonical physical directory, a path that leaves the
Specification directory a file that changes while it is being opened and any other filesystem failure of the Specification directory (permission denied, too many open files) are all `SPEC_SOURCE_UNAVAILABLE` (the body
never carries a message or a path). A registered file that is a symlink, a directory or a special entry is
`DOCUMENT_FILE_MISSING` (dangling); a registered path below a symlinked folder is `SPEC_SOURCE_UNAVAILABLE`.

Demo-only codes (`DEMO_WORKSPACE_UNAVAILABLE`, `DEMO_INVALID_SCENARIO`) stay; the demo's `demo_*` lowercase document
errors use the codes above (demo emits the same codes).

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
8. Read errors are `{error, code}` with `DOCUMENT_NOT_FOUND`, `SPEC_SOURCE_UNAVAILABLE`,
   `DOCUMENT_REVISION_UNAVAILABLE`.
9. Unclassified documents have derived ids prefixed `u-`; after classification the id changes, so the open tab and
   the route `documents/$documentId` MUST follow the returned `documents[].id`.
10. Protected branch: write errors and `actions[].reason` expose `branch-protected` / `branch-not-allowed` /
    `commit-blocked`; the editor MUST present a read-only state with that reason rather than failing on Save.
11. **Saves are acknowledged after the write, not after the commit.** A save, batch save or other operation answers
    `200` when the content is durable on disk and its commit is queued. A saved draft is clean at that response (the
    disk is the baseline; `revision` is the new disk revision). The response carries `commit.state`: show "Saved"
    with a quiet "committing" hint for `pending`, nothing extra for `committed`/`not-applicable`, and an actionable
    state for `failed`. A `DOCUMENT_REVISION_CONFLICT` MUST keep the draft (for a batch, **all** drafts: nothing was
    written, `details.conflicts` lists the documents). Send a fresh `operationId` per user save; reuse one only to
    retry the same request after a network failure (consolidation is the server's job).
12. Display titles are derived by the Engine (first H1 or file stem); there is no stored per-document title.
13. D2 changes the real Create contract (required `archetypeId`, `archetypeVersion`, `catalogueRevision`). The
    project-mode Create client (`features/specs/creation/api/api.project.ts`), the error map
    (`errors/createSpecErrors.ts`, which gains `CATALOGUE_STALE`, `ARCHETYPE_UNKNOWN`, `DOCUMENT_PATH_*` and
    `CREATE_JOURNAL_UNSUPPORTED`) and their tests are adapted **inside D2** (owner decision), not at D5.
14. The tree gains `issues[]` (including `skipped-entry`, `path-case-collision`, `archive-limit`); the UI shows
    those that make Close refuse.
15. **Save all** is one request (`POST .../documents/save`) with one `expectedRevision` per document, all checked
    before anything is written, one commit for the batch. The editor-mode multi-document save adopts it instead of N
    PUTs; a partial success does not exist (all or nothing on preconditions and on the write).
16. **Pending and failed commits are visible without Git.** `DocumentTree.commits` summarises pending and failed
    batches and each document may carry `commit` (`pending` or `failed`); the tree `revision` covers them, so
    polling with `If-None-Match` shows the transition to `committed`. The operations panel (ADR 0014) gains
    `document-change` rows while an operation is `pending`, `failed` or `recovery-required`; a committed one leaves
    the list. Rows carry no paths.
17. **Failed commits have actions.** For a failed batch the UI offers Retry and Abandon
    (`POST .../document-operations/:operationId/retry|abandon`, Manage) and explains `commit.reason`
    (`branch-changed`, `branch-protected`, `content-changed`, `index-locked`, ...). `content-changed` means someone
    else edited a pending file: saving the document again (from the version the user sees) resolves it.
    `commit.recoveryRequired: true` shows the operator hint (`nevo-specflow specs documents recover`) and no
    action. "Commit now" calls `POST .../document-commits/flush`.
18. **Busy.** `SPEC_BUSY` (`details.reason: 'busy'`, `retryAfterMs`) means a commit is in flight for the same
    paths, the queue is full or a batch awaits recovery (`details.cause`). Autosave MUST back off by
    `retryAfterMs` and keep the draft.
19. **Close refused with pending commits** (`DOCUMENT_COMMITS_PENDING`, `details.cause` `commit-pending`,
    `commit-failed` or `commit-uncommitted`): the Close dialog explains that document commits are not finished and offers "Commit now"
    (flush) or points to the failed operation.
20. **Definitions problems.** `ArchetypeCatalogue.problems[]` (invalid definition files) is shown to people who can
    fix them as a quiet warning on the Create form ("N definitions are invalid"); the valid archetypes remain
    selectable. Messages are plain text without paths.
21. **No definitions.** `DEFINITIONS_MISSING` (and an empty `archetypes[]`) shows an empty state on the Create form
    with the instruction to run `nevo-specflow definitions install`; `ARCHETYPE_UNKNOWN` with `details.cause`
    `archetype-invalid` or `archetype-not-defined` refreshes the catalogue and keeps the form.
22. **Archetype of an existing Specification no longer defined.** `DocumentTree.archetype.defined === 'absent'`: show
    "<id> v<version>" with "definition no longer available"; completeness, requirements and documents are unchanged
    (persisted snapshot); no archetype switching is offered. Document types missing from the catalogue are shown by id.
23. `actions[].reason` has lost `not-implemented`; `busy` (with `retryAfterMs` when a retry helps) and `commit-blocked`
    are real (evidence from journals, never from a Git process in a read). Documents carry `actions.save`, folders carry
    `revision` (the `expectedRevision` of a folder operation), the commit marker carries `reason`, `attempts` and
    `nextAttemptAt`, and `commits.uncommitted` counts the paths of the Specification in the ledger, `commits.policy` is `auto` or `manual`.
24. **Uncommitted changes are visible and durable.** After Abandon, or with auto-commit off, the files stay and
    `documents[].commit.state` is `uncommitted` (`reason` `abandoned` or `auto-commit-off`); show it as "changed, not
    committed" with the Commit action. Close stays refused (`commit-uncommitted`).
25. **Windows path length.** `DOCUMENT_PATH_INVALID` with `details.cause: 'path-too-long'` may be returned by Create and
    by every write on Windows hosts; the Create and document forms show the limit (240 characters including the
    workspace root) as a normal validation message.
26. **Settle window.** A save answers at once; the commit follows 250–500 ms (default 300 ms) after the last save of the
    Specification (at most 5 s). `commit.reason: 'settling'` is normal and needs no UI treatment. `flush` and the
    operation reads are scoped to the caller's Specification.
27. **Auto-commit off is a visible mode.** The tree reports `commits.policy: 'manual'` and the editor shows a quiet
    "Changes are saved, not committed" state with a **Commit changes** button (a dialog listing `entries`, a message
    field with the 100/2000 character limits, and the closure rule for a subset). Saves answer `uncommitted` at once;
    there is no pending/committing phase and no `settling` reason.
28. **Commit dialog states.** `MANUAL_COMMIT_CONFLICT` lists the paths someone else edited (reload, then retry);
    `MANUAL_COMMIT_STALE` reloads the list; `MANUAL_COMMIT_UNAVAILABLE` explains that failed or pending commits must be
    retried or abandoned first; `BRANCH_PROTECTED`/`COMMIT_BLOCKED` explain why the Engine cannot commit here and that a
    hand commit also clears the list.
29. **Close refusal reason `commit-uncommitted`** offers the same Commit changes action; after a hand commit the list
    clears on the next prune (the Close flush prunes).
30. **Configuration.** The policy source (`project`, `local`, `default`) is shown read-only; editing is a file change
    (committed config or the local file). A `GIT_POLICY_INVALID` caused by `git.commits.auto` is shown with the key name.
31. `CommitState` has no `abandoned`: an abandoned commit is `uncommitted` (reason `abandoned`).
