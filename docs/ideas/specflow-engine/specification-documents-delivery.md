---
id: ideas.specflow-engine.specification-documents-delivery
type: product
title: Specification documents layer - delivery specification (slices D0 to D5)
status: draft
scope: specflow
areas: [runtime, workflow, server, testing]
tags: [specifications, documents, archetypes, delivery, slices]
read_when:
  - planning or executing any slice of the Specification documents layer
  - decomposing the documents layer into tasks
  - checking which tests may run on Windows
summary: >
  Decision-complete specification for slices D0 to D3 (contracts and docs, Engine model and validation, Create
  with an archetype, reading) and a design-level outline for D4 (write operations with commits) and D5 (UI
  consolidation and demo cleanup). Planning artefact; durable rules live in the architecture, ADR and reference
  documents it links.
related:
  - product.specflow.specification-documents
  - architecture.runtime.specification-documents
  - reference.api.specification-documents
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - adr.0013-engine-owned-commits-and-protected-branches
  - engineering.shared.testing
  - engineering.repository.local-setup
---

# Specification documents layer - delivery specification

Non-authoritative planning document (`ideas/`). Where it restates a rule, the linked authoritative document wins.
Language follows [normative language](../../architecture/principles/normative-language.md).

## 1. Outcome, boundary and split recommendation

**Outcome.** A Specification has a manifest registry of documents, a chosen archetype with persisted requirements,
can be created with an archetype, can be read (tree, JSON, raw) through the real Runtime, and (D4) can be changed
through Engine-owned committed operations; the UI integrates by swapping demo for real without shape changes.

