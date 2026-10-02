---
id: architecture.runtime.configuration
type: architecture
title: Project configuration and local state
status: current
read_when:
  - adding or moving SpecFlow configuration
  - deciding whether a setting is committed or workstation-local
  - adding Runtime-owned local persistence
summary: >
  Nevo SpecFlow uses one .nevo namespace: committed project configuration and definitions,
  ignored workstation-local configuration, and application-owned local Runtime state.
related:
  - docs.architecture-runtime-readme
  - architecture.runtime.ownership-and-lifecycle
  - reference.cli.nevo-specflow-contract
---

# Project configuration and local state

Nevo SpecFlow uses one repository namespace:

```text
.nevo/
├── config.yaml                 # committed product configuration container
├── agent-instructions.md       # committed
├── agents/                     # committed definitions/instructions
├── workflows/                  # committed deterministic workflow definitions when migrated
└── local/                      # entirely Git-ignored
    ├── config.yaml             # workstation/operator configuration + secrets
    └── state/                  # application-owned local persistence as capabilities migrate
```

The canonical ignore entry is:

```gitignore
.nevo/local/
```

Do not introduce a sibling `.nevo-local/` namespace.

## Ownership

The product owns the **configuration containers and composition**, not the meaning of capability
settings. It owns Git-root discovery, the `.nevo/` namespace, file locations, ignore rules,
serialization, and the top-level namespaces contributed by capabilities.

Current shape:

```yaml
runtime:
  server: ...
  auth: ...
```

Runtime owns everything inside the `runtime` subtree. Within Runtime, auth owns `auth` and Runtime
server composition owns `server`. Runtime initialization (`initRuntime`) owns their prompts,
defaults, project/local split, password hashing, secret policy, merge rules, and validation.

The product initializer calls `initRuntime`, wraps its contribution under `runtime`, and writes
the aggregate documents without reconstructing Runtime settings.

Server provenance is explicit too: `host`, `port`, `publicOrigin`, and `tls.enabled` are
project-owned policy. Workstation-local Runtime config may supply only TLS certificate/key paths.
The merged Runtime config is validated after composition, so local credentials cannot weaken
project-owned auth or server policy.

This namespace boundary is deliberate. Future AI, workflow, repository, or integration
configuration can add their own top-level capability namespace without becoming an unknown Runtime
key. Runtime config loading extracts only `runtime` before applying Runtime validation.

## Project versus local

`.nevo/config.yaml` contains source-controlled configuration that should follow the project.

`.nevo/local/config.yaml` mirrors the same capability namespaces for workstation-specific values
and secrets. Under `runtime`, password hashes and OIDC client secrets are local-only. A local value
is not automatically allowed to override every project policy: the owning capability defines merge
and security rules.

`.nevo/local/state/` is reserved for application-owned data such as Session bindings,
transcript/read-model caches, workflow operation records, human-verification records, provider
aliases, and bounded diagnostics. Users should not treat that state as editable configuration.

## Definitions are not flattened into config.yaml

Large declarative definitions keep their own committed files. Agent definitions already live under
`.nevo/agents/`; deterministic workflow definitions will live under `.nevo/workflows/` when
that capability is migrated. Aggregate config may select/default such definitions, but should not
absorb their full bodies.

## Initialization

`nevo-specflow init` owns repository bootstrap only:

- discover the Git repository root;
- create `.nevo/config.yaml` and `.nevo/local/config.yaml`;
- ensure `.nevo/local/` is ignored;
- compose and serialize capability-owned contributions.

The initial Runtime authentication choices are no authentication, password login, and OIDC.
Password setup hashes the secret inside Runtime. OIDC setup keeps the client secret local.
Canonical users remain distinct from provider credentials; the password wizard defaults
`username == userId` for the common case.
