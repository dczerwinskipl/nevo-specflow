---
id: ideas.definition-starter-packs
type: engineering
title: Repository-owned starter definition packs for .NET, React and Node.js
status: draft
scope: specflow
areas: [workflow, configuration, ai, docs, testing, cli]
tags: [definitions, starter-packs, dotnet, react, nodejs, task-types, verification]
read_when:
  - preparing usable default definitions for a real application rather than the SpecFlow repo
  - designing technology-specific Task Types, agent guidance and validation gates
  - deciding how installed definitions and optional starter packs compose
summary: >
  Proposal for tested, opt-in definition packs for .NET, React and Node.js projects,
  built on a common specification and task workflow with technology-aware guidance,
  document templates and safe verification recipes. Definitions stay project-owned.
related:
  - ideas.readme
  - ideas.specflow-engine.agent-workflow-entrypoints
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - adr.0017-definitions-as-project-data
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - ideas.roadmap
---

# Technology-aware starter definition packs

## Why

The product ships editable seed definitions, including `specification-standard`,
`task-standard`, `task-ui`, `implementation` and `ui-implementation`. They establish the
generic workflow shape, but do not yet provide a well-tested starting set of
technology-specific instructions, document templates, and verification choices for
an ordinary .NET, React or Node.js application.

A user should be able to initialize SpecFlow in a real repository and ask an agent
to write a Specification or perform a Task without first designing an entire
definition catalogue. **The common shipped seeds must remain sufficient on their own
for generic projects**. Optional stack packs improve instruction quality and
verification for recognised applications; they must never be required for Create,
Task authoring or manual Workflow. A good default is useful out of the box,
explicit about assumptions, and easy to edit, not a collection of hard-coded
framework rules inside the Engine.

## Composition proposal

Keep **one common workflow vocabulary** (requirements, specification, solution,
breakdown, review, Task implementation/review, owner acceptance). Compose it with
project-selected definitions and instructions:

| Layer             | Purpose                                                                           | Initial direction                                        |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Shared core       | Standard Specification/Task workflows and generic roles                           | Reuse existing shipped YAML                              |
| Work kind         | Discovery, backend, frontend, integration, tests, migration, documentation, spike | Curated Task Types where their process genuinely differs |
| Technology pack   | Target-specific context, conventions, commands and examples                       | .NET, React, Node.js                                     |
| Repository policy | Actual project architecture, build/test aliases, permitted paths and ADRs         | Project-owned configuration and docs                     |
| Execution policy  | Agent capabilities, provider/model availability and approvals                     | Existing archetypes and E6, not pack authority           |

Do **not** create separate near-identical Workflow definitions for every language and
framework. Add a distinct workflow only when the steps, required evidence or review
policy materially differ. If the current definition schema cannot express a composed
pack, make the smallest explicit schema/tooling extension after an acceptance fixture
demonstrates the need. Do not invent an implicit YAML overlay precedence.

## Proposed initial packs

### .NET / ASP.NET Core

- Service/API and library contexts, including multi-project solutions; check target
  framework, solution/project selection and test project layout from the repository.
- Agent guidance for DI, async/cancellation, API compatibility, persistence and
  migrations, security, error handling, structured logs and existing architecture.
- Task templates: behavior/contract, impacted projects, tests, migration and rollback
  evidence when applicable. Avoid forcing database or CQRS practices on every project.
- Candidate verification **recipes**, selected from project-declared commands:
  restore/build/test, format/static analysis and optional integration tests.
  Examples like `dotnet test` are suggestions, not automatically executable gates.

### React / TypeScript

- Support single-page UI, component libraries and frontends in a monorepo. Detect
  the actual package manager, router, state/data libraries, styling and test runner.
- Guidance for UI behavior, accessibility, responsive layout, state, errors,
  interaction tests, component isolation and consistency with the repo design system.
- Task templates: UX contract, interaction states, component boundaries, test
  coverage and visual verification evidence when appropriate.
- Candidate verification: repository-declared typecheck, lint, unit/component tests,
  build and optional browser/visual checks. Never assume `npm test` or Playwright exists.

