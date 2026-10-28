---
id: architecture.runtime.specification-documents
type: architecture
title: Specification documents layer - registry, archetypes, ownership and invariants
status: current
scope: specflow
areas: [runtime, workflow, server]
tags: [specifications, documents, archetypes, manifest]
read_when:
  - changing the Specification manifest, archetypes or document types
  - implementing document reads or document write operations in the Engine or Runtime
  - deciding where document logic lives
summary: >
  Ownership, manifest schema, identity and path rules, content kinds, validation results and invariants of the
  backend documents layer, the asynchronous commit queue for document writes and definitions as project data. The Engine owns all logic; Runtime and CLI are adapters.
related:
  - adr.0015-specification-manifest-as-document-registry
  - adr.0016-engine-owned-document-commits
  - adr.0017-definitions-as-project-data
  - adr.0018-engine-commit-policy-and-manual-commit
  - product.specflow.specification-documents
  - reference.api.specification-documents
  - architecture.runtime.specflow-engine
  - architecture.runtime.specflow-lifecycle
  - architecture.principles.enforceable-invariants
---

# Specification documents layer

Requirements use the language of
[normative language and document authority](../principles/normative-language.md).

The manifest, Create, the read side (tree, document content, raw), the write operations with their commit queue
(ADR 0016), the commit policy with the uncommitted-changes ledger and manual commit (ADR 0018) and definitions as
project data (ADR 0017: the Engine reads the archetype catalogue only from the project's `.nevo/definitions`; the shipped
defaults are seed files installed by `init` and `definitions install`) are implemented in the Engine and served by the
Runtime and the CLI.

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
4. `documents[].path` is a normalised portable relative path (see "Paths"); paths are unique ignoring case, and a
   registered file path is never an ancestor folder of another registered path.
5. The registry contains exactly one entry with `id: overview`, `path: overview.md`, `type: overview`. Its id
   and path are fixed, so rename and move of `overview` are refused with the `protected` reason like delete
   (confirmed by the owner).
6. `requirements[].documentType` matches the type pattern; `minCount` is an integer >= 0 (unique per type). The
   requirements MUST contain `overview` with `minCount` >= 1 (the framework invariant below); every other
   requirement is configuration.
7. `folders[]` entries are valid portable folder paths, unique ignoring case, not equal to a registered file and not
   below one.

`archetype.version` is an integer. The persisted `requirements` are authoritative for that Specification:
the catalogue is consulted at Create and for display and authoring text (title, description, useWhen,
instructions) only. Instructions are guidance, not rules, and are deliberately **not** snapshotted.

Rewriting the manifest (registry operations) MUST go through one Engine function that validates the result with
the same parser before writing, preserves unknown top-level keys and SHOULD preserve comments and key order. Delivered behaviour: untouched content,
key order, comments outside the registry, the line ending style and long-line folding are preserved, and a no-op
update returns the source unchanged; comments inside the replaced `documents:` and `folders:` blocks are not
preserved (accepted limitation).

## Definitions: framework invariant and configuration

**Framework invariant (compiled constants, not configurable).** Exactly one thing is required of every Specification: the
main document `overview.md` (document id `overview`, type `overview`, protected from deletion). It follows from
working on a Specification at all. Parser rule 5 and rule 6 enforce it, and no definition can remove or relax it:
every archetype's requirements contain `overview` with `minCount` >= 1 and every scaffold creates it. What is
compiled is only the three constants (document id, path and type id `overview`); no definition text is compiled.
The `overview` **document type** and the `overview` template are _configuration that the framework requires_: they
live in the project's definition files and are validated (see "Definitions as project data"); without the type
every archetype is invalid and Create refuses with an actionable error.

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
| Document type | `id` M, `title` M, `description` M, `useWhen` M, `instructions` M (how to prepare the document and what it must contain), `defaultFilename`                                                                                                                                                                                            |
| Archetype     | `id` M, `version` M (integer >= 1), `title` M, `description` M, `useWhen` M, `instructions` (how to work with the archetype), `requirements[]` M, `templates[]` M                                                                                                                                                                      |
| Requirement   | `documentType` M, `minCount` M (integer >= 0)                                                                                                                                                                                                                                                                                          |
| Template      | `id` M (unique in the archetype), `documentType` M, `filename` M, `title`, `include` M (`always` or `optional`), `preselected` (optional templates only; UI default), `instructions` (how to fill this template), `content` or `contentFile` M (exactly one: inline text, or a relative file under `templates/` of the kind directory) |

Rules: `description`, `useWhen` and (for document types) `instructions` are consumed by AI agents, the CLI and the UI
to choose and to author; they are exposed in the catalogue contract. `include: always` is scaffolded at Create;
`optional` templates are the suggestions, and `preselected` only sets the default tick in clients (a
recommendation, never a requirement). A template's `documentType` MUST exist in the catalogue. A template's `title`
defaults to the title of its document type; several templates of one document type are allowed (the template `id` is
unique per archetype and is what `optionalDocumentIds` names; it is unrelated to the registry document id).
`instructions` are not rendered into the document.

**Template rendering (exact).** Content may use these placeholders and nothing else is substituted (unknown
`{{...}}` text is left as is). Substitution is one left-to-right pass; substituted values are never rescanned.

| Placeholder                  | Value                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `{{specificationTitle}}`     | The title with whitespace runs collapsed and trimmed (the value `createSpecificationScaffold` uses today)     |
| `{{specificationTitleJson}}` | `JSON.stringify` of that title: a valid YAML double-quoted scalar for frontmatter                             |
| `{{slug}}`                   | The Specification slug                                                                                        |
| `{{goal}}`                   | The trimmed goal, or the empty string                                                                         |
| `{{goalOrPrompt}}`           | The trimmed goal, or, when it is empty, the fixed text `Describe the intended outcome of this specification.` |
| `{{created}}`                | The creation date `YYYY-MM-DD`                                                                                |

