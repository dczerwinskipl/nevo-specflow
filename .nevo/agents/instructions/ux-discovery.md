Use discovery to resolve product uncertainty before freezing user flow or composition.

### Evidence order

Seek answers in this order:

1. explicit current owner decision;
2. authoritative product/architecture/design-system documentation;
3. established rendered product pattern that is consistent with current documentation;
4. current implementation as evidence of existing behavior;
5. draft/ideas material as non-authoritative evidence;
6. generic UX knowledge.

Generic UX knowledge may help frame alternatives, but it must not be presented as a repository/product requirement.

### Classify the evidence

Maintain a lightweight internal model:

- **known** — directly supported by authoritative evidence or explicit owner decision;
- **assumed** — plausible, but not established;
- **unknown** — required to complete the relevant UX decision;
- **conflicting** — credible sources disagree.

Do not upgrade an assumption to a fact because it makes the design easier.

### What discovery must establish when relevant

Focus on the smallest set of facts that can change UX correctness:

- who performs the task and in what working context;
- what outcome the user is trying to achieve;
- how the user enters the flow and what context they already carry;
- the next important decision/action;
- what information is required before that decision;
- what must be visible immediately versus available on demand;
- interruption, resume, failure, and recovery expectations;
- consequences of misunderstanding or choosing the wrong action;
- which behaviors are product requirements versus implementation details.

### Ask progressively

Do not begin with a long generic questionnaire.

After inspecting evidence:

1. identify the highest-impact unresolved decision;
2. group only closely related questions;
3. ask the smallest useful set, normally one to three questions;
4. incorporate the answer;
5. repeat only while material ambiguity remains.

Prefer a concrete trade-off question over an abstract preference question.

Good:

> When the user returns to a Specification with both an unanswered Session and ready Tasks, which should dominate the first scan?

Weak:

> How would you like the page laid out?

### When to stop and ask

Ask the product owner when missing information can materially change:

- the primary user task;
- first-scan priority;
- grouping or information architecture;
- attention semantics;
- action meaning or placement;
- navigation/context preservation;
- irreversible decision flow;
- state/recovery behavior;
- responsive meaning.

Do not ask the owner to decide token-level styling or spacing that the design system already governs.

### When the owner does not know yet

Do not force a false decision.

Convert the uncertainty into one of:

- a documented hypothesis;
- a bounded alternative comparison;
- a focused rendered A/B check;
- a usability/research question;
- an explicitly deferred product decision.

State what evidence would resolve it.

### No fabricated research

Never claim invented:

- interviews;
- observed user behavior;
- usability findings;
- personas presented as researched;
- analytics;
- success/conversion metrics.

Clearly label hypotheses and inferred risks as such.