**One specification, six slices.** The slices share one manifest model, one contract and one error vocabulary, so
they stay one specification with ordered, independently reviewable deliveries. Recommended **separate** later
specifications (they have their own lifecycle and can be built without this one's UI): (a) the document commit
queue with coalescing (post-D4, design in ADR 0016 section 9); (b) binary import/replace (after D4);
(c) project-defined archetypes and template overrides (`.nevo/archetypes`) plus archetype switching and CLI
authoring; (d) a readiness/acceptance validation capability (distinct from structural completeness);
(e) the `ux` and `exploration` archetypes. None of these is started or approved by this document.

**Readiness.** D0, D1, D2, D3: ready for task decomposition (decision-complete; owner questions in section 10 have
stated defaults). D4: partially ready, design-level; one verified gap (commit port with deleted/new paths) and
the D2/D3 outputs are prerequisites. D5: outline; depends on the parallel UI work.

## 2. Evidence and capability map

| Capability                                | Owner / evidence                                                                                                                                                                                  | Readiness                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Manifest parser, scaffold                 | `specflow-engine/src/specs/model.ts` (`type: 'standard'` hardcoded, stored, read by nothing)                                                                                                      | Exists, must be replaced (D1)                                            |
| Fail-closed listing                       | `specs/repository.ts` `listWorkspaceSpecifications` throws on any invalid manifest                                                                                                                | Exists; consequence accepted and surfaced (section 3)                    |
| Create journal, scaffold hashes, recovery | `specs/create/journal/*`, `create/scaffold.ts` (two files hardcoded via `createSpecificationScaffold`)                                                                                            | Exists, insufficient: intent has no archetype or extra files (D2)        |
| Engine-owned path-limited commit          | `version-control/commits/port.ts` (`kind: 'specification-create'` only; `inspectPaths`, `findByOperation`)                                                                                        | Exists, insufficient for deleted/new paths and new kind (D4, unverified) |
| Protected branches                        | ADR 0013, `git.commits`, `BRANCH_PROTECTED`, `COMMIT_BLOCKED`, create-options `reason`                                                                                                            | Established                                                              |
| Read endpoint                             | `runtime/features/documents/content/*`: GET `/api/specs/:specId/documents/:documentId`, `DocumentContentSource` unwired in project mode (`server/app.ts` passes `dependencies.documents?.source`) | Exists, insufficient (D3)                                                |
| Demo documents surface                    | `contracts/src/demo/index.ts`, `runtime/features/documents/demo/*` (tree, save, add, folders, tree ops)                                                                                           | Shapes to converge (D0/D5)                                               |
| Spec to workspace resolution              | Engine `specs/discovery.ts` (`DiscoveredSpecification`: root + manifest)                                                                                                                          | Established; D3/D4 start from it                                         |
| Operation list / progress                 | ADR 0014, `OperationSummary`, per-feature adapters                                                                                                                                                | Established; document ops are synchronous in v1, no list adapter needed  |
| Authorization                             | `SpecCapabilities` View / Create / Manage                                                                                                                                                         | Established                                                              |
| Workspace read model `documents` section  | `contracts/specs/workspace` (`DocumentCollectionSchema`)                                                                                                                                          | Exists as `not_implemented` in project mode; filled in D3                |

## 3. Cross-cutting decisions (apply to all slices)

1. **No backward compatibility** (owner). Parser requires `archetype` and `documents`; `type` is removed from the
   model and the scaffold; no alias, no default archetype in any contract, no legacy reader.
2. **Listing fail-closed consequence.** One manifest in the old shape makes `listWorkspaceSpecifications` throw
   `SpecificationError('SPEC_SOURCE_INVALID', ...)` for the whole checkout; HTTP surfaces map it to the existing
   503 / `SPEC_SOURCE_UNAVAILABLE`-style source error. D1 MUST (a) put the offending slug and field in the Engine
   error message (the Runtime logs it, HTTP exposes only the code), (b) document the by-hand repair (add
   `archetype` and `documents`, remove `type`) in the lifecycle documentation, and (c) **audit** that the repository
   has no Specification in the old shape: `git ls-files | grep -E "(specification|change)\.yaml$"` returned nothing
   at specification time (no tracked `specs/` directory); re-run it at D1 and fail the slice if a manifest exists.
   Local, untracked Specifications on developer machines are expected to break and are repaired by hand.
3. **Interim Create (D1 to D2).** D1 changes the scaffold shape, so Create MUST keep producing valid manifests:
   the single Create call site passes the archetype `minimal` internally (not an API default) until D2 replaces
   it. A Create journal reserved before D1 holds scaffold hashes of the old shape and fails recovery by design;
   operators abandon such a journal (existing procedure). Same for v1 journals at D2 (section 6).
4. **Error vocabulary.** One list (reference page) shared by Engine (`DocumentError` with these codes plus the
   existing `SpecificationError`, `CreateOperationError`, `GitCapabilityError`) and the Runtime status table.
5. **Ids.** Registered ids `^[a-z0-9][a-z0-9-]{0,63}$`, never `u-` prefixed; unclassified ids are derived
   (`u-` + 16 hex of sha256 of the lower-cased path).
6. **Authorization.** Reads: spec `View`. State changes: spec `Manage`. Catalogue: same capability as
   `create-options`.
7. **Testing rule (owner).** Unit tests run anywhere. Tests that use real Git, real worktrees, many files,
   symlinks, SIGKILL or the Engine commit port are **Linux-only integration** and MUST NOT be run on Windows by
   agents or developers: run them in CI or with `tools/dev/linux-test.sh` after committing, for example
   `tools/dev/linux-test.sh -- 'pnpm turbo run build --filter=@nevo/specflow-engine^... && cd packages/specflow-engine && npx vitest run test/<file>.test.ts --testTimeout=240000'`
   (see [local setup](../../engineering/repository/local-setup.md), [testing](../../engineering/shared/testing.md)).
   Test placement: owned pure tests co-located with source; cross-boundary and real-Git tests in the package
   `test/` directory. Each slice lists its tests as **U** (unit, anywhere) or **L** (Linux-only integration).

## 4. D0 - Contract, documentation and ADRs

**Scope.** (a) This documentation set becomes `current` where the owner accepts it (ADRs 0015/0016, architecture,
product, reference). (b) `packages/specflow-contracts/src/documents/` gains TypeBox schemas and types for the
shared vocabulary of the reference page: `ContentKind`, `Classification`, `ActionReason`, `Action`,
`DocumentTypeInfo`, `ArchetypeCatalogue`, `DocumentTree`, `DocumentContent`, `SaveInput/Result`,
`DocumentOperationInput/Result`, `CreateDocumentsInput`, `DocumentErrorCode`, `DocumentError`, plus the Create
request extension as an exported **fragment** (`CreateArchetypeSelectionSchema`) that is not yet merged into
`CreateSpecRequestSchema` (that is D2). Export under `@nevo/specflow-contracts/documents`. (c) Update ADR 0013's
pointer (done), `docs/architecture/runtime/specification-lifecycle.md` "Create" with a forward link,
regenerate the docs index.

**Non-goals.** No Engine, Runtime, CLI or UI change; the existing `Demo*` document schemas and
`SpecificationDocumentResponseSchema` stay untouched in D0 (demo convergence is D5; replacing them earlier would
break the parallel UI build).

**Contract outline.** As in [the reference](../../reference/api/specification-documents.md); all schemas
`additionalProperties: false`; ids and limits as stated there.

**Invariants.** Schemas contain no Engine logic; every enum (kinds, reasons, error codes) is defined once and the
error-code list is a single exported `as const` array from which the union is derived.

**Acceptance.** (1) New schemas exported and re-exported from the package index; (2) the shared vocabulary file
has no duplicate of a literal defined elsewhere; (3) a contract test proves each representative payload of the
reference (tree with unclassified + dangling + completeness, raw-error bodies, operation inputs for rename, move,
delete, classify, create-documents; error bodies) validates and that invalid shapes (extra key, `required` flag,
string archetype version, missing `useWhen`) are rejected; (4) `pnpm docs:check` passes and the generated index is
committed.

**Verification.** U: contract schema tests (Vitest, co-located `*.test.ts` like `create.test.ts`); package
lint, typecheck, build, `pnpm docs:check`. No L tests.

## 5. D1 - Engine model, catalogue and pure validation

**Scope** (`@nevo/specflow-engine`, `src/specs/`):

1. **Catalogue module** (`specs/archetypes/`): typed plain data for document types and archetypes exactly as the
   product document's tables; each entry carries mandatory non-empty `description` and `useWhen` (and archetypes
   `title`); templates (outline sections: overview = the present scaffold; behaviour: Scenarios, Rules, Edge cases,
   Acceptance scenarios; ux: Flows, Screens and states, Copy, Responsive behaviour, Accessibility; backend:
   Contracts, Data and ownership, Invariants, Errors and recovery, Verification; architecture: Context, Options,
   Chosen structure, Constraints; decisions, research, user-story: short heading skeletons) as strings; a pure
   `catalogueRevision()` (sha256 of canonical JSON); lookup functions. Shaped so that a future YAML loader yields the
   same type (`ArchetypeDefinition`), but no loader exists.
