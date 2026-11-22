---
id: architecture.runtime.document-definitions
type: architecture
title: Document definitions and archetype constraints
status: current
scope: specflow
areas: [runtime, workflow, server]
read_when:
  - changing document type or archetype definitions
  - implementing the definitions loader or scaffolding requirements
summary: >-
  Compiled framework invariants for overview, project-owned archetype and document type YAML definitions, versioning and template resolution.
related:
  - architecture.runtime.specification-documents
  - architecture.runtime.document-manifest-and-registry
  - adr.0017-definitions-as-project-data
---

# Document definitions and archetypes

## Definitions: framework invariant and configuration


### Framework invariant

- **Framework invariant (compiled constants, not configurable).** Exactly one thing is required of every Specification: the main document `overview.md` (document id `overview`, type `overview`, protected from deletion).
- It follows from working on a Specification at all.
- Parser rule 5 and rule 6 enforce it, and no definition can remove or relax it: every archetype's requirements contain `overview` with `minCount` >= 1 and every scaffold creates it.
- What is compiled is only the three constants (document id, path and type id `overview`); no definition text is compiled.
- The `overview` **document type** and the `overview` template are _configuration that the framework requires_: they live in the project's definition files and are validated (see "Definitions as project data"); without the type every archetype is invalid and Create refuses with an actionable error.


### Project configuration

**Configuration (project data).** Everything else is project configuration: which document types exist, which
archetypes exist, which documents an archetype requires or suggests, the templates and the authoring instructions.
The product ships `minimal`, `feature` and `architecture` and their document types only as **seed files** that a
project installs (`definitions install`, also done by `init`); they require nothing but `overview` and offer the
other documents as suggestions with templates. The requirements model (`documentType` + `minCount`, persisted as a
snapshot) stays so that owners can configure stricter archetypes; requirements never protect a file and only yield
validation results. Governing decision: [ADR 0017](../decisions/0017-definitions-as-project-data.md).

### Declarative schemas (one per kind)

Definitions are described by one declarative schema **per kind** (`document-type`, `specification-archetype`; later
kinds register theirs), each with a `schemaVersion`, used identically by the seed files and by owner-authored files.
The published form is a JSON Schema per kind generated from the contract types (reference: "Definition schema");
users and AI generate files against it. Entities (the fields of a `specification-archetype` file include its
`templates[]`; a `document-type` file is one document type):

| Entity        | Fields (M = mandatory)                                                                                                                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document type | `id` M, `title` M, `description` M, `useWhen` M, `instructions` M (how to prepare the document and what it must contain), `defaultFilename`, `icon` (a Design System icon name, kebab-case, at most 64 characters; unknown names are valid)                                                                                            |
| Archetype     | `id` M, `version` M (integer >= 1), `title` M, `description` M, `useWhen` M, `instructions` (how to work with the archetype), `requirements[]` M, `templates[]` M                                                                                                                                                                      |
| Requirement   | `documentType` M, `minCount` M (integer >= 0)                                                                                                                                                                                                                                                                                          |
| Template      | `id` M (unique in the archetype), `documentType` M, `filename` M, `title`, `include` M (`always` or `optional`), `preselected` (optional templates only; UI default), `instructions` (how to fill this template), `content` or `contentFile` M (exactly one: inline text, or a relative file under `templates/` of the kind directory) |

- Rules: `description`, `useWhen` and (for document types) `instructions` are consumed by AI agents, the CLI and the UI to choose and to author; they are exposed in the catalogue contract.
- `include: always` is scaffolded at Create; `optional` templates are the suggestions, and `preselected` only sets the default tick in clients (a recommendation, never a requirement).
- A template's `documentType` MUST exist in the catalogue.
- A template's `title` defaults to the title of its document type; several templates of one document type are allowed (the template `id` is unique per archetype and is what `optionalDocumentIds` names; it is unrelated to the registry document id).
- `instructions` are not rendered into the document.

**Template rendering (exact).** Content may use these placeholders and nothing else is substituted (unknown
`{{...}}` text is left as is). Substitution is one left-to-right pass; substituted values are never rescanned.

| Placeholder                  | Value                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `{{specificationTitle}}`     | The title with whitespace runs collapsed and trimmed (the value `createSpecificationScaffold` uses today)                |
| `{{specificationTitleJson}}` | `JSON.stringify` of that title: a valid YAML double-quoted scalar for frontmatter                                        |
| `{{slug}}`                   | The Specification slug                                                                                                   |
| `{{goal}}`                   | The trimmed goal, or the empty string                                                                                    |
| `{{goalOrPrompt}}`           | The trimmed goal, or, when it is empty, the fixed prompt `<!-- Describe the intended outcome of this specification. -->` |
| `{{created}}`                | The creation date `YYYY-MM-DD`                                                                                           |

