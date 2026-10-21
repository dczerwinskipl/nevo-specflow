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

## Runtime feature boundaries

Runtime product capabilities live under `src/features/<feature-name>/`. Infrastructure and
composition concerns such as `server/`, `config/`, `init/`, and `cli/` remain outside that
tree.

Each feature exposes its Runtime-facing production surface through
`src/features/<feature-name>/index.ts`. Feature composition lives in `feature.ts`; `index.ts`
is the public boundary and should not grow into the implementation module itself. Production code
outside the feature imports that boundary rather than reaching into the feature's internal sub-slices. Cross-feature production dependencies
use the target feature's public boundary.

Focused unit tests belong beside the internal module they verify. Package-level integration tests
may use explicit internal test seams when the purpose of the test is to exercise composition or an
adapter boundary that cannot be reached through the feature's production surface without obscuring
the scenario. Such imports are test-only and must not become production dependencies.

Prefer:

```text
src/
  features/
    auth/
      index.ts
      feature.ts
      authentication/
      authorization/
    specs/
      index.ts
      feature.ts
      overview/
        current/
        archive/
        repository/
    sessions/
      index.ts
      feature.ts
    settings/
      index.ts
      feature.ts
    runtime-feature.ts
  config/
    parsing/
  server/
  init/
```

A feature owns the authorization resource definitions and capabilities it exposes. Cross-cutting
authorization evaluates them but does not import product feature definitions. The Runtime composition root collects feature authorization
resource definitions, defines the product role-to-capability policy, and injects both into Auth. Product
features do not depend on global role names merely to publish their capabilities.

A sub-slice should make materially different behavior visible in the path. For example, Specs
Overview uses `overview/current/` and `overview/archive/` because they are different read models
and use cases. Do not force unrelated variants into one envelope merely to share a transport path.

`index.ts` is special. At `features/<feature>/index.ts` it is the public feature boundary.
Inside an internal folder, use `index.ts` only when that folder intentionally exposes a
sub-boundary consumed from outside the sub-slice. If a file merely defines one port or operation,
name that responsibility directly, for example `repository/read-repository.ts`.

Generic filenames such as `endpoint.ts`, `model.ts`, or `configuration.ts` are appropriate when
their directory already provides unambiguous context. Prefer responsibility names over
transport-only names such as a bare `http.ts`.

### Runtime backend naming

Runtime backend directories and TypeScript module filenames use lowercase kebab-case. Paths describe
modules and ownership; TypeScript identifiers follow normal language conventions.

Prefer:

```text
features/specs/overview/current/get-overview.ts
features/auth/authentication/password-login/verify-credentials.ts
features/auth/authorization/capability-discovery/endpoint.ts
```

with exported identifiers such as `getCurrentOverview`, `SpecCapabilities`, and
`AuthenticationRequiredError`.

Do not repeat directory context in filenames when the path already makes the responsibility clear.
For example, prefer `overview/current/get-overview.ts` over
`overview/current/get-current-specs-overview.ts`.

This convention applies to Runtime/backend modules in this architecture. UI component filename
casing is a separate repository convention and is not defined by this rule.

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
and rejects Node builtin imports from neutral package production source/output. Explicitly named
co-located development artifacts such as `.test.*`, `.stories.*`, and `.test-support.*` are not
part of that production-source scan. ESLint separately enforces the
extensionless relative-source convention.

Repository tooling under `tools/**` may use NodeNext-style `.js` specifiers when it executes
raw `tsc` output. See ADR 0009 for the product-package build model.

## Module ownership and boundaries

A component, store or API port MUST live in the module (feature) that owns the capability,
regardless of which screen or task first needed it. A screen's folder MUST NOT become the storage
of every element that screen happened to need first. Screen coordination does not change
ownership.

- Each feature owns its capabilities: components, state stores and API ports. A port is an
  interface plus a named adapter beside it, provided as a separate service from the composition
  root.
- `shared/` MUST hold only code that several features genuinely use and MUST NOT import a feature
  or a composition root. Code SHOULD NOT be promoted to `shared/` for convenience; promote it when
  a second feature needs it.
- Target rule for new code and code touched during migration: features SHOULD reach other features
  only through the target feature's public boundary (`features/<name>/index.ts`), which exports
  what others may use. This is not an existing invariant, and creating a barrel only to satisfy
  this rule is not required. A feature-private sub-slice SHOULD NOT be imported from outside.
- If ownership is ambiguous, surface the decision instead of defaulting to the current screen's
  folder.

Example: demo adapters (for example `api.demo.ts`) do not decide ownership. A demo adapter MAY
exist only for an explicit Demo Runtime contract (a real backend demo endpoint) or an isolated
test environment. It is not a frontend fixture or mock-data mode, and a port is not required to
have two adapters. Production fixture-based adapters remain forbidden.

### What tooling enforces today

- Enforced by ESLint on main: the package-level `no-restricted-imports` product boundaries in
  `eslint.config.mjs` (which package may import which). Feature-barrel imports and the `shared/`
  direction are NOT enforced by ESLint, and no rule is added for them.
- `react-hooks/*` ESLint rules are not configured on main. Where a package later configures them,
  they MUST pass; until then the state and effect rules below are guidance applied by agents and
  reviewers, not automatic enforcement.
- The module ownership and state/effect review gate is agent guidance applied through agent
  instructions and review. Nothing blocks a merge automatically.

## React UI state, effects and async operations

These rules apply only to React UI code (`packages/specflow-ui`, `packages/nevo-ui`). They apply
when adding, moving or modifying components, hooks, effects, mutations or stores.

- Values computable from props, state or query data MUST be derived during render (or memoized)
  and MUST NOT be copied into state or synchronized by an effect.
- Effects MUST synchronize with external systems (DOM, subscriptions, timers). Operation logic
  (submit, save, retry) MUST live in event handlers or a dedicated hook, not in effects reacting to
  state.
- Each user action (for example Save) MUST have a single owner operation; header buttons,
  shortcuts and leave dialogs MUST call that same operation rather than reimplement it.
- An async operation MUST act on the resource it was started for. A closure over an immutable
  resource identity captured at request start is acceptable; reading a mutable "current resource"
  (from a ref, store or closure) when the operation settles MUST NOT decide what is updated.
  Passing identity as mutation variables is one way to do this, not the only one.
- Late results (after supersession, owner change or unmount) are not always discarded; they MUST
  NOT corrupt newer state or the state or cache of another resource.
- Refs MUST NOT be written during render, and UI-relevant state MUST NOT be hidden in refs. Refs
  are fine for data that does not affect rendering. A concurrency-control mechanism (ledger,
  lock) MUST have one owner and a defined lifecycle.
- State MUST live at the lowest common owner and its updates MUST be isolated so unrelated
  consumers do not re-render. Example: an external store with selective subscription is one
  acceptable option when state must outlive unmount or is shared by independent components.
- A complex, domain-specific multi-phase operation (recovery, retry, conflict, uncertain outcome)
  SHOULD be modeled as an explicit state machine when its transition rules are not already owned
  by the framework or query library. Example: a pure reducer over named phases, tested for legal
  and illegal transitions. TanStack Query `useMutation` already covers plain save and error
  handling, so such operations need no extra reducer.
- Where `react-hooks/*` rules are configured, separate synchronization effects from operation
  logic instead of blindly adding dependencies.

Ownership, state derivation, effects and async operations of a React UI change SHOULD be reviewed
against this section. Component line count is an inspection trigger, not a rule.

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
