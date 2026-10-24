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

**One specification, slices D0 to D5 plus the design-level slice D-config.** The slices share one manifest model, one contract and one error vocabulary, so
they stay one specification with ordered, independently reviewable deliveries. Recommended **separate** later
specifications (they have their own lifecycle and can be built without this one's UI): (a) the document commit
queue with coalescing (post-D4, design in ADR 0016 section 10); (b) binary import/replace (after D4);
(c) archetype switching in an existing Specification and CLI authoring of definitions (loading owner-defined
definitions is **not** separate: it is the named slice D-config of this specification, section 7a); (d) a readiness/acceptance validation capability (distinct from structural completeness);
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
3. **Interim Create (D1 to D2).** D1 changes the scaffold shape, so Create MUST keep producing valid manifests.
   Observed: `createSpecificationScaffold` has **two** call sites, `create/reservation/reservation.ts:88`
   (reservation) and `create/scaffold.ts:11` (`expectedScaffold`, regenerating the scaffold for writing and
   recovery). Both pass the archetype `minimal` internally (not an API default) until D2 replaces them. A Create
   journal reserved before D1 holds scaffold hashes of the old shape and fails recovery by design; operators abandon
   such a journal (existing procedure). Journals of the older format at D2 follow section 6, item 2.
4. **Error vocabulary.** One list (reference page) shared by Engine (`DocumentError` with these codes plus the
   existing `SpecificationError`, `CreateOperationError`, `GitCapabilityError`) and the Runtime status table.
5. **Ids.** Rules (pattern, deterministic suffix, `u-` derived ids from the exact path) are owned by the
   architecture document; slices implement them, they are not restated here.
6. **Authorization.** Reads: spec `View`. State changes: spec `Manage`. Catalogue: same capability as
   `create-options`.
7. **Limits.** Every size, count and body limit is owned by the Limits table of the architecture document
   (bytes, not characters); slices reference it.
8. **Testing rule (owner).** Unit tests run anywhere. Tests that use real Git, real worktrees, many files,
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
`DocumentOperationInput/Result`, `CreateDocumentsInput`, the declarative **definition schema** (`ArchetypeDefinitionFile`: document types, archetypes, requirements, templates, with `instructions` and `preselected`; reference: "Definition schema") and its published JSON Schema file `packages/specflow-contracts/schema/archetype-definitions.schema.json` (generated from the TypeBox types; a unit test fails on drift), `DocumentErrorCode`, `DocumentError`, plus the Create
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

**Acceptance.** (0) The definition schema validates the example file of the reference and rejects: a document type without `instructions`, an archetype without `useWhen`, a template referencing no `documentType`, `preselected` on an `always` template, `minCount` < 0, an unknown key; the committed JSON Schema equals the generated one. (1) New schemas exported and re-exported from the package index; (2) the shared vocabulary file
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
   product document's tables; each entry carries mandatory non-empty `description` and `useWhen` (archetypes also
   `title`: "Minimal", "Feature", "Architecture") and, for document types, mandatory `instructions`; archetypes and templates carry `instructions` as the product document defines. The data conforms to the definition schema of D0 (the same validator is run over the built-ins in a test). Default filenames per type (including `note.md` and
   `user-story.md`), archetype texts, all `instructions` texts, `include`/`preselected` flags and the generated template skeletons are fixed by the product document
   ("Template skeletons"); the Engine reproduces them verbatim and a test compares them with that table. A pure
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
   path conflicts (case-insensitive, against scaffold paths and each other) and the Create limits of the Limits table.
4. **Pure modules**: `documentPaths` (validate/normalise/case-fold keys, parents, folder derivation),
   `contentKinds` (extension table, media types, `classifyContent(ext, firstBytes)`), `documentIds` (allocate,
   derive `u-` ids), `documentValidation` (requirements results, issues from a registry plus an observed file set).
5. **Interim Create call sites** (both, section 3.3) pass `minimal`. `archive-effects.ts` keeps round-tripping the parsed
   manifest; add an assertion test that archive preserves `archetype` and `documents`.
