Treat reusable design-system UI, product-owned composition, and screen-level visual behavior as separate responsibilities. Reuse follows semantic and interaction fit, not visual resemblance or repeated markup alone.

Before introducing a new local UI shape, perform semantic component/pattern discovery.

Start from any stable patterns/components referenced by the UX contract, but do not assume that the
handoff found every reusable capability. Independently inspect canonical design-system guidance,
public exports, representative stories, and meaningful consumers for the responsibility being
implemented.

Use this preference order:

1. reuse the established component/pattern as-is when it satisfies the required semantics;
2. compose existing primitives/patterns when the product-specific arrangement differs but the shared
   responsibilities already exist;
3. extend the shared owner when the missing behavior is itself a reusable design-system capability;
4. create a product-local custom structure only when existing patterns cannot satisfy a material
   semantic or interaction requirement.

Do not create a local lookalike, copy prototype CSS, fork shared styles, or override shared component
internals merely to reproduce a reference more quickly. Absence of a pattern reference in the UX
contract is not permission to skip discovery.

Before inventing a new repeated row/list treatment, resolve the canonical information hierarchy and
row pattern. A materially different grammar requires a user-facing semantic/interaction reason from
the owning UX/design-system contract; a different entity type or feature folder is not sufficient.

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

When implementing or reviewing an AppWorkspace contextual Secondary, discover and read `design-system.implementation.react.secondary-navigation` before introducing local navigation state, imperative effects or a custom sidebar stack. Treat that document as the implementation contract; use its example modules as the canonical reference. Do not apply it to unrelated global Drawer/navigation or full routable screens.
