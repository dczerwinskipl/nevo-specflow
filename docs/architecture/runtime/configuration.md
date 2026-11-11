---
id: architecture.runtime.configuration
type: architecture
title: Project configuration and local state
status: current
read_when:
  - adding or moving SpecFlow configuration
  - deciding whether a setting is committed or workstation-local
  - adding Runtime-owned local persistence
  - adding a local cache or index
summary: >
  Nevo SpecFlow uses one .nevo namespace: committed project configuration and definitions,
  ignored workstation-local configuration, persistent application-owned local state and a
  disposable local cache.
related:
  - adr.0017-definitions-as-project-data
  - adr.0020-documentation-discovery-is-a-product-capability
  - adr.0021-product-neutral-ai-semantic-search-engine
  - docs.architecture-runtime-readme
  - architecture.runtime.ownership-and-lifecycle
  - reference.cli.nevo-specflow-contract
  - architecture.runtime.endpoint-policy
---

# Project configuration and local state

Nevo SpecFlow uses one repository namespace:

```text
.nevo/
├── config.yaml                 # committed product configuration container
├── agent-instructions.md       # committed
├── agents/                     # committed definitions/instructions
├── definitions/                # committed definitions (ADR 0017): document types, archetypes,
│                               #   workflows, agent archetypes, task types (ADR 0019)
└── local/                      # entirely Git-ignored
    ├── config.yaml             # workstation/operator configuration + secrets
    ├── state/                  # persistent application-owned local data; must not be deleted
    └── cache/                  # disposable, rebuildable data; safe to delete
```

The canonical ignore entry is:

```gitignore
.nevo/local/
```

Do not introduce a sibling `.nevo-local/` namespace.

