---
id: ideas.specflow-engine.specification-documents-delivery
type: product
title: Specification documents layer - delivery specification (slices D0 to D5 and D-config)
status: draft
scope: specflow
areas: [runtime, workflow, server, testing]
tags: [specifications, documents, archetypes, delivery, slices]
read_when:
  - planning or executing any slice of the Specification documents layer
  - decomposing the documents layer into tasks
  - checking which tests may run on Windows
summary: >
  Decision-complete specification for slices D0 to D3 (delivered: contracts, Engine model, Create with an
  archetype, reading) and for the two remaining slices delivered together in one pull request: D-config (definitions
  as project data files, nothing compiled in) and D4 (write operations with an asynchronous commit queue); outline
  of D5 (UI consolidation). Planning artefact; durable rules live in the architecture, ADR and reference documents it links.
related:
  - product.specflow.specification-documents
  - architecture.runtime.specification-documents
  - reference.api.specification-documents
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - adr.0017-definitions-as-project-data
  - adr.0018-engine-commit-policy-and-manual-commit
  - ideas.specflow-engine.plan-06
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
through Engine-owned operations that write at once and commit through a durable queue; the archetypes, document types
and templates are project data files (D-config), not product code; the UI integrates by swapping demo for real
without shape changes.

**One specification, slices D0 to D5 plus D-config.** The slices share one manifest model, one contract and one error
vocabulary, so they stay one specification with ordered, independently reviewable deliveries. D0 to D3 are delivered
(PRs #92 and earlier); **D-config and D4 are delivered together in one pull request** (owner decision; section 8a).
Recommended **separate** later specifications (they have their own lifecycle and can be built without this one's UI):
(a) binary import/replace (after D4); (b) archetype switching in an existing Specification and CLI/HTTP authoring of
definitions; (c) a readiness/acceptance validation capability (distinct from structural completeness); (d) the `ux`
and `exploration` archetypes (now simply definition files); (e) further definition kinds (task archetypes, task
types, review kinds; the kind registry of D-config is their prerequisite); (f) **push/publish of document commits:
out of scope, the Engine has no push capability, to be specified only if the owner asks**. The commit queue with
coalescing is **no longer separate**: it is part of D4. None of these is started or approved by this document.

**Readiness.** D0 to D3: delivered. **D-config: ready for task decomposition** (decision-complete, section 7a; the
packaging of seed files in the single artifact is the one point to prove). **D4: ready for task decomposition**
(decision-complete, section 8), with one verified gap that its first task proves on Linux (the commit port with
deleted, new and renamed paths) and the owner questions of section 10 (all have defaults). D5: outline; depends on the
parallel UI work and on the contract of this delivery.

## 2. Evidence and capability map

State at specification time of D4 and D-config (main `db000a40`, D0 to D3 merged). Each row was checked against code.

| Capability needed                              | Owner / evidence                                                                                                                                                                                                                                                                          | Readiness                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Manifest parser, serializer, registry rewrite  | `specs/model.ts`, `manifest-serializer.ts` (delivered D1)                                                                                                                                                                                                                                 | Established                                                                                 |
| Create with N files, journal v2, payload store | `specs/create/*`, `create/journal/payload.ts`, `retention.ts`, `unsupported.ts` (delivered D2)                                                                                                                                                                                            | Established; to be generalised into `specs/durable/` (extraction, no behaviour change)      |
| Tolerant listing, claims, Close exclusion      | `coordination/resources.ts`: `checkout-scoped:` claims coexist, `checkout:` (Close) excludes them; Create journals are the claim records; control lock never stolen (`project/control-lock.ts`)                                                                                           | Established; document journals reuse the scoped claim                                       |
| Engine-owned path-limited commit               | `version-control/commits/port.ts`, `git-adapter.ts`: `kind` only `specification-create`; `add --intent-to-add` over every path (fails for a deleted path); in-process `serializePerCheckout`; lost-race retries; `findByOperation`, `inspectPaths`, `blobMatchesWorkingFile`, `preflight` | Exists, insufficient: deleted, rename pairs and new kind (D4 gap, **unverified on Linux**)  |
| Git call deadlines                             | `git/process.ts` 10 s (kill, `GIT_UNAVAILABLE`); `git/mutation.ts` 30 s + 3 s grace (`GIT_OPERATION_UNCERTAIN`)                                                                                                                                                                           | Established; the queue relies on them; a filter grandchild surviving `kill()` is unverified |
| Protected branches                             | ADR 0013, `git.commits`, `engineCommitRefusal`, `BRANCH_PROTECTED`, `COMMIT_BLOCKED` reasons                                                                                                                                                                                              | Established                                                                                 |
| Tree, document read, raw                       | `specs/documents/*` (D3)                                                                                                                                                                                                                                                                  | Established; tree gains commit summary                                                      |
| Operation list and progress                    | ADR 0014: Create adapter reads `engine/operations/create` only; rows have no paths; status table; `queued` reserved                                                                                                                                                                       | Exists, extend with a `document-change` adapter (additive)                                  |
| Operator recovery                              | `specs recover` is Create-only (`resumeInterruptedCreateOperation`)                                                                                                                                                                                                                       | Gap: document recovery command (D4)                                                         |
| Project configuration location                 | `project/home/home.ts`: `projectConfigPath`, `homeRoot`; `readProjectGitPolicy` reads the home checkout's `.nevo/config.yaml` + local; `architecture.runtime.configuration`: definitions keep their own committed files                                                                   | Established; `.nevo/definitions/` is a new namespace next to `agents/`, `workflows/`        |
| Catalogue today                                | `specs/archetypes/builtins.ts` compiled; `getBuiltInCatalogue()` called by `create/admission.ts`, `create/reservation/reservation.ts:100`, `scaffold.ts:200`, `documents/tree-reader.ts:73`, CLI `specs/command.ts`                                                                       | To be removed (D-config)                                                                    |
| Definition schema                              | `specflow-contracts/src/documents/definition.ts` (aggregate `ArchetypeDefinitionFile`), `schema/archetype-definitions.schema.json`, `findDefinitionTextLimitViolations`                                                                                                                   | Exists, to be split per kind                                                                |
| YAML parsing hardening                         | `specs/model.ts:144` uses `parse(text)` of `yaml` with defaults plus a 256 KiB cap                                                                                                                                                                                                        | Exists; definitions use stricter options                                                    |
| Packaging of data files                        | `specflow/packaging/*` bundles with esbuild; no data-asset precedent found                                                                                                                                                                                                                | Uncertain: prove in the D-config packaging task                                             |
| Authorization                                  | `SpecCapabilities` View / Create / Manage                                                                                                                                                                                                                                                 | Established                                                                                 |

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
   such a journal (existing procedure). Unreadable journals follow section 6, item 3.
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

**Scope.** (a) This documentation set stays `draft`: the owner has not recorded acceptance, so no status changes in this slice (ADRs 0015/0016, architecture, product, reference). (b) `packages/specflow-contracts/src/documents/` gains TypeBox schemas and types for the
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

> **Amended by D-config (section 7a).** D1 to D3 are delivered as written below, but the compiled built-in catalogue
> (item 1: "plain data in the Engine", `getBuiltInCatalogue`) and the aggregate definition schema of D0 are replaced by
> project definition files and per-kind schemas in the D-config delivery. Read items on the catalogue and on the
> definition schema as history.

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
   documents without type are not registered. Throws `ScaffoldValidationError` (a `SpecificationError` with code `SPEC_VALIDATION_ERROR` and a structured `cause`: `archetype-unknown`, `template-unknown`, `path-invalid`, `path-conflict`, `type-invalid` (an added document type that is malformed or cannot be registered, for example `u` or `u-*`), `limit-exceeded`, carrying the offending path or id) for unknown archetype/template ids,
   path conflicts (case-insensitive, against scaffold paths and each other) and the Create limits of the Limits table.
4. **Pure modules**: `documentPaths` (validate/normalise/case-fold keys, parents, folder derivation),
   `contentKinds` (extension table, media types, `classifyContent(ext, firstBytes)`), `documentIds` (allocate,
   derive `u-` ids), `documentValidation` (requirements results, issues from a registry plus an observed file set).
5. **Interim Create call sites** (both, section 3.3) pass `minimal`. `archive-effects.ts` keeps round-tripping the parsed
   manifest; add an assertion test that archive preserves `archetype` and `documents`.
6. **Fixture rewrite.** Re-derived with `git grep -l "specification.yaml" -- packages` (31 files mention the file
   name) and `git grep -lE "spec_id:|stringify|writeFile.*specification.yaml" -- packages`: only a few files
   write or compare **manifest content by hand** and need the new shape: Engine `test/specifications.test.ts`,
   `test/create/create-multiprocess.test.ts`, `test/git/engine-commit-port.test.ts`, Runtime
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
   fingerprint covers all of it (for `addedDocuments`, path, type and the sha256 of the content) EXCEPT
   `catalogueRevision`, which is a precondition of admitting a new operation and not part of its identity, so a
   replay with a different archetype or content under the same `operationId` conflicts as today while a retry
   after a catalogue change replays the stored result. (Implementation note: the journal also records the
   registered `documentIds`, so results and inspections need not read the payload.)
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
3. **Unreadable journals - narrow handling.** Observed:
   `listCreateJournals` is strict and throws on any invalid file, and it is used by Create admission
   (`reservation.ts:62`, `durable.ts:406`) and, through `assertSharedResourcesAvailable`
   (`coordination/resources.ts:89`), by **Close** admission. One unreadable file would therefore block Create and
   Close permanently. The handling: (a) `listCreateJournals` classifies a file that is not valid JSON or has no numeric `version` as _unsupported_ (read nothing else from it), returns it separately and does **not** throw and
   does **not** count it as a resource claim; Create and Close are never blocked by it; (b) the existing
   retention sweep deletes unsupported files whose mtime is older than the 7-day retention (no parsing of
   their content; a file that is not valid JSON or has no numeric `version` is "unsupported" the same way);
   (c) reading such a journal **by operation id** (inspection, replay) answers the new code
   `CREATE_JOURNAL_UNSUPPORTED` (503, distinct from `CREATE_JOURNAL_CORRUPT`); (d) the tolerant operations list
   shows the row as `recovery-required` with that code; (e) the same sweep removes a payload directory
   (`<operationId>.payload/`) that has **no journal** and is older than the retention (a crash between payload write and
   journal publication leaves one; age by directory mtime, never while a journal with that id exists). No old format is ever interpreted. Cost accepted: the
   evidence of a v1 journal that still had effects is lost after 7 days; the operator procedure (resume before
   upgrading) is documented.
4. **Scaffold writing and commit** generalise from two files to N files plus `folders[]` directories (created under
   the existing no-symlink checks; empty folders are registered only in the manifest). The commit covers all
   scaffold files in the one Create commit (ADR 0013 unchanged; `commit.paths` = `files[].relativePath`). Replay
   and the "byte-identical, clean human commit" acceptance operate on the full list. Git disabled: no commit.
5. **Admission** (before reservation, nothing written; maps `ScaffoldValidationError.cause` one to one: `archetype-unknown`/`template-unknown` to `ARCHETYPE_UNKNOWN`, `path-invalid` to `DOCUMENT_PATH_INVALID`, `path-conflict` to `DOCUMENT_PATH_CONFLICT`, `type-invalid`/`limit-exceeded` to `DOCUMENT_OPERATION_INVALID`): `ARCHETYPE_UNKNOWN`, `CATALOGUE_STALE`,
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

**Compile order.** Required Create fields break Runtime and UI typechecking until the Runtime and UI tasks of this slice land. The PR head MUST be green on every package; intermediate checkpoint commits on the branch may be red (they disappear on squash, per the commit conventions).

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
   actions `archived`. D3 never reports `busy` or `commit-blocked` (reads take no lock and run no mutating Git process;
   both arrive with D4). **No write route exists until D4**, so D3 reports every write action (`rename`, `move`, `delete`,
   `classify`, `folder`) and the capabilities `createFile`, `createFolder`, `import`, `classify` as `available: false`
   with a reason in this order of precedence: `archived`, then `protected` or `root`, then the advisory Git policy reason
   of the checked-out branch (`branch-protected`, `branch-not-allowed`, `git-policy-invalid`; the UI needs the read-only
   reason before D4 exists), and otherwise `not-implemented`. A registered document's `classify` is unavailable without a
   reason (nothing to classify), or `archived` in an archived Specification. `editable` stays computed from kind and
   size. D4 replaces `not-implemented` by the policy-based answer and removes the reason from the vocabulary (done with the Engine reads; the precedence is in the reference). The `archive-limit` and `skipped-entry` issues come from the count-only traversal of the
   architecture document ("Archive count rule"), independent of the listing cap; hidden entries are excluded from the tree
   and counted by that traversal.
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
registered documents only (unclassified and dangling entries are not part of that section); (14) a Specification with 4097 files (some hidden) reports `archive-limit` while the tree is `truncated` at the listing cap, and one with 4096 does not.

**Verification.** U: projection function over an in-memory file model (kinds, states, revisions, actions,
completeness, limits), content-kind table, header builder, route tests with a fake source (`app.inject`):
status mapping, headers, ETag, authorization. L: real directories with real Specifications (symlink case,
TOCTOU re-verification, large files, hand-edited files, archived location) and an HTTP test against a real
project Runtime; Linux only.

## 7a. D-config - Definitions as project data (decision-complete)

Governing decision: [ADR 0017](../../architecture/decisions/0017-definitions-as-project-data.md); rules:
[architecture, "Definitions as project data"](../../architecture/runtime/specification-documents.md); contract:
[reference, "Definition files"](../../reference/api/specification-documents.md). Delivered **together with D4 in one
pull request** (section 8a), after D3. It replaces the earlier design-level sketch (`.nevo/archetypes`, built-ins
plus user overlay).

**Outcome.** The Engine has no compiled archetype, document type or template. It reads definitions only from the
project's `.nevo/definitions/<kind>/<id>.yaml`; the product ships default definitions as seed data files that
`init` and `definitions install` copy into a project. Owners edit, add and delete files. Many kinds can plug in later
without touching the loader.

**Non-goals.** Task archetypes, task types, review kinds (the registry makes them cheap, they are not built); template
overrides or an overlay/disable list; archetype switching in an existing Specification; branch-specific definitions;
an HTTP API to write definitions; a file watcher; a global `GET /api/definitions`.

**Scope (what is built).**

1. **Contracts** (`@nevo/specflow-contracts/documents`): split the aggregate `ArchetypeDefinitionFile` into
   `DocumentTypeDefinitionFile` and `SpecificationArchetypeDefinitionFile` (adds `kind`, `schemaVersion`, `id`,
   template `contentFile`), `DefinitionProblem`, `ArchetypeCatalogue.problems`/`problemsTruncated`,
   `DocumentTree.archetype.defined`, the new error codes; JSON Schemas per kind (reference). The existing
   `findDefinitionTextLimitViolations` keeps its role per file.
2. **Engine `specs/definitions/`** (new):
   - `kind-registry.ts`: `registerDefinitionKind({ kind, directory, schemaVersions, schema, parse, check, dependsOn })`;
     the two kinds are registered in `kinds/document-type.ts` and `kinds/specification-archetype.ts`. The loader core
     never names a kind.
   - `source.ts`: a `DefinitionSource` seam (list directory, lstat, bounded read) with a real filesystem
     implementation (lstat on every entry, `realpath` equality, no symlinks, bounded `limit + 1` reads) and an
     in-memory one for unit tests.
   - `loader.ts`: `loadDefinitions(source, registry) -> { entities, problems }` implementing the safety, YAML,
     isolation, cascade and limit rules of the architecture document; deterministic (name order).
   - `catalogue-source.ts`: `getProjectCatalogue(engine) -> { catalogue, problems }` with the stat-signature memo
     (per Project Home, revalidated on every call, 2-second recency rule, no watcher, no lock, no Git).
   - `install.ts` and `seed.ts`: seed discovery next to the bundle (the packaging step copies the seed folder like
     `copyProductUiAssets`), `planInstall`/`applyInstall` (bootstrap only when empty, `<kind>/<id>` and `--add-missing`,
     `--force`, dependency closure, atomic writes, dry-run plan; no upgrade path, no stamp). Seeds are data
     files in `packages/specflow-engine/definitions/` with the same layout.
   - `archetypes/catalogue.ts`: `resolveCatalogue(entities)` becomes pure over loaded entities and returns the
     catalogue plus problems (cross-reference cascade, framework requirements); `catalogueRevisionOf` keeps the
     canonical-JSON hash; the default parameters and `getBuiltInCatalogue()` are removed.
3. **Seed files.** The nine document types and three archetypes of the product document become YAML plus template
   files under `packages/specflow-engine/definitions/`, byte-identical in text to today's `builtins.ts`; the `overview`
   template is a template file (`contentFile`) so the golden fixtures keep their meaning. Seed files are exempt from
   formatters (`.prettierignore`) because template bytes are golden-tested. Seeds carry no version stamp or hash (there
   are no existing projects). **Packaging (verified: `packaging/bundle.ts` `copyProductUiAssets` already ships data
   next to `bin.js`):** the seed folder is copied next to the bundle the same way and found relative to the bundle at
   run time (the alternative, generated TypeScript strings, is rejected: it would compile the text back in).
4. **Callers** (every code path that changes, observed by `git grep` at specification time):

   | Path                                                                                                                                                                                                                                                                                                                                          | Change                                                                                                                                                                                                                               |
   | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `engine/src/specs/archetypes/builtins.ts`                                                                                                                                                                                                                                                                                                     | Deleted; its data moves to the seed files; `templateSkeleton` becomes a test helper that regenerates the expected skeleton for the golden test                                                                                       |
   | `engine/src/specs/archetypes/catalogue.ts`, `index.ts`, `projection.ts`                                                                                                                                                                                                                                                                       | `getBuiltInCatalogue`, `BUILT_IN_DEFINITIONS` defaults removed; `projectCatalogue(catalogue, problems)` takes its input; `catalogueRevision(catalogue)`                                                                              |
   | `engine/src/specs/create/admission.ts` (`resolveCreateArchetype`, `admitCreateArchetype`)                                                                                                                                                                                                                                                     | Catalogue parameter required; `resolveCreateArchetype(engine, id)` is async and loads the project catalogue; new causes `definitions-missing`, `archetype-invalid`, `archetype-not-defined`                                          |
   | `engine/src/specs/create/reservation/reservation.ts:100`                                                                                                                                                                                                                                                                                      | Loads the project catalogue before the lock and passes it to `scaffoldOf`; a catalogue change meanwhile is covered by `CATALOGUE_STALE` and the journal pin                                                                          |
   | `engine/src/specs/scaffold.ts:200` (`createSpecificationScaffold`)                                                                                                                                                                                                                                                                            | `catalogue` becomes a required input (no `?? getBuiltInCatalogue()`)                                                                                                                                                                 |
   | `engine/src/specs/documents/tree-reader.ts:73`                                                                                                                                                                                                                                                                                                | Archetype title from the project catalogue; absent definition -> `archetype.defined: false`                                                                                                                                          |
   | `engine/src/index.ts:82-85` and `src/testing.ts`                                                                                                                                                                                                                                                                                              | Exports `projectCatalogue`, `catalogueRevision`, `resolveCreateArchetype`, `loadProjectCatalogue`, install functions; testing helper `installDefinitionsForTesting(projectRoot)`                                                     |
   | `engine/src/specs/create/*` test seam `createSpecificationForTesting`                                                                                                                                                                                                                                                                         | Installs the seeds into the test Project Home when absent (one place; this is how the ~60 Create-using suites keep working)                                                                                                          |
   | `specflow/src/specs/command.ts` (`resolveCreateArchetype(options.archetype)`)                                                                                                                                                                                                                                                                 | Calls the async Engine form; `definitions` command group added (new `specflow/src/definitions/command.ts`); `program.ts` registers it                                                                                                |
   | `specflow/src/init/initialize-project.ts`, `cli.ts`                                                                                                                                                                                                                                                                                           | Seeds the definitions before writing the committed config marker; `--no-definitions`                                                                                                                                                 |
   | `specflow/packaging/*` (bundle, pack)                                                                                                                                                                                                                                                                                                         | The seed files must be present in the packaged artifact and found at runtime (esbuild text loader or copied assets; verified by the packaged smoke test)                                                                             |
   | `runtime/src/features/specs/create/endpoint.ts` (catalogue route, Create mapping), `error-status.ts`                                                                                                                                                                                                                                          | Catalogue route returns `problems`, ETag covers them; `DEFINITIONS_MISSING` 422; `ARCHETYPE_UNKNOWN` details; tests                                                                                                                  |
   | `runtime/src/demo/catalogue.ts`, `features/specs/demo/*`                                                                                                                                                                                                                                                                                      | The demo keeps its own fixture catalogue (it is not a product source); confirm it imports nothing from the Engine catalogue                                                                                                          |
   | `ui/src/features/specs/creation/*` (project form, error map, `api.project`)                                                                                                                                                                                                                                                                   | `problems` banner, empty state for `DEFINITIONS_MISSING`, new `ARCHETYPE_UNKNOWN` causes                                                                                                                                             |
   | Tests: `catalogue.test.ts`, `catalogue-definition.test.ts`, `projection.test.ts`, `scaffold.test.ts`, `scaffold-writer.test.ts`, `admission.test.ts`, `test/create/create-archetype-recovery.test.ts`, `test/create/create-archetype.test.ts`, runtime `create-archetype.http.test.ts`, the golden `archetypes/fixtures/overview-golden.json` | Rebuilt on a catalogue loaded from the seeds (or a small in-memory definition set); the golden test renders the shipped `overview` template through the loader; the recovery test changes the catalogue by editing a definition file |
   | Docs: product doc, ADR 0015 (done), architecture, reference, `architecture.runtime.configuration` (namespace `.nevo/definitions`), CLI reference                                                                                                                                                                                              | Updated when the code lands (section 8a)                                                                                                                                                                                             |

   **Further call sites found by review (also change):** `runtime/test/support/archetype.ts` and
   `specflow/test/create-cross-transport.test.ts` call the synchronous `catalogueRevision()` at module load (they become
   async or read the installed project catalogue); about seven Runtime HTTP suites; the Engine suites
   `create-journal*`, `create-listing`, `shared-resource-coordination` and `quality-hardening-q00-journals`. The test seam
   `createSpecificationForTesting` covers 33 files, but 14 suites call `createSpecificationFromRequest` and about 6
   post to `/api/specs`: a **second helper** installs the seeds for those. Both seams MUST allow opting out so the
   `DEFINITIONS_MISSING` tests can run on a project without definitions. The tree reader MUST NOT stat-walk the
   definitions directory per tree request (single-file `lstat` plus the memo; `archetype.defined` is
   `defined|invalid|absent`).

5. **Authoritative text.** The seed files own the long strings. The product document keeps the structural matrix; a
   unit test parses the matrix tables of the product document (ids, titles, default files, requirements, include,
   preselected) and compares them with the seeds. The older test that compared every string with the document is
   removed.

**Invariants.** (1) No archetype-related text or id except the three `overview` constants exists in the compiled
Engine, Runtime, CLI or UI sources (enforced by a repository test that loads every seed `description`, `useWhen` and
`instructions` string and fails if any occurs in a non-test, non-seed source file; the Runtime demo fixture `runtime/src/demo/catalogue.ts` is exempt by explicit path (it imports only `@nevo/specflow-contracts/demo`, verified)). (2) The catalogue is a pure function of the files;
the same files give the same `revision` on any machine. (3) A bad file never affects another file, except through a
declared reference. (4) Reading and loading take no lock and start no process. (5) Install never overwrites a file
without `--force`, never resurrects a deleted definition silently, and (with Git enabled) commits what it wrote through the Engine commit capability, refusing on a protected branch before writing (ADR 0017 decision 8). (6) Existing Specifications
never depend on the catalogue for their rules.

**Error codes.** `DEFINITIONS_MISSING` (422), `ARCHETYPE_UNKNOWN` (422, causes), `CATALOGUE_STALE` (409, unchanged),
problem codes of the reference. Messages never contain absolute paths.

**Acceptance.** (1) With seeds installed, the catalogue equals today's built-in catalogue content: the revision of the
resolved catalogue is computed once from the seeds and pinned in a test (the pin replaces the old string comparison);
Create for each archetype produces the same scaffold bytes as before (golden fixtures). (2) A valid user archetype
file creates a Specification with its snapshot; editing a template file changes the next Create and the revision.
(3) An invalid file (bad YAML, schema violation, wrong `kind`, wrong `id`, duplicate, oversize, symlink, traversal in
`contentFile`, alias bomb) is reported with its code in `problems`, others still load. (4) Deleting `ux.yaml` of the
document types invalidates every archetype that requires or templates `ux` (reported, `reference-missing`) and the
rest still work; deleting `overview.yaml` invalidates all archetypes and Create answers `DEFINITIONS_MISSING`;
deleting `feature.yaml` makes `feature` `ARCHETYPE_UNKNOWN` (`archetype-not-defined`) while an existing `feature`
Specification still reads, saves, closes and shows `archetype.defined: absent`. (5) A project without a definitions
directory: catalogue route `200` with empty `archetypes`; Create `DEFINITIONS_MISSING`. (6) `definitions install` is
idempotent (second run changes nothing), a bare run on a project that already has definitions refuses and names
`<kind>/<id>` and `--add-missing`, a deleted definition is not resurrected, `--force` overwrites, `--dry-run` writes nothing, installing an archetype installs its
document types, files written atomically. (7) `definitions validate` and the Runtime report the same problems for the
same files. (8) `CATALOGUE_STALE` after editing a definition between catalogue read and Create. (9) A linked checkout's
copy of `.nevo/definitions` and the local config are never read. (10) The packaged artifact installs the seeds
(packaged smoke test). (11) `init` seeds definitions; `--no-definitions` does not.

**Verification split.** **U (anywhere):** kind registry, loader over the in-memory source (every problem code, cascade,
limits, determinism), schema validation per kind, JSON Schema drift, install planning over the in-memory source,
product-doc matrix parity, catalogue resolution and revision, stat-signature memo logic with an
injected clock, CLI argument parsing, route mapping with a fake Engine. **L (Linux only):** the real filesystem source
(symlinks, special files, traversal, many files, permissions, hard links), the stat-memo against real mtime/ctime
behaviour, Project Home resolution from a linked checkout (never read), `install` against a real project, Create
end to end with a definition edited between read and Create, the recovery test, the packaged smoke test.

## 8. D4 - Write operations with an asynchronous commit queue (decision-complete)

Governing decision: [ADR 0016](../../architecture/decisions/0016-engine-owned-document-commits.md) (amended twice; it
holds the state machine and the failure classification); rules:
[architecture, "Write operations and the commit queue"](../../architecture/runtime/specification-documents.md);
contract: [reference, section D4](../../reference/api/specification-documents.md). Delivered **together with D-config
in one pull request** (section 8a). D4 does not depend on D-config's catalogue for its rules (writes never consult the
catalogue), with one exception stated in scope item 3 (`templateId`).

**Outcome.** A person or tool can save, batch-save, create (template or content, text import), create folders,
rename, move, delete and classify documents. Each request writes to disk at once and answers when the content is
durable and its commit is queued; the Engine commits later as path-limited commits, one batch per Specification;
the commit state is observable and recoverable.

**Non-goals.** Push or publish (the Engine has no push capability; **out of scope unless the owner asks**); binary
import and replace; history/revision reads; Range; archetype switching; a UI (D5); making Close archive use the
queue; hooks and signing; cross-checkout moves; any delay beyond the settle window (300 ms default, 250–500 ms
configurable, 5 s maximum hold).

**Scope.**

1. **Generic durable core** `engine/src/specs/durable/` (extracted from `specs/create/journal/*` and
   `specs/coordination/resources.ts`; Create refactored onto it with no behaviour change; `durable/` imports neither
   `create/` nor `documents/`, checked by the import-cycle lint):

   | Module                  | Responsibility                                                                                                                                                                                                                                           | Extracted from                                                                |
   | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
   | `journal-store.ts`      | `JournalKind<T>` descriptor `{ name, relativeDir, version, parse }`; path, by-id read (unsupported -> typed error), strict listing, tolerant listing, atomic publish (caller holds the control lock), directory safety, stray temp rule, `settled/` move | `create/journal/store.ts`, `inspect/listing.ts`                               |
   | `unsupported.ts`        | version classification (kind-parametrised), retention predicate                                                                                                                                                                                          | `create/journal/unsupported.ts`                                               |
   | `payload-store.ts`      | hash-addressed payload directory per `(kind, operationId)`: write (temp, fsync, rename), verified read, remove, orphan detection                                                                                                                         | `create/journal/payload.ts`                                                   |
   | `retention.ts`          | time-capped sweep of settled journals, unsupported files, stray temps and orphan payloads                                                                                                                                                                | `create/journal/retention.ts`                                                 |
   | `claims.ts`             | resource algebra (`overlaps`, `sortedResources`, scoped/exclusive pairs) and the registry of per-kind claim functions used by `assertSharedResourcesAvailable`                                                                                           | `coordination/resources.ts`                                                   |
   | `committed-evidence.ts` | primitives only (blob match, exact-set comparison, mapping of guard refusals after files exist to `COMMIT_FAILED`); the per-path batch inspection is **new** in `documents/changes`                                                                      | `create/git/commit.ts` (not `inspectPaths` / `ensureScaffoldCommitted` logic) |

   Existing exports used by Close (`listCreateJournals`, `CREATE_JOURNAL_RELATIVE_DIR`, `resourcesForCreate`) stay as
   thin re-exports. The Create suites (L) are the regression proof.

2. **Commit port** (`version-control/commits`): `EngineCommitKind` adds `'document-change'`; the **effective path set**
   (paths whose working state differs from `HEAD`, attribute-aware) is computed by a new port function and used for the
   request, the exact-set check and the `Nevo-Documents` trailer; stale intent-to-add entries of absent untracked paths
   are removed before the commit; intent-to-add only for existing untracked paths; trailer values cut at id boundaries;
   Git children in their own process group (POSIX) / tree kill (Windows), mutation outcome resolved on `exit`;
   request-level `deadlineMs` (150 s). **Verified facts (real Git, 2.44 here; reviewer 2.44 and 2.39):** `git add -N`
   on a deleted tracked path works and stages the deletion; on an absent never-tracked path it fails with a pathspec
   error; a stale intent-to-add entry survives removal of its file; `commit --only` works for a deleted tracked path,
   for a rename pair when the new path is intent-to-added, and for a new untracked path after `add -N`. **Proven on Linux with the
   Engine's own adapter (`test/documents/document-change-commit.test.ts`):** the whole matrix, the process-group kill with a
   sleeping clean filter, and the stale-entry cleanup. The Engine adds intent-to-add only for existing paths that HEAD
   and the index do not know; a deleted tracked path needs no staging because `commit --only` takes it as it is.
3. **Document-change module** `engine/src/specs/documents/changes/`:
   - `plan/` pure planners per action; `Plan { paths: [{ path, pre, post }], manifest?, ids }`; folder operations expand
     to files (more than 200 paths -> `DOCUMENT_OPERATION_INVALID`). **`templateId` in `CreateDocumentsInput`:** the
     Specification's archetype MUST be defined in the project catalogue; the template is resolved at the first
     reservation through the project catalogue (`catalogueRevision` is a precondition, `CATALOGUE_STALE`); the
     operation fingerprint pins `templateId` and the rendered content sha256; `{{goal}}` renders empty (the goal is not
     stored after Create). This is the single place where a write consults the catalogue, and only as a content source.
   - `journal/` model (`DocumentChangeJournal`, stages, `version: 1`, 32 KiB), strict codec, hash-addressed plan file,
     `resourcesForDocumentChange` (`checkout-scoped:<workspaceId>`), fingerprint.
   - `admission.ts` (no effects): input and limits, Windows path rule, location, manifest read, preconditions,
     `SPEC_MANIFEST_DIRTY` against the post-image of the latest non-terminal operation or `HEAD`, policy via the port
     `preflight` with the cache of ADR 0016 decision 10.
   - `writer.ts`: reserve (control lock: re-check, one re-plan, claimed-batch refusal, `sequence`, plan file, payload,
     barrier), write files (fixed short temp name, re-hash target before rename), manifest last, `queued` transition,
     payload deletion; roll-forward with retries holding the claim on failure (`DOCUMENT_WRITE_FAILED`).
   - `queue/formation.ts` (pure: queued operations -> one batch per Specification, barriers, settle/max-hold on a
     monotonic clock, caps), `queue/batch-store.ts` (batch record, plan file, claim under the control lock, dissolve),
     `queue/lease.ts` (per-checkout lease), `queue/executor.ts` (identity and dead proof), `queue/inspect.ts` (the new
     per-path inspection against `{pre, post}`), `queue/worker.ts` (happy path), `queue/failure.ts` (classification,
     split-and-retry, backoff, decisive-evidence resolution), `queue/scheduler.ts` (timers, 30-second sweep, shutdown
     flush), `recovery.ts` (scan, roll-forward, resume, takeover, `recover --resume|--adopt|--abandon`).
   - `api.ts`: `saveDocument`, `saveDocuments`, `createDocuments`, `createFolder`, `applyDocumentOperation`,
     `readDocumentOperation`, `flushDocumentCommits(spec)`, `retryDocumentCommit`, `abandonDocumentCommit`,
     `resolveAbandonedMarker`, `recoverDocumentOperation`, `listDocumentOperationRows`.
4. **Close** (`specs/lifecycle/reservation.ts`, `reserveCloseOperation`): after the pure `previewCloseOperation` and
   **before** `withProjectControlLock`, call `flushDocumentCommits` for every checkout in `plan.resources` (source,
   target, integration destination), bounded 30 s. Precedence: unresolved `pending|commit-failed|abandoned|
recovery-required` -> `DOCUMENT_COMMITS_PENDING`; a save slipping in afterwards -> `CLOSE_CONFLICT` (existing claim
   conflict); other dirt -> `CLOSE_PREFLIGHT`. The pure preview/preflight is not changed. A Create with an integration
   destination claims `checkout:` and conflicts with document claims; `resourcesForCreate` already does.
5. **Tree and reads.** `DocumentTree.commits` and `documents[].commit` (incl. `uncommitted`) from the tolerant listing
   of the active directory, part of the tree revision; `not-implemented` leaves the vocabulary; real action
   availability. Folder `expectedRevision` is a folder revision (excludes commit state).
6. **Runtime** (`features/documents`): the routes of the reference; body limits (single save 2 MiB; create 2 MiB; batch
   8 MiB; others 256 KiB); authorization (Manage/View); `error-status` additions; the **feature-owned list route**
   `GET /api/specs/document-operations` with its adapter (ADR 0014; the contract prerequisites are their own task:
   `OPERATION_LIST_KINDS`, `queued` produced, source row states, `staleAfterMs` exemption); recover-at-start, the
   30-second sweep and the SIGTERM flush in the project-mode composition.
7. **CLI**: `nevo-specflow specs documents status|flush|retry|abandon|resolve|recover` (`recover` needs
   `--confirmed-stopped` and one of `--resume|--adopt|--abandon`); `specs recover` stays Create-only; the CLI flushes on
   SIGTERM/SIGINT with a deadline. CLI writes are not added in this slice.
8. **Windows-hosted paths** (architecture section of that name): the admission rule (240 characters on `win32`, cause
   `path-too-long`) in Create admission **and** every D4 target path; fixed short temp names; the Limits row.
9. **Docs** as in plan task DW.T15.

**Decisions taken (defaults; owner answers recorded in section 10).** See ADR 0016 decisions 1 to 22. In particular: one
batch per Specification and one active batch per checkout (lease); barriers; effective path set; roll-forward on
mid-batch failure; `abandon` keeps a persistent `uncommitted` marker; dead-proof takeover narrowed to same host,
namespace and start time (or different boot id), otherwise operator-only; Close hook in `reserveCloseOperation`;
`flush` is a Manage action scoped to the caller's Specification; settled records in `settled/` kept 24 h.

**Invariants.** (1) A file is never written when its commit is already known to be impossible (admission guard).
(2) After the acknowledgement the content is durable on disk and in a journal; only a human action (`abandon`,
or committing by hand) ends its life, and `abandon` keeps a marker. (3) One commit contains exactly the effective set and,
after verification, the bytes the Engine recorded; foreign content is never committed silently. (4) Overlapping
operations of one Specification are never committed in different batches. (5) One active batch per checkout across
processes (lease); a batch is claimed by one atomic record before Git runs. (6) The queue survives process death; recovery
needs no operator only with decisive evidence or a dead proof. (7) Close never overlaps a document commit. (8) Git
disabled: no Git process. (9) A failed batch never blocks other batches. (10) A write-phase failure never leaves changed
files without a claim.

**Error codes.** Reference, section D4 and Errors: `DEFINITIONS_MISSING`, `DOCUMENT_COMMITS_PENDING`,
`DOCUMENT_OPERATION_NOT_FOUND`, `DOCUMENT_OPERATION_STATE_INVALID`, `DOCUMENT_WRITE_FAILED`; `DOCUMENT_PATH_INVALID` gains
`path-too-long`; `DOCUMENT_RECOVERY_REQUIRED` and `SPEC_BUSY` as redefined there.

**Acceptance.**

1. Save of an `md` returns 200 with the new revision and `commit.state: pending`; no Git process other than the cached
   preflight ran in the request (0 on a hit, at most 6 on a miss); the file on disk equals the content; within the settle
   bound a commit with exactly that path and the trailers exists and the state reads `committed` with `sha`; the p95
   latency benchmark holds.
2. Five saves of one document within the settle window: five operations, one commit (`coalescedWith: 4`) with the last
   content; each reads `committed` with the same `sha`. Operations of two different Specifications in one checkout are two
   commits.
3. Batch save of N documents, all revisions valid: one commit with exactly those N paths; one stale revision: 409,
   `details.conflicts` lists it, no file and no journal exists.
4. Each structural operation: files and manifest at once, one commit with exactly the expected effective paths (old and
   new for rename/move, deleted path for delete, manifest when the registry changed), clean tree afterwards. A path with
   no net change (created and deleted within one batch; saved back to its `HEAD` bytes) is dropped; a batch with no
   effective path completes `not-applicable` (`nothing-to-commit`) with no Git mutation.
5. `overview` cannot be deleted, renamed or moved by any route.
6. Protected branch, `allowedBranches` mismatch, detached HEAD, merge in progress, unmerged path, ignored path, no
   commits: refused before any file or journal exists; succeeds after the condition clears. On Windows a path over the
   bound is refused with `path-too-long` (Create and D4).
7. Policy change after the acknowledgement: `failed` (`branch-protected`), files stay, `retry` after relaxing commits;
   `abandon` leaves the files, the state `abandoned` and the `uncommitted` marker; Close is refused until resolved.
8. Branch switched while pending: `failed` (`branch-changed`), nothing committed on the new branch; switched back and
   `retry` commits. A normal rebase or amend before the first attempt is harmless (`parentHead` read at claim).
9. A foreign edit to a pending path: `failed` (`content-changed`); a new save with `expectedRevision` of the disk content
   commits it as the new baseline. One failing path (ignored, foreign) does not block the others: the rest is committed
   and the failed path is a new failed batch.
10. Unrelated edits and the user's staged hunks are untouched by the commit; Create in the same checkout during pending
    documents commits only its scaffold.
11. Close flushes every checkout of its plan then proceeds; with a failed or abandoned batch it is refused
    (`DOCUMENT_COMMITS_PENDING`) and no Close journal is reserved; a save slipping in after the flush gives `CLOSE_CONFLICT`.
12. Git disabled: writes succeed with `not-applicable`; disabling Git while pending completes members as
    `not-applicable` (`git-disabled`).
13. Replay of the same `operationId` and body returns the stored result and the current commit state (also after the
    journal moved to `settled/`); a different body is `DOCUMENT_OPERATION_CONFLICT`.
14. Crash cut points (below): every acknowledged change ends committed, `failed` or `recovery-required` with evidence; none
    lost or doubled; a second process takes over a dead owner automatically (Linux, same namespace and start time proof)
    and never one whose PID is alive; elsewhere takeover is operator-only.
15. A hung clean filter cannot wedge the queue: the process group is killed at the deadline, the outcome is resolved by
    decisive evidence (no trailer commit, `HEAD` equal to the parent, no index lock -> retryable), other checkouts and
    other batches proceed.
16. Two processes writing the same document and checkout: no lost update, one consistent history, one active batch.
17. The list route `GET /api/specs/document-operations` shows `failed`, `recovery-required`, `abandoned` and `queued` older
    than 30 s, none after success; rows have no paths; `staleAfterMs` does not mark a waiting batch interrupted.
18. A `createDocuments` with `templateId` for an archetype that is not defined is refused (`ARCHETYPE_UNKNOWN`); a stale
    `catalogueRevision` is `CATALOGUE_STALE`; replay returns the pinned rendered content.
19. SIGTERM of the Runtime and of the CLI flushes pending batches within the deadline; the rest stays journaled.

**Crash cut points (Linux, SIGKILL).** CP0 payload written, journal not published; CP1 `reserved`; CP2 temp file written,
not renamed; CP3 k of N files renamed (roll-forward holding the claim); CP4 all files, manifest not rewritten; CP5
manifest renamed, not yet `queued`; CP6 `queued`, response not sent; CP7 payload deletion interrupted after `queued`; CP8
batch record being published; CP9 batch record published, no Git; CP10 intent-to-add done, commit not run; CP11 inside
`git commit` (parent and child killed: orphan `index.lock`); CP12 commit exists, `dropIntentToAdd` not run; CP13 commit
exists, members not stamped; CP14 some members stamped; CP15 batch `committed`, record not removed; CP16 **dead holder of
the control lock** (document operations and Create stall until the operator clears it; documented, asserted); CP17
crash between dissolve and re-queue; CP18 crash during `retry` and during `abandon`; CP19 Runtime restart inside the settle
window. Plus: executor dead mid-claim; two executors racing; live-PID refusal; a human commit that includes the files;
history rewrite after an attempt; and a **deterministic state-machine simulation with fault injection at every journal
write** (U, platform independent).

**Verification split and platform gating.** **U (anywhere):** planners, formation (one batch per Specification, barriers,
caps, settle/max-hold with an injected monotonic clock), effective-set computation over a fake port, failure
classification and split-and-retry, backoff, journal/batch/lease codecs, executor dead-proof predicate with an injected
process table, the state-machine simulation, admission with fake ports, route validation (`app.inject`), CLI parsing, the
Windows path rule (injected platform and lengths). **L:** everything that uses real Git, real worktrees, SIGKILL, symlinks,
PIDs, `/proc`, many files or the commit port. The `engine-filesystem.yml` workflow runs the **full** Engine suite on macOS
and Windows on main and nightly, so each new L test MUST be gated per platform with `skipIf` (SIGKILL/`/proc`/PID
namespace tests Linux-only; real-Git tests on all three only if they pass there; the path-length test Windows-specific) and
use Windows-safe temporary paths. The shard scripts `tools/ci-engine-hot-shard.mjs` and `tools/ci-engine-rest-shard.mjs`
parse test declarations and fail closed on unrecognised ones: they are audited and new files declared in the form they
accept. A Windows smoke entry (`tools/ci-windows-smoke-tests.json`) covers one write-path test (save, queue, commit).

## 8b. Commit policy, uncommitted-changes ledger and manual commit (decision-complete)

Governing decision: [ADR 0018](../../architecture/decisions/0018-engine-commit-policy-and-manual-commit.md) (owner
decision 2026-10-26). Rules: [architecture, "Commit policy, the uncommitted-changes ledger and manual
commit"](../../architecture/runtime/specification-documents.md); contract: [reference, "Commit policy, uncommitted changes
and manual commit"](../../reference/api/specification-documents.md). Delivered in the same pull request, after D4's queue
and reads (tasks DW.T18 and DW.T19 of plan 06). The mechanism is **general**, not part of the documents slice: the ledger
and the manual commit live outside `specs/documents`; documents are its first user.

**Outcome.** The owner (or a developer through the local file) can switch auto-commit off for documents. Writes then
complete at once as `uncommitted`, the Engine remembers exactly what it changed in a durable ledger, and a manual commit is
the only way the Engine commits that content, path-limited to the ledger and never touching other changes. Abandoning a
failed batch uses the same state.

**Non-goals.** Push (see below); auto-commit for tasks and reviews (they adopt the key when they exist); governing the
Create scaffold or `init`/`definitions install` commits (always committed); committing arbitrary user changes; reverting or
discarding content; a UI (D5); an `init` wizard question for the policy.

**Scope.**

1. **Config** (`version-control/worktrees/policy.ts`): `parseCommitsPolicy` accepts `auto` (closed capability set
   `documents`, booleans), `GitCommitsPolicy` gains `auto: { documents: boolean }`; `parseGitWorktreePolicy` reads the
   local `git.commits.auto` (the only local `git.commits` key; `protectedBranches`/`allowedBranches` locally stay
   `GIT_POLICY_INVALID`) and the effective value with its source; `readProjectGitPolicy` returns both; the reference
   `reference.configuration.specflow-git-worktrees` and `architecture.runtime.configuration` document the key and the second
   local exception.
2. **Ledger** (`specs/durable/ledger/`): `store.ts` (record per `(workspaceId, owner)`, atomic publish under the control
   lock, tolerant listing, caps), `upsert.ts` (idempotent by operation id), `prune.ts` (read-only Git; entries equal to
   `HEAD` removed), `revision.ts` (`ledgerRevision`). The Engine's existing 30-second sweep prunes non-empty ledgers.
3. **Writer** (`documents/changes/writer.ts`, `admission.ts`): the pinned `commitMode`; with `manual` mode no
   `preflight`, no `queued` stage; after the files and the manifest are durable: ledger upsert, then the journal transition to
   `completed` (`outcome: 'uncommitted'`, reason `auto-commit-off`), claim released, journal to `settled/`. `SPEC_MANIFEST_DIRTY`
   baseline: latest non-terminal post-image, else the ledger post-image, else `HEAD`. `DOCUMENT_UNCOMMITTED_LIMIT`.
4. **Abandon unification (changes implemented code):** remove the journal stage `abandoned` (`changes/journal/stages.ts`,
   `commit-info.ts`, `test-support.ts`, `write/manifest-dirty.ts`, `changes/errors.ts`) and the public `abandoned` in
   `CommitState` (`contracts/src/documents/operations.ts`, `tree.ts`, `operation-source.ts` row state); `commit-failed` and
   `recovery-required` reach `completed(uncommitted)` through `abandon`, which upserts the batch's effective paths and member
   ids into the ledger first and then releases the claim; tests (`stages.test.ts`, `journal.test.ts`, `model.test.ts`,
   `schemas.test.ts`, `document-write-claims.test.ts`) are rewritten.
5. **Close** (`reserveCloseOperation`): after the existing flush, prune and refuse
   `DOCUMENT_COMMITS_PENDING` (cause `commit-uncommitted`) for any ledger entry in a checkout of the plan.
6. **Reads**: `documents[].commit.state: 'uncommitted'`, tree `commits.uncommitted` and `commits.policy` (part of the tree
   revision), `GET /api/specs/:specId/uncommitted`; operation-list rows unchanged (`uncommitted` is never listed).
7. **Manual commit** (`specs/manual-commit/`): `admission.ts` (scope resolution, message validation and neutralisation,
   subset closure, `ledgerRevision`, branch check, port `preflight`; nothing reserved on refusal), `journal/` (kind
   `manual-commit`, directory `engine/operations/manual-commit/`, 16 KiB, `settled/`, payload store for the message and the
   ledger snapshot), `execute.ts` (flush of the scope's legacy queue, lease from `specs/durable/lease.ts`, claim
   `checkout-scoped`, effective set, foreign-change check against the ledger post-images, commit through the port with
   kind `manual-commit` and a multi-line body, verify with the per-path inspection, prune, complete), `recovery.ts` (trailer
   lookup, decisive evidence, `recover --resume|--adopt|--abandon`), engine API (`manualCommit`, `readUncommitted`). The lease
   record and primitives move from `documents/queue/lease.ts` to `specs/durable/lease.ts` (mechanical, the queue imports it).
8. **Runtime and CLI**: `GET /api/specs/:specId/uncommitted`, `POST /api/specs/:specId/commit` (Manage, body limit 256 KiB),
   error-status additions, `nevo-specflow commit [status]`, `specs documents resolve`; `GET .../document-operations/:id`
   serves a `manual-commit` too (action `manual-commit`); the list route lists a `manual-commit` in `recovery-required`.
9. **Definitions**: `definitions install` (and `init`) SHOULD register the paths they write in the `definitions` ledger
   owner before committing and prune after, so an interrupted install's leftovers are adoptable by `commit --scope
definitions`; they remain always committed.

**Invariants.** (1) With auto-commit off no Engine commit of that capability's content happens except through a manual commit.
(2) Every uncommitted Engine write is in the ledger, in the same control-lock section as its completion. (3) A manual
commit contains only ledger paths of its scope whose working content equals the ledger post-image and differs from `HEAD`;
it is never `git commit -a`. (4) A manual commit uses the same lease, claims, port and journal machinery as a batch; two never
run at once in a checkout. (5) Policy flips never commit silently. (6) Close never proceeds with a non-empty ledger in its
checkouts. (7) The mode is pinned at admission. (8) The ledger holds no claim.

**Error codes.** Reference, "Commit policy, uncommitted changes and manual commit"; `DOCUMENT_COMMITS_PENDING` gains the cause
`commit-uncommitted` (replacing `commit-abandoned`).

**Acceptance.**

1. Config: committed `auto.documents: false` makes new document writes `uncommitted`; a local `true` overrides it and a local
   `false` overrides a committed `true`; a non-boolean, an unknown capability key, or a local `protectedBranches` is
   `GIT_POLICY_INVALID`; Git disabled makes the policy inert.
2. With auto off: a save returns 200 at once with `commit.state: 'uncommitted'` (`auto-commit-off`), no queue entry, no Git
   mutation, no preflight (it succeeds on a protected branch and on a detached HEAD), a ledger entry with the post-image and
   the operation id, claim released, journal in `settled/`; replay returns the stored result; a second save of the same path
   updates the entry (one entry per path).
3. Create scaffold and `init`/`definitions install` commit regardless of the setting.
4. Manual commit, auto off: commits exactly the ledger paths (file and manifest together) with the user's message and the
   trailers, author per ADR 0013, ledger pruned, tree back to `committed`; an unrelated modified file and the user's staged
   hunks in the folder are untouched; a path edited by someone else after its post-image refuses the whole request
   (`MANUAL_COMMIT_CONFLICT`, nothing committed); a subset that splits an operation is `MANUAL_COMMIT_SUBSET_INVALID` with the
   closure; a stale `ledgerRevision` is `MANUAL_COMMIT_STALE`; a message with an Engine trailer line or control characters is
   neutralised or refused; a wrong branch is `MANUAL_COMMIT_CONFLICT` (`branch-changed`); a protected branch is
   `BRANCH_PROTECTED` with nothing reserved; a ledger already equal to `HEAD` completes `not-applicable`.
5. Manual commit, auto on: refused with `MANUAL_COMMIT_UNAVAILABLE` while pending/failed/recovery work exists; after a flush
   and an `abandon` it commits the adopted entries.
6. Policy flips: on -> off with a non-empty queue drains normally and new writes are `uncommitted`; off -> on with a non-empty
   ledger commits nothing until a manual commit or a later auto write of that path.
7. `abandon` ends `uncommitted` (`abandoned`): the batch no longer holds a claim, the ledger holds its paths, the tree shows
   them, Close is refused (`commit-uncommitted`) and a manual commit adopts them.
8. `SPEC_MANIFEST_DIRTY` with a ledger manifest entry: the post-image is the baseline; a foreign manifest edit is still
   detected.
9. Close with a non-empty ledger is refused; after a hand commit of the same files the Close flush prunes and Close proceeds.
10. Crash cut points (below) end committed, `uncommitted` or `recovery-required` with evidence; nothing lost, nothing doubled;
    two processes cannot run a manual commit and a batch at once.
11. `commit status` and `GET .../uncommitted` agree; `ledgerRevision` is stable and changes with any entry.

**Crash cut points (Linux, SIGKILL).** CP20 ledger upsert done, journal not completed; CP21 journal completed, ledger prune of
a committed batch not done; CP22 manual commit `reserved`, lease not taken; CP23 lease taken, `parentHead` not recorded;
CP24 inside the manual `git commit` (orphan `index.lock`); CP25 commit exists, ledger not pruned; CP26 ledger pruned,
journal not completed; CP27 crash during `abandon` between the ledger upsert and the claim release. Plus the state-machine
simulation (U) extended with the manual-commit and ledger transitions with fault injection at every write.

**Verification split.** **U (anywhere):** policy parsing (project/local/precedence/validation), ledger store/upsert/prune
with an in-memory filesystem and fake port, message validation and neutralisation (table-driven), subset closure, scope
resolution, effective-set computation, manual-commit state machine with fault injection, commit-state derivation, error
mapping and route validation (`app.inject`), CLI parsing, `ledgerRevision`. **L (Linux only):** real Git manual commits, the
conflict and branch cases, protected branch, staged-hunk safety, Close interplay, hand-commit prune, two-process exclusion
between a batch and a manual commit, the SIGKILL points, `definitions install` interplay; each gated per platform as in
section 8.

**Future: push.** Out of scope for this delivery and not to be added by it. Why it is separate: the Engine has no push
capability; a push needs credentials while the Engine runs Git as detached children without a terminal (prompts and
credential helpers cannot work and must not hang the queue); a non-fast-forward rejection MUST NOT be resolved by the Engine
(never force, never rebase); a remote may protect branches the local policy does not know; and a publish result cannot be
recovered from the local journal alone. Seams that make it addable: the ledger scope and the commit `sha` in settled
journals (with the `Nevo-Operation` trailers) identify "unpushed Engine commits"
(`git rev-list @{u}..HEAD` filtered by trailer), and the same per-checkout lease serialises Git work. Details:
ADR 0018, "Future: push".

## 8a. Delivery of D-config and D4 as one pull request

Owner decision: **one PR** (`feature/specification-documents-write-and-config`), no multiple PRs. The PR head is green on
every package; checkpoint commits may be red and vanish on squash. Tasks, dependencies, owners and per-task test split:
[plan 06](execution-plans/06-specification-documents/README.md), section 9a. Order: contract prerequisites -> durable-core
extraction -> definitions loader -> seeds and install -> removal of the compiled catalogue and call-site migration ->
Runtime/CLI/init/packaging/UI for definitions -> Windows-hosted paths -> commit port (effective set, kill, deadline) ->
journal, planners, admission, writer -> queue (formation and lease; failure; scheduler, Close, shutdown) -> reads and
routes -> CLI recovery -> SIGKILL suite -> commit policy, ledger and uncommitted completion (8b, DW.T18) -> manual commit (DW.T19) -> CI gating -> docs promotion. **Real merge gates** (review points where the work could
otherwise be wasted): after the durable-core extraction (DW.T02), after the compiled catalogue is gone (DW.T04b), after the
queue happy path and failure classification (DW.T10a), after the manual commit (DW.T19), and the final gate. The contract is touched by both slices
(`DocumentErrorCode`, tree, catalogue), which is why one PR avoids two coordinated contract releases; the cost is a large
review surface.

## 9. D5 - UI consolidation and demo cleanup (outline; owned by the UI work)

Converge the demo to the shared contract (demo schemas become re-exports of section D0 schemas; demo endpoints
emit the new shapes and codes; showcase fixtures and `required`/`required_document_path` removed); remove the
superseded `Demo*` document schemas and the old read error bodies; the UI adopts the explicit **UI impact** list
of [the reference](../../reference/api/specification-documents.md) (items 1 to 26): tree states, classify and
remove-registration actions, completeness display, kind-based viewers, raw image/download, protected-branch read-only
state, derived `u-` ids on classify, **the acknowledged-after-write save with commit state, batch save-all,
pending/failed/uncommitted indicators, Retry/Abandon/Commit now, busy back-off, Close refusal with pending commits,
definitions problems, the definitions-missing empty state, the display of a Specification whose archetype is no longer
defined, and the Windows path-length message**, with conflict handling that keeps every draft. The project-mode Create
adaptation for the new catalogue behaviour ships **inside the D4 + D-config pull request** (a small UI task). D5 is a flag
day for the UI and the demo; real endpoints ship first and are consumed by the UI at D5.

## 10. Owner decisions and open questions

Confirmed by the owner earlier: the UI Create adaptation is inside D2; no compatibility readers or aliases; built-ins
require only `overview.md`; `overview.md` id and path are fixed; narrow handling of older Create journals; the CLI
`--archetype` is required with no default. **D4:** a save writes at once and answers after the content is durable and the
commit request is durably queued; queued operations consolidate; save-all checks all revisions then makes one commit;
the operation shape is kept; the dirty window is bounded and journaled; push is out of scope. **D-config:** nothing
archetype-related is compiled in; defaults are seed files that only install; the Engine reads definitions only from the
project; one directory per kind; the owner may delete any definition; no overlay, no compiled fallback; D4 and D-config are
one PR.

**Answers received (2026-10-24, applied):** (1) settle window before the commit is **250–500 ms, default 300 ms,
configurable only within that range**, maximum hold stays 5 s; (2) **there are no existing projects**: no upgrade path, no
`--update`, no `origin` block; `init` seeds, `definitions install` is idempotent and never overwrites an edited file
without `--force`; (3) **same-host dead-PID takeover: yes**, narrowed to a dead proof (same host and PID namespace and the
PID absent or a different start time, or a different boot id), operator-only elsewhere; (4) **`abandon` leaves the files on
disk and keeps a persistent `uncommitted` marker**.

Decided by the specification writer with defaults (open to veto; ADR 0016 / 0017): layout and the overview rule of ADR
0017; bare `install` is bootstrap only (no silent resurrection of deleted definitions); stat-on-read caching; per-file
isolation; queue caps; Close flushes first; committed operations leave the list; `flush` is Manage; the documents feature
owns its list route; the Windows path bound is 240 characters with a refusal (long paths are not enabled).

**Owner decision (applied; section 8b, ADR 0018):** a general Engine commit policy per capability
(auto-commit off by default, enabled in project or local config), a general uncommitted-changes ledger in the durable core, and a
manual commit capability through the same commit port, lease, claims and journal; Create and `init`/`definitions install`
stay always committed; push is out of scope.

Defaults chosen for ADR 0018 (open to veto): the key is `git.commits.auto.<capability>` (not a sibling namespace) with a local
override as the second local exception to committed git policy; auto-off skips the commit `preflight` (editing on a
protected branch is allowed, the manual commit is then refused by the guard); abandon and auto-off are one state
`uncommitted` (the stage and state `abandoned` are removed); the ledger is pruned by commit, flush, the 30-second sweep,
manual commit and the Close flush; the manual commit is synchronous; a path subset must be closed under shared operations;
policy flips never commit silently; the `definitions` scope and its HTTP surface are CLI-only; the policy is not asked by
`init`.

**Remaining owner questions:** none blocking. One optional confirmation: the Windows path bound of 240 characters (refuse)
versus enabling long paths deliberately (default: refuse).

**Questions for ADR 0018 (defaults apply until answered):** (a) with auto-commit off, may documents be edited on a
protected branch or a detached HEAD (the Engine commits nothing, so no `preflight`), with the manual commit refused by
the guard? Default yes. (b) Should `nevo-specflow init` ask the auto-commit question? Default no (file edit only).

## 11. Not verified at specification time

- **Verified by me with real Git (2.44.0 on Windows):** `git add -N` of a deleted tracked path succeeds, of an absent
  never-tracked path fails, a stale intent-to-add entry stays. The reviewer reported 2.44 and 2.39 results for `commit --only`
  of deleted tracked, rename pairs (new path intent-to-added) and new files; I did not re-run those. The Engine adapter,
  the effective-set computation, the stale-entry cleanup and the whole matrix on Linux remain to be proven (DW.T07).
- That killing the Git process group (POSIX) or tree (Windows) ends a clean-filter grandchild and lets `exit` resolve the
  outcome; `child.kill()` ending only git is read from the adapter, not run.
- Dead-proof portability (`/proc/self/ns/pid`, `/proc/<pid>/stat` start time, boot id) on Linux; Windows, macOS and
  containers are operator-only by design; not run.
- The `yaml` options (`maxAliasCount: 0` throwing on `toJS`, `customTags: []`, `merge: false`) are specified from the
  documented API; not run.
- That `reserveCloseOperation` is the right and sufficient place for the flush hook was read from `lifecycle/reservation.ts`;
  the Close code `CLOSE_PREFLIGHT` for a dirty tree was read by name, not traced.
- The CI shard scripts' parsers were not read in detail; the audit is a task. Whether `/api/specs/document-operations` as a
  second feature-owned list route fits `registerOperationListRoute` was read from ADR 0014, not from the helper's code.
- That the repository has no old-shape manifest (D1 audit) and the behaviour of D0 to D3 were verified by their own PRs.
  `runtime/src/demo/catalogue.ts` imports only `@nevo/specflow-contracts/demo` (verified).
- Authorization of retry/abandon/flush (Manage) and operation status (View) is a decision.
- ADR 0018 was written against the implemented queue as read (`documents/changes`, `write`, `queue`, `specs/durable`); the
  stage graph, `CommitState` and the `abandoned` references named in section 8b were read by grep, the removal was not tried.
  `init`/`definitions install` commit behaviour was read from `specflow/src/init/cli.ts` and
  `definitions/install-project.ts` (they already commit; the ledger registration of installed paths is new).
- Whether a path outside the Specification folder (the `definitions` owner) can share the lease and the
  `checkout-scoped` claim without changing the Close resource algebra was not traced; `checkout:` already excludes it.
- The multi-line commit body and the `git commit -m` handling of a user message were not run; the port currently accepts a
  single-line body, so the extension and trailer neutralisation are new and need the Linux tests.
- That a hand commit is reliably seen by the prune (attribute-aware `hash-object` against `HEAD` for up to 200 paths) within
  the sweep budget was argued, not measured.
- No test suite was run (documentation-only change; Linux-only suites are not run on Windows by rule).
