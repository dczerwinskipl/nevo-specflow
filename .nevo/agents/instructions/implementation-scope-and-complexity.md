Use this as a proportional decision aid for implementation and review, not a new approval gate or a rule to minimize line count. Explicit scope and authoritative product, architecture, design-system, and engineering contracts take precedence. Never trade correctness, security, authorization, accessibility, required tests, deterministic invariants, lifecycle safety, or Git recovery for a smaller diff.

### Establish what is needed

Identify the requested observable outcome and what must remain unchanged. Inspect the closest capability owner, existing public APIs, dependencies, relevant tests, and representative consumers. For UI changes, inspect semantically matching design-system patterns and Storybook stories. Search by responsibility; keep discovery proportional to the task rather than auditing unrelated code.

Prefer existing suitable behavior as-is, then composition or extension at the established owner, and only then a new capability justified by a current requirement. Similar-looking code is not sufficient evidence of matching semantics. Do not cross ownership boundaries simply to reduce file count.

### Keep the implementation complete but focused

Avoid redundant adapters and wrappers, abstractions for hypothetical reuse, speculative extension hooks or fallback branches, duplicate state or validation, configuration flags without a real choice, unnecessary dependencies, and unrelated refactors. Introduce abstractions where current behavior, boundary isolation, ownership, testability, or domain complexity actually benefits. Do not force duplication merely to avoid an abstraction.

Prefer straightforward, readable control flow and explicit ownership over compressed code. Preserve required error handling, failure/retry paths, recovery, and coverage. A sound change can legitimately need multiple modules, new types, or additional tests. Never use lines changed, files created, or abstraction counts as hard limits or quality scores.

### Self-review and independent review

**Implementer:** Before handoff, compare the diff to the requested outcome. For each new file, abstraction, dependency, configuration option, and state owner, identify the present requirement it serves. Remove dead scaffolding and unrelated changes. Verify the behavior and material failure cases using the repository's testing rules. Explain only non-obvious choices; avoid a report-sized checklist for a trivial change.

**Reviewer:** After any required independent UX first-read, compare the diff with existing capabilities and concrete callers. Raise evidence-based findings for unnecessary complexity only where it materially harms maintainability, clarity, consistency, or correctness; name a simpler viable alternative. Distinguish defects from optional cleanup. Do not reject correct work merely for its size, coding style, or possible future reuse.
