---
id: architecture.runtime.specification-documents
type: architecture
title: Specification documents layer - registry, archetypes, ownership and invariants
status: draft
scope: specflow
areas: [runtime, workflow, server]
tags: [specifications, documents, archetypes, manifest]
read_when:
  - changing the Specification manifest, archetypes or document types
  - implementing document reads or document write operations in the Engine or Runtime
  - deciding where document logic lives
summary: >
  Ownership, manifest schema, identity and path rules, content kinds, validation results and invariants of the
  backend documents layer. The Engine owns all logic; Runtime and CLI are adapters. Draft until D0 is accepted.
related:
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - product.specflow.specification-documents
  - reference.api.specification-documents
  - architecture.runtime.specflow-engine
  - architecture.runtime.specflow-lifecycle
  - architecture.principles.enforceable-invariants
---

# Specification documents layer

Requirements use the language of
[normative language and document authority](../principles/normative-language.md). This document is a draft:
no part is implemented yet. Observed present state is stated as such.

## Ownership

| Responsibility                                                                    | Owner                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------- |
| Manifest schema, strict parser, archetype and document-type catalogue             | `@nevo/specflow-engine` (`specs/`)              |
| Validation (requirements, dangling, unclassified), tree projection, content kinds | Engine, pure functions plus a filesystem reader |
| Document write operations, journals, recovery, commits                            | Engine (ADR 0016)                               |
| HTTP routes, authorization, error-status mapping, raw-content headers             | `@nevo/specflow-runtime` `features/documents`   |
| Schemas shared by demo and real backend                                           | `@nevo/specflow-contracts/documents`            |
| CLI commands                                                                      | `@nevo/specflow`, thin calls into the Engine    |

Runtime and CLI MUST NOT contain document rules (paths, kinds, requirements, protection, commit decisions).
There is no new Core package. Reviews and Tasks are separate resources with their own read/write models; they
are never documents and are never registered in `documents[]`.

Observed present state: the Engine knows two files of a Specification; `type: 'standard'` is hardcoded in
`createSpecificationScaffold` and read by no consumer; the real documents endpoint is read-only with an unwired
`DocumentContentSource`; save/tree/add exist only in the Runtime demo (`features/documents/demo`).

## Manifest schema (`specification.yaml`)

```yaml
id: <slug> # existing
spec_id: <uuid> # existing
title: <string> # existing
status: draft # existing
priority: 10 # existing, optional
created: 2026-10-23 # existing, optional
tasks: [] # existing
archetype: # REQUIRED; replaces `type`
  id: feature # catalogue id: ^[a-z][a-z0-9-]{0,31}$
  version: 1 # positive integer
  requirements: # REQUIRED snapshot copied from the catalogue at Create
    - documentType: overview
      minCount: 1
    - documentType: behaviour
      minCount: 1
documents: # REQUIRED registry
  - id: overview # stable id
    path: overview.md # relative to the Specification directory
    type: overview # document type id
folders: # OPTIONAL: explicit folders that may hold no file (see below)
  - research
```

Parser rules (strict, `SPEC_SOURCE_INVALID` otherwise; no alias, no default, no legacy fallback):

1. `type` (the old field) is not read. A manifest lacking `archetype` or `documents` is invalid.
2. `archetype` and each `documents[]`/`requirements[]` entry accept only the keys above (unknown keys rejected).
   Unknown **top-level** keys are tolerated and preserved on rewrite.
3. `documents[].id` matches `^[a-z0-9][a-z0-9-]{0,63}$`, is unique, and MUST NOT start with `u-` (reserved for
   derived ids of unclassified files). `type` matches `^[a-z][a-z0-9-]{0,31}$`; it need not exist in the current
   catalogue (a retired type stays valid and is shown by id).
4. `documents[].path` is a normalised portable relative path (see "Paths"); paths are unique ignoring case.
5. The registry contains exactly one entry with `id: overview`, `path: overview.md`, `type: overview`. Its id
   and path are fixed, so rename and move of `overview` are refused with the `protected` reason like delete
   (**DEFAULT, pending owner confirmation**; the owner decision itself only says it cannot be deleted).
