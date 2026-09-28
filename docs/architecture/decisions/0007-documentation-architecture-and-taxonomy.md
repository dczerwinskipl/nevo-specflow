---
id: adr.0007-documentation-architecture-and-taxonomy
type: adr
title: Structure documentation by knowledge kind, ownership scope, and searchable taxonomy
status: draft
date: 2026-09-28
summary: >
  Proposes a documentation architecture that separates product behavior, durable system
  architecture, engineering guidance, reusable design-system knowledge, exact reference
  contracts, and operational instructions, while adding searchable scope/area/tag metadata
  so discovery does not depend on folder paths alone.
related:
  - docs.readme
  - docs.architecture-readme
  - architecture.repository-structure
---

# ADR-0007: Structure documentation by knowledge kind, ownership scope, and searchable taxonomy

## Status

Draft. This ADR proposes the target documentation model only. It does **not** move existing
documents, rename existing frontmatter types, or change the current product/process model.

## Context

The repository already has structured Markdown documentation, deterministic discovery through
`nevo-docs`, generated indexes, ADRs, and useful separation between `development/`,
`product/`, and `architecture/`.

That baseline is no longer sufficient for the next migration phase.

The reference `nevo` repository accumulated important knowledge in several different forms:

- durable architecture and runtime invariants, especially around AI providers, turn lifecycle,
  workflow determinism, resource ownership, recovery, and long-lived server behavior;
- implementation guidance for CLI, server, React, testing, async I/O, and external adapters;
- product-specific UX behavior;
- reusable UI/design-system knowledge that may later belong to a separate Nevo UI package or
  repository;
- exact public or internal contracts such as HTTP endpoints, events, configuration, and canonical
  DTOs;
- task-oriented instructions that tell a human or agent which authoritative documents to load
  before doing a particular kind of work.

Putting all of these into one `development/` hierarchy would make ownership unclear and would
make future extraction of Nevo UI difficult. Encoding every distinction in directory depth would
also make discovery depend too much on knowing the tree in advance.

The current `nevo-docs` search ranks `id`, `title`, `read_when`, `summary`, path, and
`related`. It does not currently have first-class scope, area, or tag metadata.

The documentation system therefore needs two independent dimensions:

1. **knowledge kind** — what role the document plays;
2. **ownership/search taxonomy** — what subsystem, product, or concern the document applies to.

## Decision proposed

### 1. Organize top-level documentation by knowledge kind

The proposed target namespace is:

```text
docs/
├── README.md
│
├── architecture/
│   ├── README.md
│   ├── principles/
│   ├── ai/
│   ├── workflow/
│   ├── runtime/
│   └── decisions/
│
├── engineering/
│   ├── README.md
│   ├── shared/
│   ├── server/
│   ├── cli/
│   ├── web/
│   ├── ai/
│   └── workflow/
│
├── design-system/
│   ├── README.md
│   ├── principles/
│   ├── implementation/
│   └── figma/
│
├── product/
│   ├── README.md
│   ├── shared/
│   └── specflow/
│       ├── README.md
│       ├── cli/
│       ├── web/
│       └── workflow/
│
├── reference/
│   ├── README.md
│   ├── api/
│   ├── cli/
│   ├── configuration/
│   └── protocols/
│
├── instructions/
│   ├── README.md
│   ├── shared/
│   ├── specflow/
│   ├── nevo-ui/
│   └── process/
│
└── templates/
```

Directories are namespaces, not a checklist of files to create. A directory should appear when it
owns real documentation.

### 2. Give each knowledge kind one responsibility

| Kind | Question it answers | Example |
| --- | --- | --- |
| **Product** | What should SpecFlow do for a user? | AI-session UX, AppShell behavior, CLI interaction model |
| **Architecture** | How is the system divided and what invariants must hold? | canonical AI runtime, workflow projections, resource ownership |
| **Engineering** | How should code in this layer be implemented? | async server rules, React state ownership, test organization |
| **Design system** | How does reusable Nevo UI work independently of SpecFlow? | semantic tokens, component API, Figma capture/IR |
| **Reference** | What is the exact contract? | HTTP API, event schema, config keys, canonical DTO shape |
| **Instructions** | What should be loaded/done for a concrete kind of work? | implementing a provider adapter, changing a server capability |
| **ADR** | Why was a durable cross-cutting choice made? | transport choice, distribution model, documentation model |

