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
  - adr.0017-definitions-as-project-data
  - adr.0018-engine-commit-policy-and-manual-commit
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

- **Specification archetype** - a named shape of work: which document types it requires (requirements) and which
  documents it suggests with templates. Selected once at Create; stored with the Specification together with its
  version and a snapshot of its requirements. The shipped archetypes are default configuration, not framework rules.
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
- **Framework invariant vs configuration** - the framework hard-requires exactly one thing: the main document
  `overview.md`. Which other documents are required or suggested, the archetypes, the templates and the authoring
  instructions are the project owner's configuration, kept as definition files in the project
  (`.nevo/definitions/`, [ADR 0017](../../architecture/decisions/0017-definitions-as-project-data.md)). Nothing is
  built into the product: the shipped archetypes and document types are default files that `nevo-specflow init` or
  `nevo-specflow definitions install` copies into the project, and the owner may edit, add or delete any of them. A
  Specification keeps working from what it recorded when it was created, whatever the files say later.

All archetypes and document types carry a mandatory `description` (what it is) and `useWhen` (when to choose it)
so an AI agent can choose from the catalogue without other context. Every document type also carries mandatory
`instructions` (how to prepare the document and what it must contain); archetypes and templates may carry
`instructions` too (how to work with the archetype, how to fill the template). AI agents, the CLI and the UI read
them from the catalogue; they are guidance, never rules, and are not stored in a Specification.

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
"Title" column. Strings in this section are the authoritative English source of the shipped default files (see "Source of the shipped text"); the seed files carry them
verbatim and translations are a UI concern.

### Authoring instructions of the document types (authoritative)

- `overview` - "Write this first and keep it current. State the context and the goal in plain terms, list explicit non-goals and constraints, name the affected areas, and write acceptance criteria that can be checked. Link to the other documents instead of repeating their content. Do not put detailed design here."
- `behaviour` - "Describe what the product does as observable scenarios (given/when/then or short numbered steps), the rules behind them and the edge and failure cases, in the terms of the user or caller. Do not describe screens, layout or implementation. Every acceptance scenario must be verifiable by someone who has not read the code."
- `ux` - "Describe the user journey: flows, each screen and its states (empty, loading, error, success), the exact copy, responsive behaviour and accessibility. Reference existing patterns and name what is new. Do not restate behaviour rules; link to the behaviour document."
- `backend` - "Describe the server-side contract: the owning module, data and persistence, API and event shapes (by reference to the authoritative contract), invariants, error codes and recovery, and how each is verified (unit versus integration). Do not describe screens."
- `architecture` - "Describe the structure: the problem, the boundaries and owners involved, the options considered with their trade-offs, the chosen structure and the constraints it imposes. Make dependencies and the direction of change explicit."
- `decisions` - "Record each decision as context, the options considered, the decision and its consequences, one decision per section, with who decided and when if known. Record decisions that are costly to rediscover, not routine choices."
- `research` - "Record the questions asked, the sources consulted (with locations) and the findings, separating fact from interpretation. State what remains unknown."
- `user-story` - "Write stories as 'As a <role> I want <capability> so that <benefit>', each with acceptance criteria. Keep stories small and independent and link them to the behaviour they imply."
- `note` - "Use for supporting material that fits no other type. Start with one sentence saying why the note belongs to this Specification."

### Template skeletons (authoritative)

Every template except `overview` has inline `content` generated by one rule: `# {{specificationTitle}} - <type title>`,
a blank line, then for each heading below `## <heading>`, a blank line (placeholders as defined in the architecture
document). Suggested templates (`include: optional`) use the same rule. Each template's own `instructions` is the line
in the last column; the type's `instructions` above apply as well. The `overview` template is the present Create scaffold (frontmatter plus the headings Context, Goal,
Non-goals, Constraints, Affected Areas, Acceptance Criteria & Verification, with the creation goal text) unchanged.

