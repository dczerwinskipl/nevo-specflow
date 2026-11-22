---
id: ideas.documentation-maintainability
type: engineering
title: Documentation maintainability and context-budget refactor proposal
status: draft
scope: repo
areas: [docs, testing]
tags: [documentation, maintainability, authority, discovery, token-budget]
read_when:
  - planning a documentation refactor without losing domain invariants
  - reviewing the cost and authority of documentation retrieved by agents
summary: Proposed improvements to oversized architecture/product documents, API operation lookup and documentation quality checks.
related:
  - adr.0007-documentation-architecture-and-taxonomy
  - architecture.principles.normative-language
  - reference.cli.nevo-specflow-docs
  - ideas.demo-api-convergence
---

# Documentation maintainability and retrieval budget

This proposal covers documentation retrieval and maintainability. It does not change
Runtime or domain contracts.

## Current documentation sources

- [Reference documentation](../reference/README.md) provides a task-oriented API map.
- [OpenAPI 3.1](../reference/api/openapi.generated.json) provides HTTP methods,
  parameters, schemas, errors and security requirements.
- Architecture holds lifecycle and security invariants; Product holds interaction
  behavior; Engineering holds implementation and operator procedures.
- [Documentation search and get](../reference/cli/nevo-specflow-docs.md) support
  document discovery and section retrieval.

## Documents to review

These are candidates for targeted editing, not automatic failures based on file size.

| Priority | Document | Review focus |
| --- | --- | --- |
| P1 | [Specification lifecycle](../architecture/runtime/specification-lifecycle.md) | Separate Create, Close and recovery rules into navigable sections without losing invariants |
| P1 | [Specification documents](../architecture/runtime/specification-documents.md) | Clarify registry, path validation, commit queue and recovery ownership |
| P1 | [Workflow kernel](../architecture/workflow/workflow-kernel.md) | Keep state-machine and gate rules findable without unrelated implementation logs |
| P1 | [Task read composition](../architecture/runtime/task-read-composition.md) | Remove obsolete review and implementation chronology; cross-link the focused Task read reference |
| P1 | [UI application architecture](../product/specflow/ui/application-architecture.md) | Keep current ownership and routing behavior separate from implementation history |
| P1 | [Documentation reader](../product/specflow/ui/documentation-reader.md) | Separate navigation, document reading and semantic search concerns |
| P1 | [Documents and archetypes UI](../product/specflow/ui/documents-archetypes-ui.md) | Divide independent editor and archetype journeys |
| P2 | [Specification creation](../product/specflow/specification-creation.md) | Distinguish user journey, admission and recoverable errors |
| P2 | [React component guidelines](../design-system/implementation/react/component-guidelines.md) | Keep general rules separate from component-specific examples |
| P2 | [Secondary navigation](../design-system/implementation/react/secondary-navigation.md) | Separate component API, navigation rules and examples |
| P2 | [Session storage lifecycle](../architecture/ai/session-storage-and-lifecycle.md) | Distinguish persistence, recovery and operator responsibilities |

## Editing rules

Keep one authoritative location for each fact. Link to the appropriate owner rather
than copying entire contracts into new documents:

| Information | Owner |
| --- | --- |
| User-facing behavior | Product |
| Domain state, security and lifecycle invariants | Architecture |
| HTTP paths, schemas, headers and statuses | TypeBox routes and generated OpenAPI |
| Configuration and non-HTTP provider protocols | Reference |
| Build, test, diagnostics and operator commands | Engineering |
| Design rationale | Architecture decision records |
| Unimplemented behavior | Ideas or tracked issues |

A focused document should answer a concrete question and direct the reader to
the related rules. Do not add empty placeholder sections, descriptions of a
documentation migration, review history or implementation timelines to a
`current` document. Preserve important failure/recovery guarantees even when
they make a document longer.

Keep section titles meaningful for search. When moving a section, update inbound
links and `related` metadata. Retain an old entry point only if it gives
readers a useful route to the right topic.

## API operation lookup

The committed OpenAPI document is too large to load as a whole for most questions.
Add a deterministic local lookup that accepts `METHOD /api/path` or `operationId`
and returns just:

- the matching operation and its description;
- parameters, request and response schemas;
- referenced components, resolving local `$ref` transitively with cycle protection;
- documented errors, headers and authentication.

Measure retrieval size on typical tasks before introducing additional CLI or
product commands. The lookup is an index over the generated contract, not
another manually maintained API description.

## Proposed quality checks

Add non-blocking authoring diagnostics for suspicious patterns in current
non-ADR documents: oversized sections, broken links, historical PR/commit
references, repetitive migration boilerplate and sections containing only
generic redirects. These are review prompts, not blanket rejection rules.
ADRs and draft proposals can legitimately describe decisions and history.

A contributor changing the HTTP surface runs `pnpm api:openapi --check`;
documentation edits run `pnpm docs:check`. For substantive documentation
moves, test both a human's navigation and a search query against the index.

## Acceptance

- A representative Create/Close, Task, Session or documentation question can
  be answered from a short entry point plus one relevant detail document.
- Existing safety invariants and recovery rules remain authoritative and findable.
- No stale or broken fragment link remains after a split.
- Retrieved context becomes smaller without dropping required behavior.
