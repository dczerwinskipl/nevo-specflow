<!-- GENERATED FILE — do not edit. Run: pnpm docs:check --write -->

# Documentation index

Regenerate with `pnpm docs:check --write`. Human-authored navigation lives in [`docs/README.md`](README.md).

## Hub

| ID | Title | Status | Summary |
|---|---|---|---|
| `docs.architecture-decisions-readme` | [Architecture Decision Records](architecture/decisions/README.md) | current | Index of ADRs. Each ADR captures one durable, cross-cutting decision, its context, and its consequences. |
| `docs.architecture-readme` | [Architecture documentation](architecture/README.md) | current | Durable technical boundaries, repository structure, system invariants, and architecture decision records. |
| `docs.design-system-react-readme` | [React documentation](design-system/implementation/react/README.md) | current | React implementation conventions — component composition, module organization, hooks, and state ownership. |
| `docs.design-system-readme` | [Design system documentation](design-system/README.md) | current | Reusable Nevo UI design and implementation guidance, independent of SpecFlow product behavior. |
| `docs.design-system-storybook-readme` | [Storybook documentation](design-system/implementation/storybook/README.md) | current | Storybook conventions — story hierarchy and naming, fixtures, interaction tests, and the agent visual-verification workflow. |
| `docs.design-system-tailwind-readme` | [Tailwind documentation](design-system/implementation/tailwind/README.md) | current | Tailwind CSS conventions — class composition pipeline, component variants, token usage, and the `@apply` policy. |
| `docs.engineering-cli-readme` | [CLI engineering](engineering/cli/README.md) | current | CLI-specific engineering guidance for command composition, external contracts, and executable testing. |
| `docs.engineering-readme` | [Engineering documentation](engineering/README.md) | current | Entry point for shared implementation guidance, repository engineering, CLI, and future Runtime, UI, AI, and workflow engineering rules. |
| `docs.engineering-repository-readme` | [Repository engineering](engineering/repository/README.md) | current | Repository-level engineering practices: local setup, Git and pull requests, CI, releasing, packaging, dogfooding, dependencies, and security. |
| `docs.engineering-shared-readme` | [Shared engineering guidance](engineering/shared/README.md) | current | Cross-cutting implementation rules shared by CLI, Runtime, UI adapters, AI, workflow, and repository tooling. |
| `docs.instructions-readme` | [Instructions](instructions/README.md) | current | Task-oriented guidance for humans and agents that routes to authoritative documentation. |
| `docs.product-readme` | [Product documentation](product/README.md) | current | What Nevo SpecFlow does: shared product concerns and the SpecFlow product surfaces. |
| `docs.product-shared-readme` | [Shared product concerns](product/shared/README.md) | current | Product concerns common to every surface — vocabulary and localization. The CLI, Runtime, and UI must stay consistent with these. |
| `docs.product-specflow-cli-readme` | [CLI product documentation](product/specflow/cli/README.md) | current | The nevo-specflow command-line product — who uses it and how it should behave. Node CLI implementation guidance is under engineering/cli/. |
| `docs.product-specflow-readme` | [SpecFlow product documentation](product/specflow/README.md) | current | Product overview and user-facing behavior of the SpecFlow CLI and UI. |
| `docs.product-specflow-ui-readme` | [SpecFlow UI product documentation](product/specflow/ui/README.md) | current | The Nevo SpecFlow UI — who uses it, how navigation and surfaces behave, and how AI sessions are presented. React/Tailwind implementation guidance is under design-system/. |
| `docs.readme` | [Nevo SpecFlow documentation](README.md) | current | Top-level map of architecture, engineering, design-system, product, reference, and instruction documentation. |
| `docs.reference-readme` | [Reference documentation](reference/README.md) | current | Exact contracts and factual lookup material such as public CLI, API, protocol, and configuration contracts. |

## Architecture

