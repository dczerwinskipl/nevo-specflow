---
id: product.specflow.specification-documents
type: product
title: Specification archetypes and documents
status: draft
scope: specflow
areas: [workflow, runtime, ui]
tags: [specifications, documents, archetypes, requirements]
read_when:
  - defining or changing Specification archetypes, document types or their descriptions
  - changing what users and AI agents see in a Specification's documents
  - deciding how document operations behave for the user
summary: >
  Product behaviour of Specification archetypes (minimal, feature, architecture), document types and
  requirements, the document tree states (registered, unclassified, dangling), content kinds, and the
  user-visible behaviour of document operations on a Git-backed workspace.
related:
  - architecture.runtime.specification-documents
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - reference.api.specification-documents
  - product.specflow.specification-creation
  - product.specflow.ui.documents-editor-mode
---

# Specification archetypes and documents

Status: draft proposal prepared for owner acceptance. Exact contracts live in
[the reference](../../reference/api/specification-documents.md); durable rules in
[the architecture document](../../architecture/runtime/specification-documents.md); the delivery plan in
[the delivery specification](../../ideas/specflow-engine/specification-documents-delivery.md).

## Goal

A Specification is a folder of documents. The product MUST let a person or an AI agent pick the right shape of
work when creating it, MUST tell them which documents the shape expects, MUST keep every document change
reviewable in Git, and MUST never lose or hide a file that is in the folder.

## Concepts

- **Specification archetype** - a named shape of work: which document types it expects (requirements) and which
  documents Create scaffolds. Selected once at Create; stored with the Specification together with its version
  and a snapshot of its requirements.
- **Document type** - what a document is for (`behaviour`, `ux`, `backend`, ...). Stored per document in the
  manifest registry.
- **Requirement** - "at least N documents of type T". It yields a validation result. It never protects a file
  and never blocks an operation.
- **Structural completeness** - every requirement is met by existing registered files. It is **not** content
  acceptance or readiness; nothing records that a document is "done".
- **Registered / unclassified / dangling** - a file listed in the manifest registry / a file in the folder that
  is not listed (readable, can be classified) / a registry entry whose file is missing (reported, never
  hidden).
- **Protected document** - only `overview.md`. It can be edited but not deleted.

All archetypes and document types carry a mandatory `description` (what it is) and `useWhen` (when to choose it)
so an AI agent can choose from the catalogue without other context.

## Document type catalogue (first release)

| Type id        | Title        | Description                                                                                                                    | Use when                                                                            | Default file      |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------- |
| `overview`     | Overview     | Entry point of the Specification: context, goal, non-goals, constraints, affected areas, acceptance criteria.                  | Always. Every Specification has exactly one, and it cannot be deleted.              | `overview.md`     |
| `behaviour`    | Behaviour    | Observable product behaviour: scenarios, rules, edge cases and acceptance scenarios, independent of layout and implementation. | The change alters what the product does for a user or a caller.                     | `behaviour.md`    |
| `ux`           | UX           | The user-experience contract: flows, screens, states, copy, responsive behaviour and accessibility.                            | The change has a user-facing interface or alters an existing one.                   | `ux.md`           |
| `backend`      | Backend      | Server-side design: contracts, data and ownership, invariants, error cases, recovery and verification.                         | The change needs new or changed APIs, persistence, Engine or Runtime behaviour.     | `backend.md`      |
| `architecture` | Architecture | Structural analysis: boundaries, options considered, constraints and the chosen structure.                                     | The work reshapes modules, ownership or dependencies, or answers a design question. | `architecture.md` |
| `decisions`    | Decisions    | Recorded decisions: context, options, decision and consequences.                                                               | A choice with lasting consequences was made and should not be rediscovered.         | `decisions.md`    |
| `research`     | Research     | Findings and evidence gathered before or during the work: questions, sources, results.                                         | Facts must be established before a decision or implementation.                      | `research.md`     |
| `user-story`   | User story   | One or more user stories (as a ... I want ... so that ...) with their acceptance criteria.                                     | The team works from stories and wants them kept next to the specification.          | `user-story.md`   |
| `note`         | Note         | Supporting free-form material that fits no other type.                                                                         | A file belongs to the Specification but has no more specific type.                  | `note.md`         |

Display titles of the archetypes are "Minimal", "Feature" and "Architecture". The title of a document type is the
"Title" column. Strings in this section are the authoritative English source; the Engine catalogue carries them
verbatim and translations are a UI concern.

### Template skeletons (authoritative)

Every template except `overview` is generated by one rule: `# <Specification title> - <type title>`, a blank line,
then for each heading below `## <heading>`, a blank line. A suggested template (`include: optional`) uses the
same rule. The `overview` template is the present Create scaffold (frontmatter plus the headings Context, Goal,
Non-goals, Constraints, Affected Areas, Acceptance Criteria & Verification, with the creation goal text) unchanged.

| Type           | Headings                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| `behaviour`    | Scenarios; Rules; Edge cases; Acceptance scenarios                           |
| `ux`           | Flows; Screens and states; Copy; Responsive behaviour; Accessibility         |
| `backend`      | Contracts; Data and ownership; Invariants; Errors and recovery; Verification |
| `architecture` | Context; Options considered; Chosen structure; Constraints                   |
| `decisions`    | Context; Options; Decision; Consequences                                     |
| `research`     | Questions; Sources; Findings                                                 |
| `user-story`   | Story; Acceptance criteria                                                   |
| `note`         | (no headings, only the title line)                                           |

