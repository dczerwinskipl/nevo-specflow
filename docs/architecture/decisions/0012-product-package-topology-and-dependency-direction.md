---
id: adr.0012-product-package-topology-and-dependency-direction
type: adr
title: Product package topology and dependency direction
status: current
date: 2026-10-03
summary: >
  Nevo SpecFlow is one npm-distributed local product composed from source packages. Product
  capabilities, including Runtime and UI, live under packages; apps is reserved for a future
  independently deployed or independently operated host. Package dependencies flow toward shared
  contracts and neutral foundations, with @nevo/specflow as the product composition root.
related:
  - architecture.repository-structure
  - adr.0005-repository-tooling-is-separate-from-the-product-api
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
  - design-system.principles.system-boundary
---

# 0012 — Product package topology and dependency direction

## Status

Current.

## Context

Nevo SpecFlow is installed and updated as one npm-distributed product. The public
`nevo-specflow` executable owns setup and lifecycle commands, and `nevo-specflow start` starts
the local product: Runtime, HTTP surfaces, UI hosting, workflow/provider capabilities, and other
product-owned services that are part of that installation.

The repository also has an `apps/*` workspace glob. Treating every executable server or browser UI
as an `apps/*` entry would create deployment boundaries that the product does not actually have.
Runtime and UI are not independently versioned or shipped products; they are source capabilities
composed into the same installable SpecFlow artifact.

At the same time, source-package boundaries remain valuable. They keep contracts, neutral
infrastructure, Runtime policy, UI code, and the public product shell independently testable and
prevent transport or presentation concerns from becoming one large package.

## Decision

### One distributed product, multiple source packages

- `@nevo/specflow` is the **product composition root and npm-distributed application package**. It
  owns the public executable, product-level command composition, packaging, and startup composition.
- `@nevo/specflow-runtime` remains a product capability package. Owning a long-lived Fastify server
  does not by itself make it an `apps/*` entry.
- The SpecFlow UI will land as `packages/specflow-ui` / `@nevo/specflow-ui`. It owns the React
  application source and frontend build output, but is still part of the same local SpecFlow
  product. The final product artifact may embed its built assets and Runtime may serve them as part
  of `nevo-specflow start`.
- `apps/*` is optional. It is reserved for a future host that has a genuinely independent
  deployment or operational lifecycle, such as a separately deployed hosted service or website.
  A package does not move to `apps/*` merely because it has a process, HTTP server, router, or UI.

### Dependency direction

Arrows point from a consumer to a dependency:

```text
@nevo/specflow
  |-> @nevo/specflow-runtime -> @nevo/specflow-contracts -> @nevo/authorization
  |                            \-> neutral foundations as needed
  |
  \-> @nevo/specflow-ui -----> @nevo/specflow-contracts
                               \-> @nevo/http-client
```

The diagram shows allowed direction, not a requirement that every package directly depends on every
package reachable below it.

- Product-neutral packages such as `@nevo/authorization` and `@nevo/http-client` MUST NOT depend
  on other `@nevo/*` packages.
- `@nevo/specflow-contracts` MAY depend on neutral primitives but MUST NOT depend on Runtime, UI,
  or the product composition root.
- Runtime MAY consume shared contracts and neutral foundations but MUST NOT depend on UI or
  `@nevo/specflow`.
- UI MAY consume shared SpecFlow contracts and neutral client infrastructure. It MUST NOT import
  Runtime internals, the product composition root, or the authorization policy implementation.
  Server-owned authorization decisions reach UI through product contracts/capabilities instead.
- `@nevo/specflow` MAY compose product capabilities. Reverse imports from capabilities into the
  composition root are forbidden.
- Cross-package behavior is consumed through declared package exports and workspace dependencies,
  not by reaching into another package's source tree.

The repository ESLint configuration enforces the high-value import directions above. Package
manifests remain the source of truth for actual workspace dependencies and Turborepo execution
order.

## Consequences

- UI migration has an explicit destination and does not need to invent an application/deployment
  boundary.
- Runtime can remain cohesive while still being independently testable from the public CLI shell.
- Shared contracts stay usable by both Runtime and UI without either side depending on the other.
- The final npm artifact can evolve its internal composition without exposing repository package
  topology as an installation concern.
- If SpecFlow later gains a separately deployed service or website, that host can be introduced
  under `apps/*` without moving reusable product capabilities out of `packages/*`.

## Revisit trigger

Revisit this decision if a SpecFlow surface gains an independently deployed, independently
versioned, or independently operated lifecycle that is no longer an implementation detail of the
single local npm-distributed product.