- The shipped `overview` template (a seed file) is exactly the text the present `createSpecificationScaffold` produces for `overview.md`, with `{{slug}}` for the interpolated slug (`id: spec.{{slug}}`, `change: {{slug}}`), `title: {{specificationTitleJson}}`, `# {{specificationTitle}}` and `{{goalOrPrompt}}` as the goal text, and the same line breaks and trailing newline.
- A golden test compares the rendered output with fixtures generated by the pre-change function (committed before the change) for: a plain title, a title with quotes and non-ASCII characters, extra whitespace, no goal, a goal with leading/trailing whitespace and a multi-line goal.
- The goal prompt is an HTML comment so template guidance is never presented as the Specification's content (its description, a rendered document); the no-goal fixtures were updated deliberately when it became one.

### Versioning rule

- Ids (document type, archetype, template) are immutable; renaming means a new id.
- An archetype `version` MUST be bumped whenever its `requirements` change; changes to text only (title,
  description, useWhen, instructions, template content) MAY keep the version. A catalogue never holds two
  definitions with the same `id` and `version`.
- `catalogueRevision` is the sha256 of the canonical JSON of the whole resolved (valid) catalogue (types, archetypes,
  templates, instructions) and changes on any edit. Create sends it and the version; a mismatch is
  `CATALOGUE_STALE`. The loader cannot detect an un-bumped requirement change (it keeps no history); the snapshot in
  the manifest, not the version, is what protects existing Specifications.
- A document type or archetype removed from the catalogue (its file deleted or invalid) stays valid in registries and Specifications (shown by id; the persisted snapshot governs).

## Definitions as project data

Governing decision: [ADR 0017](../decisions/0017-definitions-as-project-data.md).

**Layout.** Under the Project Home's committed configuration (the home checkout, the same authority as
`git.commits`; a linked checkout's copy and the local configuration are never read):

```text
.nevo/definitions/
├── document-type/<id>.yaml
├── specification-archetype/<id>.yaml
└── specification-archetype/templates/<name>.md     # referenced by contentFile, optional
```

`id` equals the file name without `.yaml`; `kind` equals the directory name; both are validated. A file is
self-describing: `kind`, `schemaVersion`, `id` and the entity fields. Future kinds (`task-archetype`, `task-type`, `review-kind`) add a directory and register
in the Engine's **kind registry** (directory name, supported `schemaVersion`s, schema, parse step, entity checks,
dependencies on other kinds); the loader core is not touched. `.nevo/agents/` is the repository's own agent-profile
namespace and is unrelated; `.nevo/definitions/` does not collide with it.


### Loader validation

**Loading (Engine, read-only).** `loadDefinitions` and the catalogue resolution take no lock and start no process.

- Safety: `.nevo/definitions` and every kind directory MUST be real directories inside the Project Home
  (`lstat`, `realpath` equality); every entry is `lstat`ed; symlinks, special files and entries not matching
  `^[a-z][a-z0-9-]{0,31}.yaml$` (or the template area) are not read and are reported (`directory-unsafe`,
  `unexpected-entry`). A `contentFile` is a relative path `templates/<segments>` of portable characters
  (`[A-Za-z0-9._-]`), no `..`, at most 8 segments, resolved only inside the kind directory, regular file, valid UTF-8
  without NUL, at most the template limit. Reading uses bounded reads (`limit + 1` bytes), like the manifest.
- YAML: parsed with aliases and merge keys rejected and unique keys required, stricter than the manifest parser
  (which relies on the 256 KiB cap and the library default alias limit); only the YAML core schema.
- Isolation: a file that is unreadable, too large, invalid YAML, fails its schema, has a mismatching `kind` or `id`,
  duplicates an id, or references something missing is rejected **as a whole**; every other file loads. Cascade by
  reference: an archetype whose requirement or template names a document type that is missing or invalid is invalid.
  Nothing is repaired. The result is the resolved catalogue of valid definitions plus `problems[]`
  (`{ source, code, severity, message, location? }`; `source` is the path relative to `.nevo/definitions`, messages
  never contain absolute paths; codes are a closed list in the reference).
