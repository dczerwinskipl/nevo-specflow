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
  Remaining authorization integration work after the scoped authorization foundation: domain
  enforcement, collection filtering, per-row capabilities, and UI consumption.
related:
  - architecture.runtime.authorization
  - reference.api.authorization
  - reference.configuration.authorization
---

# Authorization follow-ups

The authorization foundation is implemented and documented in
[Runtime authorization](../../architecture/runtime/auth/authorization.md).

Only the remaining integration work lives here.

## Remaining

1. **Domain enforcement**
   - apply capability checks to concrete SpecFlow domain operations as those endpoints are added or
     migrated;
   - construct enforcement scope from trusted backend/domain data.

2. **Authorization-aware collections**
   - filter specs and sessions by row-level `view` capability;
   - do not introduce a collection-level `spec.list` permission.

3. **Per-row capabilities**
   - include effective capabilities on row/read-model DTOs where the UI needs row-specific actions.

4. **SpecFlow UI consumption**
   - add thin query/hooks/helpers over `@nevo/specflow-contracts`;
   - use server-provided effective capabilities for visibility and interaction state;
   - keep backend enforcement authoritative.

## Already implemented

The following are not ideas anymore:

- `@nevo/authorization`;
- `@nevo/specflow-contracts` authorization definitions and shared HTTP types;
- Runtime `viewer`, `developer`, and `admin` role composition;
- project-owned scoped assignments;
- canonical project-user and assignment-scope validation;
- auth-mode/effective-subject resolution;
- `POST /api/authorization/capabilities`;
- generic resource/capability invariant validation.
