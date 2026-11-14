---
id: ideas.roadmap-delivered
type: hub
title: Nevo SpecFlow roadmap — delivered PR evidence
status: draft
scope: specflow
areas: [workflow, ai, runtime, server, ui, cli, docs, release, security]
tags: [roadmap, delivery, pull-requests, shipped, evidence]
read_when:
  - checking delivery evidence for completed roadmap foundations
  - reconciling roadmap status with the full GitHub pull-request history
  - tracing a merged PR to an implemented area of Nevo SpecFlow
summary: >
  Complete categorized snapshot of merged PRs supporting the SpecFlow roadmap, with separate
  lists of closed-unmerged and open PRs so attempted work is not mislabeled as delivered.
related:
  - ideas.roadmap
  - ideas.readme
---

# Delivered work: pull-request evidence

> **Snapshot: 2026-11-14.** The repository had **145 PRs: 121 merged, 22 closed without merge and 2 open** (including the roadmap PR #149). Statuses below are a static GitHub audit, not live data.
>
> **✅ = merged into `main`, not automatically a completed product capability.** Functional coverage is summarized in the [roadmap](roadmap.md#delivered-foundations); a large feature can still require more work after one or several PRs merge. Closed PRs without merge never get ✅.

## Merged into `main` (121 PRs)

### ✅ Engine, project lifecycle, Git and recovery (15)

- ✅ [#134](https://github.com/dczerwinskipl/nevo-specflow/pull/134): fix(specflow): verify scaffold blobs and repair Session read fixtures
- ✅ [#128](https://github.com/dczerwinskipl/nevo-specflow/pull/128): fix(engine): preserve unstable document observations during admission
- ✅ [#122](https://github.com/dczerwinskipl/nevo-specflow/pull/122): fix(engine): close the Git-process leak behind two nightly test hangs
- ✅ [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120): feat(specflow-engine): add the deterministic workflow kernel for Specifications and Tasks
- ✅ [#111](https://github.com/dczerwinskipl/nevo-specflow/pull/111): fix(engine): close document-write and control-lock races surfaced by main's nightly CI
- ✅ [#105](https://github.com/dczerwinskipl/nevo-specflow/pull/105): feat(engine)!: add document writes, definitions and commit policy
- ✅ [#94](https://github.com/dczerwinskipl/nevo-specflow/pull/94): feat(engine): read a Specification's documents safely (tree, content, raw)
- ✅ [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93): feat(engine): create a Specification from an archetype with a committed, recoverable scaffold
- ✅ [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92): feat(engine): add the Specification documents layer (archetypes, registry, committed Create, safe read)
- ✅ [#77](https://github.com/dczerwinskipl/nevo-specflow/pull/77): fix(ci): run real packaged Engine smoke before merge
- ✅ [#71](https://github.com/dczerwinskipl/nevo-specflow/pull/71): perf(engine): native Git plus parallel Windows full regression
- ✅ [#70](https://github.com/dczerwinskipl/nevo-specflow/pull/70): test(engine): stabilize Windows LC21 and LC26 real-Git regression
- ✅ [#55](https://github.com/dczerwinskipl/nevo-specflow/pull/55): feat(engine): resolve verified Project Home (E1.T03)
- ✅ [#54](https://github.com/dczerwinskipl/nevo-specflow/pull/54): feat(engine): establish independent Engine boundary (E1.T01–T02)
- ✅ [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53): feat(engine): project foundation and CLI/Runtime composition (E1.T01–T06)

### ✅ Specifications, Tasks and document editing (5)

- ✅ [#109](https://github.com/dczerwinskipl/nevo-specflow/pull/109): feat(ui): open the Documents overview by itself on mobile too
- ✅ [#95](https://github.com/dczerwinskipl/nevo-specflow/pull/95): feat(specflow-ui): show archetypes and document states in the documents ui and fix the dogfooding findings
- ✅ [#88](https://github.com/dczerwinskipl/nevo-specflow/pull/88): feat(specflow-ui): open, create and edit documents as tabs
- ✅ [#85](https://github.com/dczerwinskipl/nevo-specflow/pull/85): feat(specflow-ui): add draft foundation for multi-document save and dirty tracking
- ✅ [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60): feat(tasks): add task workbench and scoped read composition

### ✅ Workbench, UI and Design System (23)

- ✅ [#148](https://github.com/dczerwinskipl/nevo-specflow/pull/148): fix(specflow-ui): session composer docking, red Stop, and message actions
- ✅ [#146](https://github.com/dczerwinskipl/nevo-specflow/pull/146): fix(specflow-ui): read source scroll after CodeMirror measures
- ✅ [#145](https://github.com/dczerwinskipl/nevo-specflow/pull/145): fix(specflow-ui): keep the editor position shown when the document panel closes
- ✅ [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124): feat(specflow-ui): share a focused frame and two-column create and specification overview
- ✅ [#112](https://github.com/dczerwinskipl/nevo-specflow/pull/112): feat(specflow-ui): redesign full session screen to workspace v2 + chat v10
- ✅ [#87](https://github.com/dczerwinskipl/nevo-specflow/pull/87): feat(ui): add top and bottom sheet variants to drawer
- ✅ [#86](https://github.com/dczerwinskipl/nevo-specflow/pull/86): feat(ui): add pressed icon toggles and opt-in complete menu to workspace header
- ✅ [#84](https://github.com/dczerwinskipl/nevo-specflow/pull/84): feat(ui): add item tabs, opened-item state and editor-mode mock
- ✅ [#75](https://github.com/dczerwinskipl/nevo-specflow/pull/75): feat(ui): integrate SpecFlow UI with the project Runtime (Create, progress, operations panel, UX v7)
- ✅ [#67](https://github.com/dczerwinskipl/nevo-specflow/pull/67): fix(ui): stop mobile Secondary ghosting and animate Back to Primary
- ✅ [#62](https://github.com/dczerwinskipl/nevo-specflow/pull/62): feat(ui): redesign specifications overview and application navigation
- ✅ [#51](https://github.com/dczerwinskipl/nevo-specflow/pull/51): fix(specflow-ui): finalize auth identity and feature attention ownership
- ✅ [#49](https://github.com/dczerwinskipl/nevo-specflow/pull/49): fix(specflow-ui): harden data access, Workspace refresh boundaries and availability
- ✅ [#48](https://github.com/dczerwinskipl/nevo-specflow/pull/48): refactor(specflow-ui): simplify code quality issues from task routing
- ✅ [#47](https://github.com/dczerwinskipl/nevo-specflow/pull/47): refactor(specflow-ui): canonical Primary routes and global authentication recovery
- ✅ [#46](https://github.com/dczerwinskipl/nevo-specflow/pull/46): refactor(specflow-ui): modularize Specification views and attention
- ✅ [#45](https://github.com/dczerwinskipl/nevo-specflow/pull/45): refactor(specflow-ui): make Full Task a stable route independent of Workspace
- ✅ [#44](https://github.com/dczerwinskipl/nevo-specflow/pull/44): feat(specflow): integrate Specification Workspace with Runtime HTTP API
- ✅ [#42](https://github.com/dczerwinskipl/nevo-specflow/pull/42): feat(nevo-ui): prototype declarative Secondary screen stacks
- ✅ [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39): feat(specflow-ui): implement specification workspace screen
- ✅ [#30](https://github.com/dczerwinskipl/nevo-specflow/pull/30): feat(ui): add specs overview and contextual overflow menus
- ✅ [#27](https://github.com/dczerwinskipl/nevo-specflow/pull/27): feat(ui): add localization and account menu
- ✅ [#25](https://github.com/dczerwinskipl/nevo-specflow/pull/25): feat(ui): harden design-system and Figma boundaries

### ✅ Managed Sessions and provider adapters (6)

- ✅ [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126): feat(sessions): integrate managed Sessions with the UI and make them Specification-owned
- ✅ [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125): feat(runtime): add safe Antigravity discovery and Stop continuation
- ✅ [#117](https://github.com/dczerwinskipl/nevo-specflow/pull/117): feat(ui): start a Session in the Session shell
- ✅ [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107): feat(sessions): add Antigravity and live provider telemetry
- ✅ [#99](https://github.com/dczerwinskipl/nevo-specflow/pull/99): feat(sessions): add shared provider process boundary
- ✅ [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98): feat(sessions): add managed sessions with Claude and Codex

### ✅ Authentication, API and platform contracts (9)

- ✅ [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136): feat(runtime): generate, validate and serve the Runtime OpenAPI document
- ✅ [#32](https://github.com/dczerwinskipl/nevo-specflow/pull/32): chore(hardening): tighten Storybook, authz, and specification copy
- ✅ [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31): feat(authz): add request authorization foundation
- ✅ [#26](https://github.com/dczerwinskipl/nevo-specflow/pull/26): feat(auth): add login flow and modular setup wizard
- ✅ [#24](https://github.com/dczerwinskipl/nevo-specflow/pull/24): chore(architecture): define product package topology
- ✅ [#15](https://github.com/dczerwinskipl/nevo-specflow/pull/15): feat(init): add project bootstrap and config layout
- ✅ [#14](https://github.com/dczerwinskipl/nevo-specflow/pull/14): feat(authorization): add scoped authorization foundation
- ✅ [#13](https://github.com/dczerwinskipl/nevo-specflow/pull/13): feat(runtime): add server and authentication foundation
- ✅ [#12](https://github.com/dczerwinskipl/nevo-specflow/pull/12): feat(http-client): add reusable HTTP client foundation

### ✅ Agent workflows, instructions and UX tooling (13)

- ✅ [#102](https://github.com/dczerwinskipl/nevo-specflow/pull/102): docs(agents): align implementation simplicity rules with canonical guidance
- ✅ [#81](https://github.com/dczerwinskipl/nevo-specflow/pull/81): feat(agents): module ownership rule and state/effect review in the quality gate
- ✅ [#57](https://github.com/dczerwinskipl/nevo-specflow/pull/57): feat(agents): add screen delivery coordinator and independent UX gate
- ✅ [#43](https://github.com/dczerwinskipl/nevo-specflow/pull/43): feat(agents): prepare bounded specifications and plan scoped tasks
- ✅ [#41](https://github.com/dczerwinskipl/nevo-specflow/pull/41): feat(agents): harden semantic information and pattern discovery
- ✅ [#40](https://github.com/dczerwinskipl/nevo-specflow/pull/40): feat(agents): harden UX-to-UI handoff and data boundaries
- ✅ [#38](https://github.com/dczerwinskipl/nevo-specflow/pull/38): feat(agents): harden ui implementer workflow
- ✅ [#37](https://github.com/dczerwinskipl/nevo-specflow/pull/37): fix(agents): make design-system gaps explicit
- ✅ [#36](https://github.com/dczerwinskipl/nevo-specflow/pull/36): fix(agents): keep UX discovery moving
- ✅ [#35](https://github.com/dczerwinskipl/nevo-specflow/pull/35): chore(agents): allow automatic UX designer selection
- ✅ [#34](https://github.com/dczerwinskipl/nevo-specflow/pull/34): docs(ui): harden UX design workflow and screen composition
- ✅ [#29](https://github.com/dczerwinskipl/nevo-specflow/pull/29): chore(agents): harden UI design contracts and verification
- ✅ [#10](https://github.com/dczerwinskipl/nevo-specflow/pull/10): feat(agents): add agent foundation

### ✅ Documentation, discovery and product planning (9)

- ✅ [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143): feat(docs): workspace-aware documentation reader

- ✅ [#147](https://github.com/dczerwinskipl/nevo-specflow/pull/147): docs(readme): present Nevo SpecFlow and plan product visuals
- ✅ [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138): feat(docs): promote documentation discovery into SpecFlow with optional AI semantic search
- ✅ [#135](https://github.com/dczerwinskipl/nevo-specflow/pull/135): docs(specflow): prune implemented ideas, reconcile docs with the code, add an architecture overview
- ✅ [#108](https://github.com/dczerwinskipl/nevo-specflow/pull/108): docs(ideas): accepted Session Workspace V2 and Session Chat V10 UX references
- ✅ [#103](https://github.com/dczerwinskipl/nevo-specflow/pull/103): docs(specflow): capture multi-project hosting direction
- ✅ [#56](https://github.com/dczerwinskipl/nevo-specflow/pull/56): docs(ideas): plan deterministic multi-instance steps and independent AI review
- ✅ [#11](https://github.com/dczerwinskipl/nevo-specflow/pull/11): docs(docs): add MVP hardening and UI design backlog
- ✅ [#9](https://github.com/dczerwinskipl/nevo-specflow/pull/9): refactor(specflow)!: align product naming and documentation structure

### ✅ Testing, CI, security hardening and maintenance (28)

- ✅ [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144): test(specflow): disable Git auto-maintenance in CI and close the remaining flaky timeouts
- ✅ [#142](https://github.com/dczerwinskipl/nevo-specflow/pull/142): test(specflow): wait long enough for the packaged Session Turn outcome
- ✅ [#141](https://github.com/dczerwinskipl/nevo-specflow/pull/141): test(specflow): fix the SIGTERM trap race and the Windows hook launcher deadline
- ✅ [#140](https://github.com/dczerwinskipl/nevo-specflow/pull/140): test(specflow): close timing races in the SIGTERM read test and the dirty-draft scroll story
- ✅ [#139](https://github.com/dczerwinskipl/nevo-specflow/pull/139): test(specflow): stop Git auto-maintenance in fixtures and raise the runtime test timeout
- ✅ [#129](https://github.com/dczerwinskipl/nevo-specflow/pull/129): test(runtime): isolate document status authorization fixtures
- ✅ [#127](https://github.com/dczerwinskipl/nevo-specflow/pull/127): test(runtime): fix provider fixture paths across platforms
- ✅ [#110](https://github.com/dczerwinskipl/nevo-specflow/pull/110): fix(engine): update tests stale against the {key} branch default and demo fixtures
- ✅ [#104](https://github.com/dczerwinskipl/nevo-specflow/pull/104): chore(lint): require readable control flow and format repository
- ✅ [#97](https://github.com/dczerwinskipl/nevo-specflow/pull/97): fix(engine): make the documents tests platform-neutral and bound Create paths on Windows
- ✅ [#96](https://github.com/dczerwinskipl/nevo-specflow/pull/96): chore(ci): build Engine workspace dependencies before the filesystem integration jobs
- ✅ [#83](https://github.com/dczerwinskipl/nevo-specflow/pull/83): chore(ci): harden Windows file handling, per-package lint and Storybook/Windows CI
- ✅ [#80](https://github.com/dczerwinskipl/nevo-specflow/pull/80): fix(chromatic): await Archive story render and test UI interactions on PRs
- ✅ [#78](https://github.com/dczerwinskipl/nevo-specflow/pull/78): fix(security): patch follow-redirects and retain Chromatic failure diagnostics
- ✅ [#68](https://github.com/dczerwinskipl/nevo-specflow/pull/68): test(packaging): derive notice versions from manifests
- ✅ [#63](https://github.com/dczerwinskipl/nevo-specflow/pull/63): ci(engine): split filesystem smoke and full regression
- ✅ [#33](https://github.com/dczerwinskipl/nevo-specflow/pull/33): fix(storybook): stabilize Chromatic visual stories
- ✅ [#23](https://github.com/dczerwinskipl/nevo-specflow/pull/23): fix(deps): update brace-expansion
- ✅ [#22](https://github.com/dczerwinskipl/nevo-specflow/pull/22): fix(security): resolve CodeQL docs alerts
- ✅ [#21](https://github.com/dczerwinskipl/nevo-specflow/pull/21): fix(github): normalize ruleset rule order
- ✅ [#20](https://github.com/dczerwinskipl/nevo-specflow/pull/20): ci(security): enforce CodeQL scan results
- ✅ [#19](https://github.com/dczerwinskipl/nevo-specflow/pull/19): refactor(testing): standardize ownership-based test placement
- ✅ [#18](https://github.com/dczerwinskipl/nevo-specflow/pull/18): docs(ci): remove duplicated CodeQL guidance
- ✅ [#17](https://github.com/dczerwinskipl/nevo-specflow/pull/17): chore(repo): finalize production foundation hardening
- ✅ [#16](https://github.com/dczerwinskipl/nevo-specflow/pull/16): refactor(repo): harden package build and runtime auth foundations
- ✅ [#6](https://github.com/dczerwinskipl/nevo-specflow/pull/6): chore(branding): rename SpecDev to SpecFlow
- ✅ [#3](https://github.com/dczerwinskipl/nevo-specflow/pull/3): fix(ci): make CI smoke tests deterministic and align Dependabot policy
- ✅ [#1](https://github.com/dczerwinskipl/nevo-specflow/pull/1): chore(workspace): bootstrap Nevo SpecDev monorepo foundation

### ✅ Dependency updates (13)

- ✅ [#132](https://github.com/dczerwinskipl/nevo-specflow/pull/132): build(deps-dev): bump jsdom from 30.1.3 to 31.0.0
- ✅ [#131](https://github.com/dczerwinskipl/nevo-specflow/pull/131): build(deps): bump the npm-minor-patch group with 26 updates
- ✅ [#130](https://github.com/dczerwinskipl/nevo-specflow/pull/130): ci(deps): bump the github-actions group with 3 updates
- ✅ [#116](https://github.com/dczerwinskipl/nevo-specflow/pull/116): build(deps): bump the npm-minor-patch group across 1 directory with 18 updates
- ✅ [#115](https://github.com/dczerwinskipl/nevo-specflow/pull/115): build(deps): bump tailwind-variants from 3.3.1 to 4.0.0
- ✅ [#101](https://github.com/dczerwinskipl/nevo-specflow/pull/101): build(deps): bump the npm-minor-patch group with 18 updates
- ✅ [#100](https://github.com/dczerwinskipl/nevo-specflow/pull/100): ci(deps): bump the github-actions group with 2 updates
- ✅ [#66](https://github.com/dczerwinskipl/nevo-specflow/pull/66): build(deps): bump the npm-minor-patch group with 36 updates
- ✅ [#65](https://github.com/dczerwinskipl/nevo-specflow/pull/65): ci(deps): bump the github-actions group with 2 updates
- ✅ [#61](https://github.com/dczerwinskipl/nevo-specflow/pull/61): build(deps): bump the npm-minor-patch group across 1 directory with 29 updates
- ✅ [#58](https://github.com/dczerwinskipl/nevo-specflow/pull/58): ci(deps): bump the github-actions group with 4 updates
- ✅ [#28](https://github.com/dczerwinskipl/nevo-specflow/pull/28): ci(deps): bump actions/download-artifact from 7.0.0 to 8.0.1 in the github-actions group
- ✅ [#7](https://github.com/dczerwinskipl/nevo-specflow/pull/7): build(deps): bump the npm-minor-patch group across 1 directory with 7 updates

## Closed without merge (22 PRs)

These branches were **not** merged and are not evidence of shipped functionality. Some proposals were superseded by later work.

- [#133](https://github.com/dczerwinskipl/nevo-specflow/pull/133): docs(ideas): capture semantic documentation search and OpenAPI publication
- [#123](https://github.com/dczerwinskipl/nevo-specflow/pull/123): fix(specs): match Create base refs in the Runtime's full-ref format
- [#121](https://github.com/dczerwinskipl/nevo-specflow/pull/121): docs(ui): add screenshot-backed SpecFlow UI UX audit
- [#119](https://github.com/dczerwinskipl/nevo-specflow/pull/119): refactor(ui): React UI structure rules and the documents explorer by sub-concern
- [#118](https://github.com/dczerwinskipl/nevo-specflow/pull/118): feat(ui): ship the Inter font with the design system
- [#114](https://github.com/dczerwinskipl/nevo-specflow/pull/114): build(deps): bump the npm-minor-patch group with 16 updates
- [#113](https://github.com/dczerwinskipl/nevo-specflow/pull/113): docs(ui): propose storybook rework and agent safeguards
- [#106](https://github.com/dczerwinskipl/nevo-specflow/pull/106): fix(engine): refuse case-only renames on windows, describe document commits and guide init on protected branches
- [#91](https://github.com/dczerwinskipl/nevo-specflow/pull/91): feat(engine): add the document registry, archetype catalogue and strict manifest parser
- [#90](https://github.com/dczerwinskipl/nevo-specflow/pull/90): feat(contracts): add Specification documents and archetype definition schemas
- [#89](https://github.com/dczerwinskipl/nevo-specflow/pull/89): docs(docs): specify the Specification documents layer and plan its first deliveries
- [#82](https://github.com/dczerwinskipl/nevo-specflow/pull/82): chore(agents): run slow real-Git integration tests on Linux in Docker
- [#79](https://github.com/dczerwinskipl/nevo-specflow/pull/79): test(ui): wait for archive rows in Chromatic interactions
- [#74](https://github.com/dczerwinskipl/nevo-specflow/pull/74): test(ui): match LoginScreen language action by label value, not 'aria-label'
- [#72](https://github.com/dczerwinskipl/nevo-specflow/pull/72): ci(engine): parallelize Windows full real-Git regression without reducing coverage
- [#59](https://github.com/dczerwinskipl/nevo-specflow/pull/59): build(deps): bump the npm-minor-patch group with 25 updates
- [#52](https://github.com/dczerwinskipl/nevo-specflow/pull/52): superseded: execution plans moved to implementation PR #53
- [#50](https://github.com/dczerwinskipl/nevo-specflow/pull/50): docs(ideas): offline engine and optional per-spec worktrees
- [#8](https://github.com/dczerwinskipl/nevo-specflow/pull/8): docs(architecture): propose documentation taxonomy
- [#5](https://github.com/dczerwinskipl/nevo-specflow/pull/5): build(deps): bump the npm-minor-patch group across 1 directory with 6 updates
- [#4](https://github.com/dczerwinskipl/nevo-specflow/pull/4): build(deps-dev): bump the npm-minor-patch group with 2 updates
- [#2](https://github.com/dczerwinskipl/nevo-specflow/pull/2): build(deps-dev): Bump @types/node from 24.13.3 to 26.4.1

## Open at snapshot

- [#149](https://github.com/dczerwinskipl/nevo-specflow/pull/149): Open: docs(ideas): add product roadmap for 1.0, 1.1 and 2.0
- [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137): Draft: docs(ideas): reusable Workflow, Task resources and manual/agent execution

## Maintenance

- Refresh the counts and states from GitHub when preparing a release or updating the roadmap; never infer a PR's merge from its title or a closed state.
- Keep completed _capabilities_ in the concise [roadmap](roadmap.md). This inventory preserves the individual PR-level provenance, including test fixes, CI, tooling and dependency updates.
- Add links to Specifications and authoritative product/architecture docs in the roadmap as they become available. Merged PRs alone cannot prove the complete acceptance scenario.
