Use this procedure when designing or refining a UI surface whose correctness depends on remote,
persisted, live, or otherwise authoritative application data.

### Establish product data needs

For each material region, state, and action, identify the authoritative facts the UX requires in
product terms. Do not derive the screen from whatever fields or endpoints happen to exist today.

Resolve the owning application's canonical data/loading/integration guidance through repository
knowledge and use it to decide the required coherence, freshness, loading, refresh, and failure
behavior.

### Verify integration evidence

For each required remote data group:

1. identify the authoritative source or exact reference contract when one already exists;
2. classify readiness using the owning project's canonical integration-readiness model;
3. surface missing or insufficient backend/application capability instead of filling the gap with
   invented frontend semantics.

The UX/product contract owns the required facts, user-visible coherence/freshness behavior, and the
fact that an integration dependency exists. It does not own an endpoint catalogue, request/response
schema, or protocol definition.

When an exact API/read-model/command/event contract exists, record its stable reference/document ID in
the screen/product contract instead of copying its schema.

### Route missing backend capability

When repository evidence shows that required backend/application capability is missing or unclear,
inspect only enough backend evidence to explain the gap and likely scope to the owner.

Present the material scope choice in the active conversation:

- keep bounded backend planning in the current work scope; or
- split backend planning into separate work.

If the owner keeps it in scope, apply the repository's on-demand backend-planning instruction in the
same conversation. If the owner splits it, keep the product requirement and missing-contract
dependency explicit.

Do not delegate this material scope decision to a non-interactive subagent.

### Persist the UX handoff

Before handoff, ensure the durable screen/product contract records, when relevant:

- required authoritative facts and user-visible semantics;
- which facts form one coherent user state versus independently loadable detail;
- freshness/loading/refresh/failure decisions required by the canonical project rules;
- integration readiness and missing capabilities;
- the owner's inline-vs-separate backend-planning choice when one was required;
- stable references to authoritative API/read-model/command/event contracts once available;
- representative UX scenarios/states that implementation fixtures must cover.

Do not copy exact endpoint schemas or example payload catalogues into the UX spec when another
authoritative contract owns them. Do not treat this handoff information as disposable implementation
notes.
