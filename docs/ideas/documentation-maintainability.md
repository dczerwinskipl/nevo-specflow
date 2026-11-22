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
| P1 | [Specification documents API](../reference/api/specification-documents.md) | 120 KB | Retire duplicated HTTP schemas/routes after mapping domain-only rules to Architecture/Product and verifying OpenAPI coverage |
| P1 | [Sessions API](../reference/api/sessions.md) | 56 KB | Replace HTTP field and route reference with generated OpenAPI; preserve non-schema lifecycle and protocol semantics in their actual owners |
| P2 | [Demo creation API](../reference/api/specification-creation-demo.md) | 33 KB | Retire after demo/project HTTP convergence; do not promote the demo-only routes into a second public OpenAPI surface (see [demo API proposal](demo-api-convergence.md)) |

## Ownership and document shape

| Information | One authoritative home |
| --- | --- |
| User-visible behavior and interaction | Product |
| State ownership, lifecycle, security and invariants | Architecture |
| HTTP paths, request/response, status and schema shapes | TypeBox and route schemas, exposed through generated OpenAPI 3.1; **not** manually duplicated in Markdown |
| Configuration and non-HTTP protocols | Their existing configuration/protocol references (unless an equivalent generated contract exists) |
| Operator procedures, debugging, tests and recovery commands | Engineering |
| Rationale and rejected alternatives | ADR, where the decision has durable significance |
| Implementation evidence, PR/commit/review IDs | GitHub history, linked historical record or a draft proposal; never the basis of a `current` contract |
| Unimplemented behavior | `docs/ideas/` or issue; do not describe it as a currently supported feature |

A normative section should have a short statement of responsibility, a small set of rules/invariants, failure/recovery implications where applicable, and links to exact contracts. Tables are useful for bounded choice sets; do not turn prose into giant multi-line table cells. Preserve concrete technical details when they constrain behavior.

Preserve existing stable document IDs for entry-point documents; when splitting one document, the original becomes a meaningful router and new documents receive new IDs. Preserve link fragments or update every inbound reference when headings move. Update `related`, `read_when` and `summary` to match newly narrowed ownership.

**Do not rewrite ADR history as if it had always been correct.** Historical decisions may retain their original wording, including amendments. Use their successors and the current domain contract to determine today's behavior; do not make a reader traverse multiple amended ADRs just to learn a current API.

## Generated OpenAPI replaces handwritten HTTP references

The Runtime already emits **OpenAPI 3.1** from Fastify TypeBox schemas at `GET /api/openapi.json`. The committed `docs/reference/api/openapi.generated.json` is generated with `pnpm api:openapi` and checked with `pnpm api:openapi --check`. Route registration enforces tag/summary and checks for missing response documentation; the canonical generated project-mode document currently reports no missing response-schema routes. Demo-specific seams are deliberately excluded from this OpenAPI document.

**Decision proposed:** replace individual HTTP reference Markdown pages, rather than reorganize them into smaller Markdown copies. Use code/TypeBox as the source of contract truth, OpenAPI as the public machine-readable HTTP description, and Architecture/Product/Engineering for behaviors that a schema cannot express. A single short `reference/api/README.md` can document where to find the generated and live specs and how to use them. Keep `openapi.md` only if its explanation of generator limitations, verification and protocol details remains useful; simplify its HTTP-reference repetition.

The checked-in OpenAPI JSON is approximately **2.26 MB**, so loading it wholesale into every agent context is counterproductive. Provide a deterministic local operation lookup that extracts `method + path` or `operationId`, only the referenced schemas (resolving `$ref` transitively with cycle protection), errors/headers, and the operation description. Initial implementation can be a small CLI/script over the committed JSON; measure retrieved tokens for representative requests before adding a new product command. A raw reference to the whole file is not an agent retrieval strategy.

**Coverage gate before deleting any Markdown:** the schema must truly describe the relevant request/response/status/headers and documented failure codes; if a field or refusal is only in prose, annotate its TypeBox schema/route documentation or migrate the semantic rule to its single domain owner. OpenAPI describes transport, but does not replace concurrency, idempotency, crash recovery, security reasoning, state-machine invariants, operator steps or a user journey. Ensure generated project-mode OpenAPI correctly reflects enabled provider differences; do not treat a single configured server as a universal route inventory without checking its generation policy.

Retire each old reference document **only after** resolving incoming `related` IDs, Markdown links/fragments and agent skill references. The audit should distinguish a short navigation page from a copied endpoint catalogue; neither broken citations nor silently dropped edge cases are acceptable.

## Implementation sequence

1. **Baseline:** capture document IDs, section IDs, inbound links and rule inventory for each batch. Record examples of agent tasks and their context/token consumption before changing anything. Confirm whether each apparent legacy clause remains enforced by code.
2. **Lifecycle and task reads:** refactor Specification Create/Close and Task read composition. Preserve the complete list of safety invariants (idempotency, durable journals, CAS, quiescence, shared workspace isolation, recovery-required paths, authorization) and error semantics. Move executable recovery procedures to their engineering owner, not a duplicated copy.
3. **Engine/workflow and document ownership:** split large architecture files along existing capability boundaries. Cross-link, do not copy, overlapping ownership.
4. **UI/product:** split large screen contracts by independent user journey; keep layout constraints in Design System and UI-specific behavior in Product.
5. **HTTP reference consolidation:** audit every `docs/reference/api/*.md` against the checked-in generated OpenAPI; migrate non-schema semantics to the owning architecture/product/engineering docs, then retire redundant HTTP Markdown pages. Keep only a small API reference index explaining where to obtain the spec and query an operation. Do not retire the standalone demo reference until its separate public routes have been removed (see demo convergence).
6. **Guardrails:** add non-blocking documentation review diagnostics for oversized sections, deeply nested prose and PR/commit/review references in `current` non-ADR documents. Explicitly allow IDs in examples, historical ADRs and proposals. A grep match is a triage signal, not proof of a violation.

## Verification and acceptance

- For every changed document, make an old-rule -> new-owner mapping. Each still-valid rule has exactly one authoritative home; every removed statement has a reason and a code/contract check.
- `pnpm docs:check` passes, including index and Markdown link fragments; regenerate both indexes for new IDs. Migrated document IDs have a deliberate replacement, and all inbound links/section anchors are updated before deletion.
- `pnpm api:openapi --check` passes. Every removed HTTP field, route, response or error has equivalent generated coverage; any unique semantics have an authoritative non-HTTP home.
- Check five representative requests: Create recovery, shared Workspace Close, document commits, Task workflow transitions, and UI document search. Compare **retrieved tokens**, not just total repository bytes, with the baseline.
- Human review can answer each request by opening a concise entry point and only the necessary detail. Agent review distinguishes implemented behavior from planned work without interpreting old PR history.
- Avoid a blanket word-count cap. Section size, information ownership and verified semantic coverage determine whether a split is useful.

A successful reduction is measured by **less context loaded with unchanged correctness**. Splitting one 90 KB file into five 18 KB files without improving retrieval or authority is not sufficient.