| Type           | Headings                                                                     | Template `instructions`                                                                   |
| -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `overview`     | (the present Create scaffold)                                                | "Fill Context and Goal first; leave a section empty rather than inventing content."       |
| `behaviour`    | Scenarios; Rules; Edge cases; Acceptance scenarios                           | "Write scenarios before rules; each acceptance scenario must be independently checkable." |
| `ux`           | Flows; Screens and states; Copy; Responsive behaviour; Accessibility         | "Cover every state of every screen, including empty and error."                           |
| `backend`      | Contracts; Data and ownership; Invariants; Errors and recovery; Verification | "Name the owner of each contract and mark every test as unit or integration."             |
| `architecture` | Context; Options considered; Chosen structure; Constraints                   | "Give at least two options with trade-offs before the chosen structure."                  |
| `decisions`    | Context; Options; Decision; Consequences                                     | "Add one section block per decision; do not rewrite earlier decisions, supersede them."   |
| `research`     | Questions; Sources; Findings                                                 | "List the questions first; every finding cites a source."                                 |
| `user-story`   | Story; Acceptance criteria                                                   | "One story per section; keep acceptance criteria testable."                               |
| `note`         | (no headings, only the title line)                                           | "State why this note belongs here."                                                       |

## Archetype catalogue (first release)

| Archetype      | Version | Requirements (type: min) | Scaffolded at Create (`include: always`) | Suggested templates (`optional`; **bold** = preselected)                        |
| -------------- | ------- | ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `minimal`      | 1       | overview: 1              | `overview.md`                            | `decisions`, `research`, `note`                                                 |
| `feature`      | 1       | overview: 1              | `overview.md`                            | **`behaviour`**, **`ux`**, **`backend`**, `user-story`, `decisions`, `research` |
| `architecture` | 1       | overview: 1              | `overview.md`                            | **`architecture`**, **`decisions`**, `research`, `note`                         |

All three require only `overview` (the framework invariant); everything else is a suggestion. `preselected` only
sets the default tick in a client; a person may untick it and the Specification is still complete.

Archetype texts (normative; the shipped archetype files MUST carry these strings, translations are a UI concern):

- `minimal` - description: "A single overview document." useWhen: "The work is small, well understood, or exploratory, and you do not yet know which further documents it needs." instructions: "Write the overview first. If the work grows beyond one document, add documents from the suggestions or classify existing files; do not duplicate content across documents."
- `feature` - description: "A full slice of a product capability: observable behaviour, user experience and backend design, in addition to the overview. Behaviour, UX and backend documents are suggested and preselected; user stories are an optional suggestion." useWhen: "One change spans what the product does, how it looks and how the server supports it." instructions: "Start with the overview, then behaviour, then UX, then backend, keeping each to its own concern and linking between them. Add user stories only when the team works from stories. Treat the backend document as the contract that the UI and tests are checked against."
- `architecture` - description: "A structural change or design question: an architecture analysis plus recorded decisions, suggested and preselected." useWhen: "The work reshapes modules, ownership or dependencies, or answers a design question without a user-facing change." instructions: "Start with the overview, state the problem in the architecture document, record each decision in decisions as it is made and use research for evidence. Do not describe user-facing behaviour here; link to a feature Specification if one exists."

`ux` and `exploration` archetypes are deliberately deferred. Owner-defined archetypes, document types and templates
are definition files in the project (`.nevo/definitions/<kind>/<id>.yaml`, slice D-config); the shipped set is only
the default content installed there. CLI authoring beyond `definitions list|show|validate|install`, template overrides
and switching the archetype of an existing Specification stay out of scope. The persisted `archetype.version`,
stable document ids and the declarative schemas keep room for them.

### Definitions in the project (owner view)

- The definitions live as files: one per document type and one per archetype. Delete a file you do not need; edit one
  to change the text or the templates; add a file to define your own. Validate with `nevo-specflow definitions
validate`. The people who may change them are those who may commit to the project.
- **Deleting a definition** removes it from the choices for new Specifications. Existing Specifications are not
  touched: they keep their recorded archetype, requirements and documents. The Specification shows the archetype by
  id and version with "definition no longer available".
- **Consistency:** an archetype that needs a document type you deleted is invalid and is reported with the reason;
  your other archetypes still work. The one thing every archetype needs is the `overview` document type and
  template; without them nothing can be created, and the error says to run `nevo-specflow definitions install`.