The shipped `overview` template (a seed file) is exactly the text the present `createSpecificationScaffold` produces for
`overview.md`, with `{{slug}}` for the interpolated slug (`id: spec.{{slug}}`, `change: {{slug}}`),
`title: {{specificationTitleJson}}`, `# {{specificationTitle}}` and `{{goalOrPrompt}}` as the goal text, and the same line
breaks and trailing newline. A golden test compares the rendered output with fixtures generated by the
pre-change function (committed before the change) for: a plain title, a title with quotes and non-ASCII
characters, extra whitespace, no goal, a goal with leading/trailing whitespace and a multi-line goal.

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

**Consumers.** Create, the scaffold, the tree projection and the catalogue route all take the catalogue from this
loader; there is no other source. Create with no usable archetype (directory absent, empty or all invalid) is
`DEFINITIONS_MISSING`; with a named archetype that is not defined or invalid it is `ARCHETYPE_UNKNOWN` (cause in
`details`). Existing Specifications and every read, save, rename, move, delete and classify never consult the
catalogue for their rules (they use the manifest and the persisted snapshot); the catalogue only supplies display
text (archetype title, type titles) and tree `archetype.defined`.

**Deleting a definition.** Removes it from the catalogue for new work only. An existing Specification keeps its
persisted `archetype` snapshot and registry; its tree reports `archetype: { id, version, defined: 'absent' }` and no
title; its document types are shown by id. Referential integrity is inside the configuration: deleting a document
type that an archetype requires or templates invalidates that archetype (reported), other archetypes still load.

**Install (`definitions install`).** The product ships seed files in the Engine package (same layout and format; the
packaging step copies the folder next to the CLI bundle). There are no existing projects, so there is no upgrade path,
no version stamp and no content hash in definition files. `init` installs all seeds into a new project. `install` is
idempotent and never overwrites an existing file without `--force`. A bare `install` is **bootstrap only** (it works
when the project has no definitions yet); otherwise the owner names what to add (`install <kind>/<id>` or
`--add-missing`), so a deleted definition is never silently resurrected. Installing an archetype installs the document
types it needs. Files are written atomically (a file the plan saw as absent is created exclusively, so one that
appeared meanwhile is never replaced); a link, a special file or an unreadable kind folder on the way refuses the
whole install before anything is written, and a template file alone counts as "the project has definitions".
**The installed files are committed**: with Git enabled they go into one path-limited Engine commit (ADR 0013:
operation trailer, hooks off, protected-branch guard), after a pre-check that refuses a protected or not-allowed
branch, a detached HEAD or a busy checkout before anything is written; with Git disabled the install is a plain
write. `init` writes the definitions before the configuration marker and commits them after it.

**Authorization.** Definitions are repository files: Git permissions decide who changes them. The HTTP catalogue is
read-only (capability of `create-options`). The CLI resolves to the **Project Home** (not the current checkout); run
from a linked checkout it either operates on the home or refuses and prints the home path. Switching the home
checkout's branch changes the definitions for the whole project.

**Loader details.** A kind may declare auxiliary directories (`specification-archetype` declares `templates/`) so they
are not reported as unknown. File names and ids match `^[a-z][a-z0-9-]{0,31}$` and are not Windows device names.
YAML is parsed with `maxAliasCount: 0` (the library then throws on `toJS`: the loader MUST catch it and report
`yaml-invalid`), `customTags: []` (no `!!binary`), the core schema and unique keys; with `merge: false` a `<<` key is an
ordinary key and MUST be rejected explicitly. A `contentFile` is matched against the exact name `readdir` reports, so a wrong-case name is rejected on every
filesystem (a case-insensitive one would otherwise open it and give a different catalogue than Linux).
`contentFile` bytes are normalised to LF when loaded, so an
`autocrlf` checkout does not change the catalogue revision. A load whose stat signature differs before and after is
retried up to 3 times, then the last good catalogue is served with an `unstable-read` warning. The tree reader MUST NOT
walk the definitions directory per tree request: it checks only the single archetype file (one `lstat` plus the memo),
and `DocumentTree.archetype.defined` is `defined | invalid | absent`.

## Identity, paths and the registry

- `documentId` is stable for the life of the document; rename and move keep it. The first document of a type
  gets the id `<type>` (`overview`, `behaviour`, ...). Further ones get `<type>-<suffix>`, where `suffix` is
  the first 6 characters of the lowercase base32 of `sha256(<specId>:<position>)` and `position` is the entry's
  index in the registry at allocation; a collision with an existing id extends the suffix by one character until
  unique. The allocation is therefore deterministic (replay of Create produces the same ids) and, for later
  write operations, the allocated ids are persisted in the operation journal. Ids are never reused by the Engine.
- Unclassified files have a **derived** id `u-<first 32 hex of sha256(exact path, case preserved)>` (128 bits; a residual collision between two listed files is
  detected and fails closed as `SPEC_SOURCE_UNAVAILABLE`). It is stable
  while the path is stable, resolved by recomputation over the listed files, and is replaced by a registered id on
  classification. On a case-sensitive filesystem `A.md` and `a.md` are two files with two different ids; both are
  listed and readable, the tree reports an issue `path-case-collision`, and the Engine refuses any operation that
  would create, rename or move onto a path equal to another ignoring case.
  A rename or move that changes only the letter case of a path (`bb.md` to `Bb.md`, a folder `docs` to `Docs`) is
  applied as a write of the new path followed by the removal of the old one; where the file system ignores case both
  name one file and the removal would delete it. The Engine therefore refuses it on Windows
  (`DOCUMENT_OPERATION_INVALID`, `details.cause: 'case-only-rename'`) and accepts it on case-sensitive systems; no
  plan whose paths name one file twice is planned or applied (a journaled one is `DOCUMENT_RECOVERY_REQUIRED`,
  `plan-invalid`). Case-insensitive file systems other than Windows (for example the default APFS volume of macOS)
  are not detected.
