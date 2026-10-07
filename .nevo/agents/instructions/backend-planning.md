Use this instruction when a product/specification workflow has identified missing or insufficient
backend/application capability and the owner has chosen to include backend planning in the current
work scope.

This is an on-demand planning capability for the active conversation. Keeping backend planning in the
same work scope does not transfer ownership of exact API/reference contracts into the UX document.

### Assess the gap

Inspect repository evidence and distinguish:

- a bounded exposure/integration gap, where authoritative semantics already exist;
- a broader capability/design gap, where new semantics, ownership, aggregation, persistence,
  commands, events, or authorization behavior are needed;
- an unknown gap that still needs focused discovery.

Explain the likely scope and consequences to the owner before broadening the work. Do not equate a
small code diff with a small semantic decision.

### Resolve existing capability first

Before proposing new API/read-model/command/event contracts, inspect the existing authoritative
application/domain capability, exact reference contracts, transport adapters, projections, commands,
events, authorization, persistence ownership, and relevant migration evidence.

Prefer extending an existing authoritative capability when it already owns the required semantics.
Do not create a duplicate contract merely because the UI needs a convenient shape.

### Plan from product semantics

Take the required facts, coherence, freshness, actions, loading/refresh behavior, and failure semantics
from the owning product/UX contract.

Determine the smallest durable backend/application capability that satisfies those needs. Return any
new material product/UX choice to the owner instead of deciding it silently.

### Preserve documentation ownership

Follow the repository documentation taxonomy.

Exact API, read-model, command, event, protocol, request/response, and example payload contracts belong
in their authoritative reference/code-owned home. Create or update that contract there.

The UX/product spec should retain:

- the required product semantics;
- integration readiness/dependency;
- a stable reference to the authoritative exact contract;
- product-relevant constraints or scenarios.

It should not duplicate the endpoint/schema catalogue merely because backend planning happened in the
same conversation.

### Produce the planning result

When backend work is required, define enough for implementation and review:

- owning capability/module;
- exact contract changes in the proper authoritative home;
- implementation slices/dependencies appropriate to the backend work;
- verification at the correct responsibility boundaries;
- the stable contract reference that downstream UI integration consumes.

Representative exact payload examples belong with the authoritative reference contract or contract
tests/fixtures. The UX spec may name the user-visible scenarios those examples must cover.

If the owner chose separate backend planning, return the same stable reference/handoff when that work
is complete so the product/UI workflow can resume without copying the contract.