| ID | Title | Status | Summary |
|---|---|---|---|
| `architecture.repository-structure` | [Repository structure](architecture/repository-structure.md) | current | Monorepo layout (apps/packages/tools), the Turborepo task graph, the CI affected-package model and what invalidates everything, the SemVer / release-line model, and the pre-1.0 policy. |

## Adr

| ID | Title | Status | Summary |
|---|---|---|---|
| `adr.0001-record-architecture-decisions` | [Record architecture decisions](architecture/decisions/0001-record-architecture-decisions.md) | current | Durable, cross-cutting decisions are recorded as lightweight numbered Markdown ADRs under docs/architecture/decisions/. |
| `adr.0002-toolchain-selection` | [Toolchain selection](architecture/decisions/0002-toolchain-selection.md) | current | The monorepo foundation is pnpm 10 + Turborepo + TypeScript + ESLint flat config (type-aware for TS) + Prettier + Vitest on Node Active LTS. Two versions are held back on purpose — pnpm (for GitHub Dependency Graph compatibility) and TypeScript (for the lint ecosystem) — each with an explicit upgrade condition. |
| `adr.0003-branch-and-release-model` | [Branch and release model](architecture/decisions/0003-branch-and-release-model.md) | current | main carries the next development version; short-lived feature/ and fix/ branches merge into it by squash-only PR; each maintained minor line has one long-lived release/vX.Y branch. The next-version choice (minor vs major) is always an explicit input. |
| `adr.0004-mit-license` | [MIT license](architecture/decisions/0004-mit-license.md) | current | The repository is licensed MIT — permissive, minimal obligations, sufficient for a public developer-tooling project. Provenance of any code brought in from another repository is checked per file when brought in. |
| `adr.0005-repository-tooling-is-separate-from-the-product-api` | [Repository tooling is separate from the product API](architecture/decisions/0005-repository-tooling-is-separate-from-the-product-api.md) | current | Repository-internal developer tooling lives under `tools/*` as private, unscoped packages and never becomes a Nevo SpecFlow product surface by default. Product capabilities are designed as `@nevo/*` packages and `nevo-specflow` commands in their own right. |
| `adr.0006-product-ships-as-a-single-bundled-artifact` | [The product ships as a single bundled artifact](architecture/decisions/0006-product-ships-as-a-single-bundled-artifact.md) | current | `@nevo/specflow` is distributed as one self-contained tarball. `nevo-repo-product` (esbuild) bundles the `nevo-specflow` entry, the internal workspace capability packages and `commander` into `dist/bin.js`, so the artifact installs with no registry and no workspace. Source package boundaries are unchanged — only the distribution is one file. |
| `adr.0007-documentation-architecture-and-taxonomy` | [Documentation architecture and taxonomy](architecture/decisions/0007-documentation-architecture-and-taxonomy.md) | draft | Defines a documentation architecture that separates product behavior, durable system architecture, engineering guidance, reusable design-system knowledge, exact reference contracts, and operational instructions, while using searchable scope, area, and tag metadata so discovery does not depend on folder paths alone. |
| `adr.0008-product-naming-and-surfaces` | [Product naming and surfaces](architecture/decisions/0008-product-naming-and-surfaces.md) | current | Names the product Nevo SpecFlow, its executable nevo-specflow, its long-lived backend Nevo SpecFlow Runtime, its interactive application Nevo SpecFlow UI, and keeps Nevo UI as the reusable design system. |

## Engineering

