---
id: reference.cli.nevo-specflow-contract
type: reference
title: nevo-specflow public CLI contract
status: current
read_when:
  - checking which nevo-specflow commands actually exist today
  - describing the product CLI to a user or in product copy
  - planning a new nevo-specflow command
summary: >
  The currently implemented nevo-specflow CLI: version, init, project, specs (including documents),
  commit, definitions, docs, start (UI and Runtime API) and auth, plus commands not implemented yet.
related:
  - docs.product-specflow-cli-readme
  - engineering.cli.architecture
  - engineering.repository.product-packaging
---

# `nevo-specflow` public CLI contract

|                |                  |
| -------------- | ---------------- |
| **Product**    | Nevo SpecFlow    |
| **Package**    | `@nevo/specflow` |
| **CLI**        | `nevo-specflow`  |
| **Repository** | `nevo-specflow`  |

## Implemented today

```bash
nevo-specflow --help        # usage and the command list; exit 0
nevo-specflow --version     # the installed product version, carried in the artifact; exit 0
nevo-specflow init                                       # initialize .nevo project/local configuration and seed the default definitions
nevo-specflow project inspect|bootstrap                  # show the Project Home and current workspace; designate an uninitialized primary checkout
nevo-specflow specs ...                                  # Engine-backed Specifications, worktrees, workspaces and documents (offline)
nevo-specflow commit [status]                            # manual commit of the uncommitted changes the Engine recorded
nevo-specflow definitions list|show|validate|install     # the project's archetype and document type definitions
nevo-specflow docs list|find|get|context|check           # discover and validate the project documentation
nevo-specflow start [--demo]                             # serve the local SpecFlow UI and Runtime API; exit 0 after shutdown
nevo-specflow auth hash-password --password-stdin        # hash one password line from stdin
```

- `--version` prints the version baked into the installed build (from the repository's
  release model). It does not depend on any file outside the installed package.
- An unknown command or bad usage exits non-zero with usage on stderr; usage errors of nested
  commands exit with code 2 like the top-level ones.
- `init` discovers the Git repository root, creates committed `.nevo/config.yaml` plus ignored `.nevo/local/config.yaml`, ensures `.nevo/local/` is in `.gitignore`, and interactively configures no-auth, password, or OIDC authentication. New password users use their username as their user id; additional login identities explicitly choose New user or Existing user. OIDC profile data is provider-owned and is not entered manually. Password secrets are hashed internally and OIDC client secrets are written only to local config. When the owner enables Git, `init` also asks for the integration target, the worktree branch pattern, the local worktree folder, the protected branches (suggesting the local `main` and `master`, plus custom patterns validated by the Engine) and "Commit documents automatically?" (default no; a yes writes `git.commits.auto.documents: true` to the local config). It writes `git.commits.protectedBranches` to the project config only when something is protected; see `reference.configuration.specflow-git-worktrees`. It then asks "Enable semantic documentation search?" (default no); a yes asks for the embedding endpoint, model and optional API key variable name, probes the endpoint and writes `docs.search.semantic: true` to the project config and `ai.embeddings` to the local config even when the probe fails (the review then reports it as configured but unavailable); see `reference.configuration.documentation-and-embeddings`. `init` also installs the default definitions into `.nevo/definitions` (before it writes the configuration marker; they are removed again if init fails) and, with Git enabled, commits them with one Engine commit; on a protected or not-allowed branch it offers to create the branch `nevo-specflow/definitions` at the current commit, switch to it and commit them there (the protected branch is never committed on; the person merges that branch), or to go on without them (the review then says that Create needs them and how to install them later); the offer is not made when the policy protects that branch too or it exists. It skips them with a note where Nevo may not commit for another reason (detached HEAD, no commits) and with `--no-definitions`. A repository whose `.git/nevo-specflow-instance.json` (the Git instance evidence of an earlier project) exists without a designated Project Home is refused before anything is asked, naming the file and the explicit recovery (move it aside once that project is gone); a designation that fails after the configuration was written names the recovery `nevo-specflow project bootstrap`. Nothing is removed or reset automatically.
- `project inspect [--project-root <path>] [--json]` prints the verified Project Home, project id,
  current workspace and state root. `project bootstrap` explicitly designates the uninitialized
  primary checkout as Project Home.
- `start` is defined by the Runtime vertical (`@nevo/specflow-runtime/cli`) and composed into the
  shell. It opens the Engine for the current checkout, loads Runtime configuration, starts the
  Fastify HTTP server with the built SpecFlow UI on the same origin, prints
  `Nevo SpecFlow available at <address>` (and one hint line when the project has no usable
  definitions), and owns graceful shutdown through the CLI process signal. It fails when the UI
  assets are missing from the installed build. `start --demo` serves explicit demonstration data
  instead of project sources.
- `auth hash-password --password-stdin` is owned by the Runtime auth feature. It reads
  exactly one password line from stdin and prints a supported scrypt hash for the local
  Runtime configuration; the plaintext password is not accepted as a command argument.

## Specification, document, commit and definition commands

The [Specification CLI reference](specflow-specification-commands.md) owns the exact options and
outputs of:

- `specs create`, `list`, `resolve`, `recover` (an interrupted Create), `close`, `close-inspect`,
  `close-reconcile-scratch` (operator reconciliation of a removed conflict scratch before a new
  Worktree Close), `worktree close`, and `workspace close|inspect`;
- `specs documents ...` (list, validate, add, folder, save, rename, move, delete, classify, status,
  flush, retry, abandon, resolve, recover);
- `commit` and `commit status`;
- `definitions list|show|validate|install`
  ([Definitions commands](specflow-specification-commands.md#definitions-commands)).

## Documentation commands

`nevo-specflow docs list|find|get|context|check` are implemented; see [`nevo-specflow docs` commands](nevo-specflow-docs.md).

## Not implemented

`status`, `workflow`, `install`, `update` and any other unlisted command are **not**
present — not in `--help`, not as hidden commands. They are future direction only.
Product copy and docs must not describe them as available.

## Stability

Pre-1.0: the surface above can still change, but changes are intentional, marked, and
documented (see [pre-1.0 policy](../../architecture/repository-structure.md#0x-policy)).
The output contract (clean stdout, diagnostics on stderr, `0` / non-zero exit) follows
[CLI architecture](../../engineering/cli/architecture.md).
