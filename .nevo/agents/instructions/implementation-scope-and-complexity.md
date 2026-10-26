Use this as a proportional decision aid for implementation and review, not a new approval gate, a substitute for the selected role's workflow, or a line-count target. Follow the repository's normative-language and document-authority rules: an explicit owner request defines the desired scope but cannot silently waive a current MUST/MUST NOT contract. Resolve a real conflict at the owning contract before performing dependent state-changing work. Never trade correctness, security, authorization, accessibility, required tests, deterministic invariants, lifecycle safety, or Git recovery for a smaller diff.

### Establish what is needed

Identify the requested observable outcome and what must remain unchanged. Inspect the closest capability owner, existing public APIs, dependencies, relevant tests, and representative consumers as needed to establish the change's effects. For new or materially changed UI patterns, inspect semantically matching design-system components and rendered Storybook evidence; an isolated visual correction does not require a survey of unrelated components or consumers. Required repository knowledge, applicable contracts, and verification still apply. Search by responsibility, proportional to uncertainty and blast radius.

First determine whether existing behavior meets the required semantics. Otherwise choose composition, extension at the established owner, or a new capability based on the present requirement and responsibility boundary; none is an automatic default. Similar-looking code is not sufficient evidence of matching semantics. Do not cross ownership boundaries merely to reduce file count.

### Keep the implementation complete but focused

Avoid redundant adapters and wrappers, abstractions for hypothetical reuse, speculative extension hooks or fallback branches, duplicate state or validation, configuration flags without a real choice, unnecessary dependencies, and unrelated refactors. Introduce abstractions where current behavior, boundary isolation, ownership, testability, or domain complexity actually benefits. Do not force duplication merely to avoid an abstraction.

Prefer straightforward, readable control flow and explicit ownership over compressed code. Preserve required error handling, failure/retry paths, recovery, and coverage. A sound change can legitimately need multiple modules, new types, or additional tests. Never use lines changed, files created, or abstraction counts as hard limits or quality scores.

### Self-review and independent review

**Implementer:** Before handoff, compare the diff to the requested outcome. For each materially new abstraction, dependency, configuration choice, or state owner, verify that it serves a current requirement or boundary. Files may be split for ownership and testability without individual justification. Remove dead scaffolding and unrelated changes. Verify the behavior and material failure cases using the repository's testing rules. Explain only non-obvious choices; avoid a report-sized checklist for a trivial change.

**Reviewer:** After any required independent UX first-read, compare the diff with existing capabilities and concrete callers. Raise evidence-based findings for unnecessary complexity only where it materially harms maintainability, clarity, consistency, or correctness; name a simpler viable alternative. Distinguish defects from optional cleanup. Do not reject correct work merely for its size, coding style, or possible future reuse.
