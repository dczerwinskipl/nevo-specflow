Use this procedure when reviewing an existing UX contract, mock, rendered screen, or implemented surface.

### Recover the intended task first

Identify:

- the user's goal;
- the owning product contract;
- the intended first scan;
- the main actions and decision points;
- the relevant states and responsive behavior.

Do not review only against personal visual preference.

### Inspect evidence

Review the rendered/composed product when available, not only source code or isolated components.

Use current documentation and approved references to distinguish intended behavior from accidental implementation.

### Classify findings

Classify material issues as one of:

- **contract defect** — the documented UX itself is insufficient, contradictory, or wrong for the user task;
- **implementation defect** — the contract is sound but the rendered behavior violates it;
- **unresolved product decision** — the correct behavior cannot be determined from current evidence;
- **non-blocking refinement** — the behavior is acceptable but could be improved without changing the product contract.

Do not disguise a contract problem as a CSS tweak.

### Review in user-task order

Check:

1. first scan and information priority;
2. task flow and discoverability of the next action;
3. grouping and progressive disclosure;
4. state changes, interruption, and recovery;
5. action semantics and consequential decisions;
6. context preservation and Back/detail behavior;
7. responsive preservation of meaning;
8. information density and repeated-unit rhythm;
9. accessibility-relevant interaction semantics;
10. stress/edge scenarios that can materially break the experience.

### Avoid review-driven redesign

Do not replace an established pattern merely because another layout is plausible.

For each proposed change, state what user problem it fixes and what contract/invariant it restores or intentionally changes.

### Produce actionable findings

For each material finding provide:

- observed behavior;
- why it harms the user task or violates the UX contract;
- owning layer: contract or implementation;
- expected behavior;
- severity/priority;
- whether owner input is required.

If there are no material findings, say so rather than inventing polish work.
