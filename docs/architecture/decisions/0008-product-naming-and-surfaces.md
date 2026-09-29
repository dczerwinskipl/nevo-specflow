---
id: adr.0008-product-naming-and-surfaces
type: adr
title: Product naming and surfaces
status: current
date: 2026-09-28
summary: >
  Names the product Nevo SpecFlow, its executable nevo-specflow, its long-lived backend
  Nevo SpecFlow Runtime, its interactive application Nevo SpecFlow UI, and keeps Nevo UI
  as the reusable design system.
related:
  - product.shared.vocabulary
  - product.specflow.overview
  - architecture.repository-structure
---

# ADR-0008: Product naming and surfaces

## Status

Current.

## Context

The project accumulated several pre-rebrand names while proving individual boundaries, along with
`nevo-spec`, "dashboard", "server", and package names derived from those terms.

Those names no longer describe the intended product shape. The product has one identity
but several different surfaces and runtime responsibilities:

- an installed CLI;
- a long-lived local application runtime;
- an interactive UI;
- reusable UI infrastructure that is broader than SpecFlow.

Without canonical names, package names, commands, product copy, and architecture docs
will drift independently.

## Decision

### Product identity

The product is **Nevo SpecFlow**.

The repository is `nevo-specflow`, and the distributable package is
`@nevo/specflow`.

### CLI

The user-facing command-line surface is **Nevo SpecFlow CLI**.

Its executable is:

```text
nevo-specflow
```

The historical executable `nevo-spec` is not part of the target naming model.

The product lifecycle is expressed at the executable root:

```text
nevo-specflow start
nevo-specflow stop
nevo-specflow status
```

Only implemented commands are exposed. `stop` and `status` remain future commands
until the Runtime implements those operations.

Resource-oriented commands use `<noun> <verb>` when a resource has multiple
operations.

### Runtime

The long-lived local backend is **Nevo SpecFlow Runtime**.

Runtime owns application lifecycle and long-lived resources. HTTP servers, realtime
transports, provider processes, persistence, MCP endpoints, filesystem integration, and
similar mechanisms are runtime internals or adapters.

"Server" is therefore not the product-surface name. It remains valid when referring to
a specific server implementation or transport boundary.

The internal package is named `@nevo/specflow-runtime`.

### UI

The interactive application is **Nevo SpecFlow UI**.

"Dashboard" is not the name of the whole application. It may describe an individual
dashboard screen within the UI.

The package name `@nevo/specflow-ui` is reserved for the UI when it becomes a distinct
package boundary.

### Reusable design system

**Nevo UI** is the reusable design system/component platform. It is distinct from
**Nevo SpecFlow UI**, which is a product application that consumes Nevo UI.

### Branding

The canonical written lockup is **nevo SpecFlow**: the shared Nevo mark and brand name
paired with the product name.

Repository branding uses the horizontal lockup. The standalone Nevo mark is used where
a square icon/avatar is required.

## Consequences

- Product copy and docs consistently distinguish product, CLI, Runtime, UI, and design
  system.
- `dashboard` no longer leaks into package or surface names merely because the first
  UI proof was dashboard-shaped.
- `server` remains available as an implementation term without becoming the name of
  the entire backend.
- CLI examples become self-identifying and match the product/repository name.
- Future products under the Nevo family can reuse Nevo UI and the Nevo mark without
  claiming the SpecFlow product identity.
