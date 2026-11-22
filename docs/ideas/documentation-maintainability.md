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
summary: Proposed staged cleanup of oversized current documents, unstable implementation references, duplicated rules and inefficient section retrieval.
related:
  - adr.0007-documentation-architecture-and-taxonomy
  - architecture.principles.normative-language
  - reference.cli.nevo-specflow-docs
  - ideas.demo-api-convergence
---

# Documentation maintainability and retrieval budget

**Proposal, not a current rule.** This is an execution plan for a sequence of small PRs. It does not change any runtime contract.

## What needs fixing

Some `current` documents mix authoritative rules, implementation chronology, open follow-ups and operator procedures. A full-file read forces humans and agents to process unrelated material and can make old assumptions look authoritative. The existing taxonomy, stable IDs and section-aware `docs search` / `get --content` already provide the infrastructure needed to fix this. The problem is predominantly authorship, not indexing.

**Non-goals:** shorter files at any cost; deleting invariants, failure/recovery rules or required examples; creating a second source of truth; changing the semantics of established contracts; replacing the existing docs discovery system.

## Audited candidates

Sizes are approximate and are triage signals, not automatic failures.

| Priority | Current document | Approx. size | Proposed disposition |
| --- | --- | ---: | --- |
| P1 | [Specification lifecycle](../architecture/runtime/specification-lifecycle.md) | 31 KB | Small operation map; separate Create, Specification Close and Workspace Close; link to recovery procedures and exact API |
| P1 | [Specification documents architecture](../architecture/runtime/specification-documents.md) | 93 KB | Split registry/schema invariants, document-write/commit lifecycle and validation/authority into cohesive documents |
| P1 | [Workflow kernel](../architecture/workflow/workflow-kernel.md) | 73 KB | Split definitions/transitions, Tasks, gates, execution and recovery without duplicating normative rules |
| P1 | [Task read composition](../architecture/runtime/task-read-composition.md) | 18 KB | Remove the specific pre-refactor commit/review baseline from `current` architecture; retain domain ownership and coherence contracts |
| P1 | [UI application architecture](../product/specflow/ui/application-architecture.md) | 39 KB | Separate normative current ownership from obsolete routing and migration narrative |
| P1 | [Documentation reader](../product/specflow/ui/documentation-reader.md) | 60 KB | Split navigation/presentation, search, accessibility and integration contracts |
| P1 | [Documents and archetypes UI](../product/specflow/ui/documents-archetypes-ui.md) | 54 KB | Split by user surface; keep shared document semantics at their owning source |
| P2 | [Specification creation](../product/specflow/specification-creation.md) | 42 KB | Separate journey/interaction from errors and exact transport behavior |
| P2 | [React component guidelines](../design-system/implementation/react/component-guidelines.md) | 65 KB | Move component-specific contracts out of general React guidance |
| P2 | [Secondary navigation](../design-system/implementation/react/secondary-navigation.md) | 48 KB | Separate component API, navigation invariants and worked examples |
| P2 | [Session storage lifecycle](../architecture/ai/session-storage-and-lifecycle.md) | 28 KB | Split persistence and ownership from recovery/operator action |
| Review | [Specification documents API](../reference/api/specification-documents.md) | 120 KB | Keep exact coverage, but enable narrower section/resource retrieval; derive schema details from TypeBox where possible |
| Review | [Sessions API](../reference/api/sessions.md) | 56 KB | Group by independent resource and route families |
| Review | [Demo creation API](../reference/api/specification-creation-demo.md) | 33 KB | Retire only after demo/project HTTP convergence; see [demo API proposal](demo-api-convergence.md) |

## Ownership and document shape

| Information | One authoritative home |
| --- | --- |
| User-visible behavior and interaction | Product |
| State ownership, lifecycle, security and invariants | Architecture |
| Wire shapes, errors, configuration and endpoints | Reference; executable TypeBox contract takes precedence for exact schemas |
| Operator procedures, debugging, tests and recovery commands | Engineering |
| Rationale and rejected alternatives | ADR, where the decision has durable significance |
| Implementation evidence, PR/commit/review IDs | GitHub history, linked historical record or a draft proposal; never the basis of a `current` contract |
| Unimplemented behavior | `docs/ideas/` or issue; do not describe it as a currently supported feature |

A normative section should have a short statement of responsibility, a small set of rules/invariants, failure/recovery implications where applicable, and links to exact contracts. Tables are useful for bounded choice sets; do not turn prose into giant multi-line table cells. Preserve concrete technical details when they constrain behavior.

Preserve existing stable document IDs for entry-point documents; when splitting one document, the original becomes a meaningful router and new documents receive new IDs. Preserve link fragments or update every inbound reference when headings move. Update `related`, `read_when` and `summary` to match newly narrowed ownership.

**Do not rewrite ADR history as if it had always been correct.** Historical decisions may retain their original wording, including amendments. Use their successors and the current domain contract to determine today's behavior; do not make a reader traverse multiple amended ADRs just to learn a current API.

## Implementation sequence

1. **Baseline:** capture document IDs, section IDs, inbound links and rule inventory for each batch. Record examples of agent tasks and their context/token consumption before changing anything. Confirm whether each apparent legacy clause remains enforced by code.
2. **Lifecycle and task reads:** refactor Specification Create/Close and Task read composition. Preserve the complete list of safety invariants (idempotency, durable journals, CAS, quiescence, shared workspace isolation, recovery-required paths, authorization) and error semantics. Move executable recovery procedures to their engineering owner, not a duplicated copy.
3. **Engine/workflow and document ownership:** split large architecture files along existing capability boundaries. Cross-link, do not copy, overlapping ownership.
4. **UI/product:** split large screen contracts by independent user journey; keep layout constraints in Design System and UI-specific behavior in Product.
5. **Reference:** use resource-sized sections and link to TypeBox/OpenAPI for exact schemas. Do not remove a documented edge case merely because its schema is machine readable. Treat the standalone demo reference as a separate convergence decision.
6. **Guardrails:** add non-blocking documentation review diagnostics for oversized sections, deeply nested prose and PR/commit/review references in `current` non-ADR documents. Explicitly allow IDs in examples, historical ADRs and proposals. A grep match is a triage signal, not proof of a violation.

## Verification and acceptance

- For every changed document, make an old-rule -> new-owner mapping. Each still-valid rule has exactly one authoritative home; every removed statement has a reason and a code/contract check.
- `pnpm docs:check` passes, including index and Markdown link fragments; regenerate both indexes for new IDs. Existing document IDs remain resolvable.
- Check five representative requests: Create recovery, shared Workspace Close, document commits, Task workflow transitions, and UI document search. Compare **retrieved tokens**, not just total repository bytes, with the baseline.
- Human review can answer each request by opening a concise entry point and only the necessary detail. Agent review distinguishes implemented behavior from planned work without interpreting old PR history.
- Avoid a blanket word-count cap. Section size, information ownership and verified semantic coverage determine whether a split is useful.

A successful reduction is measured by **less context loaded with unchanged correctness**. Splitting one 90 KB file into five 18 KB files without improving retrieval or authority is not sufficient.
