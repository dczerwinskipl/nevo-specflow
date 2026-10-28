---
id: ideas.specflow-engine.plan-06
type: engineering
title: Temporary execution plan 06 — Specification documents layer (D0 to D3, and D-config + D4 as PR5)
status: draft
scope: specflow
areas: [runtime, workflow, server, testing, ui]
tags: [execution-plan, temporary, specifications, documents, archetypes]
read_when:
  - executing or reviewing any task of slices D0, D1, D2 or D3, or of PR5 (D-config + D4), of the Specification documents layer
  - deciding the PR order, branch names or which tests may run on Windows
  - looking for the confirmed owner decisions or the (closed) gaps routed back to the specification
summary: >
  Disposable task decomposition of slices D0 to D3 of the Specification documents layer into four PR-sized
  deliveries (D0, D1, D2, D3) with stable task ids, scope, dependencies, spec references, acceptance,
  unit versus Linux-only verification, implementer profile, review focus, confirmed owner decisions and
  gaps routed back to (and now closed in) the specification. Section 9a adds PR5: D-config (definitions as project
  data) and D4 (write operations with an asynchronous commit queue) as ONE pull request with ordered tasks DW.T00 to DW.T19. D5 is not planned here.
related:
  - ideas.specflow-engine.specification-documents-delivery
  - architecture.runtime.specification-documents
  - product.specflow.specification-documents
  - reference.api.specification-documents
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - adr.0017-definitions-as-project-data
  - ideas.specflow-engine.execution-plans
  - engineering.repository.git-workflow
  - engineering.shared.testing
---

# Plan 06 — Specification documents layer, slices D0 to D3 and PR5 (D-config + D4)

**Lifecycle: temporary planning document.** It owns task boundaries only. Behaviour, rules, limits and contracts stay in
the linked specification documents, which win on any conflict. Delete this plan when PR5 is merged and promoted.
Language follows [normative language](../../../../architecture/principles/normative-language.md).

## 1. Inputs and reference keys

| Key | Document                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS  | [Delivery specification](../../specification-documents-delivery.md) (section numbers as in that file)                                                                                                                                                            |
| AR  | [Architecture](../../../../architecture/runtime/specification-documents.md) (Manifest schema, Definitions, Identity, Content kinds, Limits, Validation results, Invariants)                                                                                      |
| PR  | [Product](../../../../product/specflow/specification-documents.md) (Document type catalogue, Authoring instructions, Template skeletons, Archetype catalogue)                                                                                                    |
| REF | [Reference](../../../../reference/api/specification-documents.md) (Shared vocabulary, D2, Definition schema, D3, Raw content, Errors, UI impact)                                                                                                                 |
| ADR | [0015](../../../../architecture/decisions/0015-specification-manifest-as-document-registry.md), [0016](../../../../architecture/decisions/0016-engine-owned-document-commits.md), [0017](../../../../architecture/decisions/0017-definitions-as-project-data.md) |

Out of PR1 to PR4: D-config and D4 (planned in section 9a as PR5), D5 (UI
consolidation, demo convergence). PR1 to PR4 are delivered; PR1 to PR4 tasks below are kept as history of what was built.

## 2. Cross-cutting rules for every task

- **Confirmed owner decisions** (implement, do not re-open): the framework hard-requires only `overview.md`; built-in
  `minimal`, `feature`, `architecture` require only `overview`; `description`, `useWhen`, `instructions` semantics as
  in AR "Definitions"; no backward compatibility, alias or default archetype in any contract; every state change is
  committed (D4); integration tests are Linux-only.
- **Confirmed owner decisions PC-1 to PC-3.** Confirmed by the owner; implement as written, each in ONE named place.

| Id   | Confirmed decision to implement                                                                                                                                                     | Single place                                                                        | Tasks                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| PC-1 | `overview.md`: id and path fixed; rename and move refused with `protected` like delete (AR parser rule 5, invariant 2)                                                              | One protection predicate in the Engine documents module, used by parser and actions | D1.T01, D1.T03, D3.T01 |
| PC-2 | Unsupported old Create journals: tolerant classification, never a claim, never blocks Create or Close, sweep deletes after 7 days, `CREATE_JOURNAL_UNSUPPORTED` by id (DS 6 item 3) | One module `create/journal/unsupported.ts` plus one `error-status` line             | D2.T04                 |
| PC-3 | CLI `nevo-specflow specs create --archetype <id>` is required, no default (DS 6 item 7)                                                                                             | One option definition in the CLI command                                            | D2.T07                 |

- **Testing rule (owner, DS 3.8).** **U** = unit test, may run on the Windows host. **L** = real Git, real worktree,
  many files, symlink, SIGKILL or Engine commit-port test: **Linux only**. Implementers and reviewers MUST NOT run **L**
  tests on Windows. Run them after committing, in CI or with
  `tools/dev/linux-test.sh -- 'pnpm turbo run build --filter=@nevo/specflow-engine^... && cd packages/specflow-engine && npx vitest run test/<file>.test.ts --testTimeout=240000'`
  (see [local setup](../../../../engineering/repository/local-setup.md)). A task report lists each L test as "written,
  not run on Windows" until a Linux run is reported. Placement per [testing](../../../../engineering/shared/testing.md):
  pure tests co-located with source, cross-boundary and real-Git tests in the package `test/` directory. Structure per
  [code organization](../../../../engineering/shared/code-organization.md): Runtime and CLI stay thin adapters; every
  document rule lives in the Engine (AR "Ownership").
- Tasks do not push or open PRs; the delivering agent does that per section 3.
- **Profiles.** `implementer` = `nevo-agents-implementer`; `implementer-ui` = `nevo-agents-implementer-ui`. Work kinds are
  planning metadata: `backend`, `ui`, `integration`, `general`.

## 3. PR deliveries, branches and merge strategy

Branches follow [git workflow](../../../../engineering/repository/git-workflow.md): `feature/<slug>`, squash-merged, PR
title in Conventional Commits form. Because merges are squash-only and the gate requires the branch to be current with
`main` ([pull requests](../../../../engineering/repository/pull-requests.md)), **the recommended mode is sequential
merge**: open PR n+1 from the updated `main` after PR n merged. Stacking (branching from the previous feature branch and
opening the PR early for review) is allowed for speed; after the base PR squash-merges, run
`git rebase --onto main <old-base-tip> <branch>` and re-run CI. Each PR head is green on its own.

| PR  | Branch (suggested)                                 | Slice         | Based on                        | Tasks            | Scope                                                                                            |
| --- | -------------------------------------------------- | ------------- | ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| PR1 | `feature/documents-contracts`                      | D0            | `main`                          | D0.T01 to D0.T03 | Contracts and documentation only                                                                 |
| PR2 | `feature/documents-engine-model`                   | D1            | `main` after PR1 (D0 validator) | D1.T01 to D1.T05 | Engine model, catalogue, validation                                                              |
| PR3 | `feature/documents-create-archetype`               | D2            | `main` after PR2                | D2.T01 to D2.T09 | Create end to end incl. CLI and UI                                                               |
| PR4 | `feature/documents-read`                           | D3            | `main` after PR3                | D3.T01 to D3.T07 | Reading: tree, content, raw                                                                      |
| PR5 | `feature/specification-documents-write-and-config` | D-config + D4 | `main` after PR4 (merged)       | DW.T00 to DW.T19 | ONE PR (owner decision): definitions as project data, write operations, commit queue; section 9a |

D3 technically needs D0 and D1 only, but its L tests create Specifications through Create, so start it after D2
(order D0 -> D1 -> D2 -> D3). The specification commits on `feature/documents-archetypes-spec` (ADR 0015/0016, AR, PR,
REF, DS and this plan) are documentation only and should reach `main` before or together with PR1.

## 4. Review focus per PR

- **PR1 (D0):** `additionalProperties: false` everywhere; every enum and the error-code array defined once; JSON Schema
  drift test; `Demo*` schemas untouched.
- **PR2 (D1), strict parser fails closed:** every AR parser rule rejects with `SPEC_SOURCE_INVALID`; unknown keys inside
  `archetype`/`documents`/`requirements` rejected while unknown top-level keys are preserved on rewrite; serializer output
  always re-validated by the parser; the old `type`-only manifest rejected; messages name slug and field, never an
  absolute path; catalogue text verbatim from the PR tables; repository audit for old-shape manifests.
- **PR3 (D2), journal and recovery:** payload fsynced and renamed before the journal is published; hash verification on
  resume; `CREATE_RECOVERY_REQUIRED` reason payload; orphan payloads; one exported journal cap used by all three readers;
  tolerant listing that never throws and never claims; Close admission not blocked; fingerprint covers archetype and
  added-document hashes; nothing written when admission fails; one commit for the whole list; replay equality.
- **PR4 (D3), security of paths and raw endpoint:** no symlink following; lstat/realpath/fstat re-verification before and
  after open; `O_NOFOLLOW` where available; containment inside the Specification directory (`SPEC_SOURCE_UNAVAILABLE`);
  raw headers (never HTML, nosniff, sandbox CSP, `Content-Disposition`, CORP, header-injection-safe filename); limits in
  bytes; no control lock and no mutating Git process on reads; `View` authorization.

## 5. Task graph

```text
PR1: D0.T01 -> D0.T02 -> D0.T03
PR2: D1.T01 --+-> D1.T03 -> D1.T05
     D1.T02 --+      \-> D1.T04
PR3: D2.T01 -> D2.T02 -> D2.T03 -> D2.T04
                              \-> D2.T05 -> D2.T06 -> D2.T08 (UI)
                                         \-> D2.T07 (CLI)
                         D2.T09 (docs) last, after T04..T08
PR4: D3.T01 -> D3.T02 -> D3.T03 -> D3.T05
                     \-> D3.T04 -> D3.T05
                     D3.T04 + D3.T02 -> D3.T06;  D3.T07 last
```

Parallel-safe pairs (disjoint owners): D1.T01 and D1.T02; D2.T07 and D2.T08 (after D2.T06); D3.T03 and D3.T04.
D2.T04 and D2.T05 both touch the journal store: sequence them (T04 first). Everything else edits shared barrels,
`model.ts`, `error-status.ts` or `app.ts` and is sequential.

---

## 6. PR1 — D0 contracts and documentation

### D0.T01 — Shared vocabulary, tree, content, operation and error schemas

- **Goal:** `@nevo/specflow-contracts/documents` exports the TypeBox schemas and types of the shared vocabulary.
- **Profile / kind:** `implementer` / `backend` (contracts).
- **Scope:** `packages/specflow-contracts/src/documents/` (new files beside the existing `index.ts`, re-exported from it and
  from the package index as `specs` does); co-located `*.test.ts`.