2. **Manifest model and parser** (`model.ts`): `SpecificationManifest` loses `type`, gains `archetype`,
   `documents`, `folders`. `parseSpecificationManifest` implements every parser rule of the architecture document.
   A `serializeSpecificationManifest` / `updateManifestRegistry` pure function produces the YAML text
   (preserving unknown top-level keys; comment preservation via the `yaml` Document API is SHOULD) and is
   re-validated through the parser before use.
3. **Scaffold**: `createSpecificationScaffold` takes `archetypeId`, `optionalDocumentIds`, `addedDocuments`,
   `folders` and returns files (manifest first, then documents in catalogue order, then added) with sha256; the
   manifest carries the archetype, requirements snapshot and registry; scaffold ids per the id rule; added
   documents without type are not registered. Throws `SPEC_VALIDATION_ERROR` for unknown archetype/template ids,
   path conflicts (case-insensitive, against scaffold paths and each other), counts/size limits (<=10 documents,
   <=100 folders, content <=200000 chars).
4. **Pure modules**: `documentPaths` (validate/normalise/case-fold keys, parents, folder derivation),
   `contentKinds` (extension table, media types, `classifyContent(ext, firstBytes)`), `documentIds` (allocate,
   derive `u-` ids), `documentValidation` (requirements results, issues from a registry plus an observed file set).
5. **Interim Create call site** passes `minimal` (section 3.3). `archive-effects.ts` keeps round-tripping the parsed
   manifest; add an assertion test that archive preserves `archetype` and `documents`.
