---
id: reference.cli.specflow-specification-commands
type: reference
title: Offline Specification CLI commands
status: current
scope: specflow
areas: [cli, runtime]
read_when:
  - using nevo-specflow specs commands
  - checking CLI parity with Engine and HTTP operations
summary: >
  Implemented Engine-backed offline CLI for creation, discovery, Specification archive and
  workspace integration.
related:
  - reference.api.specification-documents
  - adr.0017-definitions-as-project-data
  - reference.cli.nevo-specflow-contract
  - reference.api.specflow-specification-operations
---

# Offline Specification CLI commands

## Available commands

```sh
nevo-specflow specs create --title "Payments" --archetype minimal --json
nevo-specflow specs create --title "Payments" --archetype feature --with behaviour --with ux
nevo-specflow specs create --title "Payments" --archetype minimal --worktree --base-ref HEAD
nevo-specflow specs create --title "Payments" --archetype minimal --worktree --integration-target-workspace-id <uuid>
nevo-specflow specs list --json
nevo-specflow specs resolve <spec-id> --json
nevo-specflow specs close <spec-id> --preview
nevo-specflow specs close <spec-id> --archive-only --yes
nevo-specflow specs worktree close <spec-id> --preview
nevo-specflow specs worktree close <spec-id> --yes
nevo-specflow specs workspace close <workspace-id> --preview
nevo-specflow specs workspace close <workspace-id> --yes
nevo-specflow specs workspace inspect <workspace-id> <operation-id>
nevo-specflow specs close-inspect <operation-id>
```

