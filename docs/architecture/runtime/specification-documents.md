---
id: architecture.runtime.specification-documents
type: architecture
title: 'Specification documents: ownership and invariants'
status: current
scope: specflow
areas: [runtime, workflow, server]
read_when:
  - selecting authoritative document model, validation and write contracts
  - reviewing document security and recovery invariants
summary: >-
  Entry point to Engine-owned Specification and Task documents: manifest/registry, project definitions, admission bounds, write journal, commit queue and commit policy.
related:
  - architecture.runtime.document-manifest-and-registry
  - architecture.runtime.document-definitions
  - architecture.runtime.document-limits
  - architecture.runtime.document-write-and-commit-queue
  - architecture.runtime.document-commit-policy
  - product.specflow.specification-documents
  - adr.0016-engine-owned-document-commits
---

# Specification documents

The Engine is the single owner of document identity, mutation admission, filesystem operations and durable Git effects. Runtime and CLI are adapters. Start with the topic below; do not use a duplicate HTTP schema from Markdown.

| Question                                            | Owner                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| What is a registered document or a Task container?  | [Manifest, registry and validation](document-manifest-and-registry.md) |
| Which definitions and archetype requirements apply? | [Project definitions](document-definitions.md)                         |
| Which sizes and quotas are allowed?                 | [Engine limits](document-limits.md)                                    |
| What happens on write, queue claim, retry or crash? | [Write journal and commit queue](document-write-and-commit-queue.md)   |
| What is committed or left in the ledger?            | [Commit policy and workflow-state writes](document-commit-policy.md)   |

## Ownership

| Responsibility                                                                    | Owner                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Manifest schema, strict parser, catalogue resolution and the definitions loader   | `@nevo/specflow-engine` (`specs/`, `specs/definitions/`)    |
| Validation (requirements, dangling, unclassified), tree projection, content kinds | Engine, pure functions plus a filesystem reader             |
| Document write operations, journals, commit queue, recovery, commits              | Engine (ADR 0016; generic durable core in `specs/durable/`) |
| HTTP routes, authorization, error-status mapping, raw-content headers             | `@nevo/specflow-runtime` `features/documents`               |
| Schemas shared by demo and real backend                                           | `@nevo/specflow-contracts/documents`                        |
| CLI commands                                                                      | `@nevo/specflow`, thin calls into the Engine                |

Runtime and CLI MUST NOT contain document rules (paths, kinds, requirements, protection, commit decisions).
There is no new Core package. Reviews and Tasks are separate resources with their own read/write models; they
are never documents and are never registered in `documents[]`.

The Engine reads a Specification's documents (`specs/documents/tree-reader.ts`, `document-reader.ts`, `summaries.ts`: tree,
document, registered summaries; `open.ts`: raw access) and changes them through the write operations of ADR 0016. The Runtime
serves both through the Engine in project mode; demo mode keeps its own fixtures (`features/documents/demo`).

## Invariants

1. The manifest is the only authority for document identity, type and registration. Frontmatter, file names and
   the UI never are.
2. `overview` is the only protected document: it cannot be deleted (by id, by its folder, by any operation),
   its id and path are fixed (rename and move refused; confirmed by the owner) and it is editable. No requirement, type, archetype or path rule protects any other file.
3. Every state-changing document operation is a durable file change plus Engine-owned path-limited commits when
   Git is enabled (ADR 0016): the files and the registry change are written at once, the commit is made later by
   the per-checkout queue as one commit per batch of overlapping operations, with the registry change in the same
   commit as its file. The window in which a checkout is dirty because of Nevo is **journaled and bounded**: every
   pending change is represented by a durable journal, the healthy bound is the settle period plus the commit
   time, and anything that cannot be committed becomes `failed` or `recovery-required` with evidence; it is never
   dropped, never hidden and never committed with content nobody saw. A file that can never be committed is never
   written (policy and blockers are checked before the write).
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
9. Close never runs while a document commit is pending, in progress or uncommitted (ledger) for its checkout (claim exclusion plus a
   flush-first admission); Create and other Engine commits are unaffected by pending document commits.
10. The catalogue has exactly one source: the project's definition files. No archetype, document type or template
    text is compiled into the product; nothing but the three `overview` constants is framework-fixed.
11. A definition file never changes an existing Specification: its rules come from its manifest snapshot.
12. The Engine never commits a path it did not change: a manual commit contains only ledger paths of its scope, whose
    working content still equals the recorded post-image; it is never `git commit -a`.
13. Content the Engine wrote and did not commit is never invisible: it is either in a queued batch or in the ledger, and
    Close refuses while either exists. The Create scaffold and the `init`/`definitions install` commits are the only
    Engine writes that are always committed.

## Enforcement

Invariants 1, 2, 5, 6, 10 and 11 are enforced by Engine unit tests over pure functions, the strict parser and the loader. 3, 4 and 9
are enforced by Linux-only integration tests with real Git, real crashes and several processes (ADR 0016 verification). The Runtime depends on
Engine behaviour only; HTTP tests assert the mapping, not the rules.