A document that substantially answers two different questions should normally be split rather than
becoming a mixed source of truth.

### 3. Keep architecture separate from implementation detail

Architecture documents define boundaries, ownership, lifecycle, and invariants.

For example:

```text
provider protocol
      ↓
provider adapter
      ↓
canonical AI runtime
      ↓
application / workflow
      ↓
transport / UI
```

An architecture document may state that terminal turn state is immutable or that browser-facing
contracts are provider-neutral. It should not prescribe a concrete `Map`, class name, or local
directory layout unless that detail is itself part of the durable decision.

Implementation mechanics belong in `engineering/`.

### 4. Treat the design system as a separately owned body of knowledge

`design-system/` contains knowledge that should remain valid if Nevo UI is extracted from the
SpecFlow repository.

Examples include:

- semantic tokens and visual foundations;
- component authoring and variant composition;
- accessibility expectations for reusable controls;
- Storybook rules for reusable UI;
- code-as-source-of-truth rules for Figma;
- design capture IR, stable identities, and import/export behavior.

SpecFlow-specific UI behavior does not belong there. For example, Primary/Secondary/Single
workspace behavior or task navigation belongs under `product/specflow/web/`, even if Nevo UI
provides primitives used to implement it.

### 5. Separate exact contracts into reference documentation

Architecture should not become a catalogue of DTO fields, endpoint paths, or configuration keys.

Exact contracts belong under `reference/`. Reference documents may eventually be generated from
code where practical.

Example separation:

```text
architecture/ai/canonical-runtime.md
    "the browser never consumes provider-private protocol directly"

reference/protocols/canonical-turn.md
    exact CanonicalTurn / WorkItem contract
```

### 6. Make instructions a routing layer, not a second source of truth

Instructions may be human- or agent-facing, but should primarily route readers to authoritative
architecture, engineering, product, design-system, and reference documents.

For example, an instruction for changing the product server may say to load:

```text
architecture.runtime.server
engineering.shared.async-and-lifecycle
engineering.server.http-boundaries
engineering.shared.testing
```

It should not restate those documents' rules.

`instructions/process/` is reserved for later process-specific material such as specification,
implementation, or review instructions. This ADR deliberately does not define that process.

### 7. Add searchable taxonomy independently of paths

The proposed frontmatter additions are:

```yaml
scope: specflow

areas:
  - ai
  - runtime

tags:
  - provider-neutral
  - lifecycle
  - recovery
  - streaming

applies_to:
  - server
  - ai-provider
  - web
```

Their responsibilities are:

- **`type`** — knowledge kind;
- **`scope`** — owner / breadth of applicability;
- **`areas`** — small controlled set of major technical or product areas;
- **`tags`** — finer-grained search vocabulary;
- **`applies_to`** — consumers affected by the guidance.

Proposed initial `scope` values:

```text
shared
repo
specflow
nevo-ui
```

Proposed initial `areas` values:

```text
ai
workflow
server
cli
web
design-system
figma
testing
docs
release
security
configuration
```

`scope`, `areas`, and `applies_to` should use controlled values validated by
`docs:check`. Tags may be broader, but should still be normalized to avoid parallel spellings
such as `ai-runtime`, `ai_runtime`, and `AI runtime`.

The taxonomy should be defined in one machine-readable place once implementation begins.

### 8. Evolve document types

The target document types are proposed as:

```text
hub
architecture
adr
engineering
product
reference
instruction
```

The current `development` type would eventually become `engineering`. This ADR does not perform
that migration.

`design-system` is primarily an ownership area/scope, not a separate semantic document type:
design-system architecture, engineering guidance, reference material, and instructions still have
different roles.

### 9. Keep document IDs stable across moves

Document IDs represent identity, not filesystem location.

Prefer stable concept IDs such as:

```text
architecture.ai.canonical-runtime
engineering.server.realtime
ui.component-authoring
product.specflow.app-shell
```

Avoid IDs that mechanically reproduce every path segment.

This lets a document move between repositories or directories without forcing every `related`
reference to change.

### 10. Extend discovery to use taxonomy

When the taxonomy is implemented, `nevo-docs` should search and filter on the new metadata in
addition to the existing fields.

Expected usage:

```bash
pnpm docs:find "lifecycle recovery" --area ai
pnpm docs:find "testing" --scope nevo-ui
pnpm docs:list --type architecture --area workflow
pnpm docs:context "implement provider" --scope specflow --area ai
```

Folder navigation remains useful for humans, but it should not be the primary discovery mechanism.

## Placement examples

| Knowledge | Proposed home |
| --- | --- |
| Canonical Turn/Work lifecycle invariants | `architecture/ai/` |
| Provider adapter implementation rules | `engineering/ai/` |
| How waiting/requires-attention appears to the user | `product/specflow/web/` |
| Exact canonical AI event shape | `reference/protocols/` |
| Generic TypeScript and effect-boundary rules | `engineering/shared/` |
| Long-lived server cancellation/shutdown implementation | `engineering/server/` |
| Server resource ownership invariant | `architecture/runtime/` |
| Reusable component/tokens/Storybook/Figma guidance | `design-system/` |
| SpecFlow AppShell/navigation behavior | `product/specflow/web/` |
| Exact CLI command/output contract | `reference/cli/` |
| What to read before adding an AI provider | `instructions/specflow/ai/` |

## Expected migration direction for current documents

This table is illustrative. The migration itself should be a separate change.

| Current area | Expected direction |
| --- | --- |
| `development/cli/node-tooling-guidelines.md` | split repo-wide engineering rules from CLI-specific rules |
| `development/cli/testing-guidelines.md` | promote common testing policy to shared engineering; keep CLI smoke specifics under CLI |
| `development/ui/react/` | SpecFlow web engineering unless the rule is truly reusable Nevo UI |
| `development/ui/tailwind/` | primarily design-system implementation where reusable |
| `development/ui/storybook/` | primarily design-system implementation where reusable |
| `development/ui/ui-ux-guidelines.md` | split reusable design foundations from SpecFlow product UX |
| `product/dashboard/` | move conceptually toward `product/specflow/web/`; "dashboard" is not the architecture boundary |
| `product/shared/` | remain shared product knowledge where truly cross-surface |
| future AI/workflow runtime docs | architecture first; engineering/reference split where appropriate |

## Rollout proposed

Adoption should be incremental:

1. agree on the knowledge kinds and ownership boundaries;
2. agree on the controlled taxonomy;
3. extend `nevo-docs` frontmatter validation/search/indexing;
4. create missing architecture documents needed before code migration;
5. migrate/split existing documentation only when its target ownership is clear;
6. add instruction documents later as routing layers over established sources of truth.

Existing document IDs should remain stable where practical. Large-scale renaming should not be
combined with AI/workflow implementation migration.

## Non-goals

This ADR does not define:

- the specification lifecycle;
- review policy;
- agent handoff/review instructions;
- the final AI runtime architecture;
- the final deterministic workflow architecture;
- the server API or realtime transport;
- the Nevo UI package boundary;
- a mass move of current documents;
- a rename from SpecDev to SpecFlow across product/package identifiers.

Those concerns may consume the documentation architecture once settled, but are not decided here.

## Consequences if adopted

### Positive

- product behavior, architecture invariants, implementation guidance, and exact contracts have
  distinct sources of truth;
- AI/workflow knowledge learned in the reference repository has an obvious durable home;
- reusable Nevo UI documentation can later move with the library;
- instructions can stay small and compositional instead of duplicating rules;
- agents and humans can discover context by scope/area/tag rather than guessing paths;
- document moves do not require changing stable IDs.

### Costs

- `nevo-docs` needs a small schema/search extension;
- several existing documents will need to be split rather than simply moved;
- controlled taxonomy needs maintenance;
- during migration both old and new folder shapes will temporarily coexist.

## Open questions for review

1. Should `development` be renamed to `engineering` as proposed, or should the existing name be
   retained while only adding the new ownership split?
2. Should `reference/` be a first-class document type or only a top-level namespace?
3. Should instructions live inside `docs/` and be indexed by `nevo-docs`, or eventually have a
   separate loading mechanism while still referencing docs by stable ID?
4. Should tags be fully controlled, or should only `scope`, `areas`, and `applies_to` be
   controlled while tags remain normalized but extensible?
5. Is `design-system/` the right neutral name if the subtree is expected to become Nevo UI, or
   should the namespace be `ui/` from the beginning?