- **No definitions at all:** creating a Specification is refused with that same instruction. Reading and editing
  existing Specifications is unaffected.
- **Restoring defaults:** `definitions install` on a project that already has definitions never adds anything by itself,
  so a definition you deleted stays deleted; name what you want back (`install <kind>/<id>` or `--add-missing`).
  `--force` overwrites. With Git enabled, installing commits the new files in one commit made by Nevo (and refuses first on a protected branch), so your worktree is never left with untracked definitions; with Git disabled the files are just written.
- **Authoring text** (`description`, `useWhen`, `instructions`) stays mandatory, because AI agents and the UI choose
  and fill documents from it.

> **Source of the shipped text.** Until slice D-config lands, the strings in this document are the authoritative
> source of the default catalogue. From D-config the seed files in the Engine package are authoritative for the long
> strings (descriptions, instructions, skeletons) and this document keeps only the structural matrix (ids, titles,
> default files, requirements, suggestions, preselection); a conformance test then checks that matrix against the seeds.

## Behaviour

### Create with an archetype

1. The person chooses an archetype (default selection is a UI matter; the contract has no default) and ticks or
   unticks the suggested documents (preselected ones start ticked). Create scaffolds `overview.md` plus the ticked
   suggestions, from the catalogue
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

- **Save, create from a template, create a folder, rename, move, delete, classify** (and text import). Each change
  is written to the file system **at once**; the person sees it saved immediately. The Git commit follows shortly
  after, made by the Engine: changes that are still waiting are combined (several saves of one document, or "Save
  all", become one commit; a burst of saving waits a fraction of a second (300 ms by default, at most 5 s in total) so it is one commit), and the history shows who
  changed what. With Git disabled the same change is a plain file write and there is nothing to commit.
- **Commit state** is visible: "committing" (pending), "committed", "commit failed" (with the reason and Retry or
  Abandon) or, rarely, "needs operator recovery". A failed commit never loses or hides the saved content: the files stay
  as they were saved, and saving the document again also retries. The working tree may show these pending changes
  for a few seconds, or until a failed one is resolved.
- **Abandon** keeps the saved files as ordinary working-tree changes and records them as "changed, not committed" (the
  same state as when auto-commit is off); they stay marked until a later save commits them, a manual commit includes
  them or someone commits them by hand; Close stays unavailable meanwhile.
- **Auto-commit can be switched off** per project (`git.commits.auto.documents: false` in the committed configuration) or
  per machine (the same key in the local configuration, which wins). With it off, saving still writes the file at once
  but the Engine never commits it: the document shows "changed, not committed" and a **Commit changes** button lists
  exactly the changes Nevo made (never anything else in the folder), asks for a message and makes one commit with that
  message. If someone edited one of those files in the meantime, the commit is refused and names the files. Creating a
  Specification and installing the default definitions are always committed; the setting does not apply to them.
- **Switching the setting** never commits silently: turning auto-commit off lets what is already waiting finish
  committing; turning it on again leaves the "changed, not committed" documents as they are until the person commits
  them (or saves them again, which commits that document).
- **Manual commit availability:** with auto-commit off it is always available; with it on it is available only when
  nothing is waiting or failed for that Specification (retry or abandon first), and then it also takes up what Abandon left.
- **Long paths on Windows:** on Windows hosts a document whose full path (project folder plus document path) would exceed 240 characters is refused when it is created or moved, with a clear message, instead of failing later.
- **Closing** a Specification first commits what is waiting; if something cannot be committed, Close says so and
  stays unavailable until it is committed, retried or abandoned.
- **Overview** can be edited and cannot be deleted. Rename and move are not offered either: its id and path are
  fixed (confirmed by the owner). Other
  documents, including ones that satisfy a requirement, can be deleted; the requirement then reads as unmet.
- **Deleting a folder** deletes every document in it; it is refused when the folder contains `overview.md`.
- **Unclassified file**: can be opened, edited as its kind permits, renamed, moved, deleted or classified (given
  a type). Classifying it registers it in the manifest.
- **Dangling entry**: shown as missing; the user can remove the registration. It is not recreated silently.
- **Conflicts**: if the file changed on disk after it was opened (by someone else, or by an earlier save that is not
  yet committed and that this editor has not seen), the save is refused with a revision conflict and nothing is
  overwritten; the draft stays. "Save all" checks every document first: if any is in conflict, nothing is written.
- **Protected branches and blocked checkouts**: when the project forbids Engine commits on the current branch, or Git
  cannot take a commit now (detached HEAD, a merge or rebase in progress, unmerged paths), every document operation
  is refused **before anything is written**, with a clear reason, and the tree shows editing as unavailable with that
  reason. The user continues in a workspace on an allowed branch. If the branch or the project's rules change while
  something is waiting to be committed, that change is kept on disk and reported as a failed commit.
- **Archived Specifications** are read-only.

### Boundaries

Reviews and Tasks are separate resources; they never appear in a Specification's documents.

## Acceptance scenarios (observable)

1. Creating a `feature` Specification with the preselected suggestions yields a tree with `overview.md`, `behaviour.md`,
   `ux.md`, `backend.md`, completeness satisfied, one commit on the current branch containing exactly those files and
   the manifest, and a clean working tree. Unticking all suggestions yields only `overview.md`, still complete.
2. Deleting `ux.md` is saved at once and committed shortly after and completeness stays satisfied (nothing requires it); deleting `overview.md`
   is refused as protected. With an owner-configured archetype that requires `ux`, the same deletion reads `ux: 0 of 1`.
3. A markdown file dropped into the folder by hand shows as unclassified; classifying it as `research` registers
   it, and the commit that follows includes the file and the manifest.
4. Editing a document on `main` configured as protected branch is refused with the protected-branch reason; the
   file is unchanged and no commit exists.
5. Saving with a stale revision after an external edit is refused; the external edit survives.
6. An image opens as a preview; an unknown binary offers info and download; neither is editable.
7. A manifest in the old shape (with `type`, without `archetype`) makes the Specification list fail with a source
   error until the manifest is repaired.
8. Saving a document answers immediately with the new revision and "committing"; within a few seconds the document
   shows "committed" and the history holds one commit. Saving the same document five times within a second yields one
   commit that contains the last content.
9. "Save all" with three modified documents is one request and one commit containing exactly those three files. If
   one of them was changed on disk by someone else, none is written and every draft stays.
10. Editing a document on a branch that has become protected, or with a merge in progress, is refused before any file
    changes; nothing is written and nothing is pending.
11. A save is acknowledged, then the user switches the checkout to another branch before the commit happens: the saved
    content stays on disk, the commit is reported as failed (branch changed) with Retry and Abandon, and nothing is
    committed on the new branch.
12. A commit that cannot be made never loses saved content; a restart of the Runtime (or a crash) with pending
    changes ends with the same changes committed afterwards, or reported as failed, never silently dropped.
13. Closing a Specification with pending commits commits them first; if one is failed, Close is refused and names it.
14. Deleting the `ux` document type file hides every archetype that needs it from Create, with a reported reason,
    while archetypes that do not need it still work; deleting the `feature` archetype file removes it from Create but
    an existing `feature` Specification keeps working and shows "definition no longer available".
15. In a project with no definition files, Create is refused with the instruction to run `definitions install`;
    after the command, Create works and the files are uncommitted changes the owner reviews and commits.
16. With auto-commit off, saving a document answers "saved, not committed" at once and no commit appears in the
    history; **Commit changes** with a message then produces one commit that contains exactly the documents Nevo changed
    (and the registry file when it changed) and nothing else in the folder.
17. With auto-commit off, editing a document that someone else has changed on disk since it was saved is refused as a
    conflict; committing while a Nevo-changed file was edited by someone else is refused and nothing is committed.
18. Closing a Specification that has "changed, not committed" documents is refused with that reason and a Commit
    changes action; a hand commit of the same files clears the mark.
19. Turning auto-commit on again does not commit what is marked; the person commits it, or saves the document again.
20. With auto-commit off on a protected branch, documents can still be edited and saved (the Engine commits nothing);
    Commit changes there is refused with the protected-branch reason.
