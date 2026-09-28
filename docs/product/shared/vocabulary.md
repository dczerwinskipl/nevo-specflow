---
id: product.shared.vocabulary
type: product
title: Product vocabulary
status: current
read_when:
  - naming a product, surface, package, command, or domain concept
  - writing user-facing copy or documentation
  - reviewing whether CLI and UI terminology are consistent
summary: >
  Canonical names and product nouns for Nevo SpecFlow. Defines the product, CLI,
  Runtime, UI, Nevo UI design system, package naming, and shared workflow vocabulary.
related:
  - adr.0008-product-naming-and-surfaces
  - product.specflow.overview
  - product.shared.localization
  - architecture.principles.normative-language
---

# Product vocabulary

This document is the canonical vocabulary for product names and domain nouns. When a
term has a defined meaning here, product copy, code, packages, and documentation MUST NOT
introduce a competing synonym.

## Product family

| Canonical term               | Meaning                                                                                                     | Use                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Nevo SpecFlow**            | The product as a whole.                                                                                     | Product name in prose and branding.          |
| **Nevo SpecFlow CLI**        | The command-line surface of Nevo SpecFlow.                                                                  | Human-facing name of the CLI surface.        |
| **`nevo-specflow`**          | The installed executable.                                                                                   | Commands, examples, CI, scripts.             |
| **Nevo SpecFlow Runtime**    | The long-lived local application runtime. Owns lifecycle, resources, providers, persistence and transports. | Architecture and implementation terminology. |
| **Nevo SpecFlow UI**         | The interactive product UI served/connected by the Runtime.                                                 | Product/UI documentation.                    |
| **Nevo UI**                  | The reusable design system and UI component platform. It is not the SpecFlow product UI.                    | Reusable design-system documentation.        |
| **`@nevo/specflow`**         | The distributable product package and CLI composition root.                                                 | Package/API references.                      |
| **`@nevo/specflow-runtime`** | Runtime capability package.                                                                                 | Internal package/API references.             |
| **`@nevo/specflow-ui`**      | Reserved package name for the SpecFlow UI when it becomes a distinct package.                               | Internal package/API references.             |

## Naming rules

- Product prose and branding MUST use **Nevo SpecFlow** as the formal product name. They MUST NOT
  use "SpecDev" or "dashboard" as the product name.
- The whole interactive application MUST be called **Nevo SpecFlow UI** (or **UI** when the product
  context is unambiguous). **Dashboard** MAY name an individual screen/view, not the surface itself.
- The long-lived application backend MUST be called **Nevo SpecFlow Runtime** (or **Runtime** in
  context). **Server** MAY describe a concrete server/transport adapter and MUST NOT be used as a
  competing name for the whole backend.
- The executable MUST be `nevo-specflow`. `nevo-spec` MUST NOT be introduced in new commands,
  examples, scripts, or documentation.
- Product lifecycle commands MUST operate on SpecFlow itself at the executable root:
  `nevo-specflow start`, and eventually `stop` / `status` when implemented.
- Resource-oriented commands SHOULD use `<noun> <verb>` where a resource has multiple operations,
  for example `nevo-specflow task start` or `nevo-specflow workflow status`. A deviation requires a
  clearer product-level command model.
- The repository MUST be named `nevo-specflow`; published product packages MUST use the
  `@nevo/specflow*` family.

## Workflow vocabulary

| Term                     | Meaning                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Specification** (spec) | The anchoring document for a change: goal, decisions, constraints, and task breakdown.                                            |
| **Change**               | A unit of work with an identifier and classification. Owns one specification.                                                     |
| **Change class**         | Weight of a change: small, standard, architectural, or exploratory.                                                               |
| **Task**                 | A reviewable unit of work inside a change. Its exact lifecycle is defined by the workflow model, not by this vocabulary document. |
| **Review**               | A structured assessment of a specification, task, or implementation.                                                              |
| **Approval / gate**      | A deterministic condition and, where required, explicit human decision that permits progression.                                  |
| **Session**              | A provider-neutral AI working session associated with product context.                                                            |
| **Turn**                 | One request/execution cycle within a session.                                                                                     |
| **Work**                 | Structured activity performed within a turn, such as tool actions or file operations.                                             |
| **Commentary**           | Human-readable agent narration separate from structured Work.                                                                     |
| **Finalize**             | A product operation that completes a workflow according to its configured gates and outcomes.                                     |
| **Forward-port**         | Applying a fix from a maintained release line to another maintained line, normally including `main`.                              |