| ID | Title | Status | Summary |
|---|---|---|---|
| `design-system.implementation.react.component-guidelines` | [React component guidelines](design-system/implementation/react/component-guidelines.md) | draft | Small focused components, composition over configuration, split by responsibility not ceremony, feature-local vertical ownership, hooks by behavior, and where state lives. |
| `design-system.implementation.storybook.guidelines` | [Storybook guidelines](design-system/implementation/storybook/guidelines.md) | draft | Story hierarchy and naming (Foundations / Shared UI / Features / Screens), strict co-location, typed fixture factories, args-first state, play-function interaction tests, and the mandatory verification workflow. |
| `design-system.implementation.tailwind.styling-guidelines` | [Tailwind styling guidelines](design-system/implementation/tailwind/styling-guidelines.md) | draft | Class-composition pipeline: static local layout inline, reusable variants via cva, domain state resolved to a semantic tone before classes, explicit conditional composition, and a narrow @apply policy. |
| `design-system.principles.ui-ux-guidelines` | [UI/UX engineering guidelines](design-system/principles/ui-ux-guidelines.md) | draft | Portable engineering rules for building UI: validate the composed screen, semantic typography/color/spacing tokens, information hierarchy, progressive disclosure, and mandatory visual self-review. Product-specific UX (AI sessions, SpecFlow UI screens) is under product/specflow/ui/. |
| `engineering.cli.architecture` | [CLI architecture](engineering/cli/architecture.md) | current | CLI-specific architecture: Commander for command trees, thin bin/handlers, command-local options, shell composition, capability-owned adapters, and stable stdout/stderr/exit contracts. |
| `engineering.cli.testing` | [CLI testing](engineering/cli/testing.md) | current | CLI-specific testing guidance: test command adapters in-process and keep a small subprocess/packaged smoke suite for help, version, usage errors, routing, and clean machine-readable output. |
| `engineering.repository.ci` | [Continuous integration](engineering/repository/ci.md) | current | What the CI workflows run, how affected-package execution is scoped on PRs, which checks are required to merge, and what invalidates the whole graph. |
| `engineering.repository.commit-conventions` | [Commit conventions](engineering/repository/commit-conventions.md) | current | Conventional Commits `<type>(<scope>): <description>` is the required PR-title format (it becomes the squash commit message). A scope is required; scopes are open-ended. Branch-local checkpoint commits are exempt. |
| `engineering.repository.dependencies-and-security` | [Dependencies and security](engineering/repository/dependencies-and-security.md) | current | How dependency updates arrive (Dependabot, grouped, weekly), how versions are pinned, the vulnerability-report path, the repository security features that are enabled, and when CodeQL should be added. |
| `engineering.repository.dogfooding` | [Dogfooding the product build](engineering/repository/dogfooding.md) | current | `pnpm dogfood:install` builds the real distributable, packs it, installs THAT tarball globally with pnpm, and smokes the installed `nevo-specflow`. It deliberately uses a tarball — not a workspace link — so it catches packaging problems a linked install would hide. |
| `engineering.repository.git-workflow` | [Git workflow](engineering/repository/git-workflow.md) | current | Branch model (main, feature/, fix/, release/v*), protected-branch rules, squash-merge policy, and how maintained release lines and hotfixes work. |
| `engineering.repository.local-setup` | [Local setup](engineering/repository/local-setup.md) | current | Prerequisites (Node, Corepack/pnpm), the standard root commands, and how Turborepo owns the task graph. |
| `engineering.repository.product-packaging` | [Product packaging](engineering/repository/product-packaging.md) | current | How the Nevo SpecFlow product is turned into one installable artifact: nevo-repo-product bundles the nevo-specflow entry, the internal workspace capability packages and commander with esbuild, then packs on the pinned pnpm to produce .artifacts/nevo-specflow-<version>.tgz (with a THIRD_PARTY_NOTICES.txt). Source package boundaries stay real — the shell composes, each vertical owns its CLI adapter — only the distribution is a single file. |
| `engineering.repository.pull-requests` | [Pull requests](engineering/repository/pull-requests.md) | current | PR template, the merge gate on protected branches, and review expectations for a currently single-maintainer repository. |
| `engineering.repository.releasing` | [Releasing and version lines](engineering/repository/releasing.md) | current | The version model (version.json = channel + version), CI-derived build versions, the legal-transition gate, the cut-release-line and release workflows, the beta -> rc -> stable channel flow with an automatic post-stable advance, intentional prerelease tag sequences, and the pre-1.0 policy. |
| `engineering.shared.async-and-lifecycle` | [Async and lifecycle](engineering/shared/async-and-lifecycle.md) | current | Shared lifecycle rules for async work: long-lived code must be cancellable and non-blocking, resources have explicit owners, child processes distinguish startup from completion, and cleanup is deterministic. |
| `engineering.shared.code-organization` | [Code organization](engineering/shared/code-organization.md) | current | Shared code-organization rules: thin external boundaries, application use cases, pure policy, cohesive capability ownership, explicit lightweight DI, and pragmatic extraction instead of ceremonial layers. |
| `engineering.shared.effects-and-io` | [Effects and I/O](engineering/shared/effects-and-io.md) | current | Shared rules for deterministic logic and external effects: keep policy pure where useful, expose narrow application-facing ports, normalize adapter output near the boundary, and keep process/global side effects out of deep modules. |
| `engineering.shared.testing` | [Testing](engineering/shared/testing.md) | current | Shared testing strategy: pure policy tests, application tests with in-memory fakes, adapter integration tests, deterministic fixtures, and focused coverage rather than framework re-testing. |

