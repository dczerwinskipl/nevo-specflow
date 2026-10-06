---
id: ideas.authorization.follow-ups
type: engineering
title: Authorization follow-ups
status: draft
scope: specflow
areas:
  - runtime
  - server
  - ui
  - security
read_when:
  - implementing authorization beyond the current foundation
  - adding authorization to SpecFlow domain endpoints or UI
summary: >
  Remaining authorization integration work after the request/scoped authorization foundation:
  concrete domain enforcement, persistence-side collection filtering, product DTO projection, and
  UI consumption.
related:
  - architecture.runtime.authorization
  - reference.api.authorization
  - reference.configuration.authorization
---

# Authorization follow-ups

The authorization foundation is implemented and documented in
[Runtime authorization](../../architecture/runtime/auth/authorization.md).

Only remaining product/persistence integration work lives here.

## Remaining

1. **Concrete domain enforcement**
   - apply `requireCapability(...)` or `request.authz.require(...)` to real SpecFlow domain
     operations as those endpoints are added or migrated;
   - construct required scope from trusted backend/domain data whenever client identifiers do not
     prove the relevant relationship.

2. **Persistence-side collection filtering**
   - add a bounded grant-resolution API when a real persistent collection query needs it;
   - translate effective grant scopes in the repository/persistence adapter rather than teaching
     `@nevo/authorization` SQL, storage, or domain hierarchy;
   - keep per-item `view` semantics; do not introduce a collection-level `spec.list` permission.

3. **Product DTO capability projection**
   - use `request.authz.withCapabilities(...)` on read models where the UI needs row/detail actions;
   - name projection targets by read-model meaning so the same authorization resource may appear at
     different scopes.

4. **SpecFlow UI consumption**
   - consume server-provided boolean capability projections for visibility and interaction state;
   - keep backend enforcement authoritative;
   - introduce domain action projections separately when availability depends on workflow/domain
     state in addition to authorization.

## Already implemented

The following are foundation rather than ideas:

- `@nevo/authorization` generic resources, roles, assignments, and directional scope coverage;
- feature-owned SpecFlow resource/capability definitions;
- Runtime `viewer`, `developer`, and `admin` role composition;
- optional domain-neutral assignment scopes with omitted scope meaning global `{}`;
- auth-mode/effective-subject resolution;
- request-scoped `request.authz`;
- declarative `requireCapability(...)` and imperative `request.authz.require(...)`;
- centralized authorization 401/403 mapping;
- `POST /api/authorization/capabilities` boolean UI projection;
- request-local capability resolution caching;
- in-memory `filterByCapability(...)`;
- typed named-target `withCapabilities(...)`;
- Specs Overview filtering through the request authorization facade;
- generic resource/capability invariant validation.