`.nevo/local/` has exactly these three top-level entries. A capability that needs local data adds a
subdirectory inside `state/` or `cache/` (for example `cache/docs-index/`). It MUST NOT add another
top-level entry under `.nevo/local/`, another ignore entry, or a setup step for its directory: the
single ignore entry already covers it, and the capability creates its subdirectory on first use.
`nevo-specflow init` writes that entry. A capability that can write below `.nevo/local/` in a
project `init` has not set up (the documentation search cache, see
[documentation and embeddings](../../reference/configuration/documentation-and-embeddings.md#documentation-without-an-initialized-project))
first checks that Git ignores the directory and writes nothing there otherwise.

## Ownership

The product owns the **configuration containers and composition**, not the meaning of capability
settings. It owns Git-root discovery, the `.nevo/` namespace, file locations, ignore rules,
serialization, and the top-level namespaces contributed by capabilities. Git ownership: everything
shareable about Git (`git.enabled`, `git.worktrees.*`, `git.integrationTargetBranch`,
`git.commits.protectedBranches`/`allowedBranches`) lives in the committed project config; the local
config holds only machine-local values such as `git.worktreesRoot`, plus `git.commits.auto.<capability>`: the
second explicit exception (ADR 0018), allowed because turning auto-commit off never loosens a safety control.

Current shape:

```yaml
runtime:
  server: ... # optional rateLimit is project-owned server policy
  authentication: ...
  authorization: ...

specs:
  overview:
    current:
      sections:
        - requires-attention
        - active
        - ready
        - draft

sessions:
  enabled: false # managed Sessions feature; default false
  providers:
    mock: { enabled: false }
    claude: { enabled: false } # optional absolute `executable`
    codex: { enabled: false } # optional absolute `executable`
    antigravity: { enabled: false } # optional absolute `executable`

git:
  enabled: true
  worktrees: ...
  integrationTargetBranch: ...
  commits: ...

docs:
  root: docs # the taxonomy and path prefixes are in <docs.root>/docs.yaml
  search:
    semantic: true

ai:
  embeddings: ...
```

Runtime infrastructure owns composition and file loading, while feature modules own the meaning of
their configuration. Auth owns `runtime.authentication` and `runtime.authorization`; server
composition owns `runtime.server`; Specs owns the top-level `specs` namespace; Runtime Sessions
owns the top-level `sessions` namespace (`features/sessions/configuration.ts`); the Engine's
version-control capability owns `git`, whose keys and defaults are in
[SpecFlow Git/worktree configuration](../../reference/configuration/specflow-git-worktrees.md). The documentation
capability (`@nevo/specflow-docs`,
[ADR 0020](../decisions/0020-documentation-discovery-is-a-product-capability.md)) owns the `docs`
namespace and, while it is the only consumer, `ai.embeddings`. Runtime config loading invokes that
package's parsers for these namespaces like any other feature parser. The `nevo-specflow docs`
command uses the same parsers but is not Runtime config loading: it works without either config
file (using the defaults in ADR 0020), reads and validates only `docs` and `ai.embeddings`, and does
not require the `runtime` section.

**Documentation-only configuration.** A `.nevo/config.yaml` with only a `docs` section (and
optionally `ai.embeddings`) is a valid configuration for the `docs` commands; using documentation
does not require initializing the project. It is not an initialized project: the `runtime` section
is the initialization marker. Runtime config loading and `nevo-specflow project bootstrap` refuse a
project configuration without `runtime` and name `nevo-specflow init`, which completes the file (see
Initialization).

**Documentation settings file.** What describes the documentation itself — the `scope`/`areas`
taxonomy, non-authoritative and excluded path prefixes — is not in `.nevo/config.yaml` but in the
optional `<docs.root>/docs.yaml`, committed next to the documents. The documentation capability owns
and validates it whenever it opens the corpus (the `docs` commands, and the Runtime when it first
uses the corpus); it is not part of the corpus. The keys are in the
[configuration reference](../../reference/configuration/documentation-and-embeddings.md).

Configuration dependencies flow in one direction:

```text
config/parsing primitives
        ↓
feature-owned configuration
        ↓
Runtime config composition/loading
```

`config/parsing/` contains only low-level configuration parsing support such as
`RuntimeConfigError` and reusable value parsers. Feature configuration depends on those primitives,
not on Runtime config loading or composition. Feature configuration parsers are exposed through each
Runtime feature boundary and invoked by the configuration composition layer. Infrastructure must not
reproduce feature-specific validation.

Runtime initialization (`initRuntime`) owns Auth/server setup prompts, defaults, project/local
split, password hashing, secret policy, merge rules, and effective-config validation. Specs Overview
section configuration is optional project policy and defaults to the standard Current section order.

The product initializer calls `initRuntime`, wraps its contribution under `runtime`, and writes
the aggregate documents without reconstructing Runtime settings.

Server provenance is explicit too: `host`, `port`, `publicOrigin`, and `tls.enabled` are
project-owned policy, as is the optional shared endpoint `rateLimit` budget described in
[Runtime endpoint policy](endpoint-policy.md). Workstation-local Runtime config may supply only TLS certificate/key paths.
The merged Runtime config is validated after composition, so local credentials cannot weaken
project-owned authentication or server policy.

This namespace boundary is deliberate. Future AI, workflow, repository, or integration
configuration can add their own top-level capability namespace without becoming an unknown Runtime
key. Runtime config loading extracts only `runtime` before applying Runtime validation.

## Project versus local

`.nevo/config.yaml` contains source-controlled configuration that should follow the project.

`.nevo/local/config.yaml` mirrors the same capability namespaces for workstation-specific values
and secrets. It is **not** a general override layer. Provenance is validated before merge.

Current ownership is explicit:

- `server`: project owns `host`, `port`, `publicOrigin`, and `tls.enabled`; local owns
  `tls.certFile` and `tls.keyFile`.
- `authentication`: project owns `mode`, `users`, provider `enabled`, and OIDC
  `issuer`/`clientId`/`allowedEmails`; local owns `localUserId`, password `accounts`, and
  OIDC `clientSecret`.
- `authorization`: project-owned role assignments; workstation-local authorization is rejected.
- `specs.overview.current.sections`: project-owned ordered Current Overview sections; local Specs
  configuration is rejected.
- `sessions`: entirely project-owned (`enabled`, `providers.{mock,claude,codex,antigravity}` with
  boolean `enabled` and, for real providers, an optional absolute `executable`); unknown keys and
  any local `sessions` section are rejected. Provider details are in the
  [provider reference](../../reference/providers/README.md).
- `git`: project owns everything shareable (`enabled`, `worktrees`, `integrationTargetBranch`,
  `commits.protectedBranches`/`allowedBranches`/`auto`); local owns `worktreesRoot` and may override
  `commits.auto.<capability>` (the local value wins; any other local `git.commits` key is rejected).
- `docs`: project-owned (the documentation root and the `search.semantic` opt-in); local `docs`
  configuration is rejected, both by Runtime config loading and by the `nevo-specflow docs`
  command. The taxonomy and path prefixes are in `<docs.root>/docs.yaml`, which is committed with
  the documentation and has no local counterpart.
- `ai.embeddings`: allowed in both files; project config may hold a team default endpoint and local
  config overrides it, the local value winning per key. The embedding API key is never stored in
  either file: configuration holds only the name of the environment variable that contains it.
  Either file may be absent; the local file alone may configure the endpoint.

A local file that attempts to set project-owned policy is rejected before composition. Likewise,
project config cannot contain local-owned credentials or workstation-specific TLS paths.

`.nevo/local/state/` is reserved for persistent application-owned data that cannot be rebuilt, such as
Session bindings, transcript and read-model records, workflow operation records, human-verification records, provider
aliases, and bounded diagnostics. Users should not treat that state as editable configuration, and
it MUST NOT be deleted to recover from a problem.

`.nevo/local/cache/` holds data that can always be rebuilt from project files and configuration,
such as the semantic documentation index (`cache/docs-index/`). Cache contents are never migrated:
a capability that finds an incompatible cache discards and rebuilds it. Deleting `cache/` or any
subdirectory is always safe and costs only the rebuild. Data that cannot be rebuilt belongs in
`state/`, not `cache/`.

## Definitions are not flattened into config.yaml

Large declarative definitions keep their own committed files. Agent definitions already live under
`.nevo/agents/`; deterministic workflows, agent archetypes and task types are definition kinds
under `.nevo/definitions/{workflow,agent-archetype,task-type}/`
([ADR 0019](../decisions/0019-workflow-kernel-and-automatic-continuation.md)). Aggregate config may
select/default such definitions, but should not absorb their full bodies.

## Initialization

`nevo-specflow init` owns repository bootstrap only:

- discover the Git repository root;
- create `.nevo/config.yaml` and `.nevo/local/config.yaml`, or complete existing ones that have no
  `runtime` section (for example a documentation-only configuration): it adds its sections, keeps
  the existing sections and comments, and refuses a section it writes that already exists before
  the first question. A configuration
  with `runtime` is an initialized project and init refuses it;
- ensure `.nevo/local/` is ignored and verify the concrete local config path with Git;
- compose and serialize capability-owned contributions;
- write local config first and committed config last as the success marker, rolling back on failure
  (a completed file gets its previous content back).

The product shell resolves the Git repository root for both `init` and `start`, then passes
absolute config paths and the project root into Runtime. Runtime does not discover product file
locations from `process.cwd()`.

Runtime setup first decides whether authentication is required. Required authentication can combine
username/password with one or more named OIDC instances; at least one login method must remain
enabled. Password setup hashes secrets inside Runtime, while every OIDC client secret stays local.

For a new password user, the username is also the canonical user id; the wizard does not ask for a
second technical identifier. Additional password accounts explicitly choose `New user` or
`Existing user`. OIDC identities are configured by allowed email; the normalized email becomes
their stable configured identity automatically, while human-facing profile data comes from verified
OIDC claims at sign-in rather than from init prompts.

A role is selected immediately whenever setup creates a new user. The first-created user defaults to
`admin`; subsequent users default to `developer`. Setup preserves creation order explicitly and
cannot finish without at least one administrator. Trusted local mode keeps its local identity without
showing a login screen.

Before the product shell asks to write files, Runtime contributes a human-readable review of its
non-secret choices: authentication mode and methods, named OIDC instances and ids, issuer/client id,
identity-to-user mappings, canonical users, and role assignments. Passwords, hashes, client secrets,
and other workstation-local secrets are never included in that review.
