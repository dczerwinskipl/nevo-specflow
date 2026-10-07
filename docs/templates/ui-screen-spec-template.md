# UI screen specification template

Use this template when turning product ideas, prior discussion, existing UI, and repository contracts
into an implementation-ready screen specification. Delete sections that genuinely do not apply.

The screen specification is the UX/product contract for implementation. Draft ideas are evidence and
input, not requirements by themselves.

Calling a specification implementation-ready means its current implementation scope is decision-complete
and dependency-complete. Every material implementation-relevant decision reached during discovery,
conversation, rendered review, or alternative comparison must be represented in the durable contract
before handoff.

Lifecycle/status/approval mechanics are owned by the surrounding workflow. This template records the
decisions and dependencies that workflow needs; it does not define or infer workflow state from document
status.

Material alternatives may be explored while designing, but once a choice is made the selected behavior
must be written normatively and rejected alternatives must not remain viable implementation options.

## 1. Purpose and ownership

State the job of the screen in user terms.

Define what this surface owns and what deliberately belongs to another surface or deeper level.

## 2. User questions and first scan

List the questions the user should answer on initial scan, in priority order.

Example shape:

```text
1. What requires me now?
2. Where was I working most recently?
3. What work remains?
4. What supporting context can I inspect if needed?
```

For each question, state whether it is:

- primary;
- secondary;
- tertiary;
- deeper inspection only.

Do not derive this order from DTO fields, backend entities, or available screen space.

If the product evidence does not establish the order, record the question for the product owner
instead of guessing.

## 3. Attention model

Define whether exceptional human-required state can temporarily override the normal first scan.

Specify:

- what qualifies for attention;
- whether attention is local to one item or summarized across heterogeneous items;
- what semantic severity/tone is possible;
- whether the same underlying item remains present in its normal collection;
- what information the attention presentation may repeat and what it must not duplicate.

Do not turn every status into an attention surface.

## 4. Information hierarchy and budget

Describe the normal reading/scan order.

For every major region and repeated item, define:

- primary information;
- secondary information;
- tertiary/optional information;
- information deliberately omitted at this level;
- maximum visible metadata/signals where a strict budget is useful.

A rich source model does not justify a rich summary.

## 5. Composition invariants

Define the geometry and rhythm that implementation must preserve:

- dominant scan direction;
- content start / alignment anchors;
- repeated visual unit;
- shared gutters and scan columns;
- bounded information rail or reading width where relevant;
- vertical rhythm relationships;
- section separation versus row separation;
- ultra-wide behavior;
- wrapping/collapse order.

State which geometry belongs to the collection/pattern rather than individual rows.

## 6. Repeated collections

For each repeated collection, define its semantic grouping and stable row/item skeleton.

Include a conceptual shape when useful:

```text
[ utility ] [ marker ] [ identity / primary content ........ ] [ bounded actions ]
[         ] [        ] [ secondary comparison fields ....... ]
```

Define:

- grouping/order semantics;
- shared track sizing;
- selection/disclosure gutter behavior;
- per-field wrap/ellipsis policy;
- hover/focus/selected treatment;
- what changes between states and what must stay fixed.

If selection is always available, keep its geometry stable. Selection may change action emphasis
without forcing the whole layout to reflow.

## 7. Action hierarchy

List surface-level and contextual actions.

For each action define:

- when it exists;
- when it is enabled;
- whether it can be the single visible primary header action;
- whether it belongs in overflow on constrained layouts;
- whether it may be repeated later at the natural end of a deliberate evidence-reading flow.

Repeated action affordances must invoke the same authoritative command and share pending/disabled
state.

## 8. Entry, navigation, and detail flow

Describe:

- entry points;
- stable route versus local workspace state;
- Primary/Secondary ownership;
- local detail stack;
- Back/Close behavior;
- context preserved on return.

Opening detail must not accidentally perform a workflow mutation.