- **Implements:** DS 4 scope (b) without the definition schema; REF "Shared vocabulary", "D2 - Archetype catalogue and
  Create request", "D3 - Tree, read, raw", "D4 - Operations" (shapes), "Errors"; AR "Content kinds".
- **Delivers:** `ContentKind`, `Classification`, `ActionReason`, `Action`, `DocumentTypeInfo`, `ArchetypeCatalogue`,
  `DocumentTree`, `DocumentContent`, `SaveInput/Result`, `DocumentOperationInput/Result`, `CreateDocumentsInput`,
  `DocumentErrorCode` (one exported `as const` array, union derived), `DocumentError` (superset of `CreateSpecErrorSchema`
  with optional `details`), and the exported fragment `CreateArchetypeSelectionSchema`.
- **Out of scope:** the definition schema (D0.T02); merging the fragment into `CreateSpecRequestSchema` (D2.T01); any change
  to `Demo*` schemas, `SpecificationDocumentResponseSchema`, `DocumentReadErrorSchema`; Engine, Runtime, CLI, UI.
- **Depends on:** none.
- **Acceptance:** DS 4 acceptance (1) to (3): exported from the package index; no literal defined twice; each REF
  representative payload validates (tree with unclassified, dangling and completeness; raw-error bodies; operation inputs for
  rename, move, delete, classify, create-documents; error bodies); extra key, `required` flag, string `archetypeVersion`,
  missing `useWhen` rejected.
- **Verification:** U only (Vitest in the contracts package; lint, typecheck, build). No L.

### D0.T02 — Declarative definition schema and published JSON Schema

- **Goal:** `ArchetypeDefinitionFile` (`schemaVersion: 1`) and the generated `archetype-definitions.schema.json`.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `packages/specflow-contracts/src/documents/` (schema, generator helper), `packages/specflow-contracts/schema/archetype-definitions.schema.json`,
  package `files`/scripts if a generate script is added.
- **Implements:** DS 4 scope (b) and acceptance (0); AR "Definitions - One declarative schema"; REF "Definition schema"
  (example file, `$id` `urn:nevo:specflow:archetype-definitions:1`, draft 2020-12).
- **Out of scope:** any loader or YAML reading of user files (D-config); the built-in data (D1.T02); cross-checks needing the
  catalogue (template `documentType` existence is D1.T02).
- **Depends on:** D0.T01.
- **Acceptance:** validates the REF example; rejects a document type without `instructions`, an archetype without `useWhen`,
  `preselected` on an `always` template, `minCount` < 0, an unknown key; a template without `documentType`; the committed JSON
  Schema equals the generated one (unit test fails on drift). Byte limits of AR Limits for definition text are enforced either
  in the schema or by an exported helper (document which).
- **Verification:** U only.

### D0.T03 — Documentation acceptance and index

- **Goal:** the documentation set is consistent and the index is regenerated.
- **Profile / kind:** `implementer` / `general`.
- **Scope:** `docs/architecture/runtime/specification-lifecycle.md` (forward link under "Create"); `status` of ADR 0015/0016, AR,
  PR, REF stays `draft` (G-9 closed: no acceptance recorded, nothing flips); generated docs index.
- **Implements:** DS 4 scope (a), (c) and acceptance (4).
- **Out of scope:** ADR 0014 sentence and Create reference pages (D2.T09); marking endpoints implemented (D3.T07).
- **Depends on:** D0.T01, D0.T02.
- **Acceptance:** `pnpm docs:check` passes; index committed; forward link resolves.
- **Verification:** `pnpm docs:check --write`, then `pnpm docs:check`. No tests.

---

## 7. PR2 — D1 Engine model, catalogue and pure validation

Package `@nevo/specflow-engine`, `src/specs/`. Profile for all: `implementer` / `backend`.

### D1.T01 — Pure modules: limits, paths, content kinds, ids

- **Goal:** `documentPaths`, `contentKinds`, `documentIds`, the exported Limits constants and the overview-protection predicate (PC-1).
- **Scope:** new modules under `src/specs/documents/` with co-located tests.
- **Implements:** DS 5 item 4 (first three modules), DS 3.5 and 3.7; AR "Identity, paths and the registry" (id allocation, `u-` ids,
  path rules, case folding, reserved names, depth), "Content kinds" (closed table, media types, `classifyContent(ext, firstBytes)`),
  "Limits" (constants exported once, bytes), invariant 2.
- **Out of scope:** manifest parsing, catalogue, any filesystem access, Runtime imports of the constants.
- **Depends on:** none.
- **Acceptance:** DS 5 acceptance (5): table-driven cases including Windows device names with and without extension, case collisions,
  traversal, trailing dot/space, NUL, control characters, `\ : * ? " < > |`, depth 8, 500 characters, reserved `specification.yaml` /
  `change.yaml` ignoring case at the root; deterministic ids from `sha256(specId:position)` base32 with collision extension; allocated
  ids never start with `u-`; `u-` ids from the exact path, case preserved; `classifyContent` is `binary` for NUL in the first 8 KiB or
  invalid UTF-8; the kind table equals AR.
- **Verification:** U only.

### D1.T02 — Catalogue module, `resolveCatalogue`, `catalogueRevision`

- **Goal:** built-in document types and archetypes as typed plain data conforming to the D0 definition schema, resolved by one function.
- **Scope:** `src/specs/archetypes/` (data, `resolveCatalogue(builtIns, userDefinitions?)`, `catalogueRevision()`, lookups, template
  renderer with the four placeholders) and tests.
- **Implements:** DS 5 item 1; DS 7a stability list (a) to (g); PR "Document type catalogue", "Authoring instructions", "Template
  skeletons", "Archetype catalogue" (strings verbatim); AR "Definitions", "Versioning rule".
- **Out of scope:** any YAML loader or `.nevo/archetypes` reading (the optional `userDefinitions` parameter exists but no loader);
  the HTTP catalogue (D2.T06).
- **Depends on:** D0.T02.
- **Acceptance:** DS 5 acceptance (3): tests prove the catalogue invariants (every requirement type exists; every archetype requires
  `overview` with `minCount` >= 1 and has an `always` overview template; built-ins require nothing else; every template `documentType`
  exists; every type has non-empty `instructions`; ids and `(id, version)` unique; placeholders render deterministically, unknown
  `{{...}}` left as is); a test fails when any catalogue string or generated skeleton diverges from the PR tables; the D0 validator
  passes over the built-ins; the revision is stable and changes on any edit. See G-1 and G-4 for the open template points.
- **Verification:** U only.
- **Checks the D0 schema cannot express (owned here):** the `overview` template has template id `overview` and filename
  `overview.md`; template ids are unique per archetype; requirement `documentType`s are unique per archetype; template ids do
  not start with `u-`; plus the catalogue-wide cross-checks above (every template `documentType` exists, ids and
  `(id, version)` unique, exact UTF-8 byte limits via `findDefinitionTextLimitViolations`).

### D1.T03 — Manifest model, strict parser, serializer, archetype-aware scaffold

- **Goal:** replace `type` with `archetype`, `documents`, `folders` end to end and make the scaffold archetype-driven. Compile-coupled
  (model type, scaffold, the two interim call sites, archive effects): one task; two commits recommended, each typechecking.
- **Scope:** `src/specs/model.ts`, new serializer module, `src/specs/lifecycle/archive-effects.ts` (assertion test), the two interim
  call sites (`create/reservation/reservation.ts`, `create/scaffold.ts`), tests.
- **Implements:** DS 5 items 2, 3, 5 and DS 3.3; AR "Manifest schema" parser rules 1 to 7 and "Rewriting the manifest"; ADR 0015.
- **Details:** parser implements every rule (old `type` unread; missing `archetype` or `documents` invalid; unknown keys inside
  `archetype`/`documents[]`/`requirements[]` rejected, unknown top-level keys tolerated and preserved; id/type/path/requirement/folder
  rules; exactly one `overview` entry; manifest size limit). `serializeSpecificationManifest` / `updateManifestRegistry` are pure,
  re-validated through the parser, preserve unknown top-level keys (comments SHOULD). `createSpecificationScaffold` takes
  `archetypeId`, `optionalDocumentIds`, `addedDocuments`, `folders` and returns manifest first, then catalogue order, then added, with
  sha256; throws `SPEC_VALIDATION_ERROR` (with a structured cause, see G-8) for unknown ids, path conflicts and Create limits. The interim
  call sites pass `minimal` internally, not as an API default.
- **Out of scope:** journal, Create request or intent, filesystem projection, Runtime or CLI, error-code mapping to D2 codes.
- **Depends on:** D1.T01, D1.T02.
- **Acceptance:** DS 5 acceptance (1), (2): each archetype's scaffold parses back to an equal model; one rejection test per parser rule
  with `SPEC_SOURCE_INVALID`, including the old `type`-only manifest; scaffold deterministic; `overview` always present and fixed;
  archive preserves `archetype` and `documents`; messages name slug and field, never absolute paths.
- **Verification:** U: parser, serializer, scaffold, archive round-trip of a manifest string. L: none new; the real-Git suites are fixed
  in D1.T05.

### D1.T04 — Pure document validation

- **Goal:** requirement results, completeness and issues from a registry plus an observed file set.
- **Scope:** `src/specs/documents/` validation module and tests.
- **Implements:** DS 5 item 4 (`documentValidation`); AR "Validation results" (the result type also defines `skipped-entry`,
  `path-case-collision`, `archive-limit`; the projection in D3 produces them from filesystem facts).
- **Out of scope:** filesystem access; tree shape (D3.T01).
- **Depends on:** D1.T01, D1.T03.
- **Acceptance:** DS 5 acceptance (4): exact results for met, unmet, dangling, unclassified; `count` counts registered documents with an
  existing file only; persisted requirements are used, not the live catalogue (invariant 5); no readiness or acceptance wording or state.
- **Verification:** U only.

### D1.T05 — Fixture rewrite, fail-closed message, audit, lifecycle repair note

- **Goal:** the repository is green on the new shape and the fail-closed consequence is explicit and documented.
- **Scope:** Engine `test/specifications.test.ts`, `test/create/create-multiprocess.test.ts`, `test/git/engine-commit-port.test.ts`; Runtime
  `test/specs/engine-overview.http.test.ts`; shared helper `writeSpecificationManifestFixture` in Engine test support; the message in
  `specs/repository.ts`; lifecycle document; Runtime `test/specs/slug-parity.test.ts` (calls the scaffold; needs
  `archetypeId: 'minimal'`).
