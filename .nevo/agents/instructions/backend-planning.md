Use this reusable technical-contract procedure when missing or insufficient backend/application
capability falls within the agreed work scope. In UX-led discovery, preserve the UX Designer's
owner-visible inline-versus-separate scope decision before materially expanding backend work.
An already approved backend-only/specification scope does not need the same decision again.
The active UX Designer or Spec Writer can apply this instruction without switching profiles.

This is an on-demand planning capability for the active conversation. Keeping backend planning in the
same work scope does not transfer ownership of exact API/reference contracts into the UX document.

### Assess the gap

Inspect repository evidence and distinguish:

- existing domain/application semantics that merely need API/read-model exposure;
- an existing authoritative backend contract that needs bounded extension;
- a new shared capability/design gap, where ownership, aggregation, persistence,
  commands, events, or authorization semantics need decisions;
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
- required producer/consumer contract dependencies for later task decomposition;
- verification at the correct responsibility boundaries;
- the stable contract reference that downstream UI integration consumes.

Backend planning owns technical capability and contract requirements, not the final task list,
task ordering, execution profile or workflow transitions. If exact semantics cannot be confirmed,
record the unresolved requirement and its owning contract instead of inventing an endpoint or
fabricating a stable reference. Task Planner owns final decomposition after sufficient decisions.
Keep independently useful UX work moving and use the shared preparation-handoff semantics.

Representative exact payload examples belong with the authoritative reference contract or contract
tests/fixtures. The UX spec may name the user-visible scenarios those examples must cover.

If the owner chose separate backend planning, return the same stable reference/handoff when that work
is complete so the product/UI workflow can resume without copying the contract.
