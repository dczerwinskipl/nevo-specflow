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
5. The registry contains exactly one entry with `id: overview`, `path: overview.md`, `type: overview`.
6. `requirements[].documentType` matches the type pattern; `minCount` is an integer >= 0 (unique per type).
7. `folders[]` entries are valid portable folder paths, unique ignoring case, not equal to a registered file.

`archetype.version` is an integer. The persisted `requirements` are authoritative for that Specification:
the catalogue is consulted at Create and for display text (title, description) only.

Rewriting the manifest (registry operations) MUST go through one Engine function that validates the result with
the same parser before writing, preserves unknown top-level keys and SHOULD preserve comments and key order.

## Identity, paths and the registry

- `documentId` is stable for the life of the document; rename and move keep it. Scaffolded documents get the id
  `<type>` for the first of a type (`overview`, `behaviour`, ...) and `<type>-<6 lowercase base32>` for later
  ones. Ids are never reused for another document by the Engine.
- Unclassified files have a **derived** id `u-<first 16 hex of sha256(path lowercased)>`. It is stable while the
  path is stable, resolved by recomputation, and is replaced by a registered id on classification.
- **Paths**: POSIX `/`, relative to the Specification directory, at most 500 characters, no leading `/`, no
  `..`, no empty segment, no segment starting with `.` or ending with `.` or space, none of `\ : * ? " < > |` or
  control characters, no Windows reserved device name in any segment (with or without extension); folder depth
  at most 8; uniqueness is case-insensitive. `specification.yaml` is reserved: it is never a document, never in
  the tree and cannot be created, renamed to, or overwritten through the documents layer.
- **Symlinks** are never followed and never listed; a symlinked entry is skipped and counted in
  `skippedEntries` of the projection.
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

Text sizes: the JSON read returns content up to 1 MiB; the raw endpoint serves up to 25 MiB; larger files are
`DOCUMENT_TOO_LARGE`. Constants live in the Engine, not configuration. Binary import/replace is a later slice.

## Validation results (never stored)

The Engine computes, as a pure function of the registry, the persisted requirements and the observed files:

- **Requirement result** per requirement: `count` of registered documents of that type whose file exists, and
  `satisfied = count >= minCount`. **Structural completeness** = every requirement satisfied.
- **Issues**: `dangling` (registry entry, file absent), `unclassified` (file not registered), `requirement-unmet`.
  None blocks reading or any operation. Parse-level violations (duplicate id/path, missing overview entry,
  unknown keys) are not issues: they make the manifest invalid.
- Completeness is **not** acceptance. No code path marks a document or a Specification "ready", "accepted" or
  "approved" in the manifest. A readiness check, when it exists, is a separate validation capability that
  returns results.

## Invariants

1. The manifest is the only authority for document identity, type and registration. Frontmatter, file names and
   the UI never are.
2. `overview` is the only protected document: it cannot be deleted (by id, by its folder, by any operation) and
   it is editable. No requirement, type, archetype or path rule protects any other file.
3. Every state-changing document operation is file change plus exactly one Engine-owned path-limited commit when
   Git is enabled, with the registry change in the same commit as the file (ADR 0016); no dirty worktree is
   left behind by a successful operation.
4. A Specification in `archive/` is read-only.
5. Existing Specifications never change completeness because the catalogue changed (persisted requirements).
6. An operation never reads or writes outside the Specification directory; all path checks happen in the Engine
   on real paths (no symlink, `realpath` equals the expected path) at the moment of the effect.
7. Read paths are free of Git processes and of the control lock; they may run while a write is in flight and
   report either the previous or the next consistent state, never a mixture of registry and files, because the
   projection is built from a single manifest read followed by a stat of the registered files, and carries a
   `revision` that changes whenever either changes.
8. Unknown or unreadable parts never invent state: a registry entry without file is reported, never silently
   dropped or recreated.

## Enforcement

Invariants 1, 2, 5 and 6 are enforced by Engine unit tests over pure functions and by the strict parser. 3 and 4
are enforced by Linux-only integration tests with real Git (ADR 0016 verification). The Runtime depends on
Engine behaviour only; HTTP tests assert the mapping, not the rules.