- **Implements:** DS 5 items 6 and 7; DS 3.2 (a) to (c).
- **Details:** other suites asserting scaffold hashes or manifest text are found by running on Linux and fixed; the offending slug and field
  appear in the `SPEC_SOURCE_INVALID` message; lifecycle documents the repair (add `archetype` and `documents`, remove `type`); audit
  `git ls-files | grep -E "(specification|change)\.yaml$"` is empty and `git grep -n "type: 'standard'\|type: standard"` has zero hits
  (fail the task otherwise).
- **Out of scope:** product code beyond the message; journal; other docs.
- **Depends on:** D1.T03.
- **Acceptance:** DS 5 acceptance (6), (7): a directory with one old-shape manifest makes the listing throw naming the slug; audit clean;
  Engine and Runtime suites green on Linux.
- **Verification:** U: helper, message construction; Engine and Runtime lint, typecheck, build. **L (Linux only):** the rewritten real-Git
  suites and the listing test over a real directory.

---

## 8. PR3 — D2 Create with an archetype

Review checkpoints: after D2.T03 (journal contract), after D2.T05 (Engine end to end), before D2.T09.

### D2.T01 — Contracts: Create request and result

- **Goal:** merge the D0 fragment into `CreateSpecRequestSchema` (required `archetypeId`, `archetypeVersion`, `catalogueRevision`;
  `optionalDocumentIds`, `addedDocuments`, `folders`), add `documentIds` to `CreatedSpec`, extend the Create error codes from the single D0 array.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `packages/specflow-contracts/src/specs/create.ts`, `specs/index.ts`, tests.
- **Implements:** DS 6 item 6 (contract part); REF "D2 - Archetype catalogue and Create request", "Errors".
- **Out of scope:** Engine, Runtime, CLI, UI consumers beyond keeping them compiling (G-10: the PR head must be green; intermediate
  checkpoint commits may be red).
- **Depends on:** D0.T01.
- **Acceptance:** valid and invalid request examples (missing archetype fields, string version, duplicate `optionalDocumentIds`, unknown
  key); `CreatedSpec.documentIds`; the error schema accepts every new code.
- **Verification:** U only.

### D2.T02 — Engine Create input, intent, fingerprint, admission

- **Goal:** `CreateSpecificationInput`/`CreateClientIntent` carry `archetype {id, version}`, `catalogueRevision?`, normalised
  `optionalDocumentIds`, `addedDocuments`, `folders`; the fingerprint covers them; admission rejects before reservation.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `src/specs/create/{input,intent,request,error}.ts` and neighbours; the Engine `DocumentError` type (codes from the D0 array)
  introduced here; tests.
- **Implements:** DS 6 items 1 and 5; AR Limits (Added documents, Template text); REF Errors (`ARCHETYPE_UNKNOWN`, `CATALOGUE_STALE`,
  `DOCUMENT_PATH_INVALID`, `DOCUMENT_PATH_CONFLICT`, `DOCUMENT_OPERATION_INVALID`).
- **Out of scope:** journal format, payload store, writing, HTTP, CLI.
- **Depends on:** D1 merged, D2.T01.
- **Acceptance:** DS 6 acceptance (3), (4) at unit level; the `addedDocuments` fingerprint is path, type and sha256 of content; same
  `operationId` with a different archetype or content conflicts as today; admission writes nothing (fakes assert no filesystem or journal
  effect); D1 structured causes map to the document codes; stale revision or version -> `CATALOGUE_STALE`; unknown archetype or template ->
  `ARCHETYPE_UNKNOWN`; reserved name -> `DOCUMENT_PATH_INVALID`; case-insensitive duplicate -> `DOCUMENT_PATH_CONFLICT`; oversize counts or
  bytes and an added document type that cannot be registered (cause `type-invalid`) -> `DOCUMENT_OPERATION_INVALID`.
- **Verification:** U only.

### D2.T03 — Journal v2 and payload store

- **Goal:** `CreateJournal.version = 2`; scaffold contents live in hash-addressed payload files; the journal stores evidence only.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `src/specs/create/journal/{model,codec,store,retention}.ts`, `inspect/listing.ts`, `create/scaffold.ts` (`expectedScaffold` reads the
  payload), `reservation/reservation.ts`, a payload helper, tests.
- **Implements:** DS 6 item 2 in full; AR Limits (Create journal file; one exported constant replaces the three `65536` copies).
- **Details:** payload files at `<operations>/create/<operationId>.payload/<sha256>` (temp, fsync, rename) are written before the journal is
  published; the directory name does not end in `.json`; `files[]` = path, sha256, bytes (first two fixed manifest and overview, at most the
  documented count, unique paths); the intent lists `archetype`, `optionalDocumentIds`, `addedDocuments {path, type?, sha256, bytes}`,
  `folders`; the journal pins `catalogueRevision` (diagnostic only; recovery uses the payload); missing or mismatching payload on resume is
  `CREATE_RECOVERY_REQUIRED` (reason payload); payload directories are removed with the journal by the retention sweep.
- **Out of scope:** unsupported-journal handling (D2.T04); writing to the checkout (D2.T05).
- **Depends on:** D2.T02.
- **Acceptance:** DS 6 acceptance (7) at unit level: v2 codec round-trip, a payload hash helper, resume independent of the live catalogue, the
  journal under the cap at the maximum file count, payload directory ignored by journal listing. Orphan payload directories: removed by the sweep after retention (G-2 closed, DS 6 item 3 (e)).
- **Verification:** U: codec, helpers, size test with in-memory contents. **L (Linux only):** `create-journal` additions with real files,
  retention sweep with payload directories.

### D2.T04 — Unsupported older journals (PC-2)

- **Goal:** an older-version journal never blocks Create or Close, is swept after retention and answers `CREATE_JOURNAL_UNSUPPORTED` by id.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `create/journal/unsupported.ts` (single home of the rule), `store.ts` (`listCreateJournals`), `inspect/listing.ts`, `retention.ts`,
  `coordination/resources.ts` (confirm it never claims), tests.
- **Implements:** DS 6 item 3 (a) to (d); DS 10 item 2.
- **Details:** a file whose `version` is not current, is not valid JSON or has no numeric `version` is _unsupported_ and nothing else is read;
  it is returned separately, never throws, never a resource claim; sweep deletes it when older than 7 days without parsing; by-id read
  answers `CREATE_JOURNAL_UNSUPPORTED` (503, distinct from `CREATE_JOURNAL_CORRUPT`); the tolerant operations list shows `recovery-required`
  with that code.
- **Out of scope:** interpreting any old format.
- **Depends on:** D2.T03.
- **Acceptance:** DS 6 acceptance (8); a corrupt current-version journal still blocks as today; unsupported detection lives in one place.
- **Verification:** U: classifier on in-memory contents, sweep predicate with injected clock. **L (Linux only):** real files; Create and Close
  admission not blocked by an old file; sweep after retention.

### D2.T05 — N-file scaffold writing, single commit, recovery, replay

- **Goal:** Create writes N scaffold files plus `folders[]` directories and commits them in one Engine-owned commit; replay and recovery use the
  full list from the verified payload.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `src/specs/create/durable.ts` and effect/commit stages, `create/git/*`, `create/scaffold.ts`, `create/reservation/*`, Engine exports,
  Engine `test/` suites.
- **Implements:** DS 6 item 4 and the D2 Invariants (one commit, nothing written on failed admission, completeness equals the archetype's
  requirements, scaffold read from the verified payload); ADR 0013 unchanged.
- **Out of scope:** commit-port changes for deleted/new/rename paths (D4); HTTP, CLI, UI; document operations.
- **Depends on:** D2.T03 (sequence after D2.T04, both touch the store).
- **Acceptance:** DS 6 acceptance (1) to (7): one commit per archetype with exactly the scaffold files incl. manifest, clean tree, snapshot and
  registry in the manifest, `documentIds` returned; suggestions and added documents appear (typed registered, untyped unclassified); replay
  same result, different archetype conflicts; stale revision writes nothing; protected branch refuses before writing; Git disabled creates without
  commit; SIGKILL at each commit-related stage recovers with the full list, also when the live catalogue differs at resume; empty folders only
  in the manifest, directories created under the existing no-symlink checks.
- **Verification:** U: file-list derivation, intent-to-effect mapping with fakes. **L (Linux only):** `create-commit`, `durable-create`,
  `create-journal`, `create-multiprocess`, SIGKILL stage tests, byte-identical clean human commit on the full list.

### D2.T06 — Runtime: catalogue route, Create mapping, body limits, error status

- **Goal:** `GET /api/specs/archetypes`; the Create route maps the extended request; `bodyLimit` on `POST /api/specs`; the exhaustive
  `error-status` switch is extended.
- **Profile / kind:** `implementer` / `backend`.
- **Scope:** `packages/specflow-runtime/src/features/specs/create/*` (endpoint, `error-status.ts`, tests), the catalogue route in the same
  feature, server wiring, `test/specs/create.http.test.ts`.
- **Implements:** DS 6 item 6; REF "D2", "Errors"; AR Limits (HTTP body; value imported from the Engine constant); DS 11 (confirm and record that
  the catalogue uses the `create-options` capability).
- **Out of scope:** any document rule in Runtime; the Save route; demo routes.
- **Depends on:** D2.T01, D2.T05.
- **Acceptance:** DS 6 acceptance (9), (11) at HTTP level: `error-status.test.ts` covers `CATALOGUE_STALE` 409, `ARCHETYPE_UNKNOWN` 422,
  `DOCUMENT_PATH_INVALID` 400, `DOCUMENT_PATH_CONFLICT` 409, `DOCUMENT_OPERATION_INVALID` 400, `CREATE_JOURNAL_UNSUPPORTED` 503; ETag equals the
  catalogue revision; oversized body 413; same authorization as `create-options`; response carries `documentIds`.
- **Verification:** U: `app.inject` with a fake Engine (validation, mapping, status table, headers, 413). **L (Linux only):**
  `create.http.test.ts` against a real project Runtime.

### D2.T07 — CLI: `--archetype` required, `--with`

- **Goal:** `nevo-specflow specs create --archetype <id>` (required, no default; PC-3) and repeatable `--with <templateId>`; prints created ids.
- **Profile / kind:** `implementer` / `integration`.
- **Scope:** `packages/specflow/src` create command and tests, `packages/specflow/test/create-cross-transport.test.ts`.
- **Implements:** DS 6 item 7 and acceptance (9).
- **Out of scope:** `archetypes list|show|validate` (D-config); CLI reference docs (D2.T09).
- **Depends on:** D2.T05.
- **Acceptance:** a missing `--archetype` is a usage error naming the option; `--with` repeatable and unique; CLI and HTTP produce the same
  Specification for the same input.
