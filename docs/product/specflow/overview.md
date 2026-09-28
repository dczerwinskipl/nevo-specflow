---
id: product.specflow.overview
type: product
title: Product overview
status: draft
read_when:
  - orienting to what Nevo SpecFlow is
  - deciding whether a concern belongs to the CLI, Runtime, or UI
summary: >
  Nevo SpecFlow is a human-led, spec-anchored workflow for AI-assisted software
  engineering, delivered as a CLI (`nevo-specflow`), a local Runtime, and an interactive UI.
related:
  - product.shared.vocabulary
  - product.specflow.cli.interaction-model
  - product.specflow.ui.interaction-model
---

# Product overview

`status: draft` — states intent and scope; the surfaces themselves are not yet in this
repository.

## What it is

**Nevo SpecFlow** is a framework and toolset for **spec-driven, AI-assisted
development**:

- The work is **human-led**. The repository owner makes architectural and scope
  decisions. AI agents propose options with a recommendation and implement approved
  work inside an explicitly declared context — they do not decide on the owner's
  behalf.
- Every non-trivial change is **anchored to a specification**. Changes are classified
  by weight (small / standard / architectural / exploratory); heavier changes get more
  specification and explicit owner approval gates.
- The workflow is **tool-enforced and deterministic**. Discovery, specification, task
  decomposition, start/verify/finalize, and documentation discovery run through
  commands that produce stable, machine-readable output — safe for agents to drive.
- It is **vendor-neutral**. The workflow is exposed to AI coding agents through thin
  adapters over one source of truth, rather than being tied to any single tool.

## Surfaces

| Surface       | Command / entry | Role                                                                                                            |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| **CLI**       | `nevo-specflow` | Deterministic driver for the spec/task lifecycle and docs discovery, for humans and agents in a terminal or CI. |
| **Runtime** | local process | Owns long-lived application lifecycle, resources, providers, persistence, and transports. |
| **UI** | interactive application | View and steering surface for specifications, tasks, changes/PRs, and AI sessions. |
| **Library**   | `import`        | Shared spec model and workflow logic the surfaces build on.                                                     |

Published product packages use the `@nevo/*` scope (e.g. `@nevo/specflow`).

The executable is `nevo-specflow`. Product lifecycle commands live at the root (`nevo-specflow start`, and later `stop` / `status`); resource operations use `<noun> <verb>`.

## Names

| Name            | Meaning                                           |
| --------------- | ------------------------------------------------- |
| Nevo SpecFlow   | the product.                                      |
| `nevo-specflow` | the repository and installed executable. |
| Nevo SpecFlow Runtime | the long-lived local backend. |
| Nevo SpecFlow UI | the interactive product application. |
| Nevo UI | the reusable design system. |
