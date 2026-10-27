---
id: adr.0017-definitions-as-project-data
type: adr
title: Definitions are project data files read from the project configuration, never compiled into the product
status: draft
date: 2026-10-24
summary: >
  Specification archetypes, document types and every later kind of definition (task archetypes, review kinds,
  ...) are YAML data files under .nevo/definitions/<kind>/ in the Project Home. The Engine reads definitions
  only from there, through a kind registry with a schema version and a JSON Schema per kind. The product ships
  default definitions as seed files used only to install them into a project. Nothing archetype-related is
  compiled in; deleting a file removes the definition for new work and existing Specifications keep their
  persisted snapshot.
related:
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - architecture.runtime.configuration
  - architecture.runtime.specification-documents
  - reference.api.specification-documents
  - ideas.specflow-engine.specification-documents-delivery
---

# 0017 — Definitions are project data files

## Status

Draft (proposed with delivery slice D-config of `ideas.specflow-engine.specification-documents-delivery`).
Amends ADR 0015 decision 9 (the first release no longer holds the built-in definitions in Engine code).

## Context

Observed: the Engine holds the shipped catalogue as TypeScript data (`specs/archetypes/builtins.ts`, resolved by
`getBuiltInCatalogue()`), conformance-tested against `docs/product/specflow/specification-documents.md`. Create,
the scaffold, the tree reader and the CLI call it. ADR 0015 planned owner-defined YAML later, overlaid on the
built-ins. The owner decided that **nothing archetype-related may be compiled into the product**: the shipped
defaults are only a starting point of a project's own configuration. There will be many kinds of definitions
(Specification archetypes, document types, later task archetypes and task types, review kinds), so one
mechanism must serve all of them. The repository namespace `.nevo/` already holds `config.yaml` (aggregate
configuration), `local/` (ignored), `agents/` (the repository's own agent profiles; a different concern) and
`workflows/` (reserved). `architecture.runtime.configuration` states that large declarative definitions keep
their own committed files and are not flattened into `config.yaml`.

## Decision

1. **The only source is the project.** The Engine MUST read definitions exclusively from the Project Home's
   `.nevo/definitions/` (the home checkout's configuration directory, the same authority as `git.commits`: a
   linked checkout's copy and the local machine configuration are never consulted). There is no compiled fallback
   and no overlay: a project without definitions has none.
2. **One directory per kind, one file per definition.** `.nevo/definitions/<kind>/<id>.yaml`. First kinds:
   `document-type` and `specification-archetype`. Template bodies that are not inline live in
   `.nevo/definitions/specification-archetype/templates/`. A new kind adds a directory; it never changes the loader
   core. The directory name `definitions` does not collide with `.nevo/agents/` (agent profiles) or
   `.nevo/local/`; the entry `.nevo/agents/definitions/` is a subfolder of another namespace and unrelated.
   One file per definition makes "delete the file" the deletion mechanism and gives per-file isolation.
3. **A kind registry in the Engine.** A kind registers its directory name, its supported `schemaVersion`s, a
   TypeBox schema (published as a JSON Schema per kind and version), a parse step, per-entity checks, and its
   dependencies on other kinds. The loader core handles safe reading, size and count limits, YAML parsing,
   isolation and problem reporting for every kind.
4. **Each file is self-describing:** `kind`, `schemaVersion`, `id` (equal to the file name and matching the id
   pattern, 32 characters at most, not a Windows device name) and the entity fields. An unknown `kind` directory or an
   unsupported `schemaVersion` is a reported problem, not a silent skip. The Engine supports a set of versions per
   kind; adding a version adds a schema, and a version is dropped only in a documented major change.
5. **Per-file isolation, referential integrity, no repair.** An invalid file is rejected as a whole and reported in
   `problems[]`; valid files still load. A definition that references something missing or invalid (an archetype
   requiring or templating a deleted document type) is itself invalid and reported; its dependants cascade. Nothing
   is repaired or substituted.
6. **The framework invariant stays small and compiled as constants only:** the document id, path and type id
   `overview` (ids, no text). The `overview` document type and an `overview` template in every archetype are
   **required in configuration and validated**: without the type, every archetype is invalid and Create refuses
   with an actionable error. No definition text is shipped by the framework other than as seed data.
7. **Deleting a definition** removes it from the catalogue for new work. Existing Specifications keep working from
   the persisted snapshot (archetype id, version, requirements; ADR 0015). Their archetype is shown by id and
   version as "definition not available"; their document types by id. Nothing in an existing Specification
   changes, and no operation requires the definition.
8. **Seeds and install.** The product ships default definitions as data files in the Engine package (same layout
   and format), copied next to the CLI bundle by the packaging step. There are no existing projects (the product is
   being created), so there is **no upgrade path**: no `--update`, no version stamp or content hash in the files.
   `nevo-specflow init` copies all seeds into a new project. `nevo-specflow definitions install` MUST be idempotent
   and MUST NOT overwrite an existing file without `--force`. A bare `install` is **bootstrap only**: it works when
   the project has no definitions yet; otherwise it refuses and the owner names what to add
   (`install <kind>/<id>` or `--add-missing`), so a definition the owner deleted is never resurrected silently.
   **Installed definitions are never left as an untracked, dirty worktree.** With Git enabled, `init` and
   `definitions install` commit the files they wrote (and any an interrupted install left uncommitted) in one
   path-limited commit through the Engine commit capability of ADR 0013: operation trailer, hooks off, exact paths,
   protected-branch guard. A protected or not-allowed branch (or a detached HEAD) refuses **before anything is
   written**, with the existing reason codes. With Git disabled the install is a plain write. `--dry-run` writes and
   commits nothing. An install interrupted between the write and the commit is finished by
   `install --add-missing`, which commits the files already in place.
9. **Loading** MUST be bounded, MUST take no lock and MUST start no process; a read that changes underneath it (stat signature differs before and after) is retried up to 3 times, then the last good catalogue is served with an `unstable-read` warning for reads; a mutation (Create) loads again after a short pause and, when the files still do not settle, is refused with `CATALOGUE_STALE` (`details.cause: catalogue-unstable`) rather than pinning a torn read. The result is cached per process and revalidated
   on every use by a stat signature of the directory tree (no file watcher). `catalogueRevision` remains the
   sha256 of the canonical resolved catalogue; `CATALOGUE_STALE` is unchanged.
10. **Authority to change definitions is Git's.** They are repository files: whoever may commit to the project may
    change them. The HTTP catalogue is read-only. A definition change is visible to new work as soon as the file
    on disk changes in the Project Home.

## Consequences

- Every project gets the default definitions from `init`; a project without definitions can run
  `definitions install`. Create in a project without definitions refuses with `DEFINITIONS_MISSING`.
- The Engine's `builtins.ts`, `getBuiltInCatalogue()` and the built-in default parameters disappear; tests and
  tools that need a catalogue install the seeds into a temporary project through one test helper.
- The seed files become the single home of the shipped text. The product document keeps the structure of the
  shipped set (ids, titles, requirement and suggestion matrix) and links to the seeds for the long strings.
- Packaging copies the seed folder next to `bin.js` (the same mechanism as `copyProductUiAssets` in `packaging/bundle.ts`).
- The catalogue loader reads files on every use (stat-on-read); the cost is a directory listing and one `lstat`
  per definition file and is part of the performance budget of Create admission and catalogue reads.
- Definitions are read from the Project Home checkout: switching the home checkout to another branch changes the definitions for the whole project. A branch-specific definition (like workflows) is not
  supported for these kinds.

## Rejected

- **Compiled built-ins with a YAML overlay (disable list, override).** Two sources, silent precedence, and the
  product would still own archetype text.
- **A single `.nevo/archetypes/*.yaml` multi-entity file set** (the earlier D-config sketch). Cannot serve other
  kinds, deletes whole groups, and isolates failures at the wrong granularity.
- **Absorbing definitions into `.nevo/config.yaml`.** Violates the configuration architecture (large declarative
  definitions keep their own files).
- **A file watcher for invalidation.** Unreliable on Windows and network filesystems and a lifetime burden;
  stat-on-read is exact and cheap enough.
- **Reading definitions from the linked checkout or from Git history.** A branch could change the project's
  shape of work silently; Project Home is the one authority, as for `git.commits`.