6. **Fixture rewrite.** Every test or fixture that writes or compares a manifest uses the new shape, preferably via
   one shared helper (`writeSpecificationManifestFixture`) in Engine test support. Known writers (from
   `git grep -l "specification.yaml\|spec_id"`): Engine `test/specifications.test.ts`, `archive-close`,
   `close-sigkill`, `close-worktree-lifecycle`, `create-commit`, `create-journal-contract`, `create-journal`,
   `create-listing`, `create-multiprocess`, `durable-create`, `engine-commit-port`, `integration-destination`,
   `lifecycle-admission`, `quality-hardening-q00/q01/q05`; Runtime `test/specs/create.http.test.ts`,
   `close.http.test.ts`, `engine-overview.http.test.ts`, `features/specs/create/progress.test.ts`; CLI
   `packages/specflow/test/create-cross-transport.test.ts`; contracts `operations/progress.test.ts` (path strings
   only); UI tests mention the string only. The slice's definition of done includes re-running
   `git grep -n "type: 'standard'\|type: standard"` with zero hits and the audit of section 3.2.
7. **Docs**: lifecycle document gets the by-hand repair note; `docs/ideas/.../specification-and-worktree-close-design.md`
   needs no change (it only mentions `spec_id`).

**Non-goals.** No journal change, no Create request change, no filesystem projection, no Runtime or CLI change.

**Error codes.** Existing `SPEC_SOURCE_INVALID` (parse), `SPEC_VALIDATION_ERROR` (scaffold input), `SPEC_CONFLICT`.
Messages name slug and field, never absolute paths.