- **Paths**: POSIX `/`, relative to the Specification directory, at most 500 characters, every segment at most 200 UTF-8 bytes, no leading `/`, no
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
  `skippedEntries` and reported as the issue `skipped-entry`. The count is a lower bound once the archive count traversal
  reached its own bound (entries beyond it were not visited; `archive-limit` is reported then). Names with control,
  format, line or paragraph separator characters (Cc, Cf, Zl, Zp: bidi overrides, C1 controls, zero-width, U+2028), a
  backslash or bytes that are not UTF-8 are skipped the same way. Close archive refuses a directory that contains a
  symlink or special file, so this issue means "Close will refuse until it is removed" (see Limits). Opening a file
  re-verifies the physical path (lstat, `realpath` equality, regular file) before and after open and compares
  `fstat` identity; `O_NOFOLLOW` (and `O_NONBLOCK`, so a swapped-in FIFO cannot block the open) is used where the
  platform has it (not on Windows, where the re-verification is the only guard and a swap between the last check and
  the first read cannot be excluded by the platform; this is a best-effort statement). The descriptor's device and
  inode must equal those of the checked entry, and the checks are repeated after the open. A regular file with more than one hard link is readable, including a file hard-linked into the directory from
  outside it: the boundary is the directory entry, not the inode (accepted and tested; a hard link cannot be told apart
  from the original). Writes use temp file plus rename, which
  replaces the directory entry and never writes through the link.
- **Folders** are derived from file paths plus `folders[]`. Git cannot track an empty directory, so an empty
  folder exists only if it is in `folders[]` (committed with the registry change).
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

Limits are in the Limits table below. Binary import and replace are not offered.

Implemented refinement: when the whole file is within the content-hash limit (1 MiB) the reader has every byte,
and a text-extension file is `text` only if the whole file is valid UTF-8 (the NUL rule stays on the first 8 KiB), so
text delivered as JSON never contains a replacement character the file did not contain. Larger files are classified
from their first 8 KiB only.

## Limits (the single authoritative table)

Other documents refer to this table and MUST NOT restate the numbers. All sizes are **UTF-8 / raw bytes**, never
characters. The constants live in the Engine (exported once and imported by Runtime where a route needs them), not
in configuration.

| Limit                            | Value                                                                                                                                                                                                                                                                                                                   | Notes                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text JSON read and Save content  | 1 MiB (bytes)                                                                                                                                                                                                                                                                                                           | Above: JSON read and Save are `DOCUMENT_TOO_LARGE` (413); use `raw` to read                                                                                                        |
| Raw content                      | 25 MiB                                                                                                                                                                                                                                                                                                                  | Below Close's 32 MiB per-file archive limit on purpose                                                                                                                             |
| Content-hash revision            | files <= 1 MiB: sha256; above: `stat:<size>-<mtimeNs>`                                                                                                                                                                                                                                                                  | Memo keyed by path+size+mtimeNs+ctimeNs+ino, at most 5000 entries (LRU); a file modified within the last 2 seconds is never memoised                                               |
| Manifest size                    | 256 KiB                                                                                                                                                                                                                                                                                                                 | Larger: `SPEC_SOURCE_INVALID`                                                                                                                                                      |
| Listed files per Specification   | 2000, depth 8                                                                                                                                                                                                                                                                                                           | Beyond: `truncated: true`. Close archive allows 4096 files and fails above that                                                                                                    |
| Archive count traversal          | stops at 4097 files or 20000 entries (files and directories)                                                                                                                                                                                                                                                            | Mirrors Close archive (4096 files, 32 MiB per file, hidden entries counted, no depth limit); exceeding either bound is `archive-limit`                                             |
| Added documents at Create        | 10 files, 100 folders, total content 1 MiB (bytes)                                                                                                                                                                                                                                                                      | Each file also <= 1 MiB; enforced at admission                                                                                                                                     |
| Template text                    | 64 KiB each                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                    |
| Definition text                  | `description`, `useWhen`: 1000 bytes; each `instructions`: 16 KiB                                                                                                                                                                                                                                                       | Per field                                                                                                                                                                          |
| Path segment                     | 200 UTF-8 bytes                                                                                                                                                                                                                                                                                                         | One file or folder name; far below the 255-byte file name limit so staged and sibling names always fit. Same rule in admission, the manifest parser and the Create journal         |
| Definition title and filename    | `title`: 200 characters; `filename`, `defaultFilename`: 500 characters                                                                                                                                                                                                                                                  | Characters, not bytes (sanity bounds of the definition schema; path rules still apply)                                                                                             |
| HTTP body, Save and Create       | 2 MiB each (route-level `bodyLimit`)                                                                                                                                                                                                                                                                                    | Above the content caps to leave room for JSON escaping; larger bodies answer 413. The server has no global override, so each route sets its own limit                              |
| HTTP body, create documents      | 2 MiB                                                                                                                                                                                                                                                                                                                   | Same content caps as Create (10 files, total 1 MiB, each <= 1 MiB); JSON escaping headroom                                                                                         |
| HTTP body, other document writes | 256 KiB                                                                                                                                                                                                                                                                                                                 | operations (rename, move, delete, classify), folders, flush, retry, abandon                                                                                                        |
| Batch save                       | 25 documents, 4 MiB total content (bytes); body limit 8 MiB                                                                                                                                                                                                                                                             | Each document also <= the Save limit                                                                                                                                               |
| Commit batch                     | 50 operations, 200 paths per batch; 200 queued operations per checkout (operations that wait for a person do not count; 1000 of them in all)                                                                                                                                                                            | One Specification per batch. A folder operation expanding beyond 200 paths is `DOCUMENT_OPERATION_INVALID`. Beyond the caps a new operation waits, then `SPEC_BUSY` (`queue-full`) |
| Commit timing                    | settle 300 ms (configurable only within 250-500 ms), maximum hold 5 s, monotonic clock; busy wait 5 s; backoff 1 s doubling to 60 s, then every 60 s until the blocker passes; batch attempt deadline 150 s; sweep every 30 s; shutdown flush 10 s; preflight cache 2 s                                                 | Structural operations have no settle. Git deadlines: read 10 s, mutation 30 s + 3 s grace (existing)                                                                               |
| Save latency budget              | p95 150 ms on Linux with a preflight cache hit; 0 Git processes on a hit, at most 6 reads on a miss                                                                                                                                                                                                                     | Asserted by a benchmark test; not a contract to clients                                                                                                                            |
| Document journals                | operation journal file 32 KiB; batch record 64 KiB; settled record kept 24 h in `settled/`; retention sweep capped by time (50 ms), not count                                                                                                                                                                           | Content is never stored in a journal; plan and content live in the payload store (content deleted at `queued`)                                                                     |
| Uncommitted ledger               | 200 paths and 2 MiB per (checkout, owner) record (the widest admitted record is about 1.15 MB; ADR 0018 names 64 KiB, which cannot hold 200 paths); pinned branch name at most 240 characters (longer: `COMMIT_BLOCKED`, before writing); 50 operation ids per entry; prune sweep every 30 s only for non-empty ledgers | Beyond 200 distinct paths a write is refused `DOCUMENT_UNCOMMITTED_LIMIT` before anything is written                                                                               |
| Manual commit                    | subject 1-100 characters, body <= 2000 characters, subset <= 200 paths; journal 16 KiB; settled record kept 24 h; flush wait before it 10 s                                                                                                                                                                             | User text is validated and neutralised (control characters, Engine trailer lines); the body is multi-line only for this kind and the Engine's list of a document commit            |
| Windows absolute path            | 240 characters (`workspaceRoot` + `/` + relative path), win32 only                                                                                                                                                                                                                                                      | Refused at admission as `DOCUMENT_PATH_INVALID` (`path-too-long`); applies to Create and every D4 target ("Windows-hosted paths")                                                  |
| Definition files                 | 128 KiB per YAML file; template file = Template text limit; 100 document types, 50 archetypes, 64 templates per archetype; 8 MiB total bytes per load; 500 directory entries per kind; definition id <= 32 characters                                                                                                   | Extra files in name order are rejected with `limit-exceeded`. Aliases rejected                                                                                                     |

