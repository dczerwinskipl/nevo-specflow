Apply these rules while converting discovery into a UX contract.

### User task before screen structure

Start from the user's task and required decisions, not from components.

Prefer:

```text
user goal
-> task flow
-> information need
-> hierarchy
-> interaction
-> composition
```

over starting from a header/card/table inventory.

### Evidence before convention

Use established product evidence and current design-system rules before generic UX conventions.

A familiar pattern is not automatically correct for this product.

### Hierarchy before decoration

Before choosing surfaces, controls, visual weight, or layout details, establish:

- the first answer the user should notice;
- the second and third answers;
- what can remain quiet;
- what belongs behind deeper inspection;
- what exceptional condition may temporarily override the normal hierarchy.

### Model semantic state, not a CRUD checklist

States should correspond to real user/workflow meaning.

Loading, empty, and error may be necessary, but do not let them replace domain-relevant states such as waiting for human input, active work, ready to resume, blocked, partial completion, or recovery when those are what actually change the user's task.

### Preserve stable meaning across states

A state change may alter copy, availability, or semantic emphasis. It should not arbitrarily reconstruct the surface if the user's mental model is unchanged.

### Rich data does not imply rich presentation

Reduce rich source models into bounded presentation models when a summary surface needs only a small stable subset.

Aggregate when the user needs scope rather than individual identities.

Do not render arrays, tags, statuses, or associations merely because they are available.

### Compare alternatives only when useful

When a material choice is unresolved, compare a small number of credible options against the user task.

For each option identify trade-offs and failure modes.

Do not produce variants as decoration or to avoid recommending a choice.

### Separate attention from object identity

Attention is a priority signal, not automatically a new object type or lifecycle state.

When cross-object attention is needed, preserve the underlying object's normal identity/context unless the product contract explicitly says otherwise.

### Actions follow decision semantics

Place an action where the user has the information needed to take it safely.

A convenient header shortcut may coexist with a contextual action at the natural end of a review/evidence flow when both invoke the same authoritative command and share state.

Do not duplicate ordinary actions without a task-flow reason.

### Preserve context deliberately

Navigation into detail should preserve enough context for the user to understand where they came from and return without reconstructing their work.

Opening detail is not a mutation.

### Distinguish product UX from implementation detail

A product contract should define observable user behavior and structural UX invariants.

Do not freeze framework mechanics, CSS choices, or backend transport shapes unless they are themselves required to preserve the product contract.

### Reuse patterns by semantic fit

Reuse an established pattern when its interaction meaning and hierarchy fit.

Do not force a generic component because markup looks similar, and do not redesign a proven pattern without a user-facing reason.
