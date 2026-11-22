---
id: product.specflow.ui.application-architecture
type: product
title: SpecFlow UI application architecture
status: current
scope: specflow
areas: [ui]
read_when:
  - choosing UI module ownership or route responsibilities
  - locating application service, navigation or account behavior
summary: >-
  Guide to the SpecFlow UI composition root, ownership, routing, server state, product navigation, authentication and localization.
related:
  - architecture.ui.specflow-application-composition
  - product.specflow.ui.application-navigation-and-auth
  - design-system.principles.system-boundary
  - product.specflow.ui.data-loading-and-integration
---

# SpecFlow UI application architecture

`packages/specflow-ui/` is the product UI capability and React application composition root. It
owns SpecFlow copy, localization, brand assembly, routing, screens, frontend build output,
authentication UI, and product-specific interaction decisions. It consumes reusable mechanics from
`@nevo/ui` and remains part of the single local product composed by `@nevo/specflow`; it is not
an independently deployed `apps/*` host.

## UI responsibility layers

This view shows UI ownership and shared dependencies. UI features are vertical slices,
not layers of independent microservices; data access is composed once at the application root.
The reusable `@nevo/ui` design system supplies components across these features but is **not** a SpecFlow product feature.

```mermaid
block-beta
  columns 1
  block:surfaces
    columns 2
    surfaceTitle["1. UI shell and navigation"]:2
    surfaceRouter["TanStack Router and shell"]
    surfaceScreens["Overview, Workspace and screens"]
  end
  block:features
    columns 3
    featureTitle["2. Product features"]:3
    featureSpecs["Specifications and Tasks"]
    featureDocs["Documents and Git"]
    featureSessions["Sessions"]
  end
  block:services
    columns 2
    servicesTitle["3. Services and state"]:2
    servicesApi["Typed feature APIs"]
    servicesQuery["TanStack Query and auth bootstrap"]
  end
  block:transport
    columns 2
    transportTitle["4. Runtime transport"]:2
    transportHttp["Shared HTTP client"]
    transportContracts["SpecFlow contracts"]
  end
```

The browser talks to Runtime over HTTP/SSE, never imports Runtime internals, and
does not contain a parallel Engine. Components receive bounded view models rather than raw
transport clients. The [architecture overview](../../../architecture/overview.md) owns the
cross-process view; this document owns the UI's detailed application decisions.

## Where to read next

| Concern                                                       | Owner                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Router, feature adapters, query state and Runtime integration | [Application composition](../../../architecture/ui-application-composition.md) |
| User routes, shell, authentication and localization           | [Navigation and authentication](application-navigation-and-auth.md)            |
| Server freshness, batching and failure ownership              | [Data loading](data-loading-and-integration.md)                                |
| Reusable components and design constraints                    | [Nevo UI design system](../../../design-system/)                               |