Revision memo limit (accepted): a content change that preserves size, mtime, ctime and inode within a memoised entry can serve a stale file revision, and so a stale tree revision, until the entry is evicted or the file changes again. The ctime cannot be set by user space and moves on every write, so restoring the mtime after a same-size rewrite (a copy that preserves timestamps) is detected; only a change that also holds the ctime (an in-place write within the filesystem timestamp granularity) can slip through. Files modified in the last 2 seconds are never memoised to keep that window small.

## Validation results (never stored)

The Engine computes, as a pure function of the registry, the persisted requirements and the observed files:

- **Requirement result** per requirement: `count` of registered documents of that type whose file exists and is safely readable, and
  `satisfied = count >= minCount`. **Structural completeness** = every requirement satisfied.
- **Issues** (the tree's `issues[]`): `dangling` (registry entry, file absent; a registered file that is present but unreadable, for example
  replaced by a symlink, is only a `skipped-entry` and is never dangling), `unclassified` (file not
  registered), `requirement-unmet`, `skipped-entry` (symlink or special entry; Close archive will refuse),
  `path-case-collision`, `archive-limit` (Close will refuse; computed by the archive count rule below). None blocks reading or any document operation. Parse-level violations (duplicate id/path, missing overview entry,
  unknown keys) are not issues: they make the manifest invalid.
- **Archive count rule (`archive-limit`).** The tree listing is capped (Limits) but the issue is computed by a
  separate **count-only traversal** of the whole Specification directory that mirrors Close archive's inventory
  (`lifecycle/archive-effects.ts` `physicalInventory`): it includes hidden entries, hashes nothing, and counts every
  regular file. `archive-limit` is reported when the file count exceeds the archive file limit, or any file exceeds the
  archive per-file limit, or the traversal reaches its own bound (Limits) before finishing (conservative: Close would
  likely refuse). Symlinks and special entries found by the traversal are the `skipped-entry` issue (Close refuses
  them), whether or not the listing was truncated.
- Completeness is **not** acceptance. No code path marks a document or a Specification "ready", "accepted" or
  "approved" in the manifest. A readiness check, when it exists, is a separate validation capability that
  returns results.

## Write operations and the commit queue

Governing decision: [ADR 0016](../decisions/0016-engine-owned-document-commits.md) (the state machine and the full
failure classification live there). Exact contract: the reference. Push and publishing are not
part of this layer. Numbers are in "Limits".

**Write path (every state-changing operation).**

1. _Admission_ (nothing written): validate input, limits and the Windows path rule; resolve the Specification and its
   location (`archive/` is read-only); read the manifest; check preconditions on disk (`expectedRevision` of every
   named document, path rules, collisions, protection of `overview`, `SPEC_MANIFEST_DIRTY` against the post-image of
   the latest non-terminal operation or `HEAD`); with Git enabled the commit port's read-only `preflight` for the
   operation's paths (cached per `(root, branch ref, path-set hash)` for 2 s while the stat signatures hold). Any
   refusal ends here with no journal and no file written.
2. _Reservation_ under the control lock: preconditions and the manifest plan are re-checked (one re-plan, then
   `SPEC_BUSY`/`manifest-changed`); paths of a **claimed** batch are refused; `sequence` is allocated; the plan file
   and the content payload are durable; the operation becomes a **barrier** for its paths.
3. _Write_: files by temp file (fixed short name in the target directory) and rename, the manifest last, then one
   journal transition to `queued`; content payload files are then deleted. The response is `200` after this
   transition, with `commit.state` `pending` (Git enabled) or `not-applicable`. A failure after the first rename rolls
   forward from the payload while the claim and barrier are held.
   _Replay and roll-forward._ The same `operationId` is the retry and the crash recovery. An equal request returns the
   stored result with the **current** commit state and writes nothing; a different request, or the same id on another
   Specification, is `DOCUMENT_OPERATION_CONFLICT`. A journal in `reserved` or `files-writing` records the writer's
   **executor identity** (`pid`, `hostId`, and where `/proc` supplies them `pidNamespaceId`, `processStartTime`,
   `bootId`); the field exists only in those two stages. The write is continued from the payload only when that writer is
   this very process (a write that stopped inside it), is provably gone (same host and PID namespace and the PID is
   absent or has another start time, or another boot id) or an operator asserted it; a live or unprovable writer is
   `SPEC_BUSY` (`write-in-progress`). Each path is at its pre or its post state (anything else is a foreign edit), a path
   already at post is skipped, and the target is hashed again immediately before it is replaced, so continuing twice is
   harmless. A foreign edit found while nothing of the write is on disk (at the `reserved` stage, or right after
   `files-writing`) ends the operation as `failed` (`DOCUMENT_REVISION_CONFLICT`, no claim, the client keeps nothing
   half done). Once any path is in place a foreign edit, a full disk, an I/O error or an unprovable payload leaves the
   operation `recovery-required` in its write phase, holding the claim and the barrier, and the answer is
   `DOCUMENT_WRITE_FAILED` or `DOCUMENT_RECOVERY_REQUIRED` (`write-conflict` for a foreign edit, with
   `details.conflicts`). The continuing process takes the write over by replacing the journal's `executor` under the
   control lock only if it is still the one proven gone, stage and backup files carry the operation and the executor
   in their names and are removed by pattern, and a replaced file keeps its mode. The replacement of a file narrows the
   window after the second hash with a hard link to the old file, which is checked after the rename; this is best
   effort ("Known limits" of the ADR). Empty folders left by a move or removal are an accepted state. Without Git the operation
   completes at once as `not-applicable` (`git-disabled`) and its record moves to `settled/`, where it and its plan file
   stay for 24 hours so that the id keeps replaying.
