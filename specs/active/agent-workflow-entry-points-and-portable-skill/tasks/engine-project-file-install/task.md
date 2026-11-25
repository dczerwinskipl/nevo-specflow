# Engine project-file install and commit

## Goal

The Engine writes and commits the product's skill wrappers in the Project Home under its own commit,
lock and ledger rules, and commits an `init`'s definitions and wrappers together (architecture.md S3,
S4; ADR 0013: only the Engine commits).

## Scope

- New Engine `project-files/`: `writeProjectFiles` (write only) and
  `installProjectFiles(engine, { purpose: 'skill', files })` built on it, with each file
  `{ path, bytes, expected }`. The checks and their order are S3 steps 1 to 5: the purpose's path
  allowlist (the two `SKILL.md` paths), no link or special file at the path or any parent inside the
  Project Home, the protected or not-allowed branch refusal before writing, the re-check of every
  `expected` under the project control lock and the execution-claim admission (`SPEC_BUSY`,
  `PROJECT_FILE_CHANGED` refuses the whole install and writes nothing), then write, ledger, commit.
- The error code `PROJECT_FILE_CHANGED` where Engine error codes are published.
- Commit kinds in `version-control/commits/port.ts`: `skill-install` (subject `skill(install): N files`)
  and `project-init`. Paths left uncommitted by an earlier install are committed with the next one.
  With Git disabled, files are written without a commit.
- Ledger owner `{ kind: 'skill' }` in `LedgerOwner`, `ledgerOwnerOfKey`, the uncommitted holds and the
  manual-commit owners, so Close refuses while a wrapper is uncommitted, as for definitions. The
  design does not fix which `nevo-specflow commit --scope` reaches `skill` paths. `all` must, and the
  CLI reference records the choice.
- An Engine function that commits an initialization: the definitions paths and the wrapper paths in one
  `project-init` commit, with the ledger record keeping each group under its owner (`definitions`,
  `skill`). It sits beside `commitInstalledDefinitions`, which `init` calls today. The `init` changes
  themselves are Task `init-installs-skill`.
- Docs: the commit kinds in ADR 0013's references, and the ledger owners in ADR 0018's references
  (`architecture.runtime.document-commit-policy` where it lists them).

Out: rendering or classifying wrappers. Those are the CLI's (Task `skill-source-and-commands`).

## Verification

Engine tests (integration over a temporary Git repository where the behaviour needs Git):

- a path outside the allowlist is refused, and so is a link or special file at the path or at a parent;
- a protected branch refuses before anything is written;
- `SPEC_BUSY` while an execution claim holds the project;
- an `expected` that no longer matches gives `PROJECT_FILE_CHANGED` and writes nothing;
- a successful install makes one `skill-install` commit with the subject above, and the next install
  also commits paths an interrupted one left uncommitted;
- Git disabled: the files are written and no commit is made;
- the ledger owner `skill` holds Close while a wrapper is uncommitted;
- the initialization commit is one `project-init` commit holding both groups under their owners.

## Planning notes

Work kind: backend. Recommended profile: `nevo-agents:implementer`.
