---
id: engineering.shared.code-organization
type: engineering
title: Code organization
status: current
read_when:
  - structuring or refactoring application code
  - deciding whether to introduce another layer or module
  - reviewing dependency direction or module ownership
summary: >
  Shared code-organization rules: thin external boundaries, application use cases,
  pure policy, cohesive capability ownership, explicit lightweight DI, and pragmatic
  extraction instead of ceremonial layers.
related:
  - engineering.shared.effects-and-io
  - engineering.shared.async-and-lifecycle
  - engineering.shared.testing
  - engineering.cli.architecture
---

# Code organization

Use the smallest structure that gives clear ownership, testability, and lifecycle
boundaries. Architectural names are responsibilities, not a mandatory directory tree.

## Dependency flow

```text
external boundary (CLI / HTTP / event / UI adapter)
        ↓
application use case / orchestration
        ↓
pure policy / transformation / state logic
        ↓
explicit external dependencies
```

Do not force work through forwarding chains such as
`Handler → Service → Manager → Repository`. Introduce a boundary when it owns an
observable responsibility.

## External boundaries stay thin

CLI handlers, HTTP routes, event consumers, and similar adapters translate external
input into an application operation and translate its result back out. They do not own
business planning, persistence orchestration, or domain validation.

If two external surfaces need the same operation, both call the same application
function. One surface must not spawn another surface's CLI merely to reuse behavior.

## Organize by cohesive capability

Name modules after what they do: `search.ts`, `create-release.ts`,
`session-lifecycle.ts`. Avoid generic dumping grounds such as `utils.ts`,
`helpers.ts`, `manager.ts`, or `service.ts` unless the name expresses a real
domain concept.

Feature-local ownership is preferred over central folders that collect unrelated code
of the same technical shape.

## File size is an inspection trigger

There is no hard line-count limit. Refactor when a file mixes independent
responsibilities, multiple lifecycle owners, unrelated effects, or becomes difficult to
test for reasons unrelated to its core algorithm.

A large cohesive parser, projection, or state machine may remain one module.

## Dependency injection

Use explicit function arguments or a small context object for external effects and
nondeterministic sources.

```ts
export async function executeRelease(
  plan: ValidReleasePlan,
  deps: { git: GitClient; github: GitHubClient; clock: Clock },
): Promise<ReleaseResult> {
  // ...
}
```

Do not add a DI container. Do not inject pure helpers.


## Comments document why and invariants

Comments should preserve information that cannot be recovered cheaply from reading the code.

Good comments explain:

- why an unusual constraint exists;
- which invariant a non-obvious guard protects;
- why a seemingly simpler implementation is unsafe;
- protocol or compatibility facts that are not encoded in types/tests.

Avoid comments that merely restate the next line of code.

Do not leave temporary specification IDs, task IDs, line numbers, review references, or migration
breadcrumbs in production comments unless they are a durable public identifier such as an ADR or
authoritative documentation ID. Historical implementation context belongs in Git/PR/spec history,
not in code comments.