**Invariants.** Parser strictness; catalogue completeness (every requirement type exists in the type catalogue;
every `always` template satisfies its archetype's requirements; every archetype includes `overview`); scaffold
determinism (same input, same sha256); `overview` entry always present and fixed; ids unique; paths unique case-insensitively.

**Acceptance.** (1) A scaffold for each archetype parses back to an equal model; (2) the parser rejects each rule
violation with `SPEC_SOURCE_INVALID`, including the old `type`-only manifest; (3) the catalogue test suite proves
the catalogue invariants and the revision is stable and changes on any edit; (4) validation returns the exact
results for met/unmet/dangling/unclassified cases; (5) path, kind and id modules pass table-driven cases incl.
Windows device names, case collisions, traversal, trailing dots, NUL; (6) `listWorkspaceSpecifications` on a
directory with one old-shape manifest throws and names the slug; (7) the repository audit has no old-shape hit.

**Verification.** U: all pure-module tests, parser/scaffold/catalogue/validation tests, archive round-trip of a
manifest string via the pure serializer; engine lint, typecheck, build. L: the rewritten real-Git suites listed in
item 6 (they only change fixtures) and the listing test with a real directory; run on Linux. Windows: unit only.

## 6. D2 - Create with an archetype (Engine, Runtime, contracts, CLI)

**Scope.**

1. **Engine input** (`CreateSpecificationInput`/`CreateClientIntent`): adds `archetype: {id, version}`,
   `catalogueRevision?` (checked when present), `optionalDocumentIds` (normalised: sorted, unique),
   `addedDocuments` (path, type?, content), `folders` (sorted, unique). The intent fingerprint covers all of it, so
   replay with a different archetype is `CREATE_OPERATION_INVALID`-style conflict as today.
2. **Journal intent versioning**: `CreateJournal.version` becomes `2`; the codec accepts only 2; `requestIntent`
   carries the new fields; added-document content is stored in the journal (cap 1 MiB total, enforced at admission);
   `files[]` evidence lists every scaffold file; `commit.paths` = `files[].relativePath`. A journal of version 1
   is unsupported: listing reports it as `CREATE_JOURNAL_UNSUPPORTED` naming the file, Create admission fails
   closed with that code until the operator deletes it (documented next to the existing recovery procedure; the
   product is pre-release; ADR 0014's "version 1, no migration" sentence is updated).
3. **Scaffold writing and commit** generalise from two files to N files plus `folders[]` directories (directories
   created under the existing no-symlink checks; empty folders are registered only in the manifest). The commit
   covers all scaffold files in the one Create commit (ADR 0013 unchanged). Replay and the "byte-identical, clean
   human commit" acceptance operate on the full list. Git disabled: no commit, as today.
4. **Admission** (before reservation, nothing written): unknown archetype/template (`ARCHETYPE_UNKNOWN`), stale
   catalogue or version (`CATALOGUE_STALE`), invalid/colliding path (`DOCUMENT_PATH_INVALID`,
   `DOCUMENT_PATH_CONFLICT`), limits (`DOCUMENT_OPERATION_INVALID`). Existing codes unchanged.
5. **Runtime**: `GET /api/specs/archetypes` (catalogue; same capability as create-options; ETag = revision);
   `CreateSpecRequestSchema` gains the required `archetypeId`, `archetypeVersion`, `catalogueRevision` and the
   optional lists (reference page); `CreatedSpecSchema` gains `documentIds`; error-status table gains
   `CATALOGUE_STALE` 409, `ARCHETYPE_UNKNOWN` 422, `DOCUMENT_PATH_INVALID` 400, `DOCUMENT_PATH_CONFLICT` 409,
   `CREATE_JOURNAL_UNSUPPORTED` 503; body limit raised to 1 MiB for this route only. Progress vocabulary unchanged.
6. **CLI** (`nevo-specflow specs create`): `--archetype <id>` (default `minimal`, a CLI presentation default, not an
   Engine one), repeatable `--with <templateId>`; result prints created document ids; cross-transport parity test
   updated. Reference CLI page updated.
7. **Docs**: reference pages for Create (`reference.api.specflow-specification-operations`), lifecycle document,
   CLI reference.

**Non-goals.** No document operations; no tree/read changes; no UI change (the UI adaptation is a coordinated
dependency, see UI impact and open question 1); archetype switching; project archetypes.

**Contract/schema outline.** Reference page, section D2. Journal: `version: 2`, intent extension as item 2.

**Invariants.** Intent immutability (fingerprint); the scaffold is regenerated from the journal and must match
`files[]` hashes; exactly one commit for the whole scaffold; nothing is written when admission fails; completeness
of a new Specification equals the archetype's requirements (the scaffold satisfies them by construction).

**Error codes.** As item 4/5 plus existing Create codes (`BRANCH_PROTECTED`, `COMMIT_BLOCKED`, `COMMIT_FAILED`,
`CREATE_RECOVERY_REQUIRED`, ...).

**Acceptance.** (1) Creating each archetype on a Git-enabled checkout yields one commit with exactly the scaffold
files and the manifest, a clean tree, a manifest with the archetype snapshot and registry, and `documentIds`
in the response; (2) optional suggestions and added documents appear (typed ones registered, untyped ones
unclassified); (3) replay with the same `operationId` returns the same result; different archetype under the same
id conflicts; (4) stale catalogue revision is `CATALOGUE_STALE` with nothing written; (5) protected branch refuses
before writing; (6) Git-disabled project creates without a commit; (7) SIGKILL at each commit-related stage
recovers via `specs recover` with the full file list; (8) a v1 journal yields `CREATE_JOURNAL_UNSUPPORTED`;
(9) CLI and HTTP produce the same Specification for the same input.

**Verification.** U: intent normalisation and fingerprint, catalogue-driven admission (pure), journal codec v2
round-trip and v1 rejection, route schema/validation/error-status mapping with a fake Engine
(`app.inject`), CLI argument parsing. L: `create-commit`, `durable-create`, `create-journal`, `create-multiprocess`,
SIGKILL stage tests, `create.http.test.ts` and `create-cross-transport.test.ts` extended for archetypes; run on
Linux only.

## 7. D3 - Reading: projection, real content source, content kinds, raw

**Scope.**

1. **Engine** `specs/documents/read.ts`: `readSpecificationDocumentTree(engine, specId)` and
   `readSpecificationDocument(engine, specId, documentId)`; both start from `DiscoveredSpecification` (explicit
   workspace), take one manifest read, then list the Specification directory (no symlink following, skip + count,
   depth <= 8, <= 2000 files, hidden entries and `specification.yaml` excluded), stat registered files and compute
   the projection of the architecture document: registered / unclassified / dangling, `kind` by the closed
   table, `protected`, `editable` (md, txt, size <= 1 MiB, active location), `satisfiesRequirement`,
   `completeness`, folders (from files plus `folders[]`), actions with advisory reasons. Revisions: sha256 of
   bytes for files <= 1 MiB (memoised by path + size + mtimeNs + ino, bounded cache), `stat:<size>-<mtimeNs>`
   above. Tree `revision` = sha256 over manifest bytes plus the sorted `path:revision` list. Advisory reasons
   `branch-protected` / `branch-not-allowed` / `git-policy-invalid` come from the same policy evaluation as
   create-options (read-only; no Git process other than what `currentBranch` already costs; if the branch cannot be
   determined cheaply the reason is omitted and enforcement still happens on write). Archived location: all
   actions `archived`.
2. **Raw access**: `openSpecificationDocument(engine, specId, documentId)` returns `{ metadata, stream }`; it
   re-verifies the physical path (lstat, realpath equality, regular file) before and after open (fstat identity),
   enforces 25 MiB.
3. **Runtime**: implements the real `DocumentContentSource` over the Engine and wires it in project mode
   (`server/app.ts` replaces the unwired `dependencies.documents?.source`; tests may still inject);
   routes `GET /api/specs/:specId/document-tree`, `GET /documents/:documentId` (new `DocumentContent`),
   `GET /documents/:documentId/raw` with the headers of the reference page; error mapping to the new
   `{error, code}` bodies (D3 owns replacing the three lowercase read error bodies); ETag/304 on tree and raw;
   workspace read model `documents` section filled from the registered documents (`kind` = document type id)
   instead of `not_implemented`. Demo routes, demo schemas and the UI are not touched.
4. **Docs**: reference page marks D3 endpoints implemented; `reference.api.specification-workspace` data-source
   paragraph updated.

**Non-goals.** No writes, no unclassify, no history/revision reads, no Range, no archive (zip) inspection, no
server-side markdown rendering, no demo convergence.

**Invariants.** Architecture invariants 1, 6, 7, 8. Reads take no control lock and start no mutating Git process.
`raw` never serves text as HTML/script (types, nosniff, sandbox CSP); a registered path escaping the Specification
directory (cannot occur after parsing, defence in depth) is `SPEC_SOURCE_UNAVAILABLE`.

**Error codes.** `DOCUMENT_NOT_FOUND` 404, `DOCUMENT_FILE_MISSING` 404, `DOCUMENT_REVISION_UNAVAILABLE` 409,
`DOCUMENT_TOO_LARGE` 413, `SPEC_SOURCE_UNAVAILABLE` 503, 401/403 unchanged.

**Acceptance.** (1) A real Specification created with `feature` shows four registered documents, completeness
satisfied; (2) a file added by hand appears `unclassified` with a derived id and can be read; (3) deleting a
registered file by hand makes it `dangling` and reading it is `DOCUMENT_FILE_MISSING`; (4) png/svg open as images
with correct MIME and the sandbox CSP header, a `.zip` is `binary` with `attachment`, a `.md` containing NUL is
`binary`; (5) html is served `text/plain`; (6) > 1 MiB text read is 413 on JSON and served by raw; > 25 MiB raw is
413; (7) revision query mismatch is 409; (8) a symlink in the folder is skipped and counted, never read;
(9) archived Specification: all actions `archived`; (10) project-mode GET of the existing document URL no longer
returns 503 for a valid document; (11) 403 without `View`; (12) the workspace `documents` section lists the
registered documents.

**Verification.** U: projection function over an in-memory file model (kinds, states, revisions, actions,
completeness, limits), content-kind table, header builder, route tests with a fake source (`app.inject`):
status mapping, headers, ETag, authorization. L: real directories with real Specifications (symlink case,
TOCTOU re-verification, large files, hand-edited files, archived location) and an HTTP test against a real
project Runtime; Linux only.

## 8. D4 - Write operations (design-level outline; not decision-complete)

**Scope.** Engine operations behind a `document-change` journal (ADR 0016): save, create from template or content
(batch, one commit), create folder (registers in `folders[]`), rename, move, delete (document, folder, dangling
registration), classify, text import (md/txt/other text kinds); Runtime routes PUT `/documents/:documentId`, POST
`/documents`, POST `/folders`, POST `/document-operations`; contract per reference section D4.

**Design by operation** (all: reserve journal under the write lock, check preconditions, write via temp+rename,
registry rewrite last, commit once, complete):

| Operation   | Files and registry                                            | Commit paths               | Key preconditions / refusals                                         |
| ----------- | ------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| save        | replace bytes; manifest untouched                             | the file                   | revision match, editable, active                                     |
| create      | new files from template/content; add registry entries         | new files + manifest       | no path collision, manifest clean                                    |
| folder      | `folders[]` add; mkdir                                        | manifest                   | path valid, not a file                                               |
| rename/move | move file(s) (folder: all under it); update paths in registry | old + new paths + manifest | not `overview`, no collision, manifest clean                         |
| delete      | remove file(s); remove registry entries                       | removed paths + manifest   | not `overview` (nor a folder containing it); dangling: registry only |
| classify    | add registry entry for an unclassified file                   | the file + manifest        | not registered, type valid, manifest clean                           |

**Prerequisites and gaps to prove first (Linux L tests):** the commit port accepts `kind: 'document-change'`,
untracked new paths, deleted paths and rename pairs under `git commit --only` without disturbing other staged or
unstaged changes; `preflight` ignores-check works for new paths. Not verified at specification time.

**Journal and recovery** (ADR 0016 sections 6 and 8): stages, per-step physical evidence, two-state save, `specs`
recovery command extended (`nevo-specflow specs recover <operation-id>` already generic by kind; verify), HTTP
replay semantics, Git-disabled path, protected-branch admission, `SPEC_BUSY` against Close/Create via the checkout
write lock.

**Commit queue with coalescing** (design in ADR 0016 section 9; build after D4 as a follow-up, own specification
per section 1): ordering by journal sequence; coalescing of queued consecutive saves of the same document;
idempotency through `Nevo-Operation` plus `Nevo-Coalesced` trailers; merged groups fail and recover as one unit.

**Acceptance themes** (to become decision-complete before decomposition): every operation yields one commit with
exactly the expected paths and a clean tree; protected branch refusal leaves no change; stale revision refusal keeps
foreign edits; crash at each stage recovers or abandons deterministically; overview cannot be deleted by any route
(document, folder, classify misuse); Git disabled writes without commits; replay idempotency.

**Verification themes.** U: path/plan computation (pure planners per operation), preconditions, input validation,
route mapping. L: all journal/crash/commit tests with real Git, multi-process contention, SIGKILL cut points.

## 9. D5 - UI consolidation and demo cleanup (outline; owned by the UI work)

Converge the demo to the shared contract (demo schemas become re-exports of section D0 schemas; demo endpoints
emit the new shapes and codes; showcase fixtures and `required`/`required_document_path` removed); remove the
superseded `Demo*` document schemas and the old read error bodies; the UI adopts the explicit **UI impact** list
of [the reference](../../reference/api/specification-documents.md) (tree states, classify and remove-registration
actions, completeness display, kind-based viewers, raw image/download, protected-branch read-only state, derived
`u-` ids on classify, synchronous save with conflict handling, project-mode Create sends `archetypeId` /
`archetypeVersion` / `catalogueRevision`). Verification: UI unit/Storybook tests and demo-vs-real contract tests
asserting both emit schema-valid payloads for the same scenarios. Sequencing: D5 is a flag day for the UI and
the demo; real endpoints (D2/D3) ship first and are consumed by the UI at D5. The UI project-mode Create must send
the archetype fields no later than D2 (open question 1).

## 10. Open questions for the owner (defaults stated)

1. **D2 breaks the shipped UI project-mode Create** (it sends no archetype; fields are required, no default).
   Default: D2 is merged together with a minimal UI adaptation (select archetype from `GET /api/specs/archetypes`
   and send the three fields; the demo form already has the selection UI), owned by the UI work.
2. **`overview.md` rename/move.** Decision 4 says protected = cannot be deleted. Default: its id and path are also
   fixed (parser rule), so rename/move are refused with the same `protected` reason.
3. **Pre-D2 Create journals / v1 journals** are unsupported and must be abandoned by hand (`CREATE_JOURNAL_UNSUPPORTED`).
   Default accepted as pre-release behaviour; say if a one-time cleanup tool is wanted.
4. **`architecture` archetype requires one `decisions` document** (overview 1, architecture 1, decisions 1).
   Default as stated; trivial to relax.

## 11. Not verified at specification time

- The commit port with deleted, renamed and new paths (D4 gap above); behaviour of `commit --only` on rename pairs.
- That `git ls-files` shows no old-shape manifest in the repository was checked only for tracked files in this
  worktree; developer-local specifications were not inspected.
- The Create scaffold writer and the codec were read, not executed; the claim that generalising from two files to
  N files needs no change in the multi-process locking was not tested.
- Authorization capability for the catalogue route (`create-options` equivalent) was inferred from the demo
  routes; D2 confirms.
- No test suite was run (documentation-only change; Linux-only suites were not run on Windows by rule).
