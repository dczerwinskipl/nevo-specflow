---
id: architecture.runtime.document-manifest-and-registry
type: architecture
title: Document manifest, registry, identity and validation
status: current
scope: specflow
areas: [runtime, workflow, server]
read_when:
  - changing specification.yaml, document IDs, registration, folders or path validation
  - reviewing Task document containers, content kinds or missing/unclassified files
summary: >-
    Engine-owned Specification/Task manifest identity, registration, path safety, content kinds, validation results and Windows path refusal.
related:
  - architecture.runtime.specification-documents
  - architecture.runtime.document-definitions
  - architecture.runtime.document-limits
  - adr.0015-specification-manifest-as-document-registry
---

# Document manifest and registry

## Manifest schema (`specification.yaml`)

```yaml
id: <slug> # existing
key: nevo-12 # optional: <prefix>-<number>, given by Create (one more than the highest key of the project)
spec_id: <uuid> # existing
title: <string> # existing
status: draft # existing
priority: 10 # existing, optional
created: 2026-10-23 # existing, optional
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
    baselineRevision: <sha256> # optional, Engine-written: the initial content it wrote (template or generated)
folders: # OPTIONAL: explicit folders that may hold no file (see below)
  - research
```

Parser rules (strict, `SPEC_SOURCE_INVALID` otherwise; no alias, no default, no legacy fallback):

1. `type` and `tasks` (old fields) are not read; Tasks are registered in the reserved `tasks/index.yaml`
   ([ADR 0024](../decisions/0024-tasks-are-resources.md)). A manifest lacking `archetype` or `documents` is invalid.
2. `archetype` and each `documents[]`/`requirements[]` entry accept only the keys above (unknown keys rejected).
   Unknown **top-level** keys are tolerated and preserved on rewrite.
3. `documents[].id` matches `^[a-z0-9][a-z0-9-]{0,63}$`, is unique, and MUST NOT start with `u-` (reserved for
   derived ids of unclassified files). `type` matches `^[a-z][a-z0-9-]{0,31}$`; it need not exist in the current
   catalogue (a retired type stays valid and is shown by id).
