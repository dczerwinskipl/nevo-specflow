Follow this workflow for design, refinement, and UX review. Adapt depth to task scope, but do not skip a step whose missing answer could materially change the UX.

### 1. Determine the work mode

Classify the current work as one or more of:

- **discover** — the user problem, workflow, or material requirements are still unclear;
- **design** — the problem is sufficiently understood and an implementation-ready UX contract must be created;
- **review** — an existing UX contract, mock, screen, or implementation must be evaluated;
- **refine** — known findings or owner decisions must be incorporated without reopening unrelated design.

This classification is local workflow state, not a profile switch.

### 2. Resolve existing context

Load required repository knowledge first, then discover the owning product/screen documentation and relevant design-system guidance.

Inspect available evidence before asking questions:

- current authoritative product documentation;
- existing rendered product and approved patterns;
- current screen/product specification;
- repository implementation when it reveals established behavior;
- draft/ideas material as non-authoritative evidence;
- explicit owner decisions supplied in the task or conversation.

Distinguish what is already decided from what is merely implemented today.

### 3. Run UX discovery

Identify known facts, assumptions, unknowns, and conflicts. Ask only for unresolved decisions that can materially change user flow, hierarchy, interaction semantics, state behavior, or responsive composition.

Do not use a generic questionnaire when the repository already answers the question.

### 4. Model the user task

Before composing the screen, establish the relevant journey:

```text
entry
-> orient
-> notice
-> inspect
-> decide
-> act
-> feedback
-> continue / recover / leave
```

Not every task needs every stage, but the normal path must be explicit.

Where relevant, include:

- alternative paths;
- interruption and resume;
- cancellation;
- irreversible or consequential actions;
- failure and recovery;
- evidence that the task is complete.

Do not continue to detailed composition while the primary user task is materially ambiguous.

### 5. Model meaningful states

Derive states from the actual user task, authoritative data, permissions, workflow semantics, and failure/recovery model.

Do not mechanically stop at loading / empty / error / success.

State which states change:

- available actions;
- attention priority;
- content;
- semantic emphasis;

and which geometry/hierarchy must remain stable.

### 6. Establish information architecture

Define what belongs on this surface versus deeper detail.

Identify:

- the user-facing objects/concepts;
- navigation and ownership boundaries;
- what is summary versus detail;
- what may be aggregated;
- what should be progressively disclosed;
- what must remain reachable without polluting the primary surface.

Do not mirror backend object nesting merely because it exists.

### 7. Establish the first-scan contract

Write the ordered user questions the surface should answer at a glance.

For each answer decide whether it is primary, secondary, tertiary, or deeper inspection only.

Identify any exceptional condition that may temporarily override the normal hierarchy, such as required human attention.

Only after this step define visual placement and weight.

### 8. Explore alternatives when the decision is genuinely uncertain

For a material unresolved UX choice, compare a small number of viable alternatives.

For each alternative record:

- what user problem it optimizes;
- trade-offs;
- likely failure modes;
- conditions under which it stops working.

Reject clearly inferior options. Recommend one when evidence is sufficient. Ask the owner or define a focused validation experiment when evidence is not sufficient.

Do not generate arbitrary variants for settled or low-impact details.

### 9. Define the composition and interaction contract

Define the implementation-relevant UX invariants, including where applicable:

- repeated visual unit;
- dominant scan direction;
- stable content start / gutters / scan columns;
- information and affordance budgets;
- action hierarchy;
- grouping;
- progressive disclosure;
- attention behavior;
- responsive Wide / Compact / Narrow behavior;
- ultra-wide behavior;
- state invariants;
- representative stress cases.

Apply authoritative design-system rules instead of copying them into the product contract.

### 10. Resolve material open decisions

Before claiming the design is implementation-ready, surface all remaining decisions that could materially change the contract.

Ask the owner rather than inventing an answer.

If the owner explicitly chooses to defer a decision, mark the affected part as unresolved and prevent downstream work from treating it as settled.

### 11. Produce the durable UX contract

When the work creates or materially changes a screen/product UX contract, update the authoritative documentation using the repository documentation rules.

For an implementation-ready screen specification, use `docs/templates/ui-screen-spec-template.md` as the structural starting point unless the owning documentation defines a stricter format.

Draft/ideas material is input and evidence. Promote approved behavior into the correct authoritative product or design-system home instead of making ideas the implementation source of truth.

### 12. Define validation scenarios

Specify the scenarios needed to verify the uncertain and high-risk parts of the design.

Use realistic content and state combinations, including extreme-but-valid content when layout resilience matters.

When a decision cannot be settled from evidence alone, define what an A/B comparison, usability check, or rendered side-by-side review is intended to answer.

### 13. Self-review against the user task

Before handoff, verify:

- the first scan answers the most important user questions in order;
- the main task can be completed without discovering hidden product logic;
- deeper information does not dominate the summary;
- states and recovery are coherent;
- responsive behavior preserves meaning;
- unresolved product decisions are explicit;
- the design has not drifted into implementation convenience or generic dashboard conventions.
