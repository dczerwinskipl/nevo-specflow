---
id: adr.0015-specification-manifest-as-document-registry
type: adr
title: The Specification manifest is the document registry; archetypes are project-defined catalogue entries
status: current
date: 2026-10-23
summary: >
  specification.yaml becomes the canonical registry of a Specification's documents (stable id, path, type)
  and records the selected archetype with a snapshot of its requirements. Archetypes and document types
  are project data files (ADR 0017), not compiled into the product. Frontmatter is optional and never authoritative;
  files outside the registry are unclassified. Structural completeness is a computed validation result.
related:
  - architecture.runtime.specification-documents
  - adr.0016-engine-owned-document-commits
  - adr.0017-definitions-as-project-data
  - adr.0013-engine-owned-commits-and-protected-branches
  - architecture.runtime.specflow-engine
  - product.specflow.specification-documents
---

# 0015 — The Specification manifest is the document registry

## Status

Current. The decisions below were taken by the product owner.

## Context

Observed in the repository (not assumed):

- `specification.yaml` carries `type: 'standard'`, hardcoded by `createSpecificationScaffold` and required but
  read by nothing (`parseSpecificationManifest` stores it; no consumer branches on it).
- The Engine knows exactly two files of a Specification (`specification.yaml`, `overview.md`). The real Runtime
  documents endpoint is read-only and its `DocumentContentSource` is not wired in project mode.
- The demo (`@nevo/specflow-contracts/demo`) already shapes archetypes, templates, a tree and tree operations
  that the UI uses, with `required` / `required_document_path` protection tied to a template flag.
- Listing is fail-closed (`listWorkspaceSpecifications` throws on any invalid manifest), so a manifest contract
  change affects every Specification in a checkout.

The product needs Specification Archetypes (so an AI agent and a human can choose the right shape of work),
document types, requirements, a way to say which files are the Specification's documents, and a safe way to
evolve this later (project-defined archetypes, template overrides) without redefining what is stored.

## Decision

1. **The manifest is the registry.** `specification.yaml` gains `archetype: {id, version, requirements[]}` and
   `documents[]` entries `{id, path, type}`, and optionally `folders[]`. `type: standard` is removed. The
   manifest remains the only authority for canonical Specification metadata (existing rule); the registry is
   part of it. Indexes, the Runtime projection and the UI never store document identity.
2. **Stable `id`, relative `path`.** `id` is the durable identity of a document (URLs, links, requirements
   linkage); `path` is relative to the Specification directory and may change by rename/move without changing
   the id. Archiving moves the directory and therefore changes nothing in the registry.
3. **Strict parser, no compatibility.** The parser REQUIRES `archetype` and `documents`. There is no alias for
   `type`, no default archetype, no fallback for an old manifest and no migration reader. Fixtures and examples
   are rewritten. Consequence accepted by the owner: listing stays fail-closed, so one manifest in the old
   shape makes the whole checkout listing fail with `SPEC_SOURCE_INVALID` until it is repaired by hand.
4. **Frontmatter is optional and not a source of truth.** Nothing in a document's frontmatter decides its type,
   id, path or status. The scaffolded `overview.md` keeps its present frontmatter only as a convenience for
   humans and the docs tooling.
5. **Unclassified and dangling.** A regular file under the Specification directory that is not registered is
   `unclassified`: readable and classifiable, never an error. A registry entry whose file is absent is
   reported as `dangling` (a validation issue), not a parse failure.
6. **One framework invariant, everything else configuration.** The framework hard-requires exactly one document:
   `overview.md` (id and type `overview`). Which other documents are required or suggested, archetypes, templates and
   authoring instructions are the owner's configuration; the shipped archetypes are default configuration and require
   only `overview`. The requirements model is kept so owners can configure stricter archetypes.
7. **One protected document.** `overview.md` (document id `overview`, type `overview`) cannot be deleted and
   is editable. No other protection exists. Archetype requirements never protect a file; they only produce
   validation results. There are no per-document status fields.
8. **Completeness is computed, never stored.** "Structural completeness" (requirements met) is a pure function
   of the registry, the files and the persisted requirements snapshot. Readiness or content acceptance is not
   stored and is not decided here; it is a validation result of a separate (later) capability.
9. **Declarative definitions, owned by the project.** Archetypes, document types, templates and requirements are
   described by declarative schemas (`schemaVersion` per kind), published as JSON Schemas. They are **project data
   files** read from `.nevo/definitions/<kind>/` ([ADR 0017](0017-definitions-as-project-data.md)); nothing
   archetype-related is compiled into the product (amended 2026-10-24: the first draft held the built-ins in Engine
   code). The shipped `minimal`, `feature` and `architecture` archetypes and their document types are seed files that
   install into a project. Every archetype and document type has mandatory `description` and `useWhen`; document types
   also have mandatory `instructions` (templates and archetypes optional `instructions`), consumed by AI, CLI and UI.
10. **Selected archetype version and requirements are persisted with the Specification.** `archetype.requirements`
    is a snapshot copied from the catalogue at Create. Later catalogue changes never alter an existing
    Specification's completeness. Archetype switching in an existing Specification is out of scope; the
    `archetype.version` and stable document ids leave room for it.
11. **Engine owns all logic.** Parsing, catalogue, validation, projection and operations live in
    `@nevo/specflow-engine`. Runtime and CLI are thin adapters. No new Core package.

## Consequences

- Production code that builds or round-trips a manifest changes (`model.ts`, `lifecycle/archive-effects.ts`), as do the few tests that write manifest text by hand. Suites that obtain manifests from Create change only if they assert scaffold content.
- A checkout containing a manifest in the old shape fails closed. The Runtime reports the existing
  `SPEC_SOURCE_INVALID` (503) and logs the offending slug and field; operators repair the manifest by hand
  (add `archetype`, `documents`, drop `type`). There is no shim.
- Rewriting the manifest (registry changes) must preserve unknown top-level keys and SHOULD preserve comments
  and key order (use a document-preserving YAML API); Close archive already round-trips the parsed manifest.
- The Create journal intent grows (archetype, optional documents, added documents) and its format version
  moves to 2; file contents live in hash-addressed payload files, not in the journal. A journal file that is not JSON or has no
  numeric `version` is ignored and swept by retention; any other file that does not validate is a corrupt journal.
- Reviews and Tasks remain separate resources; they are not documents and are not registered here.

## Rejected

- **Keeping `type` and adding fields beside it.** Two fields with overlapping meaning, one read by nothing.
- **Frontmatter as the registry.** A second source of truth that drifts from the manifest and is invisible to
  non-markdown files.
- **A "status" per document (draft, accepted, ...).** Readiness is a validation result; storing it creates
  states nobody can enforce.
- **Requirements-protected files.** Protection by archetype rule would make deletion depend on a catalogue
  version; requirements instead yield an explicit, recoverable validation result.
- **Reading requirements live from the catalogue.** A catalogue change would silently change the completeness
  of existing Specifications.
- **Aliases or a legacy reader for the old manifest.** Rejected by the owner; the product is pre-release.