6. **Fixture rewrite.** Re-derived with `git grep -l "specification.yaml" -- packages` (31 files mention the file
   name) and `git grep -lE "spec_id:|stringify|writeFile.*specification.yaml" -- packages`: only a few files
   write or compare **manifest content by hand** and need the new shape: Engine `test/specifications.test.ts`,
   `test/create-multiprocess.test.ts`, `test/engine-commit-port.test.ts`, Runtime
   `test/specs/engine-overview.http.test.ts`, plus production code `model.ts` and `lifecycle/archive-effects.ts`
   (which round-trips the parsed manifest). All other suites obtain manifests from Create or only mention paths
   and therefore change only if they assert scaffold hashes or manifest text; those are found by running them on
   Linux after the change. Use one shared helper (`writeSpecificationManifestFixture`) in Engine test support for
   the hand-written ones. The earlier estimate of "25+ rewritten fixtures" was wrong. Definition of done includes
   `git grep -n "type: 'standard'\|type: standard"` with zero hits and the audit of section 3.2.
7. **Docs**: lifecycle document gets the by-hand repair note; `docs/ideas/.../specification-and-worktree-close-design.md`
   needs no change (it only mentions `spec_id`).

**Non-goals.** No journal change, no Create request change, no filesystem projection, no Runtime or CLI change.

**Error codes.** Existing `SPEC_SOURCE_INVALID` (parse), `SPEC_VALIDATION_ERROR` (scaffold input), `SPEC_CONFLICT`.
Messages name slug and field, never absolute paths.