## Archetype catalogue (first release)

| Archetype      | Version | Requirements (type: min)                     | Scaffolded at Create                                 | Suggested (optional at Create)        |
| -------------- | ------- | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| `minimal`      | 1       | overview: 1                                  | `overview.md`                                        | `decisions`, `research`, `note`       |
| `feature`      | 1       | overview: 1, behaviour: 1, ux: 1, backend: 1 | `overview.md`, `behaviour.md`, `ux.md`, `backend.md` | `user-story`, `decisions`, `research` |
| `architecture` | 1       | overview: 1, architecture: 1, decisions: 1   | `overview.md`, `architecture.md`, `decisions.md`     | `research`, `note`                    |

Archetype texts (normative; the Engine catalogue MUST carry these strings, translations are a UI concern):

- `minimal` - description: "A single overview document." useWhen: "The work is small, well understood, or
  exploratory, and you do not yet know which further documents it needs."
- `feature` - description: "A full slice of a product capability: observable behaviour, user experience and
  backend design, in addition to the overview. User stories are an optional suggestion, not a requirement."
  useWhen: "One change spans what the product does, how it looks and how the server supports it."
- `architecture` - description: "A structural change or design question: an architecture analysis plus recorded
  decisions." useWhen: "The work reshapes modules, ownership or dependencies, or answers a design question
  without a user-facing change."

The `architecture` archetype requiring a `decisions` document is a **DEFAULT pending owner confirmation**.

`ux` and `exploration` archetypes are deliberately deferred. Project-defined archetypes (`.nevo/archetypes`),
template overrides, CLI authoring and switching the archetype of an existing Specification are out of scope; the
persisted `archetype.version` and stable document ids keep room for them.

## Behaviour

### Create with an archetype

1. The person chooses an archetype (default selection is a UI matter; the contract has no default) and may tick
   any suggested documents. Create scaffolds the archetype's documents plus the ticked ones, from the catalogue
   templates, and registers them. Optionally the person adds files of their own at Create: each is unclassified
   unless a type is given.
2. The manifest records the archetype id, version and requirements snapshot. A Specification created today keeps
   its completeness rules even if the catalogue changes tomorrow.
3. The scaffold, the registry and any added files land in the same Engine-owned commit when Git is enabled (the
   Create contract of ADR 0013 extended); with Git disabled no commit is made.

### Reading a Specification's documents

- The tree lists registered documents with their type, unclassified files marked as such, and dangling entries
  as missing. Nothing in the folder is hidden except `specification.yaml`, hidden (dot) entries and symlinks.
- Each document shows a **kind**: text (opened and, for markdown and plain text, editable), image (preview), or
  binary (information and download only). Other text formats are viewable in the first release.
- Completeness is shown as requirement results ("behaviour: 0 of 1") with the text of the type, never as a
  document status. Unmet requirements are information, not errors, and never prevent an action.

### Changing documents

- **Save, create from a template, create a folder, rename, move, delete, classify** (and later import). Each
  succeeds as one atomic change: files and registry together, then one commit, so the history shows who changed
  what and the working tree stays clean. With Git disabled the same change is a plain file write.
- **Overview** can be edited and cannot be deleted. Rename and move are not offered either: its id and path are
  fixed (**DEFAULT, pending owner confirmation**; the owner decision only says it cannot be deleted). Other
  documents, including ones that satisfy a requirement, can be deleted; the requirement then reads as unmet.
- **Deleting a folder** deletes every document in it; it is refused when the folder contains `overview.md`.
- **Unclassified file**: can be opened, edited as its kind permits, renamed, moved, deleted or classified (given
  a type). Classifying it registers it in the manifest.
- **Dangling entry**: shown as missing; the user can remove the registration. It is not recreated silently.
- **Conflicts**: if the file changed on disk after it was opened, the save is refused with a revision conflict
  and nothing is overwritten.
- **Protected branches**: when the project forbids Engine commits on the current branch, every document
  operation is refused with a clear reason and the tree shows editing as unavailable with that reason. The user
  continues in a workspace on an allowed branch.
- **Archived Specifications** are read-only.

### Boundaries

Reviews and Tasks are separate resources; they never appear in a Specification's documents.

## Acceptance scenarios (observable)

1. Creating a `feature` Specification yields a tree with `overview.md`, `behaviour.md`, `ux.md`, `backend.md`,
   completeness satisfied, one commit on the current branch containing exactly those files and the manifest, and
   a clean working tree.
2. Deleting `ux.md` produces one commit; the tree shows completeness not met for `ux: 0 of 1`; deleting
   `overview.md` is refused as protected.
3. A markdown file dropped into the folder by hand shows as unclassified; classifying it as `research` registers
   it in one commit that includes the file and the manifest.
4. Editing a document on `main` configured as protected branch is refused with the protected-branch reason; the
   file is unchanged and no commit exists.
5. Saving with a stale revision after an external edit is refused; the external edit survives.
6. An image opens as a preview; an unknown binary offers info and download; neither is editable.
7. A manifest in the old shape (with `type`, without `archetype`) makes the Specification list fail with a source
   error until the manifest is repaired.