6. `requirements[].documentType` matches the type pattern; `minCount` is an integer >= 0 (unique per type). The
   requirements MUST contain `overview` with `minCount` >= 1 (the framework invariant below); every other
   requirement is configuration.
7. `folders[]` entries are valid portable folder paths, unique ignoring case, not equal to a registered file.

`archetype.version` is an integer. The persisted `requirements` are authoritative for that Specification:
the catalogue is consulted at Create and for display and authoring text (title, description, useWhen,
instructions) only. Instructions are guidance, not rules, and are deliberately **not** snapshotted.

Rewriting the manifest (registry operations) MUST go through one Engine function that validates the result with
the same parser before writing, preserves unknown top-level keys and SHOULD preserve comments and key order.

## Definitions: framework invariant and configuration

**Framework invariant (hard-coded, not configurable).** Exactly one thing is required of every Specification: the
main document `overview.md` (document id `overview`, type `overview`, protected from deletion). It follows from
working on a Specification at all. Parser rule 5 and rule 6 enforce it, and no definition can remove or relax it:
every archetype's requirements contain `overview` with `minCount` >= 1 and every scaffold creates it.

**Configuration (shipped defaults now, owner-defined later).** Everything else is project configuration: which
document types exist, which archetypes exist, which documents an archetype requires or suggests, the templates and
the authoring instructions. The built-in `minimal`, `feature` and `architecture` archetypes are only the shipped
**default configuration**; they require nothing but `overview` and offer the other documents as suggestions with
templates. The requirements model (`documentType` + `minCount`, persisted as a snapshot) stays so that owners can
configure stricter archetypes; requirements never protect a file and only yield validation results.

### One declarative schema

Specification archetypes, document types, templates and requirements are described by **one** declarative
definition schema (`schemaVersion: 1`), used identically by the built-in definitions (plain typed data in the
Engine for D1 to D3) and by future user-defined definitions (YAML files, slice D-config). Its published form is a
JSON Schema generated from the contract types (reference: "Definition schema"); users and AI generate files against
it. Entities:

| Entity        | Fields (M = mandatory)                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document type | `id` M, `title` M, `description` M, `useWhen` M, `instructions` M (how to prepare the document and what it must contain), `defaultFilename`                                                                                                                                        |
| Archetype     | `id` M, `version` M (integer >= 1), `title` M, `description` M, `useWhen` M, `instructions` (how to work with the archetype), `requirements[]` M, `templates[]` M                                                                                                                  |
| Requirement   | `documentType` M, `minCount` M (integer >= 0)                                                                                                                                                                                                                                      |
| Template      | `id` M (unique in the archetype), `documentType` M, `filename` M, `title`, `include` M (`always` or `optional`), `preselected` (optional templates only; UI default), `instructions` (how to fill this template), `content` M (inline text; a file reference is added by D-config) |

Rules: `description`, `useWhen` and (for document types) `instructions` are consumed by AI agents, the CLI and the UI
to choose and to author; they are exposed in the catalogue contract. `include: always` is scaffolded at Create;
`optional` templates are the suggestions, and `preselected` only sets the default tick in clients (a
recommendation, never a requirement). A template's `documentType` MUST exist in the catalogue. Content may use the
placeholders `{{specificationTitle}}`, `{{slug}}`, `{{goal}}` and `{{created}}` (nothing else is substituted;
unknown `{{...}}` text is left as is). `instructions` are not rendered into the document.

### Versioning rule

- Ids (document type, archetype, template) are immutable; renaming means a new id.
- An archetype `version` MUST be bumped whenever its `requirements` change; changes to text only (title,
  description, useWhen, instructions, template content) MAY keep the version. A catalogue never holds two
  definitions with the same `id` and `version`.
- `catalogueRevision` is the sha256 of the canonical JSON of the whole resolved catalogue (types, archetypes,
  templates, instructions) and changes on any edit. Create sends it and the version; a mismatch is
  `CATALOGUE_STALE`. The loader cannot detect an un-bumped requirement change (it keeps no history); the snapshot in
  the manifest, not the version, is what protects existing Specifications.
- A document type removed from the catalogue stays valid in registries (shown by id).

## Identity, paths and the registry

