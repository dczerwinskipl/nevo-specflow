---
id: adr.0007-documentation-architecture-and-taxonomy
type: adr
title: Documentation architecture and taxonomy
status: current
date: 2026-09-28
summary: >
  Defines a documentation architecture that separates product behavior, durable system
  architecture, engineering guidance, reusable design-system knowledge, exact reference
  contracts, operational instructions, and a non-authoritative idea backlog, while using
  searchable scope, area, and tag metadata so discovery does not depend on folder paths alone.
related:
  - docs.readme
  - docs.architecture-readme
  - architecture.repository-structure
---

# ADR-0007: Structure documentation by knowledge responsibility, ownership scope, and searchable taxonomy

## Status

Current.

## Context

The repository contains several kinds of durable knowledge that have different owners and
different reasons to be read:

- product behavior and UX contracts;
- system architecture, boundaries, lifecycle rules, and invariants;
- implementation guidance for shared code, CLI, server, UI, AI, and workflow;
- reusable design-system knowledge that should remain independent of SpecFlow and may move with
  Nevo UI;
- exact contracts such as APIs, events, configuration, and protocol shapes;
- task-oriented instructions for humans and agents;
- non-authoritative migration/design ideas that need to preserve evidence before an authoritative decision exists.

These concerns must not become one undifferentiated development-document hierarchy. They also
cannot rely only on directory location for discovery: the same document can concern AI, runtime,
server, recovery, and testing at the same time.

The documentation model therefore separates:

1. **physical responsibility namespaces**, used for human navigation and ownership;
2. **semantic document type**, describing the role a document plays;
3. **search taxonomy**, describing the scope and concerns the document applies to.

## Decision

### 1. Use explicit top-level responsibility namespaces

The documentation root is organized as:

```text
docs/
├── README.md
├── architecture/
│   ├── principles/
│   ├── ai/
│   ├── workflow/
│   ├── runtime/
│   └── decisions/
├── engineering/
│   ├── shared/
│   ├── repository/
│   ├── server/
│   ├── cli/
│   ├── ui/
│   ├── ai/
│   └── workflow/
├── design-system/
│   ├── principles/
│   ├── implementation/
│   └── figma/
├── product/
│   ├── shared/
│   └── specflow/
│       ├── cli/
│       ├── ui/
│       └── workflow/
├── reference/
│   ├── api/
│   ├── cli/
│   ├── configuration/
│   └── protocols/
├── instructions/
│   ├── shared/
│   ├── specflow/
│   ├── nevo-ui/
│   └── process/
├── ideas/
│   └── <scope-or-package>/
└── templates/
```

Directories are namespaces, not a checklist. A directory exists only when it owns real
documentation.

The physical path is not the semantic identity of a document.

### 2. Give each namespace one responsibility

- **architecture** — durable system boundaries, ownership, lifecycle, invariants, and cross-cutting
  architectural decisions.
- **engineering** — rules for implementing, testing, and operating code and repository tooling.
- **design-system** — reusable Nevo UI design and implementation knowledge independent of SpecFlow.
- **product** — user-visible behavior, terminology, interaction models, and product contracts.
- **reference** — exact APIs, schemas, configuration keys, protocol/event shapes, and lookup material.
- **instructions** — task-oriented guidance that routes to authoritative documents.
- **ideas** — non-authoritative backlog for evidence, candidate contracts, migration hardening, and design directions that are not yet approved as architecture, engineering policy, product behavior, or exact reference contracts.
- **templates** — non-authoritative starting material for authoring documents.

A document that contains multiple independent responsibilities should be split instead of becoming
a mixed source of truth.

`ideas/` is intentionally different from the authoritative namespaces above. Its documents are
proposals/evidence packs and remain `status: draft` until their durable conclusions are promoted to
an authoritative home. The `ideas/README.md` hub may be `status: current` because it defines the
namespace's interpretation, not a product/runtime rule.

### 3. Keep architecture and engineering distinct

Architecture defines what must remain true at system level: boundaries, ownership, state models,
lifecycle, invariants, and dependency direction.

Engineering defines how code should be written to preserve those architectural properties:
implementation patterns, testing strategy, async/process rules, framework conventions, and local
code organization.

Architecture must not become a catalogue of implementation details. Engineering guidance must not
silently redefine architecture.

### 4. Keep product behavior separate from reusable design-system behavior

`product/` owns behavior that exists because the product is SpecFlow.

`design-system/` owns reusable UI knowledge that remains valid outside SpecFlow and should move
with Nevo UI if that system is extracted.

A product may consume design-system primitives, but using a reusable primitive does not transfer
ownership of product behavior into the design system.

The design-system namespace is intentionally a portability boundary. It is a physical ownership
namespace, not a semantic document type.

### 5. Keep reference separate from normative guidance

Reference documentation answers "what exactly is the contract?" rather than "why is the system
designed this way?" or "how should code be written?".