4. _Commit_ (asynchronous): the worker holding the checkout lease forms the batch of one Specification, claims it
   (records `parentHead`), computes the **effective path set**, re-checks the guard and per-path states, makes one
   path-limited commit, verifies it and completes the members.

**Reads of the commit state.** The tree, the workspace `documents` section, the status of one operation and the rows of
the document operation list read the active journals and batch records of the Project Home and nothing else: no control
lock, no Git process, no write, bounded by the listing cap of the journal directory. A bad file is counted and reported
(`commit-blocked` for the writes, a `recovery-required` row), never a failure of the read; a file that is not JSON is ignored.
The plan file of an operation names the paths it covers (immutable, addressed by its hash, so a read remembers it). Only
operations that have not settled appear, so a committed one leaves the tree; the tree revision covers the markers, the held
paths, the capacity of the queue and the blockers but not the age of anything, so an unrelated read never changes it. A
`reserved` or `files-writing` operation whose writer is provably gone (same host and PID namespace, or another boot) is
reported as needing recovery; an unprovable one stays pending. The read side sits in `documents/reads` and imports neither
the writer nor the mutating modules of the queue (import boundary).

**Consolidation rule.** A commit batch is all non-terminal `queued` operations of **one Specification** in one
checkout, in `sequence` order, up to the caps; its commit is the final on-disk state of the effective path set.
Different Specifications are different commits. A batch of only saves waits for the settle period (300 ms, 250–500
configurable) bounded by the maximum hold (5 s); any structural operation makes it eligible at once. A barrier
operation (`reserved`/`files-writing`) delays claiming a batch that overlaps it.

**Formation, claim and lease.** One pass of the queue takes the operations of one Specification that
are `queued`, in `sequence` order, up to 50 operations and 200 distinct paths (paths compare case-insensitively). An
operation is skipped, and no later operation that overlaps it may overtake it, while one of its paths is held by a
barrier (`reserved`, `files-writing`, write-phase `recovery-required`), by a `failed` or `recovery-required` batch, or
when it was pinned to another branch than the first member. A batch of only saves is claimable when 300 ms (configurable
only within 250-500 ms) passed since its last member was queued or 5 s since its first, on a monotonic clock; the age of
an operation that this process has not seen is read from its journal and clamped to 0..5 s, so a restart makes it
eligible at once and a wall clock that jumped backwards cannot postpone the maximum hold. A structural operation, a full
batch or a flush is claimable at once. The batch id is the id of its first member. The claim is one section under the
control lock, in this order: the hash-addressed path list, the lease of the checkout, the batch record (`committing`,
with `parentHead` read just before the lock and the executor), then each member `queued` to `committing`. The batch
record is the commit point of every attempt and the member journals follow it, each function idempotent, so the process
that takes over from a stopped executor (the dead proof, or an operator assertion) resumes a `committing` batch,
completes the members of a `committed` one from the record without Git, and finds an unrecorded commit by its
`Nevo-Operation` trailer instead of committing twice. A record is never created under the id of a record that is not
finished; a split after a failure forms two new batches with disjoint members, never two under one id.

**Message of a batch commit.** The subject says what the batch did, worded from the plans of its members and
restricted to what the commit holds: `spec(documents): update notes.md in <slug>`, `update 3 documents in <slug>`,
`add …`, `rename <old> to <new> in <slug>`, `move …`, `delete … from <slug>`, `classify <path> as <type> in <slug>`,
and `change N documents in <slug>` when the members did different things. It is at most 72 characters: the longest
name (document, folder, type or slug) is shortened first, with an ellipsis, never inside a character. The body lists
one line per change (at most 20 lines and 1500 characters, then `… and N more`) and, for a coalesced batch, the number
of operations; it is cleaned like the body of a manual commit. A member whose plan cannot be read is worded from its
action and the committed paths. The trailers (ADR 0016 decision 3) are unchanged; the wording is not configurable.

**Failures, retry, abandon and recover.** A transient blocker (index lock, busy Git, timed-out or
hung Git, an effective set that changed under the attempt) dissolves the batch: its members are `queued` again with the
attempt counted, `reason` and `blockedBy` visible and `nextAttemptAt` after the backoff (1 s doubling to 60 s, then every 60 s; the attempt counter saturates at 10). A transient blocker never
ends the retries, a Git that is missing or cannot be started included: the operation stays `pending` and is committed once
Git works again (the startup pass and the sweep arm it after a restart), and `abandon` is allowed meanwhile. A
permanent failure makes the batch `failed` and its members `commit-failed`; when only some paths are at fault (a path
edited by someone else, an ignored path, a directory where a document belongs) the batch is split: the original is
dissolved, the members that touch a failing path (and, transitively, every member that shares a path with them) become one
new `failed` batch named by its own first member, and the rest is queued to be committed as a new batch. Two live records
never share an id. A failed batch is dissolved, its members queued again with the counter reset, when a new operation on
the same branch overlaps its paths (the new write is folded in), or by `retry`; a failed batch holds only its own paths and
never delays other paths or Specifications. An uncertain outcome is resolved by evidence: a commit that carries the
batch's trailer AND leaves HEAD holding the recorded content of every path completes it; no such commit, HEAD still the
recorded parent and a repository that can take a commit (no `index.lock`) is a retryable failure; anything else is
`recovery-required`. A trailer alone is never trusted. A parent that history has rewritten is read again when no commit
of the batch was started (`commitStartedAt` absent), otherwise the batch needs recovery. With Git turned off the queued
operations complete as `not-applicable` (`git-disabled`) and the files stay; with the checkout gone they become
`commit-failed` (`workspace-missing`). The Engine functions `retryDocumentCommit`, `abandonDocumentCommit`,
and `recoverDocumentOperation` (`resume`, `adopt`, `abandon`) are the actions behind `retry`, `abandon` and `recover`;
`abandon` keeps the files and ends every operation of the batch `completed` as `uncommitted` (reason `abandoned`): each
member's paths are upserted into the ledger first and the operation completes in the same control-lock section, so its
claim is released and its journal settles; a later commit that holds the paths, a manual commit or a hand commit removes the
ledger entries (there is no marker stage and no `resolve`). The operator assertion that an executor whose lease cannot be proven dead has stopped is
`QueueOptions.confirmExecutorStopped` of `runQueueOnce` / `drainQueue`.