`specs create` requires `--archetype <id>` (`minimal`, `feature`, `architecture`; there is no default, a missing
option is a usage error naming it). `--with <templateId>` is repeatable (each id once) and selects suggested
documents of the archetype; an unknown archetype or id is `ARCHETYPE_UNKNOWN`. The CLI uses the catalogue of the
installed Engine, so it is current by construction; the output (`--json` or human) lists the created document ids.
Re-running the same `--operation-id` after the catalogue changed may conflict: the archetype version is part of the
operation identity, so a retry after an owner bumped the archetype's `version` is `CREATE_CONFLICT` (known
behaviour, kept on purpose until the identity is reconsidered); finish such an operation with
`specs recover <operation-id>`. The archetypes the CLI can create from are the ones in
`.nevo/definitions` (see [Definitions commands](#definitions-commands)); a project without definitions answers
`DEFINITIONS_MISSING`.

`specs create` additionally accepts `--goal`, `--workspace-id`, `--branch`,
`--operation-id`, `--project-root`, and `--json`. New-worktree-only options require
`--worktree`. The CLI default uses its **verified current checkout** context, whereas an
omitted HTTP Create target means primary; do not conflate these defaults.

Use `--preview` before any destructive Close; mutation requires `--yes`.
Workspace Close takes `workspaceId`, not one of its Specs. Reuse the original
`--operation-id` on retries. These commands work offline; the CLI does **not** call Runtime
HTTP and its local OS-account trust is distinct from authenticated HTTP grants.

Usage errors of nested commands (for example a missing required option of `specs create`) now exit with code **2**
like the top-level ones; they used to end the process with code 1. Operation failures still exit 1.

See `packages/specflow/src/specs/command.ts` for the exact options and operator diagnostics.

## Definitions commands

```sh
nevo-specflow definitions list [--kind <kind>] [--json]
nevo-specflow definitions show <kind>/<id> [--json]
nevo-specflow definitions validate [<folder>...] [--json]
nevo-specflow definitions install [<kind>/<id>...] [--add-missing] [--force] [--dry-run] [--json]
```

All of them accept `--project-root <path>` and work on the definitions of the **Project Home**, also when run from
a linked checkout (which has none of its own). Every human output starts with `Project Home: <path>` and every
JSON object carries `projectHome`, so the folder that was used is always visible. Kinds: `document-type` and
`specification-archetype`.

- `list` prints `<kind>/<id> v<version> - <title>`, the rejected files (`<kind>/<id> - INVALID`) and the problems.
- `show` prints the resolved definition; for a rejected file it prints its problems and fails.
- `validate` runs the loader the Runtime uses, over the project or over the given definitions folders, and fails
  when any problem is an error (warnings alone pass). The problems are those of the Runtime catalogue route.
- `install` copies the shipped defaults. Bare `install` works only while the project has no definitions (any entry
  below a kind folder counts as started); otherwise it refuses and names `<kind>/<id>` and `--add-missing`. A named
  definition brings the definitions it refers to. An existing file that differs is kept unless `--force`. A link, a
  special file or an unreadable kind folder refuses the whole install before anything is written. With Git enabled the
  written files (and any left by an interrupted install) are committed in one Engine commit; a protected or
  not-allowed branch refuses before writing (`BRANCH_PROTECTED`), naming the branch and the ways out: switch to a
  branch Nevo may commit on (for example `git switch -c nevo-specflow/definitions`), install there and merge it, or
  change `git.commits.protectedBranches` / `allowedBranches`; with Git disabled it is a plain write. `--dry-run` prints the plan and
  changes nothing.

Exit codes: `0` success; `1` an operation failure, a refused install, `show` of a missing or rejected definition,
or `validate` finding an error (the output is still printed); `2` a usage error (unknown option, a target that is
not `<kind>/<id>`, targets together with `--add-missing`).

## Document commands

`nevo-specflow specs documents ...` reads and changes the documents of one Specification for external agents and
operators. The commands are thin adapters over the Engine, work offline (no Runtime needed) and resolve the Project
Home like the other `specs` commands (`--project-root <path>` requires a verified root). The write commands take
the same inputs as the HTTP routes of the [documents reference](../api/specification-documents.md): a write names
the revision of what it changes, and an `--operation-id <uuid>` (generated when omitted) makes a retry safe.

| Command                                                                                                                    | Engine function                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `specs documents list <spec-id>`                                                                                           | `readSpecificationDocumentTree`                              |
| `specs documents validate <spec-id>`                                                                                       | `readSpecificationDocumentTree` (completeness, issues)       |
| `specs documents add <spec-id> (--path <p> [--type <t>] (--content-file <f> \| --stdin) \| --template <id> [--path <p>])`  | `applyDocumentChange` (`create`)                             |
| `specs documents folder <spec-id> <path>`                                                                                  | `applyDocumentChange` (`folder`)                             |
| `specs documents save <spec-id> <document-id> --expected-revision <r> (--content-file <f> \| --stdin)`                     | `applyDocumentChange` (`save`)                               |
| `specs documents rename <spec-id> <name> (--document <id> \| --folder <path>) --expected-revision <r>`                     | `applyDocumentChange` (`rename`)                             |
| `specs documents move <spec-id> (--document <id> \| --folder <path>) (--to <folder> \| --to-root) --expected-revision <r>` | `applyDocumentChange` (`move`)                               |
| `specs documents delete <spec-id> (--document <id> \| --folder <path>) --expected-revision <r>`                            | `applyDocumentChange` (`delete`)                             |
| `specs documents classify <spec-id> <document-id> --type <t> --expected-revision <r>`                                      | `applyDocumentChange` (`classify`)                           |
| `specs documents status <operation-id>`                                                                                    | `readDocumentOperationStatus`                                |
| `specs documents flush [<spec-id>] [--wait-ms <ms>]`                                                                       | `flushDocumentCommits` / `flushAllDocumentCommits`           |
| `specs documents retry <operation-id>`                                                                                     | `retryDocumentCommit`                                        |
| `specs documents abandon <operation-id>`                                                                                   | `abandonDocumentCommit`                                      |
| `specs documents recover <operation-id> (--resume \| --adopt \| --abandon) [--confirmed-stopped]`                          | `recoverOperation` (a document operation or a manual commit) |
| `specs documents resolve <operation-id>`                                                                                   | `resolveLedgerOperation`                                     |
| `specs documents recover --confirmed-stopped`                                                                              | `takeOverDocumentQueue`                                      |

Every command accepts `--project-root <path>` and `--json`; every write command also accepts `--operation-id`,
`--wait` and `--wait-ms <ms>`.

- **Revisions.** `--expected-revision` is the `revision` of the document (or of the folder, for a folder
  target) that `list --json` shows. A stale revision is `DOCUMENT_REVISION_CONFLICT`.
- **Templates.** `add --template <id>` renders the template of the Specification's archetype from the project's
  definitions. The path defaults to the template's filename; the type is the template's. The catalogue revision is
  read from the current definitions (`{{goal}}` renders empty: the goal is not stored in the manifest).
- **Acknowledgement and waiting.** A write returns when the Engine acknowledges it, like the HTTP routes:
  files and registry are on disk, the commit is `pending`. `--wait` drains the queue of the Specification's
  checkout first (at most `--wait-ms`, default 30 s) and prints the settled commit. `flush` drains without
  writing; without a Specification it drains every checkout with work.
- **Drain at exit.** A command that queued commits (a write, `retry`, `recover --resume`) calls
  `flushAllDocumentCommits` with the 10 s shutdown deadline before it exits, so a one-shot agent does not leave
  commits behind. What does not finish stays journaled for the next executor and a note goes to stderr; the exit
  code is not affected.
- **Recovery.** `recover` is the only entry for `confirmExecutorStopped`; it has no HTTP route. With an operation id
  it needs exactly one of `--resume`, `--adopt`, `--abandon`; `--confirmed-stopped` asserts that no process of the
  project still runs the document queue (needed where the Engine cannot prove a dead executor, for example
  Windows and macOS). Without an operation id, `recover --confirmed-stopped` is the queue-wide takeover: it clears a
  dead control-lock holder, rolls interrupted writes forward, resumes the manual commits a killed command left holding a
  checkout (`Manual commit <id>: resumed|refused`) and drains every checkout. The same three modes resolve
  a manual commit that needs recovery (see [Manual commit](#manual-commit)); the operation id says which kind it is.
- **Resolve.** `resolve <operation-id>` drops the uncommitted-changes entries of an operation that you dealt with
  by hand: a path that HEAD already holds, or one whose file you edited so that it is no longer the content the
  Engine wrote. An entry whose file still holds the Engine content and differs from HEAD stays listed (it is
  printed as `Still uncommitted:`; commit it with `nevo-specflow commit`); the command exits 1 when nothing could
  be resolved. It never commits and never changes a file.
- **Output.** stdout carries only the result: human lines, or with `--json` one JSON document (`write`
  commands: `operationId`, `specId`, `action`, `documents[{id,path,revision,type?}]`, `removedDocumentIds`, `folders`,
  `commit`, `replayed`; `list`: the document tree plus `specId`; `status`: the operation status of the HTTP
  contract). stderr carries diagnostics, hints and notes.
- **Refusals.** A refusal of the documents layer is printed to stderr as `CODE: message (cause)` followed by
  `Hint: ...` and, with `--json`, stdout also carries `{ "error": { "code", "message", "details"?, "hint"? } }`.
  Hints exist for `SPEC_BUSY` (the `retryAfterMs`, the recover command for `cause: recovery-required`, or the id of the
  manual commit that holds the checkout for `cause: commit-in-progress`),
  `DOCUMENT_COMMITS_PENDING` (flush, retry, abandon; for `commit-uncommitted` `nevo-specflow commit`),
  `DOCUMENT_UNCOMMITTED_LIMIT` (commit the uncommitted changes), `DOCUMENT_RECOVERY_REQUIRED` (recover), the
  `MANUAL_COMMIT_*` codes (see below) and `DOCUMENT_REVISION_CONFLICT`, `CATALOGUE_STALE`, `DEFINITIONS_MISSING`,
  `ARCHETYPE_UNKNOWN`.

Exit codes: `0` success; `1` a refusal of the documents layer, any other operation failure, `validate` finding an
invalid Specification, a `flush` or `--wait` that did not settle, or a refused takeover; `2` a usage error (a
missing or conflicting option, an unknown command, a malformed `--operation-id`).

## Manual commit

[ADR 0018](../../architecture/decisions/0018-engine-commit-policy-and-manual-commit.md): with auto-commit off (or
after `abandon`) the Engine leaves its edits uncommitted and records them in a ledger. `nevo-specflow commit` commits
exactly those paths with your message, through the same commit port, lease and claims as the commit queue, and never
anything else (it is not `git commit -a`). The HTTP route is `POST /api/specs/:specId/commit`
([documents reference](../api/specification-documents.md#commit-policy-uncommitted-changes-and-manual-commit)); the
`definitions` scope is the command line's alone.

```sh
nevo-specflow commit status --spec payments
nevo-specflow commit --spec payments -m "Update the payment notes" -m "They match the review."
nevo-specflow commit --spec payments --path specs/active/payments/notes.md --path specs/active/payments/specification.yaml
nevo-specflow commit --scope definitions
nevo-specflow commit --scope all --spec payments --json
```

| Command                                                                                                                                                                             | Engine function        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `commit [--scope specification\|definitions\|all] [--spec <slug\|id>] [-m <text>]... [--path <p>]... [--ledger-revision <r>] [--operation-id <uuid>] [--project-root <p>] [--json]` | `manualCommit`         |
| `commit status [--scope ...] [--spec <slug\|id>] [--project-root <p>] [--json]`                                                                                                     | `readUncommittedScope` |

- **Scope.** `--spec` names a Specification by slug or UUID; with it the scope is `specification`. `--scope all` covers
  every ledger owner of the checkout of `--spec` (or of the project without it), definitions included.
  `--scope definitions` commits the definitions of the Project Home that an interrupted `definitions install` left.
  Without `--spec` and `--scope` the command is a usage error.
- **Message.** `-m` is repeatable (each is a paragraph, like Git). The first line is 1 to 100 characters, the whole
  body at most 2000, and a NUL is refused; other control characters are removed and any line that looks like an Engine
  trailer (`Nevo-...:`) is quoted with `> `. Without `-m` the Engine writes `spec(docs): manual commit <slug>` or
  `definitions: manual commit`. The Engine appends its own trailers (`Nevo-Operation`, `Nevo-Kind: manual-commit`,
  `Nevo-Action: manual-commit`, `Nevo-Scope`, and `Nevo-Spec` / `Nevo-Documents` where they apply).
- **Subset.** `--path` commits only the listed paths; the subset must be closed under shared operations (a file and the
  registry change of the operation that wrote it travel together) or the command refuses with the closure it needs.
  `--ledger-revision` refuses unless the list is still the one you read (`commit status` prints it).
- **Safety.** A listed path that was edited after the Engine wrote it, or a checkout on another branch than the one
  the changes were made on, refuses the whole request (`MANUAL_COMMIT_CONFLICT`); a protected branch is
  `BRANCH_PROTECTED`; while document commits of the scope are pending, failed or need recovery the command is
  unavailable (`MANUAL_COMMIT_UNAVAILABLE`, flush, retry or abandon them first). An operation id makes a retry safe:
  the same id and request answer the stored result.
- **Output.** stdout carries only the result: `Committed <sha12> (<n> files)`, the files and `Remaining uncommitted:
<n>`, or `Nothing to commit: every path already equals HEAD.`; with `--json` one document with `operationId`,
  `scope`, `specId?`, `commit`, `paths`, `remaining { entries, ledgerRevision }` and `replayed`. `commit status`
  prints the scope, the policy and its source, the ledger revision, the paths (`reason`, number of operations, owner)
  and the queue counts; `--json` prints the view of `GET /api/specs/:specId/uncommitted` with an `owner` per entry and
  the `scope`. A refusal is printed like the document commands do (`CODE: message (cause)`, `Hint: ...`, and with
  `--json` `{ "error": { ... } }` on stdout).
- **Recovery.** A manual commit whose Git outcome cannot be proven is `MANUAL_COMMIT_RECOVERY_REQUIRED`; resolve it with
  `specs documents recover <operation-id> --resume|--adopt|--abandon` (`--abandon` leaves the ledger as it is).

Exit codes: `0` committed, or nothing to commit, or a listing; `1` a refusal or any other failure (including
`MANUAL_COMMIT_RECOVERY_REQUIRED`); `2` a usage error (no scope, `--scope specification` without `--spec`, `--spec`
with `--scope definitions`, an unknown scope, a malformed `--operation-id`).