## Product

| ID | Title | Status | Summary |
|---|---|---|---|
| `product.shared.localization` | [Localization](product/shared/localization.md) | current | Localization is a standing product requirement. The first release may be English-only, but all user-facing copy must be localizable and must not be scattered as hard-coded strings. The i18n library and locale-loading design are chosen when the UI/CLI reaches that concern. |
| `product.shared.vocabulary` | [Product vocabulary](product/shared/vocabulary.md) | current | Canonical names and product nouns for Nevo SpecFlow. Defines the product, CLI, Runtime, UI, Nevo UI design system, package naming, and shared workflow vocabulary. |
| `product.specflow.cli.interaction-model` | [CLI interaction model](product/specflow/cli/interaction-model.md) | draft | Command shape (nevo-specflow <noun> <verb>), the stdout/stderr/exit-code contract shared with agents and CI, deterministic output, and how confirmations gate irreversible actions on the human path only. |
| `product.specflow.cli.personas` | [CLI personas](product/specflow/cli/personas.md) | draft | The three consumers of nevo-specflow — the repository owner/maintainer, the AI coding agent, and CI — and what each needs from the command surface. |
| `product.specflow.overview` | [Product overview](product/specflow/overview.md) | draft | Nevo SpecFlow is a human-led, spec-anchored workflow for AI-assisted software engineering, delivered as a CLI (`nevo-specflow`), a local Runtime, and an interactive UI. |
| `product.specflow.ui.ai-session-ux` | [AI session UX](product/specflow/ui/ai-session-ux.md) | draft | How an AI session is presented: canonical semantics first, immediate turn feedback, "thinking" needs evidence, "waiting" is not "needs attention", and the four Work information levels. |
| `product.specflow.ui.interaction-model` | [UI interaction model](product/specflow/ui/interaction-model.md) | draft | Responsive shell (wide with contextual inspector / narrow), the product navigation hierarchy, context-preserving drill-down, and when to use a tooltip vs. inspector vs. sheet vs. full page. |
| `product.specflow.ui.personas` | [UI personas](product/specflow/ui/personas.md) | draft | Who uses the UI — the owner monitoring and steering work, and the reviewer checking a change — and what each needs from it. The UI observes and steers; it does not replace the CLI/PR workflow. |

## Reference

| ID | Title | Status | Summary |
|---|---|---|---|
| `reference.cli.nevo-specflow-contract` | [nevo-specflow public CLI contract](reference/cli/nevo-specflow-contract.md) | draft | The currently-implemented public surface of the nevo-specflow CLI — --help, --version and the runtime bootstrap command — and an explicit statement that no other command (init, status, workflow, install, update) exists yet. |