- **Verification:** U: argument parsing, usage errors. **L (Linux only):** cross-transport test with real Git.

### D2.T08 — UI Create adaptation (project mode)

- **Goal:** the project-mode Create client, form, submit hook and error map send and handle the new fields against the real Runtime.
- **Profile / kind:** **`implementer-ui`** / `ui`.
- **Scope:** `packages/specflow-ui/src/features/specs/creation/` `api/api.project.ts` (+ test), `form/CreateProjectForm.tsx`,
  `form/createProjectReadiness.ts`, `useCreateProjectSpecification.ts` (+ test), `errors/createSpecErrors.ts` (+ test), strings and stories where
  they exist for the form.
- **Implements:** DS 6 item 8; REF "UI impact" item 13 (and the catalogue shape items 4 and 5 as consumed by the project form); the archetype
  choice already built for the demo form is reused.
- **Out of scope:** documents tree or editor UI, demo contract convergence, the rest of the UI impact list (D5).
- **Depends on:** D2.T01, D2.T06.
- **Acceptance:** DS 6 acceptance (10): a project-mode Create with the chosen archetype works end to end against the Runtime; each of
  `CATALOGUE_STALE`, `ARCHETYPE_UNKNOWN`, `DOCUMENT_PATH_*`, `CREATE_JOURNAL_UNSUPPORTED` has a mapped message; no default archetype is hard-wired
  in a contract (the UI chooses the initial selection).
- **Verification:** U (Vitest and Storybook per repository UI practice): `api.project`, form, hook, error map. End to end against a real Runtime is
  L-class (real Git): CI or `tools/dev/linux-test.sh`, not on Windows.

### D2.T09 — Documentation: ADR 0014, reference, lifecycle, CLI