- `documentId` is stable for the life of the document; rename and move keep it. The first document of a type
  gets the id `<type>` (`overview`, `behaviour`, ...). Further ones get `<type>-<suffix>`, where `suffix` is
  the first 6 characters of the lowercase base32 of `sha256(<specId>:<position>)` and `position` is the entry's
  index in the registry at allocation; a collision with an existing id extends the suffix by one character until
  unique. The allocation is therefore deterministic (replay of Create produces the same ids) and, for later
  operations (D4), the allocated ids are persisted in the operation journal. Ids are never reused by the Engine.
- Unclassified files have a **derived** id `u-<first 16 hex of sha256(exact path, case preserved)>`. It is stable
  while the path is stable, resolved by recomputation over the listed files, and is replaced by a registered id on
  classification. On a case-sensitive filesystem `A.md` and `a.md` are two files with two different ids; both are
  listed and readable, the tree reports an issue `path-case-collision`, and the Engine refuses any operation that
  would create, rename or move onto a path equal to another ignoring case.
- **Paths**: POSIX `/`, relative to the Specification directory, at most 500 characters, no leading `/`, no
  `..`, no empty segment, no segment starting with `.` or ending with `.` or space, none of `\ : * ? " < > |` or
  control characters, no Windows reserved device name in any segment (with or without extension); folder depth
  at most 8; uniqueness is case-insensitive. At the Specification root the names `specification.yaml` and
  `change.yaml` are reserved **ignoring case**: they are never documents and cannot be created, renamed to, or
  overwritten through the documents layer (`DOCUMENT_PATH_INVALID`). `specification.yaml` is never in the tree.
  A hand-dropped root entry whose name equals `specification.yaml` or `change.yaml` ignoring case but is not the
  canonical manifest is not a document problem: the existing Specification listing already fails closed for it
  (`repository.ts` requires exactly one manifest-named entry, spelled `specification.yaml`), so the tree is never
  reached; this is documented behaviour, not new.
- **Symlinks and special files** are never followed and never listed; such an entry is skipped, counted in
  `skippedEntries` and reported as the issue `skipped-entry`. Close archive refuses a directory that contains a
  symlink or special file, so this issue means "Close will refuse until it is removed" (see Limits). Opening a file
  re-verifies the physical path (lstat, `realpath` equality, regular file) before and after open and compares
  `fstat` identity; `O_NOFOLLOW` is used where the platform has it (not on Windows, where the re-verification is
  the only guard). A regular file with more than one hard link is readable; writes use temp file plus rename, which
  replaces the directory entry and never writes through the link.
- **Folders** are derived from file paths plus `folders[]`. Git cannot track an empty directory, so an empty
  folder exists only if it is in `folders[]` (committed with the registry change in D4).
- **Display title** is derived, not stored: the first level-1 heading of a markdown text, else the file stem.
  Frontmatter is not consulted.

## Content kinds

Kind is decided by the Engine from the extension and, for text kinds, a content check (UTF-8, no NUL byte in the
first 8 KiB; otherwise the file is `binary`). The extension table is closed in the Engine and lists the media
type served by the raw endpoint.

| Kind     | Extensions (initial)                                                                                | Behaviour                                                               |
| -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `text`   | `md markdown txt json csv tsv yaml yml toml xml html css js mjs ts tsx jsx py rb go rs java sh sql` | Opened as text. `editable` for `md` and `txt` only in the first release |
| `image`  | `png jpg jpeg gif webp avif svg`                                                                    | Preview. `svg` is an image, never inline-rendered markup                |
| `binary` | everything else, or text with NUL                                                                   | Info and download only. No archive (zip) inspection                     |

Limits are in the Limits table below. Binary import/replace is a later slice.

## Limits (the single authoritative table)

Other documents refer to this table and MUST NOT restate the numbers. All sizes are **UTF-8 / raw bytes**, never
characters. The constants live in the Engine (exported once and imported by Runtime where a route needs them), not
in configuration.