### Node.js / TypeScript

- Support API/service, worker, CLI and library projects; recognize runtime,
  module system, workspace setup and package manager from actual project facts.
- Guidance for input/schema validation, async behavior, process shutdown,
  resource handling, auth, logging, integration boundaries and compatibility.
- Task templates: API/event contract, failure behavior, dependencies, fixtures,
  observability and deployment impact where relevant.
- Candidate verification: project-declared install policy, typecheck, lint, tests,
  build and optional integration/contract tests; no implicit dependency installation
  or arbitrary script execution.

### Mixed repositories

For a .NET API with a React app, or a Node backend with shared UI packages,
select both applicable technology contexts and preserve **one** Specification,
Task graph and set of workflow decisions. Integration Tasks may need multiple
verification recipes, but must not acquire two independent execution histories.

A React frontend normally has a `package.json`, but that is **not** evidence of a
Node.js backend. Distinguish the Node.js service/worker pack from the frontend's
toolchain. A plain React app should not be assigned Node service rules about
process shutdown, API authentication or queue consumers.

## Installation and ownership

[ADR 0017](../architecture/decisions/0017-definitions-as-project-data.md) stays
authoritative: installed definitions live **only** in the Project Home's
`.nevo/definitions/` and are user-owned Git files. The product's shipped seeds
are starting data, not a hidden overlay or a mandatory runtime dependency.

Candidate UX: show the common defaults and optional stack packs during `init`
or later installation, with an explicit **preview of files, dependencies, collisions
and effective selections**. Prefer existing `definitions install` semantics where
possible. An install never silently overwrites edited files, restores definitions
the user removed on purpose, or changes existing pinned runs. Automatic repository
detection may **recommend** a pack but cannot select, install or run it without
the owner's choice.

Pack identity/version/provenance and ID collision handling need design before
adding an actual `pack` definition kind or a new `definitions packs` command.
The existing YAML definition kinds and their validation should be reused first.
Technology-specific **agent profile definitions**, if needed, belong in the
project's `.nevo/agents/definitions/`, not in `.nevo/definitions/`; provider-specific
skills are generated projections of those profiles. Avoid committing generated
machine-local settings or credentials. A stack pack must not install a native skill
as a backdoor around the managed provider's fixed tool and extension policy.

## Verification and guardrails

The current shipped workflows primarily support document gates. Command/test
and human verification gates are separately proposed under P105/F03. Therefore
starter packs may describe verification recipes now, but must **not claim those
recipes are enforced by the Engine** until that feature ships and is proven.
Executable commands need an allowlisted repository-owned declaration and an
explicit execution policy; a pack is untrusted project data, not permission to run
arbitrary shell commands.

Every pack should have:

1. A tiny maintained fixture project and valid installed YAML catalogue.
2. A real Specification -> Breakdown -> Task Implement -> independent Review
   -> owner Acceptance journey, exercised with the universal skill/E6 when ready.
3. Evidence that Task context routes to the correct sources and that
   repo-specific rules override suggestions without violating the workflow model.
4. Negative tests for missing toolchains, conflicting package managers,
   multi-root repositories, React-only repositories mistakenly detected as Node
   services, unknown test commands and stale definition revisions.
5. Measured prompt/context size and review of instruction quality on at least
   two different representative repositories per ecosystem (not only SpecFlow).
6. No assumption that an agent's reported "tests passed" is a verified Engine gate.

## Proposed delivery order

1. Audit current seed workflows, Task Types and archetypes; establish a small
   reusable base and a catalogued test fixture.
2. Deliver an opt-in .NET pack end-to-end, including guidance and examples.
3. Add React and Node.js using the same composition mechanics and acceptance tests.
4. Verify mixed .NET + React and Node + React projects and safe install/upgrade
   behavior. Add richer command/human gates only when P105 exists.

**Separate decisions:** whether the first release ships these packs or simply
links optional examples; whether stack detection is preview-only; and whether pack
selection needs a schema extension. No unapproved default is assumed.
