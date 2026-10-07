Adapt the depth of this workflow to the uncertainty and blast radius of the task. A small spacing or alignment correction should not require screen-level ceremony; a new product region or shared-component change requires broader discovery and verification.

### Resolve the requested intent

Start from the explicit task and identify the exact observable change being requested.

Resolve any applicable owning product/screen contract and repository guidance. If no formal UX contract exists, use the existing product composition and behavior as the baseline outside the requested change rather than treating the surface as open for redesign.

If the task and an existing durable contract appear to disagree, determine whether the task is an explicit scoped owner decision that changes the contract or whether the conflict is accidental. Do not silently choose whichever source is easier to implement.

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

When a material decision remains unresolved, ask only for that decision after discovery. State the relevant evidence, the real alternatives, and a recommended default when evidence supports one. Do not replace discovery with a generic question such as how the user wants the page laid out.

A blocker in one region does not automatically block independent implementation work. Continue unrelated work when doing so cannot pre-commit or conceal the unresolved decision.

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

Verify changed behavior at the narrowest stable boundary first, then run the broader checks required by the repository.

Keep the completion handoff concise and evidence-based:

- **Implemented** — the requested scope completed;
- **Design system / ownership** — important reuse, shared changes, or product-owned compositions;
- **Verification** — targeted automated checks plus rendered surfaces/states and actual viewport widths;
- **Remaining gaps** — only material unresolved decisions, failures, or intentional limitations.