| Limit                            | Value                                                             | Notes                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text JSON read and Save content  | 1 MiB (bytes)                                                     | Above: JSON read and Save are `DOCUMENT_TOO_LARGE` (413); use `raw` to read                                                                            |
| Raw content                      | 25 MiB                                                            | Below Close's 32 MiB per-file archive limit on purpose                                                                                                 |
| Content-hash revision            | files <= 1 MiB: sha256; above: `stat:<size>-<mtimeNs>`            | Memo keyed by path+size+mtimeNs+ino, at most 5000 entries (LRU)                                                                                        |
| Manifest size                    | 256 KiB                                                           | Larger: `SPEC_SOURCE_INVALID`                                                                                                                          |
| Listed files per Specification   | 2000, depth 8                                                     | Beyond: `truncated: true`. Close archive allows 4096 files and fails above that                                                                        |
| Added documents at Create        | 10 files, 100 folders, total content 1 MiB (bytes)                | Each file also <= 1 MiB; enforced at admission                                                                                                         |
| Template text                    | 64 KiB each                                                       |                                                                                                                                                        |
| Definition text                  | `description`, `useWhen`: 1000 bytes; each `instructions`: 16 KiB | Per field                                                                                                                                              |
| HTTP body, Save and Create       | 2 MiB each (route-level `bodyLimit`)                              | Above the content caps to leave room for JSON escaping; larger bodies answer 413. The server has no global override, so each route sets its own limit  |
| HTTP body, other document writes | 256 KiB                                                           | operations, folders, classify                                                                                                                          |
| Create journal file              | 64 KiB (the existing cap)                                         | Kept: file contents are not stored in the journal (delivery D2). One exported constant replaces the copies in `store.ts`, `listing.ts`, `retention.ts` |

## Validation results (never stored)

The Engine computes, as a pure function of the registry, the persisted requirements and the observed files:

- **Requirement result** per requirement: `count` of registered documents of that type whose file exists, and
  `satisfied = count >= minCount`. **Structural completeness** = every requirement satisfied.
- **Issues** (the tree's `issues[]`): `dangling` (registry entry, file absent), `unclassified` (file not
  registered), `requirement-unmet`, `skipped-entry` (symlink or special entry; Close archive will refuse),
  `path-case-collision`, `archive-limit` (more files than the archive's file limit or a file above its per-file
  limit; Close will refuse). None blocks reading or any document operation. Parse-level violations (duplicate id/path, missing overview entry,
  unknown keys) are not issues: they make the manifest invalid.
- Completeness is **not** acceptance. No code path marks a document or a Specification "ready", "accepted" or
  "approved" in the manifest. A readiness check, when it exists, is a separate validation capability that
  returns results.

## Invariants

1. The manifest is the only authority for document identity, type and registration. Frontmatter, file names and
   the UI never are.
2. `overview` is the only protected document: it cannot be deleted (by id, by its folder, by any operation),
   its id and path are fixed (rename and move refused; DEFAULT pending owner confirmation) and it is editable. No requirement, type, archetype or path rule protects any other file.
3. Every state-changing document operation is file change plus exactly one Engine-owned path-limited commit when
   Git is enabled, with the registry change in the same commit as the file (ADR 0016); no dirty worktree is
   left behind by a successful operation.
4. A Specification in `archive/` is read-only.
5. Existing Specifications never change completeness because the catalogue changed (persisted requirements).
6. An operation never reads or writes outside the Specification directory; all path checks happen in the Engine
   on real paths (no symlink, `realpath` equals the expected path) at the moment of the effect.
7. Read paths are free of mutating Git processes and of the control lock. The projection is built from one
   manifest read followed by a directory listing and a stat/hash of the files; it is **not** an atomic snapshot.
   The guarantee delivered: every reported field was true of its file or of the manifest at some instant during
   the read; writes put the manifest last, so a concurrent reader may transiently see a new file as
   `unclassified` or a removed file as `dangling`, never an invented document; and the tree `revision` is
   computed from exactly the bytes and stat signatures that were read, so a client that re-reads and compares
   revisions detects any change.
8. Unknown or unreadable parts never invent state: a registry entry without file is reported, never silently
   dropped or recreated.

## Enforcement

Invariants 1, 2, 5 and 6 are enforced by Engine unit tests over pure functions and by the strict parser. 3 and 4
are enforced by Linux-only integration tests with real Git (ADR 0016 verification). The Runtime depends on
Engine behaviour only; HTTP tests assert the mapping, not the rules.