Normative architecture and engineering rules should link to exact reference material instead of
embedding copies of schemas, endpoint catalogues, or protocol fields.

Reference material may be generated from code where the code is the authoritative contract.

### 6. Keep instructions as a routing layer

Instructions are operational. They describe what context to load and what workflow to follow for a
specific kind of task.

They must not become a second source of truth for architecture, engineering, product, or
design-system rules. When a durable rule exists elsewhere, an instruction references that
document by stable ID instead of restating it.

General instructions and product-specific instructions remain structurally separate. Process
instructions such as specification writing, implementation, or review have their own
`instructions/process/` namespace and are not defined by this ADR.

### 7. Make semantic document type independent of path

The semantic document types are:

```text
hub
architecture
adr
engineering
product
reference
instruction
```

`engineering` represents engineering policy and implementation guidance rather than the entire
software-development lifecycle.

A document under `design-system/` still uses the semantic type that matches its role. For
example, a durable design-system boundary may be `architecture`, component-authoring guidance
may be `engineering`, and an exact token schema may be `reference`.

The same rule applies to all physical namespaces: path and type are related but not required to
mirror each other.

Documents under `ideas/` use the semantic type that best describes their **content shape**, but the
path plus draft status remains the authority signal: an `ideas/` document never becomes an exact
reference contract merely by using `type: reference`, and proposal guidance MUST NOT override a
current authoritative document.

### 8. Define an extensible ownership and search taxonomy

The documentation model reserves these optional frontmatter fields for richer ownership and search:

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
```

The fields have distinct responsibilities:

- **`type`** — semantic role of the document;
- **`scope`** — stable owner or breadth of applicability;
- **`areas`** — controlled major concerns used for filtering and routing;
- **`tags`** — finer-grained discovery vocabulary;
- **`read_when`** — concrete situations in which the document should be loaded.

The initial controlled `scope` vocabulary is:

```text
shared
repo
specflow
nevo-ui
```

The initial controlled `areas` vocabulary is:

```text
ai
workflow
runtime
server
cli
ui
figma
testing
docs
release
security
configuration
```

`scope` and `areas` use one machine-readable taxonomy once taxonomy-aware validation is enabled.

Tags are normalized and extensible rather than fully closed. They exist for search precision, not
for authorization or architecture enforcement.

The taxonomy fields are an additive extension to the existing documentation contract. They are not
required merely because this ADR is current, and tooling that has not yet implemented them must not
pretend they were validated or indexed. The baseline discovery contract remains `id`, `type`,
`title`, `read_when`, `summary`, path, and `related`.

No separate `applies_to` dimension is introduced: its intended meaning overlaps with
`scope`, `areas`, and `read_when`.

### 9. Treat canonical document IDs as stable

A document ID identifies a canonical concept, not a path.

Once an ID is assigned to a canonical concept, moving the document between directories or
repositories does not by itself justify changing the ID. A new ID is warranted only when the
concept or its authoritative ownership changes identity.

Stable IDs are the canonical targets for `related` links and instruction routing.

### 10. Use metadata for discovery, paths for navigation

Human readers should be able to browse the directory tree, but automated discovery must not depend
on knowing a path in advance.

`nevo-docs` indexes and searches the baseline metadata today. A taxonomy-aware implementation must
add `scope`, `areas`, and `tags` without making directory paths part of semantic identity.

When taxonomy support is enabled, filtering by semantic type, scope, and area is part of the
documentation contract. Free-text tags improve ranking inside those boundaries.

### 11. Maintain one authoritative home for each rule

A durable rule has one authoritative document.

Other documents may summarize enough context to be understandable, but they link to the source of
truth rather than copying normative requirements.

When knowledge changes ownership, the authoritative document moves or is superseded; duplicate
active copies are not maintained for convenience.

## Non-goals

This ADR does not define:

- specification, implementation, or review process;
- the contents of AI, workflow, server, CLI, UI, or design-system architecture;
- concrete API, protocol, or configuration contracts;
- product naming;
- package boundaries;
- migration steps for existing documents.

Those subjects use this documentation model but are decided independently.

## Consequences

### Positive

- system architecture, implementation guidance, product behavior, reusable UI knowledge, and exact
  contracts have distinct authoritative homes;
- Nevo UI knowledge has an explicit portability boundary;
- product-specific and general instructions can coexist without duplicating source-of-truth rules;
- humans can navigate by structure while agents and tooling discover context by metadata;
- stable IDs allow documents to move without breaking conceptual links;
- taxonomy supports cross-cutting concerns that do not fit a single directory.

### Costs

- `nevo-docs` requires an additive tooling change before taxonomy-aware validation and search are enabled;
- authors must classify both semantic role and ownership scope;
- the controlled scope/area vocabulary requires maintenance;
- some subjects naturally cross namespaces, so links between authoritative documents remain
  necessary.