**Invariants.** Parser strictness; catalogue completeness (every requirement type exists in the type catalogue;
every archetype requires `overview` with `minCount` >= 1 and has an `always` overview template (the framework invariant), and the built-ins require nothing else; every template's `documentType` exists; every document type has non-empty `instructions`; placeholders render deterministically); scaffold
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

## 6. D2 - Create with an archetype (Engine, Runtime, contracts, CLI, UI Create adaptation)

**Scope.**

1. **Engine input** (`CreateSpecificationInput`/`CreateClientIntent`): adds `archetype: {id, version}`,
   `catalogueRevision?` (checked when present; the HTTP schema requires it), `optionalDocumentIds` (normalised:
   sorted, unique), `addedDocuments` (path, type?, content) and `folders` (sorted, unique). The intent
   fingerprint covers all of it (for `addedDocuments`, path, type and the sha256 of the content), so a replay with
   a different archetype or content under the same `operationId` conflicts as today.
2. **Journal v2 and its size caps.** Observed caps: the journal file is read with a 65536-byte ceiling in three
   separate places (`journal/store.ts` `readCreateJournal` line 42, `inspect/listing.ts` line 10,
   `journal/retention.ts` line 24); the strict codec requires `version === 1`, `files.length === 2` with the
   exact manifest and overview paths (`codec.ts` `isValidJournalFiles`) and allows only the intent keys
   `title|goal|slug|target` (`isValidJournalIntent`). **Decision: file contents are not stored in the journal.**
   Instead each scaffold file (manifest, overview, templates, added documents) is written once, before the journal
   is published, to a hash-addressed payload file `<operations>/create/<operationId>.payload/<sha256>` (temp file,
   fsync, rename; the folder name does not end in `.json`, so journal readers ignore it). The journal keeps only
   evidence: `files[]` (path, sha256, bytes; first two fixed as manifest and overview, then at most the documented
   count, unique paths) and an intent that lists `archetype`, `optionalDocumentIds`, `addedDocuments` as
   `{path, type?, sha256, bytes}`, and `folders`. Recovery and `expectedScaffold` read the payload files and verify
   each against `files[].sha256`; a missing or mismatching payload is `CREATE_RECOVERY_REQUIRED` (reason payload).
   Payload folders are deleted with the journal by the retention sweep. Why not raising the cap: contents of up to
   ~1 MiB would be rewritten on each of ~10 stage transitions, three constants would have to change in lockstep, and
   every reader (including the tolerant listing that must stay cheap) would parse megabytes. The payload store keeps
   the journal under the existing cap, which stays but becomes **one exported constant** used by all three readers.
   `CreateJournal.version` becomes `2`; the codec accepts `files` of the new shape and the new intent keys, and
   the journal pins `catalogueRevision` (diagnostic only: recovery uses the payload, never the live catalogue, so
   a catalogue that changed between crash and resume has **no effect** on the outcome).
3. **Older journals - narrow handling (PROPOSAL, owner sign-off required; not a compatibility reader).** Observed:
   `listCreateJournals` is strict and throws on any invalid file, and it is used by Create admission
   (`reservation.ts:62`, `durable.ts:406`) and, through `assertSharedResourcesAvailable`
   (`coordination/resources.ts:89`), by **Close** admission. One old-format file would therefore block Create and
   Close permanently. The proposal: (a) `listCreateJournals` classifies a file whose `version` field is not the
   current one as _unsupported_ (read nothing else from it), returns it separately and does **not** throw and
   does **not** count it as a resource claim; Create and Close are never blocked by it; (b) the existing
   retention sweep deletes unsupported-version files whose mtime is older than the 7-day retention (no parsing of
   their content; a file that is not valid JSON or has no numeric `version` is "unsupported" the same way);
   (c) reading such a journal **by operation id** (inspection, replay) answers the new code
   `CREATE_JOURNAL_UNSUPPORTED` (503, distinct from `CREATE_JOURNAL_CORRUPT`); (d) the tolerant operations list
   shows the row as `recovery-required` with that code. No old format is ever interpreted. Cost accepted: the
   evidence of a v1 journal that still had effects is lost after 7 days; the operator procedure (resume before
   upgrading) is documented. Alternative if the owner declines: none that avoids permanent blocking, because
   deleting at once would destroy live evidence.
4. **Scaffold writing and commit** generalise from two files to N files plus `folders[]` directories (created under
   the existing no-symlink checks; empty folders are registered only in the manifest). The commit covers all
   scaffold files in the one Create commit (ADR 0013 unchanged; `commit.paths` = `files[].relativePath`). Replay
   and the "byte-identical, clean human commit" acceptance operate on the full list. Git disabled: no commit.
5. **Admission** (before reservation, nothing written): `ARCHETYPE_UNKNOWN`, `CATALOGUE_STALE`,
   `DOCUMENT_PATH_INVALID`, `DOCUMENT_PATH_CONFLICT`, `DOCUMENT_OPERATION_INVALID` (limits). Existing codes
   unchanged.
6. **Runtime.** `GET /api/specs/archetypes` (same capability as create-options; ETag = revision).
   `CreateSpecRequestSchema` gains the required fields of the reference. **Body limits (observed: the server has no
   global `bodyLimit`; only password-login and the demo document routes set one)**: `POST /api/specs` declares its
   own `bodyLimit` and the future Save route its own, both above the content cap and equal to the value in the
   Limits table (the demo already uses 2 MiB for save and 16 MiB for its batch). Oversized bodies answer 413.
   `error-status.ts` is an exhaustive switch: add `CATALOGUE_STALE` 409, `ARCHETYPE_UNKNOWN` 422,
   `DOCUMENT_PATH_INVALID` 400, `DOCUMENT_PATH_CONFLICT` 409, `DOCUMENT_OPERATION_INVALID` 400,
   `CREATE_JOURNAL_UNSUPPORTED` 503 and extend `error-status.test.ts`.
7. **CLI** (`nevo-specflow specs create`): `--archetype <id>` is **required** (no default in any layer, matching the
   contract rule), repeatable `--with <templateId>`; result prints created document ids. Justification for removing
   the earlier `minimal` default: a CLI default would be a hidden second place that decides the shape of work.
8. **UI Create adaptation (owner decision: inside D2).** The project-mode Create client
   (`packages/specflow-ui/src/features/specs/creation/api/api.project.ts` and `api.project.test.ts`), the project form
   (`CreateProjectForm.tsx`, catalogue loading and the archetype choice already built for the demo form), the
   submit hook (`useCreateProjectSpecification.ts` and test) and the error map (`errors/createSpecErrors.ts` and
   test: `CATALOGUE_STALE`, `ARCHETYPE_UNKNOWN`, `DOCUMENT_PATH_*`, `CREATE_JOURNAL_UNSUPPORTED`) send and handle
   the new fields. Owner: the UI implementation profile, as part of the D2 delivery.
9. **Docs**: reference pages for Create (`reference.api.specflow-specification-operations`), lifecycle document,
   CLI reference, and **ADR 0014**: replace the sentence "The Create journal format is `version: 1`; there was never a
   released version 2 and no migration or compatibility reader exists." (line 68; also in the lifecycle document)
   with the version 2 statement and the item 3 handling.

**Non-goals.** Document operations; tree/read changes; demo convergence (D5); archetype switching; project archetypes.

**Contract/schema outline.** Reference, section D2. Journal: `version: 2`, items 2 and 3.

**Invariants.** Intent immutability (fingerprint); the scaffold is read from the verified payload, not regenerated;
exactly one commit for the whole scaffold; nothing is written when admission fails; completeness of a new
Specification equals the archetype's requirements; no old journal can block Create or Close.

**Acceptance.** (1) Each archetype on a Git-enabled checkout yields one commit with exactly the scaffold files and
the manifest, a clean tree, the archetype snapshot and registry in the manifest, and `documentIds` in the response;
(2) suggestions and added documents appear (typed registered, untyped unclassified); (3) replay with the same
`operationId` returns the same result, a different archetype conflicts; (4) stale catalogue revision is
`CATALOGUE_STALE` with nothing written; (5) protected branch refuses before writing; (6) Git-disabled project
creates without a commit; (7) SIGKILL at each commit-related stage recovers with the full file list, also when the
catalogue revision differs at resume; (8) a journal of an older version does not block Create or Close, is
removed by the sweep after retention, and yields `CREATE_JOURNAL_UNSUPPORTED` by id; (9) CLI and HTTP produce the
same Specification for the same input; (10) the UI creates a Specification in project mode with the chosen
archetype end to end against the Runtime and shows each new error code; (11) a body above the route limit is 413.

**Verification.** U (anywhere): intent normalisation and fingerprint, catalogue-driven admission, journal codec v2
round-trip and old-version classification (pure, with in-memory file contents), payload hashing helpers, route
validation and `error-status` mapping with a fake Engine (`app.inject`), CLI argument parsing, UI unit tests for
`api.project`, form, hook and error map. L (Linux only): `create-commit`, `durable-create`, `create-journal`,
`create-multiprocess`, SIGKILL stage tests, the sweep with real files and the Close-not-blocked case,
`test/specs/create.http.test.ts` and `packages/specflow/test/create-cross-transport.test.ts` extended for archetypes.

## 7. D3 - Reading: projection, real content source, content kinds, raw

**Scope.**

1. **Engine** `specs/documents/read.ts`: `readSpecificationDocumentTree(engine, specId)` and
   `readSpecificationDocument(engine, specId, documentId)`; both start from `DiscoveredSpecification` (explicit
   workspace), take one manifest read, then list the Specification directory (no symlink following, skip + count,
   limits per the Limits table, hidden entries and `specification.yaml` excluded), stat registered files and compute
   the projection of the architecture document: registered / unclassified / dangling, `kind` by the closed
   table, `protected`, `editable` (md, txt, within the save limit, active location), `satisfiesRequirement`,
   `completeness`, folders (from files plus `folders[]`), actions with advisory reasons. Revisions per the Limits table (hash or stat signature, bounded memo). Tree `revision` = sha256 over manifest bytes plus the sorted `path:revision` list. Advisory reasons
   `branch-protected` / `branch-not-allowed` / `git-policy-invalid` come from the same policy evaluation as
   create-options (read-only; no Git process other than what `currentBranch` already costs; if the branch cannot be
   determined cheaply the reason is omitted and enforcement still happens on write). Archived location: all
   actions `archived`.
2. **Raw access**: `openSpecificationDocument(engine, specId, documentId)` returns `{ metadata, stream }`; it
   re-verifies the physical path (lstat, realpath equality, regular file) before and after open (fstat identity),
   enforces the raw limit.
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

**Acceptance.** (1) A real Specification created with `feature` and its preselected suggestions shows four registered documents, completeness
satisfied; (2) a file added by hand appears `unclassified` with a derived id and can be read; (3) deleting a
registered file by hand makes it `dangling` and reading it is `DOCUMENT_FILE_MISSING`; (4) png/svg open as images
with correct MIME and the sandbox CSP header, a `.zip` is `binary` with `attachment`, a `.md` containing NUL is
`binary`; (5) html is served `text/plain`; (6) text above the JSON limit is 413 on JSON and served by raw; above the raw limit is 413; (7) revision query mismatch is 409; (8) a symlink in the folder is skipped, counted, reported as the `skipped-entry` issue and never read; a
Specification with more files than Close archive allows, or a file above its per-file limit, reports
`archive-limit` (Close archive refuses symlinks and special files, 4096 files and 32 MiB per file; the document
limits are chosen below those on purpose); (13) on a case-sensitive filesystem `A.md` and `a.md` both appear with
different `u-` ids and a `path-case-collision` issue, both readable;
(9) archived Specification: all actions `archived`; (10) project-mode GET of the existing document URL no longer
returns 503 for a valid document; (11) 403 without `View`; (12) the workspace `documents` section lists the
registered documents.

**Verification.** U: projection function over an in-memory file model (kinds, states, revisions, actions,
completeness, limits), content-kind table, header builder, route tests with a fake source (`app.inject`):
status mapping, headers, ETag, authorization. L: real directories with real Specifications (symlink case,
TOCTOU re-verification, large files, hand-edited files, archived location) and an HTTP test against a real
project Runtime; Linux only.

## 7a. D-config - Owner-defined archetypes, document types and templates (design level, after D3)

Named slice, **not decision-complete and not part of the first execution pass**. It sits right after D3 and may run
before or alongside D4 (it does not depend on D4 and D4 does not depend on it). It makes the "configuration"
half of the framework invariant real (architecture document, "Definitions").

**Scope (design).**

1. **Location and trust.** YAML files under `.nevo/archetypes/*.yaml` plus template files under
   `.nevo/archetypes/templates/`, in the schema of D0 (`schemaVersion: 1`), read only from the **committed** Project
   Home configuration, with the same trust rule as `git.commits` (ADR 0013): a linked checkout's copy and local
   machine configuration are never consulted. A template may use `contentFile` (relative path under
   `templates/`, no traversal, size limit of the Limits table) instead of inline `content`; the loader resolves it, and
   the resolved catalogue contains content only.
2. **Validation and error surface.** Each file is validated with the D0 JSON Schema rules plus cross-checks (template
   `documentType` exists, `overview` requirement and `always` overview template present, unique ids and
   (`id`,`version`) pairs, limits). An invalid **file** is rejected as a whole and reported in
   `ArchetypeCatalogue.problems[]` (`source` = file, `code`, `message`, location); valid files and built-ins still load.
   Nothing is silently repaired. A Create that names an archetype from a rejected file is `ARCHETYPE_UNKNOWN`. A
   broken or unreadable configuration directory never blocks reading existing Specifications (they use their
   persisted snapshot) and never blocks Create with a built-in archetype.
3. **Precedence and collisions.** Ids are unique across built-ins and user definitions. A user definition whose
   archetype or document-type `id` equals a built-in's is rejected (`id-collision`); there is no overlay or silent
   override in the first version. Template overrides for a built-in archetype are a later extension (a separate
   `templateOverrides` section would be added to the schema with `schemaVersion: 2`).
4. **Versions against existing Specifications.** Existing Specifications keep their persisted snapshot whatever the
   files say. The version rule of the architecture document applies; the loader cannot detect an un-bumped
   requirements change. A Create with a stale `catalogueRevision` or version is `CATALOGUE_STALE`.
5. **Surfaces.** The same `GET /api/specs/archetypes` (now including user definitions and `problems`); CLI
   `archetypes list|show|validate` as thin adapters (validate runs the loader over given files). Authoring by AI uses
   the published JSON Schema and the catalogue's `description`/`useWhen`/`instructions`.

**Dependencies.** D0 (definition schema and JSON Schema), D1 (catalogue types, validator, placeholder rendering,
id and version rules), D2 (Create reads the catalogue by id, version and revision, and snapshots requirements), D3
(catalogue endpoint and real read path). Project Home configuration reading (existing, used for `git.commits`).

**What D1 to D3 MUST keep stable for D-config:** (a) the definition schema and `schemaVersion`; (b) ids of the
built-in types, archetypes and templates (never renamed); (c) the meaning of `version` (bump on requirements
change) and the snapshot in the manifest; (d) `catalogueRevision` = sha256 of the canonical resolved catalogue,
computed by one function that takes any list of definitions; (e) the catalogue contract fields `instructions`,
`preselected`, `include` and the reserved optional `problems`; (f) the catalogue being a single Engine function
(`resolveCatalogue(builtIns, userDefinitions?)`) so D-config only adds an input; (g) the error codes
`ARCHETYPE_UNKNOWN`, `CATALOGUE_STALE`. No backward-compatibility rule is weakened: user files are in the current
schema only and an unknown `schemaVersion` is rejected.

**Acceptance themes (to be made decision-complete before decomposition).** Valid user archetype creates a
Specification with its snapshot; invalid file reported and isolated; id collision rejected; broken directory does not
block built-ins or reads; revision changes with any edit; CLI validate agrees with the Runtime.

**Verification themes.** U: schema validation, cross-checks, collision and precedence logic, `resolveCatalogue`
determinism. L (Linux only): loading from a real Project Home with committed and uncommitted/linked-checkout copies.

## 8. D4 - Write operations (design-level outline; not decision-complete)

**Scope.** Engine operations behind a `document-change` journal (ADR 0016): save, create from template or content
(batch, one commit), create folder (registers in `folders[]`), rename, move, delete (document, folder, dangling
registration), classify, text import (md/txt/other text kinds); Runtime routes PUT `/documents/:documentId`, POST
`/documents`, POST `/folders`, POST `/document-operations`; contract per reference section D4.

**Design by operation** (all: reserve a `document-change` journal as a resource claim under the control lock, check preconditions, write via temp+rename,
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

**Journal and recovery** (ADR 0016 sections 6 to 10). Corrections to earlier wording: (1) `specs recover` is
**Create-only** today (`resumeInterruptedCreateOperation`); D4 must add a resume/abandon entry for document
journals. (2) There is **no per-checkout write lock** in the Engine; document journals join the existing journal
claim mechanism (`assertSharedResourcesAvailable`: journals are the claim records, checked under the short control
lock) with resources for the Specification's documents and for the checkout index, so `SPEC_BUSY` comes from the
overlap check against Create and Close journals, and a tolerant document-journal listing so a bad file never
blocks others. (3) Replay after delete or rename needs the **per-path expected state** recorded in the journal
(pre-state sha256/absent/untracked, post-state), decided per path on resume; a delete of a never-tracked file has
nothing to commit (completes with `committed: false` when all paths are untracked). (4) The Engine verifies each
path's **post-image hash** before committing and the committed content after (`fileAt`). (5) The manifest is
rewritten by compare-and-swap against the pre-image hash stored in the journal. (6) A failed commit restores any
intent-to-add index entries it created. Stages include a terminal `failed`.

**Commit queue with coalescing** (design in ADR 0016 section 10; build after D4 as a follow-up, own specification
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
`u-` ids on classify, synchronous save with conflict handling). The project-mode Create adaptation is **not** part
of D5: it ships inside D2. Verification: UI unit/Storybook tests and demo-vs-real contract tests
asserting both emit schema-valid payloads for the same scenarios. Sequencing: D5 is a flag day for the UI and
the demo; real endpoints (D2/D3) ship first and are consumed by the UI at D5. The UI project-mode Create adaptation ships with D2.

## 10. Open questions for the owner

Resolved by the owner: the UI Create adaptation is inside D2 (item 8); no compatibility readers or aliases.
Still open (defaults stated, **unconfirmed**):

1. **DEFAULT - `overview.md` rename/move.** Its id and path are fixed; rename and move are refused with `protected`
   like delete.
2. **PROPOSAL - old Create journals (D2 item 3).** Tolerant classification, never a claim, never blocking Create or
   Close; the sweep deletes unsupported-version files after 7 days; `CREATE_JOURNAL_UNSUPPORTED` by id. Needs sign-off
   because it deletes old evidence after retention.
3. **DEFAULT - CLI `--archetype`** is required (no default `minimal`).

Decided by the owner and therefore not open: built-in archetypes require only `overview.md`; owner-defined archetypes, types, templates and instructions are the slice D-config.

## 11. Not verified at specification time

- The commit port with deleted, renamed and new paths (D4 gap above); behaviour of `commit --only` on rename pairs.
- That `git ls-files` shows no old-shape manifest in the repository was checked only for tracked files in this
  worktree; developer-local specifications were not inspected.
- The Create scaffold writer and the codec were read, not executed; that the payload store (D2 item 2) needs no
  change in the multi-process locking was not tested. The behaviour of Close archive with hidden files (it includes
  them) was read, not executed.
- Authorization capability for the catalogue route (`create-options` equivalent) was inferred from the demo
  routes; D2 confirms.
- No test suite was run (documentation-only change; Linux-only suites were not run on Windows by rule).
