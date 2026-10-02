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
├── config.yaml                 # committed project configuration
├── agent-instructions.md       # committed
├── agents/                     # committed definitions/instructions
├── workflows/                  # committed deterministic workflow definitions when migrated
└── local/                      # entirely Git-ignored
    ├── config.yaml             # workstation/operator configuration + secrets
    └── state/                  # Runtime-owned local persistence as capabilities migrate
```

The canonical ignore entry is:

```gitignore
.nevo/local/
```

Do not introduce a sibling `.nevo-local/` namespace. The old repository's
`.nevo-ai-local/` convention mixed local provider configuration and runtime data; the
new layout keeps the useful committed/local boundary while placing both under one product namespace.

## Ownership

`.nevo/config.yaml` contains values that describe **how this project is intended to work**
for every checkout. Current examples include:

- Runtime-safe server defaults;
- `auth.mode`;
- canonical users;
- enabled authentication providers;
- OIDC issuer/client id and email-to-user mapping.

Authentication secrets MUST NOT be committed. Password hashes and OIDC client secrets live in
`.nevo/local/config.yaml`.

The local config is also the future home for workstation choices such as enabled/available AI
providers, local executable paths, certificates, IDE integration, and machine-specific overrides.
A local value is not automatically allowed to override every project policy: each capability owns
its merge/security rules.

`.nevo/local/state/` is reserved for application-owned data such as Session bindings,
transcript/read-model caches, workflow operation records, human-verification records, provider
aliases, and bounded diagnostics. Users should not treat that state as editable configuration.

## Definitions are not flattened into config.yaml

Large declarative definitions keep their own committed files. Agent definitions already live under
`.nevo/agents/`; deterministic workflow definitions will live under `.nevo/workflows/` when
that capability is migrated. `.nevo/config.yaml` may select/default such definitions, but should
not absorb their full bodies.

## Initialization

`nevo-specflow init` discovers the Git repository root, creates project and local config, and
ensures `.nevo/local/` is ignored. It does not overwrite an existing `.nevo/config.yaml`.

The initial interactive authentication choices are:

- no authentication;
- password login;
- OIDC.

Password setup hashes the secret internally. OIDC setup commits provider metadata/identity mapping
and stores only the client secret locally. The canonical user is distinct from provider credentials;
the password wizard defaults `username == userId` so the distinction does not create needless
complexity for the common case.
