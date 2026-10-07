# UI screen specification template

Use this template when turning product ideas, prior discussion, existing UI, and repository contracts
into an implementation-ready screen specification. Delete sections that genuinely do not apply.

The screen specification is the UX/product contract for implementation. Draft ideas are evidence and
input, not requirements by themselves.

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

## 15. Data/read-model ownership

Only after the UX contract is clear, describe which facts come from:

- backend/application projection;
- route state;
- local UI state;
- derived bounded presentation model.

State facts the frontend must not infer.

## 16. API availability and migration evidence

Describe required read/write capabilities and current availability.

Migration evidence from old repositories is evidence, not an automatic target contract.

## 17. Acceptance criteria

Write checks that are observable in the composed UI and preserve the important UX invariants.

## 18. Open questions

List unresolved product decisions explicitly.

Questions that affect hierarchy, grouping, attention, action placement, navigation, or responsive
behavior are blockers for the relevant part of implementation. Do not silently resolve them in
Storybook, JSX, CSS, or a backend DTO.