- **Goal:** durable documents state journal version 2, the unsupported handling and the new Create contract.
- **Profile / kind:** `implementer` / `general`.
- **Scope:** ADR 0014 (replace the sentence "The Create journal format is `version: 1`; there was never a released version 2 and no migration or
  compatibility reader exists." and the same statement in the lifecycle document), `reference.api.specflow-specification-operations`, lifecycle
  document, CLI reference, the operator procedure (resume before upgrading), generated index.
- **Implements:** DS 6 item 9. **Out of scope:** D3 docs.
- **Depends on:** D2.T04 to D2.T08.
- **Acceptance:** `pnpm docs:check` passes; the version 2 statement and PC-2 handling are present; Create reference lists the new fields and codes.
- **Verification:** `pnpm docs:check --write`, `pnpm docs:check`.

---

## 9. PR4 — D3 Reading

Profile for all: `implementer` / `backend`. Review checkpoints: after D3.T03 (security), before D3.T05.

### D3.T01 — Pure tree projection

- **Goal:** a pure function from (manifest, observed file model, policy facts, location) to the `DocumentTree`.
- **Scope:** `src/specs/documents/projection.ts` and tests (in-memory file model).
- **Implements:** DS 7 item 1 (projection); REF "D3 - Tree"; AR "Validation results", "Content kinds", Limits (revision rule, listing limits,
  `truncated`), invariants 2 (PC-1: `overview` delete/rename/move actions carry `protected`), 4, 7, 8.
- **Details:** registered / unclassified / dangling; `kind`, `mediaType`; `protected`; `editable` (md, txt within the save limit, active location);
  `satisfiesRequirement`; `completeness`; folders from files plus `folders[]` (root path `''`); actions with advisory reasons (`protected`, `root`,
  `archived`, `branch-protected`, `branch-not-allowed`, `git-policy-invalid`, `not-editable`, `dangling`); tree `revision` = sha256 over manifest bytes
  plus the sorted `path:revision` list; issues including `path-case-collision`, `skipped-entry`, `archive-limit`.
- **Out of scope:** I/O; Runtime; `busy` and `commit-blocked` reasons (G-5).
- **Depends on:** D1.T01, D1.T03, D1.T04.
- **Acceptance:** DS 7 acceptance (1) to (4 kind part), (8 issue part), (9), (13) at unit level, table-driven.
- **Verification:** U only.

### D3.T02 — Engine filesystem reader: tree and document read

- **Goal:** `readSpecificationDocumentTree` and `readSpecificationDocument` over a real Specification directory.
- **Scope:** `src/specs/documents/read.ts` (listing/stat helpers, revision memo), Engine exports, `test/` suites.
- **Implements:** DS 7 item 1 (reader); AR "Symlinks and special files", Limits (2000 files, depth 8; hash to 1 MiB else `stat:<size>-<mtimeNs>`;
  memo keyed by path+size+mtimeNs+ino, at most 5000 entries LRU), invariant 7; advisory branch reasons from the create-options policy evaluation
  (read-only; omitted when the branch is not cheaply known).
- **Details:** starts from `DiscoveredSpecification`; one manifest read then listing; no symlink following (skip and count); hidden entries and
  `specification.yaml` excluded; no control lock, no mutating Git process; `DOCUMENT_TOO_LARGE`, `DOCUMENT_FILE_MISSING`, `DOCUMENT_NOT_FOUND`,
  `DOCUMENT_REVISION_UNAVAILABLE` for the JSON read. `archive-limit` counting: G-3.
- **Out of scope:** raw streaming (D3.T03); Runtime; writes.
- **Depends on:** D3.T01.
- **Acceptance:** DS 7 acceptance (1) to (4), (6 JSON part), (7), (8), (9), (13) with real directories: a hand-added file is `unclassified`, has a derived
  id and is readable; a hand-deleted registered file is `dangling` and read is `DOCUMENT_FILE_MISSING`; archived location: all actions `archived`.
- **Verification:** U: memo/LRU, revision computation, policy-reason adapter with fakes. **L (Linux only):** real directories (symlink skip, case collision on
  a case-sensitive filesystem, >1 MiB text, hand-edited files, archived location, more than 4096 files for `archive-limit`).

### D3.T03 — Engine raw access with TOCTOU re-verification (security)

- **Goal:** `openSpecificationDocument(engine, specId, documentId)` returns `{ metadata, stream }`.
- **Scope:** `src/specs/documents/open.ts` and tests.
- **Implements:** DS 7 item 2 and Invariants; AR "Symlinks and special files" (lstat, realpath equality, regular file, before and after open, `fstat`
  identity, `O_NOFOLLOW` where available, hard links readable), Limits (raw 25 MiB), invariant 6; escape from the Specification directory is
  `SPEC_SOURCE_UNAVAILABLE`.
- **Out of scope:** HTTP headers (D3.T05); Range; archive inspection.
- **Depends on:** D3.T02.
- **Acceptance:** DS 7 acceptance (4), (6 raw part), (8 never read): a symlinked entry is never opened; replacing a file by a symlink between check and
  open is detected (fault-injection seam for the window); size above the raw limit -> `DOCUMENT_TOO_LARGE`; registered and unclassified files openable;
  stream closes on error and on consumer abort.
- **Verification:** U: re-verification logic with an injected fs seam (check order, identity comparison). **L (Linux only):** real symlink, rename-race and
  large-file tests.

### D3.T04 — Runtime: real content source, tree and content routes, error bodies

- **Goal:** implement `DocumentContentSource` over the Engine, wire it in project mode, add `GET .../document-tree` and the new `DocumentContent`
  read, replace the three lowercase read error bodies with `{error, code}`.
- **Scope:** `packages/specflow-runtime/src/features/documents/content/*`, `feature.ts`, `server/app.ts` (replaces the unwired
  `dependencies.documents?.source`; tests may still inject), `error-status.ts`, route tests.
- **Implements:** DS 7 item 3 (source, routes, errors, ETag/304 on tree); REF "D3", "Errors"; `Cache-Control: no-store`; `View` authorization; DS 7
  acceptance (10), (11).
- **Out of scope:** the raw route (D3.T05); demo routes, demo schemas, UI.
- **Depends on:** D0.T01, D3.T02.
- **Acceptance:** the existing document URL no longer answers 503 for a valid document in project mode; 403 without `View`; tree ETag/304; exhaustive
  status mapping; no document rules in Runtime.
- **Verification:** U: `app.inject` with a fake source (mapping, ETag, authorization). L: D3.T07.

### D3.T05 — Runtime: raw route and safe headers (security)

- **Goal:** `GET /api/specs/:specId/documents/:documentId/raw[?download=1]` streams with the REF header table.
- **Scope:** `features/documents/content/raw*.ts` (header builder, route) and tests.
- **Implements:** DS 7 item 3 (raw); REF "Raw content" (Content-Type table with all text kinds incl. html/xml as `text/plain; charset=utf-8`, markdown
  `text/markdown`, images incl. `image/svg+xml`, binary `application/octet-stream`; `nosniff`; CSP `default-src 'none'; style-src 'unsafe-inline'; sandbox`;
  `Content-Disposition` inline or attachment with `filename*=UTF-8''`; `Cross-Origin-Resource-Policy: same-origin`; `Cache-Control: private, no-cache`,
  ETag, 304; `Content-Length`); DS 7 acceptance (4), (5), (6).
- **Out of scope:** Range; inline SVG rendering.
- **Depends on:** D3.T03, D3.T04.
- **Acceptance:** header table asserted per kind (png, svg, zip, md, html, md with NUL as binary); `download=1` -> attachment; non-ASCII, quote and CRLF
  basenames cannot split headers; 304 on matching `If-None-Match`; 413 above the raw limit; stream aborted cleanly.
- **Verification:** U: header builder, route tests with a fake source. L: D3.T07.

### D3.T06 — Workspace read model `documents` section

- **Goal:** the Specification workspace `documents` section lists the registered documents in project mode instead of `not_implemented`.
- **Scope:** Runtime workspace read composition and tests; `WorkspaceDocumentSchema` consumed unchanged (`kind` = document type id).
- **Implements:** DS 7 item 3 (workspace bullet) and acceptance (12).
- **Out of scope:** workspace contract changes; unclassified or dangling entries in this section (G-6).
- **Depends on:** D3.T02, D3.T04.
- **Acceptance:** the section is `ready` for a valid Specification and degrades to the existing unavailable state when the manifest is unreadable.
- **Verification:** U: composition with a fake reader. L: D3.T07.

### D3.T07 — End-to-end HTTP integration and documentation

- **Goal:** prove D3 through a real project Runtime and mark the endpoints implemented.
- **Scope:** a Runtime `test/` HTTP suite over real Specifications created through D2; the reference page; `reference.api.specification-workspace`
  data-source paragraph.
- **Implements:** DS 7 acceptance (1) to (13) end to end; DS 7 item 4.
- **Out of scope:** new behaviour; writes.
- **Depends on:** D3.T04, D3.T05, D3.T06.
- **Acceptance:** every DS 7 acceptance item is covered by at least one test (unit earlier, L here); `pnpm docs:check` passes; REF marks D3 endpoints
  implemented.
- **Verification:** **L (Linux only):** the HTTP suite (a `feature` Specification with preselected suggestions shows four registered documents, hand-added and
  hand-deleted files, png/svg/zip/html/NUL cases, 413s, revision 409, symlink skip, archived location, 403). Docs: `pnpm docs:check`.

---

## 9a. PR5 — D-config + D4 as ONE delivery

**Owner decision: a single pull request**, branch `feature/specification-documents-write-and-config`, based on `main`
after PR4. Specification: [DS 7a, 8 and 8a](../../specification-documents-delivery.md); decisions:
[ADR 0016](../../../../architecture/decisions/0016-engine-owned-document-commits.md),
[ADR 0017](../../../../architecture/decisions/0017-definitions-as-project-data.md). The PR head is green on every
package; checkpoint commits inside the branch may be red (they vanish on squash). The size is accepted by the owner. The
five **merge gates** (real go/no-go review points, not ceremony) are after DW.T02, after DW.T04b, after DW.T10a,
after DW.T19 (the manual commit) and the final gate after DW.T17.

**Confirmed owner decisions W-1 to W-10** (implement, do not re-open; each lives in ONE named place):

| Id   | Decision                                                                                                                                                                                                                      | Single place                                                   | Tasks        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| W-1  | A write is on disk at once; the response comes after the file is durable and the commit request is durably queued                                                                                                             | `documents/changes/writer.ts` (transition to `queued`)         | DW.T09       |
| W-2  | Queued operations of one Specification consolidate into one commit; a save-all is one commit; settle 300 ms (250–500), max hold 5 s                                                                                           | `documents/changes/queue/formation.ts` (one pure function)     | DW.T10a      |
| W-3  | Policy and commit blockers (and the Windows path bound) are checked before any file is written                                                                                                                                | `documents/changes/admission.ts`                               | DW.T09       |
| W-4  | Nothing archetype-related is compiled in; the Engine reads definitions only from the project; defaults ship as seeds that only install                                                                                        | `specs/definitions/*`; deletion of `archetypes/builtins.ts`    | DW.T03, T04b |
| W-5  | Push/publish is out of scope                                                                                                                                                                                                  | no task; reviewers reject any push code                        | all          |
| W-6  | D4 and D-config are one PR                                                                                                                                                                                                    | this section                                                   | all          |
| W-7  | No existing projects: no upgrade path, no `--update`, no stamp; `install` never overwrites an edited file without `--force`                                                                                                   | `specs/definitions/install.ts`                                 | DW.T04a      |
| W-8  | Same-host dead-proof takeover is automatic; `abandon` keeps files and a persistent `uncommitted` marker                                                                                                                       | `queue/executor.ts`; `queue/failure.ts`                        | DW.T10b      |
| W-9  | A general Engine commit policy per capability (`git.commits.auto`, default OFF since 2026-10-28 (originally on), local override); with it off a write is `uncommitted` and recorded in a generic ledger; Create and `init`/`install` commits are never governed | `version-control/worktrees/policy.ts`; `specs/durable/ledger/` | DW.T18       |
| W-10 | A manual commit goes through the same port, lease, claims and journal, is limited to the ledger paths of a scope and never commits arbitrary changes; push stays out of scope                                                 | `specs/manual-commit/execute.ts`                               | DW.T19       |

**Task graph.**

```text
DW.T00 (contract prerequisites) --+--> DW.T03a --> DW.T03b --> DW.T04a --> DW.T04b --> DW.T05 --> DW.T06 (UI)
DW.T02 (durable core) -------------+
DW.T01 (Windows-hosted paths; touches Create admission) -- independent
DW.T07 (commit port; start at once) --+
DW.T02 + DW.T00 --> DW.T08 --> DW.T09a --> DW.T09b --> DW.T10a --> DW.T10b --> DW.T10c --> DW.T11 --> DW.T12 --> DW.T14
                         DW.T07 ---^                                              \--> DW.T13
DW.T14 --> DW.T18 (policy, ledger, uncommitted path) --> DW.T19 (manual commit, CLI, routes, UI states)
DW.T15 (CI gating) runs with every L task; DW.T16 (startup hint) after T04b; DW.T17 (docs) last, after T19
```

Parallel-safe pairs (disjoint owners): DW.T03a with DW.T07; DW.T05 with DW.T08; DW.T06 with DW.T09a; DW.T13 with DW.T12.
DW.T04b and DW.T09a both touch Engine barrels: sequence them. DW.T02 must land before DW.T08.

### DW.T00 — Contract prerequisites

- **Goal:** every new schema and the widened operation-list contract exist; nothing consumes them yet.
- **Profile / kind:** `implementer` / `backend` (contracts, plus the list contract in contracts/runtime types).
- **Scope:** `packages/specflow-contracts/src/documents/` (per-kind definition file schemas without any `origin`;
  `DefinitionProblem`; catalogue `problems`; `archetype.defined: defined|invalid|absent`; `CommitInfo`/`CommitState`;
  save, batch save, operation, status, flush schemas; tree `commits` and `documents[].commit` incl. `uncommitted`;
  `DocumentErrorCode` additions incl. `DOCUMENT_WRITE_FAILED`; `DocumentErrorDetails` (`reason` = `ActionReason` only,
  `cause`, `retryAfterMs`, `conflicts`); folder revision wording; `CreateDocumentsInput.catalogueRevision`), per-kind JSON
  Schemas and the drift test; **operation list contract** (`operations/list.ts`: `OPERATION_LIST_KINDS` += `document-change`,
  `OPERATION_LIST_RESERVED_STATUSES` without `queued`, source row `state` += `queued|failed|abandoned`, action and
  `documentCount`).
- **Implements:** REF "Definition files", "D4", "Errors"; DS 7a scope 1; DS 8 scope 6 (list prerequisite).
- **Depends on:** none. **Acceptance:** REF examples validate; rejected shapes (wrong `kind`, unknown key, both/neither
  `content`/`contentFile`, traversal, `preselected` on `always`, id over 32 characters, `origin` key); drift test; one exported
  error-code array. **Verification:** U only.

### DW.T01 — Windows-hosted paths (admission rule)

- **Goal:** on `win32` an absolute path over 240 characters is refused at reservation (Create and, later, D4) with
  `DOCUMENT_PATH_INVALID` (`path-too-long`); fixed short Engine temp names.
- **Scope:** Create admission (`create/admission.ts`, scaffold path checks), a shared `windowsPathBound` helper in
  `documents/document-paths.ts`, Limits constant, tests; the D4 admission reuses the helper in DW.T09a.
- **Implements:** ARCH "Windows-hosted paths"; DS 8 scope 8.
- **Depends on:** none. **Verification:** U (injected platform and lengths). A Windows-only L test reproduces the CI failure
  (200-byte segment + 200-byte file name now refused before any journal; no stuck journal).

### DW.T02 — Extract the generic durable core (no behaviour change)

- **Goal / scope / acceptance:** as in DS 8 scope 1; every existing Create, Close, shared-resource and retention suite passes
  unchanged; import-cycle lint passes; `settled/` support exists but Create does not use it.
- **Profile / kind:** `implementer` / `backend`. **Depends on:** none.
- **Verification:** U: moved unit tests, lint, typecheck, build. **L:** all existing Create/Close suites (regression).
- **Merge gate 1:** no semantic change (a diff of moves and parametrisation); claims identical; payload naming unchanged.

### DW.T03a — Definitions: kind registry and loader

- **Goal:** `specs/definitions/` loads definition files safely (registry with auxiliary directories, real and in-memory
  source, loader with isolation, cascade, limits, YAML options incl. catching the `maxAliasCount: 0` throw, `customTags: []`,
  `<<` rejection, LF normalisation, id regex 32 and device names, unsupported schema version) and resolves the catalogue
  with problems; not wired. **Depends on:** DW.T00. **Verification:** U over the in-memory source (every problem code);
  **L:** the real source (symlinks, special files, traversal, hard links, permissions, hundreds of files).

### DW.T03b — Catalogue stat memo

- **Goal:** `catalogue-source.ts` (per Project Home stat-signature memo, 2-second recency rule, stat-before/after bounded
  retry with `unstable-read`, single-archetype-file lookup for the tree reader). **Depends on:** DW.T03a.
  **Verification:** U with an injected clock and source; **L:** real mtime/ctime behaviour.

### DW.T04a — Seeds, install, parity tests

- **Goal:** seed files (YAML + templates, byte-identical text), `install.ts`/`seed.ts` (bootstrap only, `<kind>/<id>`,
  `--add-missing`, `--force`, dry-run, dependency closure, atomic writes), the product-doc matrix parity test, the
  string-presence repository test, `.prettierignore`; **no** `origin`, no hash script, no `--update`.
- **Depends on:** DW.T03a. **Verification:** U: install planning over the in-memory source, parity, resolution; **L:** install
  against a real project.

### DW.T04b — Remove the compiled catalogue, migrate every call site

- **Goal:** `builtins.ts` and `getBuiltInCatalogue` are gone; all call sites of DS 7a (incl. the further sites found by
  review) use the project catalogue; two test seams (Create seam and the `createSpecificationFromRequest`/HTTP seam) install
  the seeds and can opt out; tests rebuilt; the pinned revision test; `archetype.defined` tri-state in the tree reader.
- **Depends on:** DW.T04a, DW.T03b, DW.T02 (barrels). **Verification:** U + **L** (`create-archetype*`, scaffold suites, the
  recovery test with a definition edited between read and Create).
- **Merge gate 2:** deletion complete; no fallback; the seam installs seeds in exactly two places.

### DW.T05 — Runtime catalogue route, `definitions` CLI, `init`, packaging

- **Goal:** route reports `problems` (ETag covers them), `DEFINITIONS_MISSING` mapped; `definitions list|show|validate|install`
  resolving to the Project Home (or refusing and printing it); install and `init` COMMIT the written definitions through the
  Engine commit capability when Git is enabled (refusing on a protected branch before writing; owner decision, ADR 0017
  decision 8); `init` seeds (`--no-definitions`); the seed folder is copied
  next to the bundle like `copyProductUiAssets` and found at runtime; packaged smoke test.
- **Depends on:** DW.T04b. **Verification:** U: route mapping, argument parsing. **L:** cross-transport `validate`/route parity,
  `init` end to end, packaged smoke.

### DW.T06 — UI: Create form adaptation (`implementer-ui`)

- **Goal:** `problems` notice, `DEFINITIONS_MISSING` empty state, new `ARCHETYPE_UNKNOWN` causes, Windows `path-too-long`
  message. **Depends on:** DW.T00, DW.T05. **Verification:** U (Vitest, Storybook); end to end is L-class.

### DW.T07 — Commit port (prerequisite of T09 and T10)

- **Goal:** `document-change` kind; effective-path-set function (attribute-aware `hash-object` vs `rev-parse HEAD:path`,
  deletion = absent); drop paths equal to `HEAD`; no Git mutation when empty; stale intent-to-add cleanup for absent untracked
  paths; intent-to-add only for existing untracked paths; id-boundary trailer cutting; process-group kill (POSIX) / tree kill
  (Windows) and outcome on `exit`; request-level `deadlineMs` 150 s.
- **Depends on:** none. **Verification:** U: argument construction, trailer cutting, effective set over a fake runner.
  **L:** the Git matrix (deleted tracked, rename pair, new file, mixed, no-op path, stale ita, other staged work untouched), the
  sleeping clean filter. **Review:** if `commit --only` misbehaves in the Engine adapter, stop and return to specification.

### DW.T08 — Journal, plans, codecs, fingerprint, claims (pure)

- **Goal:** planners per action, `DocumentChangeJournal` and batch/lease codecs (plan in a hash-addressed plan file; caps),
  fingerprint, `resourcesForDocumentChange`, executor identity type, the per-path inspection function signature (pure core).
  **Depends on:** DW.T02, DW.T00. **Verification:** U (table-driven, incl. folder expansion > 200 paths, overview protection).

### DW.T09a — Admission, preflight cache, `SPEC_MANIFEST_DIRTY`

- **Goal:** `admission.ts`: input/limits/Windows bound, preconditions, manifest rule against the latest non-terminal post-image
  or `HEAD`, port `preflight` with the cache keyed by `(root, branch ref, path-set hash)` and stat signatures, Git-process
  budget. **Depends on:** DW.T07, DW.T08, DW.T01. **Verification:** U with fake ports (nothing written on refusal); **L:** real
  refusals and the cache invalidation.
- **Delivered as:** `specs/documents/write/` (the effectful half; `specs/documents/changes/` stays pure and is
  lint-gated against I/O): `admission.ts` (`admitDocumentChange`), `snapshot.ts`, `git-preflight.ts` +
  `preflight-cache.ts`, `manifest-dirty.ts`, `path-bound.ts`, `folder-revision.ts`, `reservation-guard.ts` (claimed-batch
  refusal as a pure function over batch views) and `claim-source.ts` (wired into `assertSharedResourcesAvailable`).
  Left to DW.T09b: the reservation under the control lock (re-check of `manifestSha256`, one re-plan, `sequence`, plan
  file and payload, barrier), the writes and the `queued` transition. Left to DW.T10: the batch store that supplies
  batch views to the reservation guard.

### DW.T09b — Writer, replay, roll-forward

- **Goal:** `writer.ts` per ADR 0016 decisions 6 and 11: reservation under the control lock (re-check, one re-plan,
  claimed-batch refusal, `sequence`, barrier), writes with fixed short temp names, manifest last, `queued` transition, payload
  deletion, roll-forward holding the claim, `DOCUMENT_WRITE_FAILED`, `settled/` move, replay, Git-disabled path.
  **Depends on:** DW.T09a. **Verification:** U (injected filesystem seam: order of effects, re-hash before rename, ENOSPC);
  **L:** real writes, foreign edits, kill after the first rename.

### DW.T10a — Queue: formation, batch record, lease, happy-path worker

- **Goal:** one batch per Specification, barriers, caps, settle/max-hold on a monotonic clock, atomic batch claim recording
  `parentHead`, per-checkout lease, effective set, post-state check, commit, verify, complete members.
  **Depends on:** DW.T09b. **Verification:** U: formation, lease, claim; **L:** real Git end to end, two processes.
- **Merge gate 3 (with T10b if ready):** no path in two batches; one active batch per checkout; nothing committed that was not recorded.

### DW.T10b — Queue: failure classification, retry/abandon/recover

- **Goal:** classification table and split-and-retry, backoff, decisive-evidence resolution, dissolve, `retry`, `abandon` with
  the persistent `uncommitted` marker, `resolve`, `recover --resume|--adopt|--abandon`, dead-proof takeover, workspace-missing,
  Git disabled while pending, the deterministic state-machine simulation with fault injection at every journal write.
  **Depends on:** DW.T10a. **Verification:** U: all of it with injected clocks and fake ports; **L:** policy change, branch switch,
  foreign edit, human commit, hung filter.

### DW.T10c — Scheduler, Close hook, shutdown flush

- **Goal:** timers (unref'd), 30-second sweep, recover-at-start and first-access scan, SIGTERM/SIGINT flush (10 s) hooks for
  Runtime and CLI, the `reserveCloseOperation` flush of every checkout in `plan.resources` and the error precedence
  (`DOCUMENT_COMMITS_PENDING` / `CLOSE_CONFLICT` / `CLOSE_PREFLIGHT`). **Depends on:** DW.T10b. **Verification:** U; **L:** Close and
  Create interplay, restart inside the settle window.
- **Delivered as:** `specs/documents/scheduler/` (`scheduler.ts`, `notifier.ts`, `operator.ts`), `specs/documents/queue/flush.ts` and
  `timers.ts`, the Close hook in `lifecycle/reservation.ts`, `project/control-lock-takeover.ts`, the Runtime call in
  `startRuntime`. The CLI has no document command yet: DW.T13 calls `flushAllDocumentCommits` and `takeOverDocumentQueue`.
  Spec gap handled: the Close preview refuses a dirty tree before the plan exists, so the preview is retried once after a
  flush; see "Close and the document queue" in the architecture document.

### DW.T11 — Reads: commit summary, real actions, status, list rows

- **Goal:** tree `commits`, `documents[].commit`, folder revision, real action availability (evidence-based `busy`/
  `commit-blocked`), `readDocumentOperation`, `listDocumentOperationRows` (active directory only; no Git, no lock).
  **Depends on:** DW.T10c. **Verification:** U (in-memory journals); **L:** real directories.

### DW.T12 — Runtime routes and the document-operations list route

- **Goal:** the routes of the reference; body limits; error mapping; `GET /api/specs/document-operations` via
  `registerOperationListRoute` with its adapter and the `staleAfterMs` exemption; wiring of recover/sweep/shutdown.
  **Depends on:** DW.T11, DW.T00. **Verification:** U (`app.inject`); **L:** against a real project Runtime.

### DW.T13 — CLI `specs documents ...`

- **Goal:** `status|flush|retry|abandon|resolve|recover`; shutdown flush. **Depends on:** DW.T10c. **Verification:** U parsing;
  **L:** recover a SIGKILLed batch.
- **Delivered as:** `packages/specflow/src/documents/` (`command.ts`, `api.ts` the Engine seam, `report.ts`, `present.ts`,
  `content-input.ts`), registered under `specs documents`; reference: "Document commands" in the offline CLI reference.
  `resolve` belongs to DW.T19. Spec gap: the reference had no command shapes beyond the names, so the options are
  defined in the CLI reference.

### DW.T14 — SIGKILL and multi-process suite

- **Goal:** crash cut points CP0 to CP19 of DS 8 (incl. dead control-lock holder), racing executors, Runtime + CLI contention,
  takeover refusal, history rewrite, the latency benchmark. **Depends on:** DW.T10c, DW.T12, DW.T13. **Verification:** L (Linux).
- **Delivered as:** the crash cut points CP0 to CP19 of DS 8 are exercised by the tests named below; Linux, serial,
  `tools/dev/linux-test.sh`. Real SIGKILL kills the checkpoint process itself (the runner, not its supervisor); a
  kill inside Git also kills the Git process group. Shared pieces: `test/support/document-invariants.ts` (the
  invariants I1 to I7, asserted from the disk at the stop and after recovery), `test/support/queue-worker.ts`
  (cut names), `test/fixtures/crash-document-worker.test.ts`, `test/fixtures/document-contention-worker.test.ts`.
  The queue hooks gained `inResumeAfterRecord` (the lease replace of a resumed batch).

  | CP   | Cut                                                    | Status and test                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | CP0  | payload written, journal not published                 | added: `document-crash-cutpoints` "a writer killed inside the control lock" (SIGKILL inside the reservation lock); in process: `document-writer-faults` "between the plan and the journal"                                                                                                                                                                                                                                                              |
  | CP1  | `reserved`                                             | existing: `document-writer-crash` `after-reserved`                                                                                                                                                                                                                                                                                                                                                                                                      |
  | CP2  | stage file written, not renamed                        | added: `document-writer-crash` `staged` (first process); existing: the second process killed at `staged`                                                                                                                                                                                                                                                                                                                                                |
  | CP3  | k of N files renamed                                   | existing: `document-writer-crash` `mid-files`, `before-manifest`; in process: the file-effect fault matrix of `document-writer-faults`                                                                                                                                                                                                                                                                                                                  |
  | CP4  | all files, manifest not rewritten                      | existing: `document-writer-crash` `before-manifest`                                                                                                                                                                                                                                                                                                                                                                                                     |
  | CP5  | manifest renamed, not `queued`                         | existing: `document-writer-crash` `after-manifest`, `before-queued`                                                                                                                                                                                                                                                                                                                                                                                     |
  | CP6  | `queued`, response not sent                            | existing: `document-writer-crash` `after-queued`                                                                                                                                                                                                                                                                                                                                                                                                        |
  | CP7  | payload release interrupted after `queued`             | `after-queued` (existing), `after-payload-released` (added); in process: `document-writer-faults` "after queued, before the payload is released"                                                                                                                                                                                                                                                                                                        |
  | CP8  | batch record being published (inside the control lock) | added: `document-crash-cutpoints` `in-claim-after-lease`, `in-claim-after-record`; every record write and every rename: `document-state-machine`                                                                                                                                                                                                                                                                                                        |
  | CP9  | batch record published, no Git                         | existing: `document-queue-crash` `after-claim`; added: `member-claimed-1..3` (a kill between the claims of the members, k of n)                                                                                                                                                                                                                                                                                                                         |
  | CP10 | intent-to-add done, commit not run                     | existing: `document-queue-crash` `before-commit`; the intent-to-add and the commit are one port call, so the mid-commit kill below covers the pair; stale entries: `document-change-commit` "removes a stale intent-to-add entry"                                                                                                                                                                                                                       |
  | CP11 | inside `git commit` (parent and Git killed)            | added: `document-crash-cutpoints` "a commit killed inside git with a hung filter" (orphan `index.lock`, the retry waits, commits once) and CLI `documents-cli-sigkill`; in process: `document-change-commit` hung filter                                                                                                                                                                                                                                |
  | CP12 | commit exists, intent-to-add not dropped               | deliberately not a kill: there is no seam between the commit and the drop inside the port. Covered by the evidence-based recovery of `document-queue` "a commit that exists but was not recorded" and the stale-entry test of CP10                                                                                                                                                                                                                      |
  | CP13 | commit exists, members not stamped                     | existing: `document-queue-crash` `after-commit`                                                                                                                                                                                                                                                                                                                                                                                                         |
  | CP14 | some members stamped                                   | existing: `after-batch-recorded`, `after-members-completed` (SIGKILL); a partial stamp: `document-queue` "settles members completed before the stop" (in process)                                                                                                                                                                                                                                                                                       |
  | CP15 | batch `committed`, record not removed                  | existing: `document-queue-crash` `after-settled`                                                                                                                                                                                                                                                                                                                                                                                                        |
  | CP16 | dead holder of the control lock                        | added: three real kills inside the lock (`in-claim-after-lease`, `in-claim-after-record`, `in-resume-after-record`, the last one during the lease replace): the lock stays held by the dead PID, a second taker gives up with `CONTROL_LOCK_BUSY`, the takeover refuses a live holder and refuses without the assertion, the assertion clears it and the work finishes once; existing: `document-scheduler` "operator takeover" with a simulated holder |
  | CP17 | crash between dissolve and re-queue                    | existing and extended: `document-queue-faults` "a new save dissolves a failed batch" (every write), now with the invariants at each stop                                                                                                                                                                                                                                                                                                                |
  | CP18 | crash during `retry` and `abandon`                     | existing and extended: `document-queue-faults` "retry", "abandon" (every write), now with the invariants at each stop                                                                                                                                                                                                                                                                                                                                   |
  | CP19 | Runtime restart inside the settle window               | existing: `document-scheduler` "after a restart inside the settle window" (fake timers) and "after a crash (SIGKILL, /proc dead proof)"                                                                                                                                                                                                                                                                                                                 |

  Also: executor dead mid-claim (the CP8, CP9 and CP16 kills above); two executors racing (`document-queue-crash` "two
  processes never both execute", `document-contention` six processes times six rounds, with a scheduler of the test
  process and with the Close admission racing the writers); live-PID refusal (CP16 above, `document-writer-crash`); a
  human commit that includes the files (`document-queue-failures` "recover --adopt"); history rewrite after an attempt
  (`document-queue-failures` "rewritten history"). The **state-machine simulation** (`document-state-machine`) stops the
  simulated process before every record write and before every rename of save, queue and settle, and before every
  write of the Close hook, and `document-queue-faults` asserts the same invariants at the stop of every transition and
  action. Not delivered: a latency benchmark beyond the existing size and budget tests (`document-commit-reads` "within a
  sane bound", `document-write-admission` "the save budget").

### DW.T18 — Commit policy, uncommitted-changes ledger, uncommitted completion path (size L)

- **Goal:** `git.commits.auto.documents` works; with it off a document write completes at once as `uncommitted` and is
  recorded in the generic ledger; `abandon` and auto-off are one state; Close refuses a non-empty ledger; the manifest
  baseline uses the ledger. Decision: ADR 0018; specification: DS 8b scope 1 to 6 and 9.
- **Profile / kind:** `implementer` / `backend` (config, Engine, contracts, Runtime read side).
- **Scope:** `version-control/worktrees/policy.ts` and `config.ts` (parse, local exception, effective value and source) and the
  `init` validator it shares; `specs/durable/ledger/*`; `documents/changes/{writer,admission}.ts` (pinned `commitMode`, no
  preflight and no `queued` in manual mode, ledger upsert before the completing transition, `DOCUMENT_UNCOMMITTED_LIMIT`);
  removal of the `abandoned` stage and state (`journal/stages.ts`, `commit-info.ts`, `errors.ts`, `write/manifest-dirty.ts`,
  `test-support.ts`, contracts `operations.ts`/`tree.ts`, Runtime `operation-source.ts`) and the `abandon` path writing the ledger;
  `reserveCloseOperation` prune-and-refuse (`commit-uncommitted`); sweep prune; tree `commits.uncommitted`/`policy`,
  `documents[].commit.state: 'uncommitted'` with reason, `GET /api/specs/:specId/uncommitted` (Engine read + Runtime route);
  `definitions install`/`init` ledger registration; contracts for the new schemas and codes; `reference.configuration.specflow-git-worktrees`
  and `architecture.runtime.configuration` updated (they are `current` documents: only when the code lands).
- **Depends on:** DW.T14 (the queue, reads, routes and crash suite exist), DW.T11, DW.T12.
- **Out of scope:** the manual commit (DW.T19); UI; tasks/reviews capabilities.
- **Acceptance:** DS 8b acceptance (1), (2), (3), (6), (7), (8), (9), (11) and the crash points CP20, CP21, CP27; the rewritten
  stage/schema tests pass with no `abandoned` left; Create and install still commit under `auto: false`.
- **Verification:** U: policy parsing and precedence, ledger store/upsert/prune/revision (in-memory), writer manual mode with fake
  ports (no preflight, order of effects), stage graph, commit-state derivation, Close refusal logic, state-machine simulation
  extended. **L (Linux, platform-gated):** real Git for auto-off writes, prune after a hand commit, Close refusal, `abandon` end to
  end, the crash points.
- **Estimate:** large (config + generic store + a change to implemented stage/contract code across five packages); expected 2 to 3
  review sessions; no UI work.
- **Delivered as:** `version-control/worktrees/policy.ts` (`auto`, `effectiveAutoCommit`, local exception);
  `specs/durable/ledger/` (`model`, `codec`, `upsert`, `prune`, `revision`, `store`); `specs/uncommitted/` (HEAD probe,
  prune, the hold Close reads); the journal field `commitMode`, the outcome `uncommitted` and the transition
  `files-writing -> completed` (manual mode); `write/uncommitted-write.ts`, `queue/uncommitted.ts` and `queue/abandon.ts`
  (abandon completes uncommitted, ledger first); the ledger baseline of `SPEC_MANIFEST_DIRTY`; `queue/flush.ts` (`readCloseHold`);
  the tree `commits.uncommitted`/`policy` and `GET /api/specs/:specId/uncommitted` (`readSpecificationUncommitted`); tests
  `document-uncommitted`, `document-uncommitted-crash` (CP20, CP21, CP27) and the rewritten stage, journal, commit-model and
  queue suites. The record cap is 512 KiB, not 64 KiB (200 paths with 50 operation ids each do not fit 64 KiB).

### DW.T19 — Manual commit operation, CLI, routes, reads and UI states (size L)

- **Goal:** a person can commit exactly the ledger content of a scope with their message, through the same port, lease, claims and
  journal as the queue. Decision: ADR 0018 decision 8; specification: DS 8b scope 7 and 8.
- **Profile / kind:** `implementer` / `backend` for Engine, Runtime, CLI; **`implementer-ui`** / `ui` for the small UI states task
  that follows (commit dialog, states, Close reason) only if the owner includes it in this PR (the UI integration of the documents
  editor is D5; the contract and the project-mode Create adaptation are not blocked by it).
- **Scope:** move the lease to `specs/durable/lease.ts`; `specs/manual-commit/*` (admission, journal kind and directory, execute,
  recovery, API); commit port `manual-commit` kind with a multi-line body and message neutralisation; `POST /api/specs/:specId/commit`,
  error-status additions; `nevo-specflow commit [status]`, `specs documents resolve` and `recover` for manual commits; operation
  status read and list row for a `manual-commit` in `recovery-required`; CLI/ARCH/REF text.
- **Depends on:** DW.T18.
- **Out of scope:** push; `git commit -a` semantics; discard/revert; auto-commit for tasks and reviews.
- **Acceptance:** DS 8b acceptance (4), (5), (10) and the crash points CP22 to CP26; idempotent replay by `operationId`; the
  effective set never contains a path outside the ledger; two processes cannot run a batch and a manual commit at once.
- **Verification:** U: message validation and neutralisation tables, subset closure, scope resolution, foreign-change detection over a
  fake port, manual-commit state machine with fault injection, route validation, CLI parsing. **L (Linux, platform-gated):** the
  real-Git matrix of acceptance (4) and (5), staged-hunk and unrelated-file safety, branch change, protected branch, hand-commit prune,
  the SIGKILL points, two-process exclusion with the queue worker.
- **Estimate:** large; **review checkpoint (merge gate 5)** after this task: the safety boundary (no path outside the ledger, no
  foreign content), the shared lease, the message handling, and that no push code exists.
- **Delivered as:** `version-control/commits/commit-message.ts` (the pure sanitiser) and the port kind `manual-commit`
  (`failure-class.ts` shares the classification of a failed attempt with the queue); `specs/durable/lease.ts` and
  `executor-identity.ts` (the lease and the dead proof, shared); `specs/manual-commit/` (`model`, `codec`, `transition`,
  `journal-store`, `payload`, `selection`, `message`, `admission`, `execute`, `evidence`, `recovery`, `commit`, `claims`,
  `reads`); the composition `specs/documents/manual-commit.ts` (target resolution, the ports to the queue, `recoverOperation`,
  `resolveLedgerOperation`, `readUncommittedScope`); the claim source in `coordination/resources.ts`; the Runtime route
  `POST /api/specs/:specId/commit`, the six `MANUAL_COMMIT_*` codes in the contract and `details.paths`; the list source
  `manual-commit`; the CLI `commit`, `commit status` and `specs documents resolve`, and `recover` for a manual commit. Tests:
  `commit-message`, `selection`, `model`, `message` (unit); `manual-commit-port`, `manual-commit`, `manual-commit-recovery`
  (real Git, every platform, slow timeout) and `manual-commit-crash` (Linux, SIGKILL: CP22 after the reservation, CP23 inside
  the claim, CP24 inside `git commit` with a hung filter, CP25 after the commit, CP26 after the ledger prune, and the lease
  exclusion with a queue worker); `write-routes.http`/`write.http` (Runtime); `commit-command`/`commit-cli` (CLI). Spec gaps and
  choices: `MANUAL_COMMIT_UNAVAILABLE` has the causes `ledger-empty` and `git-disabled` besides `queue-not-empty`; `all` over HTTP
  leaves the definitions out; the result carries `remaining`; `specs documents resolve` is defined as "drop the entries a person
  dealt with by hand, never Engine content that is still uncommitted"; a `failed` manual commit is final for its operation id
  (a retry takes a new id); the CP24 replay ends `failed` (`index-locked`), not `recovery-required`, because the port's blocker
  proves nothing was committed.

### DW.T15 — CI gating of the new tests

- **Goal:** every new L test is gated per platform (`skipIf`: SIGKILL, `/proc` and PID tests Linux-only; Windows-specific path
  test Windows-only; the others only where they pass), Windows-safe temporary paths; audit of `tools/ci-engine-hot-shard.mjs`
  and `tools/ci-engine-rest-shard.mjs` (the hot-shard parser fails closed on unrecognised declarations); a Windows smoke
  entry (`tools/ci-windows-smoke-tests.json`) for save → queue → commit. **Runs alongside** each L task; closes before the
  final gate. **Verification:** the `engine-filesystem` workflow dry-run on the branch (label `ci:full-platform`).
- **Delivered as:** `packages/specflow-engine/test/support/platform.ts` (the gating helper, with its unit test) used by
  every platform-dependent document test; `tools/ci-engine-shard-audit.mjs` (every Engine test file is in exactly one
  Windows shard; run by the `plan tests` job); `--testTimeout=120000` for the Windows shards and the Windows CLI run;
  `vi.setConfig` timeouts for the real-Git files that take seconds on Linux; the Engine unit tests next to the sources
  now run on Windows; smoke entries `document-queue.test.ts` and `documents-cli.test.ts` in
  `tools/ci-windows-smoke-tests.json`. The matrix and the Windows assumptions are in `engineering.repository.ci`,
  "Platform gating of the real-Git, process and filesystem tests". Not verified on a Windows runner: the
  `ci:full-platform` dry run of the branch.

### DW.T16 — Startup hint when definitions are missing

- **Goal:** `nevo-specflow start` (and the Runtime log) prints one line when the project has no usable definitions, naming
  `definitions install`. **Depends on:** DW.T04b. **Verification:** U.

### DW.T17 — Documentation promotion and index

- **Goal:** durable documents describe the implemented behaviour: `architecture.runtime.configuration` (namespace
  `.nevo/definitions/`), ADR 0014 (second feature-owned list), `reference.api.specs-operations-list`,
  `reference.api.specflow-specification-operations` (Close refusal), `specification-lifecycle.md` (Close flush, document
  recovery), `reference.configuration.specflow-git-worktrees` (`git.commits.auto`, the second local exception), the product
  document (reduce the shipped-text sections to the structural matrix), the reference "Implementation
  status", the ARCH "observed present state", CLI reference, operator procedures, generated index. Status stays `draft` until
  the owner records acceptance. **Verification:** `pnpm docs:check --write`, then `pnpm docs:check`.

**Review focus (PR5).** Deletion of the compiled catalogue is complete and no fallback exists; no write before the admission
guard; the acknowledgement happens only after the `queued` transition; one atomic batch claim and one active batch per
checkout; no path in two batches; recovery never commits unrecorded content; a write-phase failure never leaves changed files
without a claim; Close never overlaps a pending or uncommitted change; a manual commit contains only ledger paths; no push code anywhere; Runtime and CLI hold no document or definition
rule; messages and problems never carry absolute paths; every new L test is platform-gated.

## 10. Coverage check

| Requirement                                         | Task(s)                                    |
| --------------------------------------------------- | ------------------------------------------ |
| DS 4 (a) docs; (b) schemas, definition, JSON Schema | D0.T03; D0.T01, D0.T02                     |
| DS 5 items 1 to 7; DS 3.2 fail-closed               | D1.T02, D1.T03, D1.T01/T04, D1.T05         |
| DS 6 items 1, 5; 2; 3; 4                            | D2.T02; D2.T03; D2.T04; D2.T05             |
| DS 6 items 6; 7; 8; 9                               | D2.T01/T06; D2.T07; D2.T08; D2.T09         |
| DS 7 items 1; 2; 3; 4                               | D3.T01/T02; D3.T03; D3.T04/T05/T06; D3.T07 |

PR5 (section 9a) covers D-config, D4 and the commit queue. Not planned: D5, push/publish, binary import, archetype switching, further definition kinds (`task-archetype`, ...), `ux` and `exploration` archetypes (they are definition files).

## 11. Gaps routed back to specification (all closed)

Each gap is resolved in the specification documents (DS = delivery specification, AR = architecture, PR = product, REF = reference). Tasks implement the resolution; nothing is left to the implementer.

| Id   | Resolution (where)                                                                                                                                                                                                                                                                                                                                                                                         | Tasks          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| G-1  | **Closed.** AR "Template rendering (exact)": placeholders `{{specificationTitleJson}}` (JSON-quoted title for frontmatter) and `{{goalOrPrompt}}` (empty-goal fallback text); the overview template equals today's scaffold; D1 golden test against fixtures from the pre-change function.                                                                                                                 | D1.T02, D1.T03 |
| G-2  | **Closed.** DS 6 item 3 (e): the retention sweep removes a journal-less `<operationId>.payload/` older than 7 days (same class as PC-2, confirmed).                                                                                                                                                                                                                                                        | D2.T03         |
| G-3  | **Closed.** AR "Archive count rule" and Limits: a count-only traversal (hidden entries included, stops at 4097 files or 20000 entries) independent of the 2000-file listing cap; `archive-limit` above 4096 files, a file above 32 MiB or an exhausted bound; symlinks and special entries are `skipped-entry`.                                                                                            | D3.T01, D3.T02 |
| G-4  | **Closed.** AR Definitions and REF: template `title` defaults to the document type title; several templates per type are allowed; catalogue `documents[].id` is the template id (unique per archetype), not the document type id.                                                                                                                                                                          | D1.T02, D2.T06 |
| G-5  | **Closed.** DS 7 item 1 and REF: `busy` and `commit-blocked` are emitted from D4 only; D3 never reports them.                                                                                                                                                                                                                                                                                              | D3.T01         |
| G-6  | **Closed.** DS 7 item 1 and REF: before D4 every write action and capability is `available: false` with the new reason `not-implemented`, behind this precedence: `archived`, then `protected` or `root`, then the advisory Git policy reason (`branch-protected`, `branch-not-allowed`, `git-policy-invalid`), then `not-implemented`; the workspace `documents` section lists registered documents only. | D3.T01, D3.T06 |
| G-7  | **Closed.** REF "Errors": `DocumentErrorCode` holds every code of the table; the Create `code` stays a string in this release.                                                                                                                                                                                                                                                                             | D0.T01, D2.T01 |
| G-8  | **Closed.** DS 5 item 3 and DS 6 item 5: `ScaffoldValidationError` with a structured `cause`; D2 admission maps cause to code one to one (six kinds: `archetype-unknown`, `template-unknown`, `path-invalid`, `path-conflict`, `type-invalid`, `limit-exceeded`).                                                                                                                                          | D1.T03, D2.T02 |
| G-9  | **Closed.** DS 4 (a): documents stay `draft`; no status flips until the owner records acceptance.                                                                                                                                                                                                                                                                                                          | D0.T03         |
| G-10 | **Closed.** DS 6 "Compile order": the PR head is green on every package; checkpoint commits may be red.                                                                                                                                                                                                                                                                                                    | D2.T01         |

## 11a. Deliberate follow-ups (not implemented)

- **P2.6 path hardening.** Unicode NFC normalisation of document paths (two canonically equivalent spellings are
  distinct today) and rejection of bidirectional control characters in paths are deliberately not implemented in D1.
  Revisit before D4 (document write operations), where a path can be created through the API.

## 12. Readiness per slice

| Slice | Verdict                                                                 | Condition                                                                                                            |
| ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| D0    | Ready for execution.                                                    | G-7 and G-9 closed.                                                                                                  |
| D1    | Ready after D0 merged.                                                  | G-1, G-4 and G-8 closed.                                                                                             |
| D2    | Ready after D1 merged; D2.T03 and D2.T04 implement confirmed PC-2/PC-3. | PC-2 (with G-2) and PC-3 are confirmed; no task blocked.                                                             |
| D3    | Ready after D2 merged.                                                  | G-3, G-5 and G-6 closed.                                                                                             |
| PR5   | Ready for task execution (PR1 to PR4 are merged).                       | DS 7a and 8 are decision-complete; DW.T07 proves the one verified gap first; owner questions in DS 10 have defaults. |

## 13. Delivered state of PR5 (record, no status change)

This section records what the branch holds after DW.T00 to DW.T19. It does not accept anything: the documents of the
layer stay `draft` (see the deviation below), and behaviour stays defined by the authoritative documents, not here.

| Tasks             | Delivered                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DW.T00 to DW.T06  | Contract prerequisites, Windows-hosted paths, the generic durable core, definitions as project data (`.nevo/definitions`, `definitions` CLI, `init`), no compiled catalogue, the UI Create adaptation |
| DW.T07 to DW.T10c | Commit port, document journal and writer, admission and preflight cache, commit queue with scheduler, failure handling, Close hook and shutdown flush                                                 |
| DW.T11 to DW.T13  | Reads with commit state and real actions, document write routes and `GET /api/specs/document-operations`, CLI `specs documents ...`                                                                   |
| DW.T14, DW.T15    | SIGKILL and multi-process suite; platform gating of the new tests, shard audit and Windows smoke entries                                                                                              |
| DW.T16            | Startup hint when definitions are missing                                                                                                                                                             |
| DW.T18, DW.T19    | `git.commits.auto` with a local override, uncommitted-changes ledger and read, manual commit (Engine, Runtime `POST /api/specs/:specId/commit`, CLI `commit`)                                         |
| DW.T17            | Durable documents already `current` were aligned with the code (configuration layout, Git/worktree reference, CLI references, Close refusal, operation lists, ADR 0013 and 0014 pointers)             |

**Deviation (owner decision).** DW.T17 did not promote any document: ADR 0015 to 0018, the architecture, product and
reference documents of the layer, the delivery specification and this plan stay `draft` until the owner records
acceptance and the external review of the PR has happened.

**Deferred or not delivered.**

- Push and publish: no push code exists anywhere (out of scope of ADR 0018).
- Freshness is polling with ETag; there is no event stream for document changes or the document-operation list.
- Write-operation list items beyond `queued` and `failed` document rows, and a UI for them, are not part of this delivery; the UI
  states of manual commit are limited to what DW.T19 lists.
- D5, binary import, archetype switching, further definition kinds and the `ux` and `exploration` archetypes (section 10).
- Section 11a: NFC normalisation and bidirectional control characters of document paths.

**Known limits.** Not verified on a Windows runner: the `ci:full-platform` dry run of the branch (DW.T15). Windows-hosted
paths and the executor-identity dead proof without `/proc` are covered as the architecture document states them.