4. `documents[].path` is a normalised portable relative path (see "Paths"); paths are unique ignoring case, and a registered file path is never an ancestor folder of another registered path.
   - `documents[].baselineRevision`, when present, is a lowercase sha256 hex digest: the revision of exactly the bytes of the document's **baseline**, the initial content the Engine itself wrote.
   - Three sources are kept apart: a _template_ is where initial content can come from (an archetype template, at Create or by a create naming a `templateId`); a _generated baseline_ is content the Engine generates at creation (a Task's `task.md` from its title and summary, `task.yaml` carrying the same field); _authored content_ is what a person or an agent writes.
   - Template and generated content are both a baseline: one field, one rule for Specification and Task documents.
   - The Engine records the field in the same change as every write of baseline content, and a write of the Engine that regenerates such content records the new revision the same way, so a system rewrite never makes a document authored (no such rewrite exists today: a Task metadata edit does not touch `task.md`).
   - Rename and move keep it; nothing else writes it.
   - A created document with given content (including a Task's `task.md` given at creation) records none.
   - The read's **content state** (`contentState`) of a registered document with a file is `baseline` exactly while its current revision equals the record, else `authored`, so the check costs no read beyond the revision the documents section computes anyway.
   - Archetype templates are not offered for Task documents.
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

## Identity, paths and the registry

### Document identity

- **Registered:** `documentId` survives move/rename and is never reused. First ID of a type is `<type>`; later IDs append a lowercase-base32 SHA-256 suffix from `<specId>:<registry position>` (6 characters, extended on collision). Create replay is deterministic; later operations journal allocated IDs.
- **Unclassified:** derive `u-<first 32 hex sha256(exact case-sensitive path)>`. Stable until rename/classification, which returns a registered ID. A residual 128-bit collision fails closed (`SPEC_SOURCE_UNAVAILABLE`).
- **Case collisions:** list `A.md` and `a.md` as distinct on case-sensitive volumes but flag `path-case-collision`; refuse create/rename/move onto case-insensitively duplicate paths.
- **Case-only rename:** accepted on case-sensitive filesystems. On case-insensitive filesystems, write-then-remove would delete the same entry; refuse with `DOCUMENT_OPERATION_INVALID` / `case-only-rename` before writing. Windows also refuses at planning.
- **Detection:** determine aliasing by filesystem, not OS. At reservation and before journaled writes, `lstat` planned existing paths; identical device/inode for a removed and retained path in one directory that does not list both names proves an alias (APFS, NTFS, WSL, SMB, 8.3 and Unicode variants). If `ino=0`, probe a swapped-case path. Two genuinely listed hard links remain valid.
- **After reservation:** case-alias detection yields `DOCUMENT_RECOVERY_REQUIRED` / `plan-invalid` with files untouched.

### Path validation

- **Paths**: POSIX `/`, relative to the Specification directory, at most 500 characters, every segment at most 200 UTF-8 bytes, no leading `/`, no `..`, no empty segment, no segment starting with `.` or ending with `.` or space, none of `\ : * ? " < > |` or control characters, no Windows reserved device name in any segment (with or without extension); folder depth at most 8; uniqueness is case-insensitive.
  - At the Specification root the names `specification.yaml` and `change.yaml` are reserved **ignoring case**: they are never documents and cannot be created, renamed to, or overwritten through the documents layer (`DOCUMENT_PATH_INVALID`).
  - `specification.yaml` is never in the tree.
  - A hand-dropped root entry whose name equals `specification.yaml` or `change.yaml` ignoring case but is not the canonical manifest is not a document problem: the existing Specification listing already fails closed for it (`repository.ts` requires exactly one manifest-named entry, spelled `specification.yaml`), so the tree is never reached; this is documented behaviour, not new.
  - The root folder `tasks/` (ignoring case) is reserved for the Specification's Task resources (`tasks/index.yaml`, `tasks/<id>/`): no document or folder path lies in it (`DOCUMENT_PATH_INVALID`) and the tree never lists it.

### Symlinks and special files

- **Symlinks and special files** are never followed and never listed; such an entry is skipped, counted in `skippedEntries` and reported as the issue `skipped-entry`.
  - The count is a lower bound once the archive count traversal reached its own bound (entries beyond it were not visited; `archive-limit` is reported then).
  - Names with control, format, line or paragraph separator characters (Cc, Cf, Zl, Zp: bidi overrides, C1 controls, zero-width, U+2028), a backslash or bytes that are not UTF-8 are skipped the same way.
  - Close archive refuses a directory that contains a symlink or special file, so this issue means "Close will refuse until it is removed" (see Limits).
  - Opening a file re-verifies the physical path (lstat, `realpath` equality, regular file) before and after open and compares `fstat` identity; `O_NOFOLLOW` (and `O_NONBLOCK`, so a swapped-in FIFO cannot block the open) is used where the platform has it (not on Windows, where the re-verification is the only guard and a swap between the last check and the first read cannot be excluded by the platform; this is a best-effort statement).
  - The descriptor's device and inode must equal those of the checked entry, and the checks are repeated after the open.
  - A regular file with more than one hard link is readable, including a file hard-linked into the directory from outside it: the boundary is the directory entry, not the inode (accepted and tested; a hard link cannot be told apart from the original).
  - Writes use temp file plus rename, which replaces the directory entry and never writes through the link.

### Folder semantics

- **Folders** are derived from file paths plus `folders[]`. Git cannot track an empty directory, so an empty
  folder exists only if it is in `folders[]` (committed with the registry change).

### Derived display titles

- **Display title** is derived, not stored: the first level-1 heading of a markdown text, else the file stem.
  Frontmatter is not consulted.

## Task documents (document containers)

The documents layer serves two kinds of **document container** (`specs/documents/changes/plan/container.ts`): the
Specification, and each Task of it. A container has its own root folder, registry file and required document; the
reads, planners, journal, claims, revision checks, commit queue, commit policy and ledger are the same for both (no
second writer). A Task container's journal and plan carry the `taskId`; its paths are committed with the
Specification's other documents.

| Container       | Root                    | Registry                  | Required document (not deletable or renamable) |
| --------------- | ----------------------- | ------------------------- | ---------------------------------------------- |
| `specification` | `specs/active/<slug>`   | `specification.yaml`      | `overview` (`overview.md`)                     |
| `task`          | `<spec>/tasks/<taskId>` | `task.yaml` `documents[]` | `task` (`task.md`)                             |

#### Task container and mutation scope

- A Task container has no folders: save, batch save, create (typed documents, directly in the Task folder, never
  type `task`, no templates), rename and delete of a document. Folder, move and classify are
  `DOCUMENT_OPERATION_INVALID`. `task.yaml` is reserved. The Task must be listed in `tasks/index.yaml`
  (`DOCUMENT_NOT_FOUND` otherwise).
- A registry change rewrites `task.yaml` through the strict Task manifest parser (it is read back before it is
  stored) and keeps every other field. A document a `task-document` context entry names cannot be deleted.
  `task.yaml` is compared as a whole file under the control lock (re-plan on change). It is not judged
  `SPEC_MANIFEST_DIRTY`: the Specification execution store writes it too, and its writes may be
  uncommitted (auto-commit off, see [Commits of workflow state](document-commit-policy.md#commits-of-workflow-state)).
- Mutual exclusion with the Specification execution store (D03, under the project control lock): a Task document change is refused with `SPEC_BUSY` (`details.cause: task-resource-change`) while that store holds a pending journal that writes the Task's `task.yaml` or documents.
  - The reverse check is `hasPendingTaskDocumentChange(context, specId, taskId)`: true while a document change of the Task is not final (being written, waiting for or in its commit, failed to commit, needing recovery).
  - The store applies it to every change that writes a Task's `task.yaml` or documents (Task edit and removal, status decisions, Breakdown revising a draft, finish effects, a first start): `openWorkflow` wraps the store (`workflow/state/task-document-guard.ts`), which refuses such a change with `WORKFLOW_TASK_BUSY` (`task-document-change`) inside `serialize`, before anything is written.
  - Close's Specification exit gate and Abandon report it as the blocker `pending-task-documents` ([lifecycle](specification-lifecycle.md)).
- The execution store's writes of `task.yaml` are `workflow` operations of the same queue
  ([Commits of workflow state](document-commit-policy.md#commits-of-workflow-state)). A Task registry change queued after one
  plans from the file the store wrote; the batch keeps the first `pre` and the last `post` of the path.
  With auto-commit off both are ledger entries, so a manual commit takes `task.yaml` whole.

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

## Validation results (never stored)

The Engine computes, as a pure function of the registry, the persisted requirements and the observed files:

### Requirement results

- **Requirement result** per requirement: `count` of registered documents of that type whose file exists and is safely readable, and
  `satisfied = count >= minCount`. **Structural completeness** = every requirement satisfied.

### Tree issues

- **Issues** (the tree's `issues[]`): `dangling` (registry entry, file absent; a registered file that is present but unreadable, for example
  replaced by a symlink, is only a `skipped-entry` and is never dangling), `unclassified` (file not
  registered), `requirement-unmet`, `skipped-entry` (symlink or special entry; Close archive will refuse),
  `path-case-collision`, `archive-limit` (Close will refuse; computed by the archive count rule below). None blocks reading or any document operation. Parse-level violations (duplicate id/path, missing overview entry,
  unknown keys) are not issues: they make the manifest invalid.

### Archive admission and completeness

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

## Windows-hosted paths

- Observed on Windows CI: Create accepted a document at the segment limits (a 200-byte folder segment plus a 200-byte file name), then the Engine's `git add --intent-to-add` failed (`COMMIT_FAILED`, reason `intent-to-add`) because the absolute path exceeded the Windows limit, leaving a stuck journal. **Decision: the Engine MUST refuse such a path at admission instead of enabling long paths.** Reason: Git for Windows long-path support (`core.longpaths`) and the Windows long-path opt-in are per-user or per-repository settings the Engine does not own and cannot verify; a refusal is deterministic and testable.
- Rule: on `win32`, if `length(workspaceRoot) + 1 + length(relative path)` exceeds 240 characters, reservation fails with `DOCUMENT_PATH_INVALID` (`details.cause: 'path-too-long'`) before any journal or file exists.
- The same rule applies to Create (scaffold and added documents) and to every write target path (create, rename, move, classify of a file whose new path is longer, folder expansion).
- Engine temporary files use a fixed short name (at most 16 characters) in the target directory so they never exceed the bound.
- The bound is in the [document limits table](document-limits.md).
- Other platforms do not apply the rule.