## 9. Pseudo-layouts

Provide representative composition sketches for:

### Wide

```text
...
```

### Compact

```text
...
```

### Narrow

```text
...
```

The sketches should show hierarchy and geometry, not pixel-perfect decoration.

## 10. State matrix

List meaningful normal and exceptional states.

For each state say:

- what content changes;
- what visual emphasis changes;
- what geometry must remain invariant;
- what action availability changes.

Avoid state-specific mini-layouts unless the state genuinely changes the user's task.

## 11. Component and ownership map

Map regions to:

- existing Nevo UI primitives;
- product-owned compositions;
- missing reusable capability candidates.

Do not create a design-system abstraction only because two pieces of markup currently look similar.

## 12. Containment and visual treatment

Reference the shared design-system rules and record only local exceptions/stricter constraints.

Explain any strong contained surface, Card, unusual colour emphasis, or persistent divider that is
required by this screen.

## 13. Accessibility and input behavior

Cover relevant:

- focus movement/restoration;
- keyboard operation;
- semantic row/link/button structure;
- non-colour state communication;
- live updates;
- reduced motion;
- touch target behavior.

## 14. Verification and stress fixtures

Define representative Storybook/composed-app scenarios.

Include as applicable:

- normal;
- loading;
- empty;
- unavailable/error;
- attention;
- long primary title;
- dense metadata;
- mixed short and intentionally extreme valid repeated rows;
- Wide;
- ultra-wide;
- Compact;
- Narrow;
- selection/bulk state.

For repeated collections, acceptance must verify stable scan axes and rhythm, not merely absence of
horizontal overflow.

## 15. Data/read-model, freshness, and loading requirements

Describe the user-facing data requirements after the UX contract is clear:

- which authoritative facts the surface needs;
- which facts must be interpreted together as one coherent user state;
- which detail is intentionally lazy, pageable, or independently loadable;
- which facts are route/local UI state rather than remote authoritative state;
- which semantics the frontend must not infer;
- freshness, loading, refresh, pending, and independent-failure behavior required by the owning
  canonical product/data rules.

Do not restate the repository's general loading/query policy here. Record only the screen-specific
decisions and link to the canonical rule that owns the general behavior.

## 16. Integration readiness and authoritative contract references

For every required remote data group:

- record its integration readiness using the owning project's canonical readiness model;
- name the missing capability in product terms when integration is incomplete;
- link to the stable authoritative API/read-model/command/event reference contract when it exists;
- record the owner's inline-vs-separate backend-planning choice when material backend planning was
  required;
- name the representative user-visible scenarios/states that contract examples or implementation
  fixtures must cover.

Exact endpoint paths, request/query schemas, response fields, command payloads, protocol/event shapes,
error catalogues, and example payloads belong in their authoritative reference/code-owned contract.
Do not copy that catalogue into the screen specification.

If the required exact contract does not yet exist, production integration for that data group remains
dependent on backend planning. UX/visual work may continue where safe, but the screen spec should
carry the requirement and later link the resulting authoritative contract rather than absorbing it.

Migration evidence from old repositories is evidence, not an automatic target contract.

## 17. Acceptance criteria

Write checks that are observable in the composed UI and preserve the important UX invariants.

## 18. Open questions

List unresolved product decisions explicitly.

An implementation-ready specification must not contain an open question that can materially change
its current implementation scope. Such a question either keeps the affected scope non-ready, or is
explicitly deferred outside that scope while the contract states which current behavior remains in force.

When an owner decision resolves a previously listed question, remove it from this section and encode
the selected behavior in the owning section of the specification. Rejected alternatives may remain only
as clearly labelled rationale/history, never as choices left to implementation.

Questions that affect hierarchy, grouping, attention, action placement, navigation, or responsive
behavior are blockers for the relevant part of implementation. Do not silently resolve them in
Storybook, JSX, CSS, or a backend DTO.
