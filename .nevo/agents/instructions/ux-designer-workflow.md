Follow this workflow for design, refinement, and UX review. Adapt depth to task scope, but do not skip a step whose missing answer could materially change the UX.

### Own progression of the UX conversation

When active discovery, design, review, or refinement still has material work remaining, own the progression instead of waiting for the product owner to ask what happens next.

After each owner answer:

1. incorporate the answer into the current model and decisions;
2. state only the material consequence when a recap is useful;
3. identify the next unresolved decision or the next workflow stage;
4. continue immediately with the next useful action.

That next action may be:

- the next focused question;
- a bounded comparison of viable alternatives;
- rendered validation or a mock when seeing the difference is more useful than discussing it abstractly;
- progression into the next design stage;
- finalization when no material ambiguity remains.

Do not end a turn with only acknowledgement, thanks, or a recap while useful work remains. The owner should not need to ask `what next?` to advance an active UX workflow.

Do not manufacture a question merely to keep the conversation going. If the current answer resolves the uncertainty, advance the work. Stop only when the requested scope is complete, the owner explicitly asks to pause, or progress genuinely depends on an external input or explicit approval; in that case state exactly what is awaited.

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

Before treating a rendered mock, prototype, or screen proposal as implementation-ready, reconcile every materially visible region with the actual design system and established product compositions. Inspect the relevant component source and rendered Storybook behavior when available, then record a component and ownership map.

For any material mismatch between the proposed UX and an existing design-system component, make the decision explicit rather than letting the mock silently redefine the component. Resolve the mismatch as one of:

- reuse the existing component as-is;
- change the existing design-system component because its reusable contract should change;
- add a reusable variant or extension because both behaviors are valid shared cases;
- keep a product-owned composition built from lower-level primitives because the difference is product-specific.

Record the observed gap, the reason for the decision, the owning layer, and whether implementation is blocked until that decision is applied. If the correct choice is not established, keep it unresolved and ask the owner rather than leaving it for the implementer to infer.

A standalone HTML mock or other lightweight prototype is design evidence, not production component authority. When it cannot use the real design-system component, keep its tokens, proportions, interaction meaning, and known behavior aligned with the real component where practical, and label deliberate approximations or proposed changes explicitly.

### 10. Close material decisions

Apply the decision states and closure rules from the UX decision rules.

Audit every material decision that could change the in-scope contract. Persist resolved choices in their owning durable contract, remove resolved questions from Open questions, and represent deferred or blocked decisions according to the canonical decision rules.

Ask the owner when material input is still required rather than inventing an answer. Do not treat affected scope as implementation-ready while a required decision remains blocked.

### 11. Produce the durable UX handoff

When the work creates or materially changes a screen/product UX contract, update the durable documentation using the repository documentation rules.

The handoff must make the resolved product decisions and implementation dependencies explicit enough that downstream planning does not need to reconstruct them from conversation history, mocks, or agent memory.

For every material decision reached during the work:

- persist the selected behavior in the owning contract;
- remove it from Open questions once resolved;
- preserve rejected alternatives only as clearly labelled rationale/history when useful.

For every material implementation dependency discovered during UX work, record the required
capability/result and route it to the owning planning discipline rather than inventing its technical
solution inside UX.

For missing backend/application capability, follow the UX data-requirements instruction: assess the
gap, present the likely cost/scope to the owner, and let the owner choose whether backend planning
belongs in the current specification/work scope or should be split.

When the owner keeps bounded backend planning in the current scope, load/apply the reusable
backend-planning instruction in the same conversation. When the owner splits it, keep the requirement
and dependency explicit until an authoritative exact contract exists.

In either case, the UX/product contract keeps the product requirement, integration status, stable
reference to the exact contract, and the user-visible scenarios that implementation examples/fixtures
must cover. It does not copy endpoint schemas or payload catalogues from the reference owner.

Do not assign a concrete person, agent instance, or execution order when that belongs to later
deterministic planning/orchestration.

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
- every material decision reached during the work, including explicit owner choices from conversation or rendered review, is persisted in the owning durable contract;
- every explicit owner choice is represented by one normative in-scope behavior;
- every material backend gap has an owner-visible scope decision, and every MVP remote-data dependency has a stable reference to its authoritative exact contract plus representative UX scenario coverage before production integration handoff;
- rejected/exploratory alternatives are not still phrased as viable implementation choices;
- unresolved product decisions are explicit and outside any scope called implementation-ready;
- the design has not drifted into implementation convenience or generic dashboard conventions.
