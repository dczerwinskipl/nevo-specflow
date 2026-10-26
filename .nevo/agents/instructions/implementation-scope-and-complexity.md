Keep implementation and review proportional to the requested outcome. This guidance is not a separate approval gate, a replacement for role-specific workflows, or a line-count target. An explicit owner request sets the intended scope but cannot silently override a current MUST/MUST NOT contract; resolve such conflicts in the authoritative source before dependent changes. Do not sacrifice correctness, security, authorization, accessibility, required verification, deterministic invariants, lifecycle safety, or Git recovery for a smaller diff.

### Establish what is needed

Identify the requested observable outcome and what must remain unchanged. Inspect the closest capability owner, existing public APIs, dependencies, relevant tests, and representative consumers as needed to establish the change's effects. For new or materially changed UI patterns, inspect matching design-system contracts, available Storybook stories, and rendered behavior. An isolated visual correction does not require an unrelated component survey, but still needs applicable design-system rules and visual verification. Required repository knowledge, applicable contracts, and verification still apply. Search by responsibility, proportional to uncertainty and blast radius.

Prefer reusing an existing capability when both its semantics and ownership fit. Otherwise compose existing capabilities, extend their owner, or introduce a new capability when the present requirement justifies it. For UI work, follow the more specific design-system reuse rules. Similar-looking code does not necessarily have matching semantics. Do not cross ownership boundaries merely to reduce file count.

### Keep the implementation complete but focused

Avoid forwarding-only wrappers, abstractions for hypothetical reuse, unsupported compatibility paths, fallbacks without a defined failure case, duplicate state or validation without distinct boundary responsibilities, configuration options with no real choice, unnecessary dependencies, and unrelated refactors. Introduce abstractions where current behavior, boundary isolation, ownership, testability, or domain complexity actually benefits. Do not force duplication merely to avoid an abstraction.

Prefer straightforward, readable control flow and explicit ownership over compressed code. Preserve required error handling, failure/retry paths, recovery, and coverage. A sound change can legitimately need multiple modules, new types, or additional tests. Never use lines changed, files created, or abstraction counts as hard limits or quality scores.

### Self-review and independent review

**Implementer:** Before handoff, compare the diff to the requested outcome. For each materially new abstraction, dependency, configuration choice, or state owner, verify that it serves a current requirement or boundary. Files may be split for ownership and testability without individual justification. Remove dead scaffolding and unrelated changes. Verify the behavior and material failure cases using the repository's testing rules. Explain only non-obvious choices; avoid a report-sized checklist for a trivial change.

**Reviewer:** After any required independent UX first-read, compare the diff with existing capabilities and concrete callers. Raise evidence-based findings for unnecessary complexity only where it materially harms maintainability, clarity, consistency, or correctness; name a simpler viable alternative. Distinguish defects from optional cleanup. Do not reject correct work merely for its size, coding style, or possible future reuse.
