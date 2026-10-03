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

### Keep owned development artifacts with the feature

Source-adjacent artifacts follow the same ownership rule as production code. Focused unit tests,
component tests, hooks tests, Storybook stories, and feature-local fixtures/helpers belong beside
the module, component, or vertical slice they describe.

Do not move them into central technical buckets merely because they are tests or stories. A
package-level `test/` directory is for cross-module integration, public-contract, packaging,
process-boundary, smoke, or end-to-end verification.

See [Testing](testing.md#test-and-story-placement) for the placement decision and examples.

### Structure vertical slices recursively

A vertical slice is an ownership boundary, not permission to flatten a large feature into one
directory. When a capability grows, split it again by cohesive sub-capability or operation.

Prefer:

```text
feature/
  composition.ts
  sub-capability-a/
    operation.ts
    policy.ts
    adapter.ts
  sub-capability-b/
    ...
```

over central technical buckets such as `feature/routes/`, `feature/services/`, or
`feature/repositories/` when those folders separate code that changes together. A small genuinely
shared adapter concern may stay at the feature root, but provider/operation-specific transport code
belongs beside the operation it adapts.

## TypeScript imports in product packages

Code under `packages/**` uses TypeScript's bundler resolution. Relative TypeScript
imports use extensionless source specifiers:

```ts
import { createThing } from './create-thing';
```

Do not write source-relative JavaScript/TypeScript module suffixes in product packages. The
generic product-package builder owns emitted filenames and bundles JavaScript plus declaration
files from the same public surface. Neutral packages extend `tsconfig.package-neutral.json`;
Node-only packages extend `tsconfig.package-node.json` and declare `engines.node`. The builder
derives the platform from that tsconfig profile, rejects ambiguous profile/manifest combinations,
and rejects Node builtin imports from neutral package source/output. ESLint separately enforces the
extensionless relative-source convention.

Repository tooling under `tools/**` may use NodeNext-style `.js` specifiers when it executes
raw `tsc` output. See ADR 0009 for the product-package build model.

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
