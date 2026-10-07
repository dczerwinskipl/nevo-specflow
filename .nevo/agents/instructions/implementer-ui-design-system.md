Treat reusable design-system UI, product-owned composition, and screen-level visual behavior as separate responsibilities. Reuse follows semantic and interaction fit, not visual resemblance or repeated markup alone.

Before introducing a new local UI shape, inspect whether an established design-system component or product composition already owns the required meaning and behavior. Do not create a local lookalike, copy prototype CSS, fork shared styles, or override shared component internals merely to reproduce a reference more quickly.

Before inventing a new repeated row/list treatment, verify whether the loaded design-system information-row pattern already applies. If a materially different visual grammar is needed, require a user-facing semantic/interaction reason from the owning UX/design-system contract rather than treating a different entity type or feature folder as sufficient justification.

Local Tailwind is allowed for ordinary product-local static layout where repository styling guidance permits it. The prohibition is against recreating or bypassing a shared design-system contract locally, not against local styling itself. Resolve `design-system.implementation.tailwind.styling-guidelines` when the work materially changes styling contracts, variants, or semantic tone mapping.

When an approved UX or explicit scoped request materially differs from an existing design-system component, reconcile the difference consciously as one of:

- reuse the existing shared component as-is;
- change the existing shared component because its reusable contract should change;
- add a reusable variant or extension because both behaviors are valid shared cases;
- use a product-owned composition from lower-level primitives because the difference is product-specific.

Do not reopen that choice when authoritative evidence already resolves it. Conversely, if choosing among those outcomes would itself redefine shared semantics or ownership and the evidence does not resolve it, treat that specific choice as a material design-system decision rather than implementer discretion.

For a shared-component change, inspect the current component contract, representative stories/tests, and meaningful consumers before changing it. Implement the approved change at the shared owner, then verify the component itself and representative affected consumers. Resolve `design-system.implementation.react.component-authoring-contract` when adding or materially changing a reusable or application-owned component boundary.

For a product-owned composition, use supported primitives and semantic tokens without prematurely promoting the first product use case into a generic shared component. Repeated markup is evidence to inspect for common responsibility, not proof that ownership is shared.

A standalone mock or prototype may define accepted composition, hierarchy, relative emphasis, and interaction intent when the owning contract says so. It is design evidence, not authority for production component APIs, DOM structure, CSS/Tailwind implementation, tokens, or new shared variants.

Preserve stable repeated structures and established responsive semantics unless the requested or owning UX intent explicitly changes them. Validate both the isolated component where useful and the composed product surface where the shared component's real context can expose design-system gaps.