**Classification summary and ownership rules.** Permanent (a person decides): a detached HEAD, a changed branch, a
repository without commits, an ignored path, an unreadable index (`index-unreadable`), a protected or not-allowed
branch, a foreign edit (`content-changed`), an invalid Git policy. Transient (waits, then catches up): an index lock, a
busy Git, a timeout, a Git program that is missing or cannot be started, an unmerged index. Git turned off by policy is
not an outage: a queued operation completes `not-applicable` and nothing is retained, no ledger entry. A started commit
is never completed `not-applicable` without decisive evidence: it is resolved by the trailer look-up or goes to
`recovery-required`. The durable batch record decides the fate of its members: the Git-disabled and workspace gates
leave a `queued` member of a `formed` or `committing` batch to the batch, and `abandon` of a waiting operation is
refused while it belongs to such a batch. Working content is read with `lstat` and a size-checked descriptor (raw
limit): a symbolic link, a special file or an over-limit file is never hashed or committed, and Git path facts treat a
working symbolic link and a committed mode `120000` entry as non-blob states. The write preflight cache signature covers
`HEAD`, the index lock, merge, cherry-pick, revert, rebase and sequencer state, the root `.gitignore`, the common
`info/exclude` and `config` and the Project Home configuration.

**Rules the queue keeps after a failure.** A failure after the commit was started is checked against the repository
before it is called transient: a commit that carries the batch's trailer and holds the whole batch is recorded with its
sha, whatever the failure was (a timeout, an error of the queue's own storage, Git turned off meanwhile). Only a failure
that comes before any commit (the port's own blockers) or one with proof that nothing was committed is retried; a
repository that cannot be asked, or a Git process that may still run (`not-terminated`), leaves the batch for recovery.
Attempts are counted per member and a batch counts as many as its freshest member, so a new save that joins members that
failed before keeps its full set of attempts. A failure is recorded only while the batch still belongs to the executor
that reports it, and a lease is released only by the batch it names. A Git that cannot be found is permanent; one that
could not be started for want of descriptors, processes or memory passes. A queued operation whose plan cannot be read is
failed alone (`plan-invalid`, abandon or retry it); a write in progress whose plan cannot be read holds back the queue
without throwing. Operations that wait for a person do not count against the 200 of the queue; 1000 of them end new saves with `SPEC_BUSY` (`held-limit`), which is not retryable. A repeat of the same action on an
operation that is already where the action would put it (`retry` on a queued or finished operation, `abandon` on an
abandoned one, `recover` on a recovered one) answers with that state; every other mismatch
stays `DOCUMENT_OPERATION_STATE_INVALID`. `recover --resume` on a batch that was only partly committed by hand is
`recovery-unresolved`: the exits are `abandon`, or finishing the commit by hand and then `adopt`. A save on another branch
than a failed batch holds waits as `queued` without a `waitMs` (the sweep of the scheduler covers it); it is not marked as
blocked.

**Commit states** (`pending`, `committed`, `failed`, `uncommitted`, `not-applicable`) are derived from the journals.
`failed` keeps the files; `retry`, `abandon`, `flush` or the next overlapping save resolve it; `recovery-required` is
resolved by the operator command. `abandon`, like auto-commit off, ends `uncommitted`: the paths are in the ledger (ADR 0018).

**Where the queue lives.** In persisted journals, a batch record and a per-checkout lease record under the Project Home
engine operations directory, not in memory. Every claim and transition is read, compare and write under the control
lock (not a hardware compare-and-swap). The control lock is never stolen: a holder killed by SIGKILL stalls document
operations (and Create) until an operator clears it (see the operator takeover below). Executors are identified by PID, host, PID namespace, process
start time and boot id; automatic takeover needs a dead proof (same host and namespace and the PID absent or with a
different start time, or a different boot id), otherwise an operator assertion.

**Interaction with other operations.** Create and other path-limited commits are unaffected. Another checkout has its
own queue, branch and HEAD. Git deadlines: read 10 s, mutation 30 s plus 3 s grace, batch attempt 150 s; children are
killed as a process group (tree on Windows).

**Scheduler.** The Engine owns one scheduler per Engine (Project Home); it has no transport and no
process signals (`createDocumentQueueScheduler`, `specs/documents/scheduler/`). A host creates and starts it: the
Runtime after its listener is up; the one-shot CLI commands start none and drain explicitly. Rules:

- A finished write (`applyDocumentChange`, `resumeDocumentChange` ending `queued`) announces itself in process; the scheduler
  of the same Project Home state root arms one timer per checkout at the settle period (300 ms). A timer that is already
  due earlier is kept, so a burst keeps one timer.
- A pass is `drainQueue`. What the queue reports decides the next timer: `idle.waitMs` (settle left, or the backoff of a
  failed attempt) re-arms at that time; a re-queued attempt asks again at once and then learns its backoff; `busy` (another
  executor, or a second run of this process) retries with the queue backoff capped at 30 s; an empty or blocked queue arms
  nothing.
- At most one pass per checkout runs at a time; a wake-up during a pass runs one more pass afterwards. The queue's process
  wide lease mark backs this up for explicit runs of the same process.
- Every 30 s a sweep lists the active journals and arms the checkouts that have `queued` or `committing` work and no timer.
- The startup pass rolls interrupted writes (`reserved`, `files-writing`) forward through `resumeDocumentChange` (the
  writer judges the recorded executor: a live one is refused, a dead one is taken over) and arms every checkout with queue
  work at once. A restart inside the settle window therefore waits the rest of the settle again; an operation older than the
  maximum hold is eligible at once. There is no scan at first document access: Runtime start, the 30 s sweep, `flush` and
  Close cover it.
- An error of a pass is recorded (name only, never a path) in a ring of the last 50 events and published on the
  diagnostics channel `nevo.specflow.engine.document-scheduler`, and the checkout is retried with the queue backoff (1 s
  doubling to 60 s). The queue gives its claim back before an error escapes a pass, so no lease is leaked.
- All timers are `unref`'d: the scheduler never keeps a process alive. The timers and the monotonic clock are seams, and a
  disabled scheduler (`disabledDocumentQueueScheduler`) does nothing.
- `stop({ flush, deadlineMs })` cancels every timer and starts no further pass, waits for passes in flight, then (with
  `flush`) commits everything queued, ignoring the settle period, within the deadline (default 10 s). A commit already
  running is not cancelled. When the deadline passes the journals stay `queued` or `committing`; the next executor finishes
  them (dead proof, or the operator assertion). The outcome reports `complete`, `timedOut` and the operations `remaining`.
  A stopped scheduler is not started again; create a new one.

**Shutdown.** The Runtime (`startRuntime`) closes the server first, so that requests in flight have queued their writes,
then calls `stop({ flush: true, deadlineMs: 10 s })`; SIGTERM and SIGINT reach it through the `start` command. A CLI
command that writes documents calls `flushAllDocumentCommits(engine, { deadlineMs })` before it exits.

**Close and the document queue.** `reserveCloseOperation` (and so every Close use case) does this at
first admission, in this order:

1. The pure preview. If it refuses with `CLOSE_PREFLIGHT` (a dirty tree may be Nevo's own queued documents), every
   checkout with queue work is flushed and the preview runs once more; if it still refuses and a document journal holds the
   source checkout or the primary checkout, the answer is `DOCUMENT_COMMITS_PENDING` instead. The preview and the preflight
   themselves never flush or write.
2. The flush of every checkout the plan owns (the source and, when it is another checkout, the target that is the
   integration destination), one after the other, ignoring the settle period, with a wait cap of 30 s per checkout when
   another executor keeps the queue.
3. The claim check: when document journals still hold one of those checkouts the Close is refused with
   `DOCUMENT_COMMITS_PENDING` (409), `details.cause` `commit-pending` (queued, committing, or a write in progress),
   `commit-failed` (`commit-failed` or `recovery-required`) or `commit-uncommitted` (the ledger still holds paths of the
   checkout after the flush pruned the entries a commit now holds). The first cause in that order wins.
4. The control lock. A save that slipped in between the flush and the lock holds a claim, so the in-lock claim check refuses
   with `CLOSE_CONFLICT`.

Precedence is therefore `DOCUMENT_COMMITS_PENDING`, then `CLOSE_CONFLICT`, then `CLOSE_PREFLIGHT` (a dirty tree that
no document journal explains). A Close that was reserved earlier is read back without any of this. A Create with an
integration destination requests `checkout:<destination>` and conflicts with the document claims of that checkout like a
Close does (`CREATE_CONFLICT`). A Git-disabled project queues nothing, so the flush returns without asking Git.

**Operator takeover.** The control lock is never stolen by age, PID or timeout. `takeOverDocumentQueue`
(`--confirmed-stopped` of the recover command) is the operator's answer to a stopped Runtime on platforms where the Engine
cannot prove the holder dead (Windows, macOS, containers without procfs). It needs the explicit assertion
`confirmExecutorStopped`; without it nothing is touched. It then:

1. clears the control lock (`takeOverProjectControlLock`) only when the lock is a regular file and the holder is provably
   not running on this host: the recorded PID is absent (`kill(pid, 0)`), or it is the PID of this process and the lock
   was written before this process started (a restarted container) while this process does not hold it, or the metadata is
   unreadable and the file is at least a minute old. A live PID, a lock this process holds, a lock written by this
   process after it started (a sibling thread may hold it) and a lock that changed while it was judged are refused, and a
   refusal ends the command. The record carries no host, so the assertion is also the statement that the Project Home is not
   shared with another machine; a recycled PID of an unrelated live process needs a person to remove the file;
2. rolls interrupted writes forward with `confirmWriterStopped`;
3. drains every checkout with queue work, flushing, with `confirmExecutorStopped`: a lease or `committing` batch whose
   executor cannot be proven dead is taken over, a live one is reported `busy` and left alone.

**Foreign edits.** `expectedRevision` is the on-disk hash, so a pending version is the baseline of the next save.
A pending path changed by another writer is `content-changed` at commit time, never committed silently.

## Commit policy, the uncommitted-changes ledger and manual commit

Governing decision: [ADR 0018](../decisions/0018-engine-commit-policy-and-manual-commit.md). Push and publishing remain out of scope ("Future: push" in the ADR).

**Policy.** `git.commits.auto.documents` (committed `.nevo/config.yaml`, overridable in `.nevo/local/config.yaml`, default
`false`: nothing is committed automatically unless the configuration enables it, and there is no per-request override; the closed key set grows with each capability that adopts it). The Create scaffold commit and the commits of
`init` and `definitions install` are never governed by it. The effective mode is pinned in each operation's journal at
admission; a change affects new operations only (a non-empty queue drains normally; a non-empty ledger is never
committed silently).

`parseCommitsPolicy` accepts `auto` (a closed set of boolean capability keys, `documents`);
`parseGitWorktreePolicy` reads the local `git.commits.auto` (the only local `git.commits` key) and `effectiveAutoCommit`
returns the value with its source (`project`, `local`, `default`); an invalid value or an unknown key is
`GIT_POLICY_INVALID`, also while Git is disabled (the setting is then inert: nothing is committed, writes complete
`not-applicable`). The mode is pinned in the journal as `commitMode` (`auto` with the pinned `commit.branch`, or `manual`
without a commit; absent while Git is disabled). Manual-mode and queued operations never share a path state: the ledger holds
the first, the queue the second. The reservation counts the ledger's paths plus the ones of manual writers still in
flight and refuses the 201st distinct path with `DOCUMENT_UNCOMMITTED_LIMIT` before anything is written. The journal stage
`abandoned` does not exist as a stage or a commit state (`completed` with outcome `uncommitted`, state `uncommitted`).

**Auto-commit off.** The write is the Git-disabled path with Git present: admission without the commit `preflight`, files
written at once, no queue, the operation completes `uncommitted` (reason `auto-commit-off`) in the same control-lock
section that upserts the ledger; its claim is released and its journal moves to `settled/`.

**The ledger** (generic, `specs/durable/ledger/`): one durable record per checkout and owner (`specification`,
`definitions`, later `task`, `review`) of the paths the Engine changed and did not commit, each with the post-image
sha256 (or `absent`), the producing operation ids (at most 50 kept) and the pinned branch. `abandon` writes the same
entries. It holds no claim. A record is `engine/operations/ledger/<workspaceId>/<owner>.json`, published by atomic rename
under the control lock and read lock-free; entries are `{ path, postSha256 | null, operationIds, operationCount,
recordedAt, reason }` and the record pins `branch`, `head` and `workspaceRoot`. It is pruned when entries equal `HEAD`
(after a queued batch commits, a flush, a hand commit seen by the 30-second sweep, a manual commit or the Close flush): the
read-only effective-set read runs outside the lock and an entry is removed only if it is still the one judged. It is the only source of what a manual commit may include. Its revision is
the sha256 of the sorted `path:postSha256` list.

**Manual commit** (`manual-commit` operation): same commit port, lease, `checkout-scoped` claim and journal store as a
queued batch. Scope `specification | definitions | all`; an optional path subset closed under shared operation ids; the
effective set is the ledger paths of the scope that differ from `HEAD`; any ledger path edited since its post-image, or a
changed branch, refuses the whole request (`MANUAL_COMMIT_CONFLICT`); the message is user text, validated and neutralised,
plus the Engine trailers; author per ADR 0013. **It is not `git commit -a`**: no path outside the ledger is ever
committed. States: `reserved` -> `committing` -> `completed` (`committed` or `nothing-to-commit`), `failed` (no effect),
`recovery-required`; order commit, verify, prune, complete; each step idempotent, resumed by the trailer lookup.

`specs/manual-commit/` is a journal kind of the durable core (`engine/operations/manual-commit/`,
`settled/`, a payload holding the ledger snapshot and the message, 16 KiB) with the stages `reserved`, `committing`,
`completed`, `failed` and `recovery-required` of its own. The checkout lease moved to `specs/durable/lease.ts` (the record, the
in-process mark and the dead proof; the queue binds it to its error vocabulary), so the queue and the manual commit exclude each
other through one file. The module imports no other Specification slice: the composition `documents/manual-commit.ts` resolves the
target (a Specification, the definitions, or a checkout) and supplies the ports (the claim check, the flush of the queue,
the quiet check of the paths). Admission order: Git enabled, queue at rest after a flush, ledger not empty, `ledgerRevision`, subset
closure, pinned branch, port preflight, no path edited since its post-image; the reservation re-reads the ledger under the control
lock and starts over when it moved. The reservation holds the checkout claim and the paths (a write of them is `SPEC_BUSY`) until
the journal ends. Execution takes the lease, records `parentHead` and the executor, records the start of the commit before Git
runs, commits the effective set through the port (kind `manual-commit`, a multi-line sanitised body, the paths in a pathspec
file), proves the commit holds every post-image, prunes the ledger entries as judged at the reservation, completes the journal and
releases the lease. A repeat finds its own commit by the `Nevo-Operation` trailer, accepts it only when it is the whole snapshot
and HEAD holds it, and never commits twice; a failure that does not prove the commit never ran waits for `recover`. Journal edges:
`reserved` to `committing` or `failed`; `committing` to itself (a new executor, the start of the commit), `completed`, `failed` or
`recovery-required`; `recovery-required` to `committing` (resume), `completed` (adopt) or `failed` (abandon).

**Interaction.** Close refuses while the ledger of any checkout of its plan is non-empty after the flush and prune
(`DOCUMENT_COMMITS_PENDING`, cause `commit-uncommitted`). `SPEC_MANIFEST_DIRTY` is judged against the post-image of the
latest operation in flight, else the ledger post-image, else `HEAD` (a manifest that equals `HEAD` also passes a ledger
entry that no prune removed yet); a foreign edit is a hash mismatch. Policy flips: `on -> off` lets queued work drain with its
pinned mode and makes later writes `uncommitted`; `off -> on` commits nothing, the entries stay until a later `auto` write
of the path commits it (and prunes) or a manual commit. `init` and `definitions install` register the paths they commit
in the `definitions` owner before the commit and prune after it, so what an interrupted install leaves is known. With the policy on, a manual commit needs an empty queue for the scope (after a flush);
with it off it is always available once queued work has drained.

## Windows-hosted paths

Observed on Windows CI: Create accepted a document at the segment limits (a 200-byte folder segment plus a 200-byte
file name), then the Engine's `git add --intent-to-add` failed (`COMMIT_FAILED`, reason `intent-to-add`) because the
absolute path exceeded the Windows limit, leaving a stuck journal. **Decision: the Engine MUST refuse such a path at
admission instead of enabling long paths.** Reason: Git for Windows long-path support (`core.longpaths`) and the Windows
long-path opt-in are per-user or per-repository settings the Engine does not own and cannot verify; a refusal is
deterministic and testable. Rule: on `win32`, if `length(workspaceRoot) + 1 + length(relative path)` exceeds 240
characters, reservation fails with `DOCUMENT_PATH_INVALID` (`details.cause: 'path-too-long'`) before any journal or file
exists. The same rule applies to Create (scaffold and added documents) and to every write target path (create, rename,
move, classify of a file whose new path is longer, folder expansion). Engine temporary files use a fixed short name
(at most 16 characters) in the target directory so they never exceed the bound. The bound is in "Limits". Other
platforms do not apply the rule.

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