- Required by the framework: the `overview` document type, and in every archetype a requirement `overview >= 1`
  and exactly one `always` template with id `overview`, type `overview` and filename `overview.md`. A violation
  invalidates the archetype (`overview-template-invalid` / `requirement-overview-missing`); a missing `overview`
  type invalidates all archetypes.
- Limits (in "Limits"): bytes per file, files per kind, total bytes per load; beyond them extra files (in
  name order) are rejected with `limit-exceeded`, never partially read.
- Caching: the resolved catalogue is cached per Project Home in the process and revalidated on every use by a stat
  signature of the definitions tree (names, size, mtime, ctime, inode); there is no file watcher. A file modified in
  the last 2 seconds is never trusted from the cache (same rule as the revision memo). `catalogueRevision` is the
  sha256 of the canonical JSON of the valid catalogue; the catalogue route's ETag also covers `problems`.


### Catalogue consumers

**Consumers.** Create, the scaffold, the tree projection and the catalogue route all take the catalogue from this
loader; there is no other source. Create with no usable archetype (directory absent, empty or all invalid) is
`DEFINITIONS_MISSING`; with a named archetype that is not defined or invalid it is `ARCHETYPE_UNKNOWN` (cause in
`details`). Existing Specifications and every read, save, rename, move, delete and classify never consult the
catalogue for their rules (they use the manifest and the persisted snapshot); the catalogue only supplies display
text (archetype title, type titles) and tree `archetype.defined`.


### Removing definitions

**Deleting a definition.** Removes it from the catalogue for new work only. An existing Specification keeps its
persisted `archetype` snapshot and registry; its tree reports `archetype: { id, version, defined: 'absent' }` and no
title; its document types are shown by id. Referential integrity is inside the configuration: deleting a document
type that an archetype requires or templates invalidates that archetype (reported), other archetypes still load.


### Seed installation

- **Install (`definitions install`).** The product ships seed files in the Engine package (same layout and format; the packaging step copies the folder next to the CLI bundle).
- There are no existing projects, so there is no upgrade path, no version stamp and no content hash in definition files.
- `init` installs all seeds into a new project.
- `install` is idempotent and never overwrites an existing file without `--force`.
- A bare `install` is **bootstrap only** (it works when the project has no definitions yet); otherwise the owner names what to add (`install <kind>/<id>` or `--add-missing`), so a deleted definition is never silently resurrected.
- Installing an archetype installs the document types it needs.
- Files are written atomically (a file the plan saw as absent is created exclusively, so one that appeared meanwhile is never replaced); a link, a special file or an unreadable kind folder on the way refuses the whole install before anything is written, and a template file alone counts as "the project has definitions". **The installed files are committed**: with Git enabled they go into one path-limited Engine commit (ADR 0013: operation trailer, hooks off, protected-branch guard), after a pre-check that refuses a protected or not-allowed branch, a detached HEAD or a busy checkout before anything is written; with Git disabled the install is a plain write.
- `init` writes the definitions before the configuration marker and commits them after it.


### Repository authorization

**Authorization.** Definitions are repository files: Git permissions decide who changes them. The HTTP catalogue is
read-only (capability of `create-options`). The CLI resolves to the **Project Home** (not the current checkout); run
from a linked checkout it either operates on the home or refuses and prints the home path. Switching the home
checkout's branch changes the definitions for the whole project.


### Additional loader guarantees

- **Loader details.** A kind may declare auxiliary directories (`specification-archetype` declares `templates/`) so they are not reported as unknown.
- File names and ids match `^[a-z][a-z0-9-]{0,31}$` and are not Windows device names.
- YAML is parsed with `maxAliasCount: 0` (the library then throws on `toJS`: the loader MUST catch it and report `yaml-invalid`), `customTags: []` (no `!!binary`), the core schema and unique keys; with `merge: false` a `<<` key is an ordinary key and MUST be rejected explicitly.
- A `contentFile` is matched against the exact name `readdir` reports, so a wrong-case name is rejected on every filesystem (a case-insensitive one would otherwise open it and give a different catalogue than Linux).
- `contentFile` bytes are normalised to LF when loaded, so an `autocrlf` checkout does not change the catalogue revision.
- A load whose stat signature differs before and after is retried up to 3 times, then the last good catalogue is served with an `unstable-read` warning.
- The tree reader MUST NOT walk the definitions directory per tree request: it checks only the single archetype file (one `lstat` plus the memo), and `DocumentTree.archetype.defined` is `defined | invalid | absent`.
