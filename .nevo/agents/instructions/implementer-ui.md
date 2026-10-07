Treat reusable UI, product UI, and visual behavior as separate concerns when the repository documentation distinguishes them. Reuse shared primitives for genuinely shared behavior rather than similar markup.

For UI changes, inspect the composed screen as well as the isolated component. Preserve responsive behavior, accessibility, semantic tokens, and the established App Shell or design-system contracts relevant to the edited surface.

Treat the owning screen/product specification, approved visual reference, and established reusable pattern as a contract. Do not silently reinterpret information hierarchy, scan flow, alignment, row anatomy, wrapping, density, or responsive behavior merely because another implementation is easier. If a material design decision is contradictory or underspecified, surface the ambiguity instead of inventing a new composition without evidence.

Before implementing a materially new or changed screen region, resolve its component and ownership mapping and inspect the mapped design-system component or established product composition. Do not create a local lookalike, copy prototype CSS, or override shared component internals merely because the approved mock differs from the current design-system rendering.

A material mismatch between the approved UX and an existing design-system component must already be resolved by the UX/product contract as one of: reuse as-is, change the shared component, add a reusable variant or extension, or use a product-owned composition from lower-level primitives. If that decision is missing or contradictory, surface it as a design/design-system gap instead of choosing silently during implementation.

When the contract explicitly changes a design-system component, implement the change at the design-system owner and update its representative stories/tests plus affected consumers as required by repository guidance. When the contract explicitly chooses a product-owned composition, compose it from supported primitives and tokens without forking an existing shared component. A standalone HTML mock is visual/design evidence, not production CSS or component API authority.

Repeated items and state variants should preserve a stable visual skeleton unless their meaning genuinely requires a different structure. State may change content and semantic emphasis; it should not arbitrarily change content start, indentation, column boundaries, line hierarchy, or metadata placement. Compare representative states side by side so state-specific layout drift is visible.

When a whole-row navigation target coexists with selection or nested controls, keep the DOM and focus model valid. Do not nest checkboxes, buttons, or links inside another interactive row link/button. Use a non-interactive row root with a semantic primary navigation target and sibling controls; activating a sibling control must not also trigger row navigation.

Own the rendered visual quality of the change. Source review, passing tests, and the presence of expected CSS classes are not substitutes for inspecting the rendered result.

For visual changes, perform an explicit render -> inspect -> fix -> render-again loop across the responsive modes affected by the work. Use realistic long and dense fixture content where overflow, wrapping, spacing, or hierarchy could fail. Actively look for horizontal overflow, clipping, accidental double padding, excessive empty space, overly dense regions, broken viewport-height behavior, weak hierarchy, and desktop assumptions leaking into Narrow layouts.

Prefer deterministic Storybook fixtures for screen/component states. Also inspect the composed application when correctness depends on App Shell / AppWorkspace behavior, viewport height, scrolling, routing, sticky/fixed regions, or Primary/Secondary composition. Do not weaken product authentication or authorization policy merely to make visual verification easier.

Perform the final rendered inspection after the last UI/CSS change and report the surfaces and actual viewport widths inspected.
