Adapt the depth of this workflow to the uncertainty and blast radius of the task. A small spacing or alignment correction should not require screen-level ceremony; a new product region or shared-component change requires broader discovery and verification.

### Resolve the requested intent

Start from the explicit task and identify the exact observable change being requested.

Resolve any applicable owning product/screen contract and repository guidance. Draft/ideas material is evidence only; use the durable implementation-facing contract and explicit current owner decisions for the requested scope.

If no formal UX contract exists, use the existing product composition and behavior as the baseline outside the requested change rather than treating the surface as open for redesign.

If the task and an existing durable contract appear to disagree, determine whether the task is an explicit scoped owner decision that changes the contract or whether the conflict is accidental. Do not silently choose whichever source is easier to implement.

When a contract is presented as implementation-ready, check that material in-scope alternatives have actually been closed and that material implementation dependencies are explicit enough to route the work.

If required work has no clear owning layer/workstream, sequencing relationship, or handoff condition, surface that planning gap instead of silently absorbing unrelated application/API/design-system work into the UI implementation. A remaining `A vs B` decision for navigation, attention, hierarchy, action semantics, responsive behavior, containment, or shared ownership is a contract defect, not implementation-level freedom. Do not reopen clearly rejected/history alternatives either.

### Establish the delivery target

Before implementing a new screen, major region, or materially data-driven surface, classify what is being delivered:

- **presentation/mock only** — Storybook/prototype/design validation; production routing and authoritative application behavior are intentionally out of scope;
- **production feature** — the normal product route/surface must use authoritative application data and real actions;
- **both** — build the reusable presentation surface and wire the production composition explicitly.

Do not infer `presentation/mock only` merely because backend capability is missing.

If the work is reachable from normal product routing, treat it as production scope unless the current task/contract explicitly says the route itself is a development/demo surface.

For production scope, identify the authoritative data/action path before claiming the feature complete. Missing API/read-model/backend capability may block production integration while still allowing independent presentation work, but fixture/example data MUST NOT become the normal production source or fallback.

Record any intentional split between completed presentation work and still-pending production integration in the handoff.

### Reduce uncertainty before choosing

When the implementation is not obvious, perform proportional repository discovery before using generic frontend judgement.

Seek evidence in this order:

1. the explicit current task and owner decisions for its scope;
2. authoritative product, architecture, engineering, and design-system documentation;
3. the closest semantically matching established product or design-system pattern;
4. rendered Storybook or composed-application behavior for that pattern when useful;
5. current implementation and neighboring consumers as evidence of existing behavior;
6. draft/ideas/prototype material as non-authoritative evidence;
7. generic engineering or frontend knowledge.

Search for semantic and interaction patterns, not merely components with similar markup. Prefer the closest meaningful context: the same feature, then neighboring product surfaces, then broader product/design-system patterns. Inspect component stories and meaningful consumers when their contract or usage is relevant.

Distinguish repository-established behavior from a local precedent, an assumption, an unknown, or a conflict. Do not upgrade a convenient assumption to a repository rule.

### Classify what remains unknown

If repository discovery leaves uncertainty, classify it before acting:

- **implementation-level** — the requested product meaning is already clear and the remaining choice concerns implementation or presentation within established contracts. Decide it yourself using repository conventions and proceed.
- **material product/design-system** — different choices would change user-facing meaning, interaction semantics, ownership, or the reusable shared contract. Do not invent the answer.

Do not ask the owner to resolve information that can reasonably be established from repository documentation, established rendered patterns, component contracts, or neighboring implementation. Do not use a generic frontend convention merely because repository discovery takes more effort.

When a material decision remains unresolved, ask only for that decision after discovery. This applies whether the alternatives were explicitly left in a specification or became apparent while inspecting/rendering the implementation. If two or more materially different user-facing outcomes remain plausible after repository discovery, do not select one silently.

State the relevant evidence, the real alternatives, and a recommended default when evidence supports one. Do not replace discovery with a generic question such as how the user wants the page laid out. Technical alternatives that preserve the same decided observable UX remain implementer discretion and do not require owner input.

A blocker in one region does not automatically block independent implementation work. Continue unrelated work when doing so cannot pre-commit or conceal the unresolved decision.

### Resolve production integration evidence

When production scope consumes remote, persisted, live, or otherwise authoritative application data,
resolve the owning application's canonical architecture and data/integration guidance through
repository knowledge before implementing the integration.

Verify that the implementation-facing product/screen contract points to the authoritative exact
API/read-model/command/event contract required by the production path.

If that exact contract is missing, incomplete, or still under backend planning, surface the dependency
instead of designing the backend contract as incidental UI work. Independent presentation/mock work
may continue only when it is explicitly within scope and does not conceal the missing production
integration.

Use the owning project/design-system rules to verify the production path, test/fixture seam, semantic
mapping, loading/refresh behavior, and responsibility-boundary tests. Do not restate or replace those
rules in the implementation.

A presentation/mock render proves presentation behavior. Production completion additionally requires
verification through the real application integration path.

### Plan proportionally

For ordinary local changes, derive ownership from the existing implementation and proceed without producing a separate implementation plan.

Create a lightweight implementation/ownership map when the change spans multiple material regions, crosses product/design-system owners, or depends on shared-component changes. Keep it small enough to expose misunderstandings rather than becoming a mini-RFC. A useful shape is:

```text
region or capability -> owner -> implementation/reuse decision -> verification
```

Build the map after inspecting the actual owners, components, stories, and relevant consumers rather than merely copying a design handoff.

### Implement in dependency-complete slices

Work in the smallest useful dependency-complete slice rather than requiring a design-system-wide waterfall.

When a product region depends on an approved shared capability, implement or confirm that capability before finalizing the consumer. Do not preserve a temporary local workaround merely because the shared owner has not yet been changed.

After each visually material slice, render it and compare the actual behavior with the requested intent or owning contract. Classify a difference as an implementation defect, an unresolved contract/design-system gap, or an intentional approved deviation; do not accept drift merely because the code and tests are green.

### Verify and hand off

Follow the repository's canonical UI/UX, testing, and Storybook guidance instead of duplicating their detailed checklists here.

Rendered inspection is part of completion. Use the explicit render -> inspect -> fix -> render-again loop for affected responsive modes and realistic stress content. Inspect the composed application when correctness depends on App Shell/AppWorkspace, viewport height, scrolling, routing, sticky/fixed behavior, or Primary/Secondary composition. Perform the final rendered pass after the last UI/CSS change.

Do not modify or bypass authentication guards, authorization checks, capabilities, or product access-control policy merely to make UI verification easier. Use supported repository verification seams and configured development/authentication modes instead.

Verify changed behavior at the narrowest stable boundary first, then run the broader checks required by the repository.

Keep the completion handoff concise and evidence-based:

- **Implemented** — the requested scope completed;
- **Design system / ownership** — important reuse, shared changes, or product-owned compositions;
- **Verification** — targeted automated checks plus rendered surfaces/states and actual viewport widths;
- **Remaining gaps** — only material unresolved decisions, failures, or intentional limitations.
