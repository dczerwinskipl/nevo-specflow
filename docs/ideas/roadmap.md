---
id: ideas.roadmap
type: hub
title: Nevo SpecFlow product roadmap — 1.0, 1.1 and 2.0
status: draft
scope: specflow
areas: [workflow, ai, runtime, server, ui, cli, docs, release, security]
tags: [roadmap, product-direction, pre-specification, releases, planning]
read_when:
  - deciding what to design or implement next
  - writing a Specification that must leave room for later product capabilities
  - evaluating whether an idea belongs in 1.0, 1.1 or a larger 2.0 architecture change
  - linking completed Specifications and pull requests back to product direction
summary: >
  Proposed product roadmap for a usable single-project 1.0, incremental 1.1 improvements,
  and a possible multi-project, externally hosted 2.0. Tracks conceptual maturity separately
  from implementation and preserves links to ideas, Specifications and PRs after completion.
related:
  - ideas.readme
  - ideas.specflow-engine
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.multi-project-hosting
  - ideas.specflow-ui
  - ideas.semantic-docs
---

# Nevo SpecFlow Roadmap

> **Snapshot: 2026-11-14.** This is a proposed product scope, not an approved release contract. Capability implementation is checked against `main`; #137 is an unmerged **architecture proposal**, not code in progress. Current architecture and approved Specifications take precedence.

## Release status and next action

| Release | Status | Progress |
| --- | --- | --- |
| **1.0.0 · First usable release** | 🚧 Integration not started | **10 Done / 21 tracked** in the working scope; **11 not Done**. Not approved release coverage. End-to-end acceptance **0/1 verified**. |
| **1.1.0 · Automated execution** | ⬜ Proposed | No percentage until feature scope is approved |
| **Later 1.x · Compatible improvements** | 💡 Backlog | No fixed scope or percentage |
| **2.0.0 · Multi-project hosting** | 🔎 Exploration | No fixed scope or percentage |

**Current milestone: E0 · Boundary audit and accepted design.** **Next implementation-enabling action:** review and approve D01/D02/D09, the neutral Workflow boundary, deterministic pins/replay and Run identity; promote decisions into an authoritative ADR before implementing E1. The source is the [draft E0–E6 delivery plan](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md). No approved E0 completion evidence or implementation PR was verified.

**What a user can do today:** create and close Specifications, edit Specification documents, inspect Tasks, use managed agent Sessions and the Workbench, and read/search project documentation. **What they cannot yet do end to end:** author Tasks, execute a complete manual Specification/Task Workflow in the UI, or delegate a Workflow step to a managed agent.

**Release progress is not a PR count.** The **10/21** figure counts completed capabilities against the **21-item working inventory below**, including already delivered foundations. It is *not a percentage of work, not an agreed release metric, and not release readiness*. Once the 1.0 requirements are approved, report `Done / approved criteria` and track overall end-to-end acceptance independently. Product-wide acceptance remains **not verified**, regardless of how many foundations have merged.

## 1.0.0 · Full capability scope (working proposal)

**All 21 tracked capabilities are shown together**, including ten finished scopes and eleven remaining items. `Done` means the explicitly described scope is on `main`; it does not mean the entire user journey is implemented or the product was released.

| ID · capability | Kind                                      | Implementation       | Delivered scope or blocker | Evidence                                                                                  |
| --------------- | ----------------------------------------- | -------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| C001            | Create/Close Specification, Git worktrees | User-facing          | ✅ Done                     | Create and technically close a Specification                                              | [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#55](https://github.com/dczerwinskipl/nevo-specflow/pull/55) |
| C002            | Specification documents                   | User-facing          | ✅ Done                     | Read and edit archetype-backed documents                                                  | [#88](https://github.com/dczerwinskipl/nevo-specflow/pull/88), [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93), [#94](https://github.com/dczerwinskipl/nevo-specflow/pull/94), [#105](https://github.com/dczerwinskipl/nevo-specflow/pull/105) |
| C003            | Task Workbench                            | User-facing          | ✅ Done                     | Inspect Task lists and details; **not** author Tasks                                      | [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60) |
| C004            | Deterministic Workflow kernel             | Foundation           | ✅ Done                     | Run progression and dependency logic exist; **not** a manual UI flow                      | [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120) |
| C005            | Managed Claude/Codex Sessions             | User-facing          | ✅ Done                     | Start and use Sessions; **not** delegated Workflow execution                              | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126) |
| C006            | Antigravity and provider telemetry        | User-facing          | ✅ Done                     | Use the native provider integration and see telemetry                                     | [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125) |
| C007            | Workbench and navigation                  | User-facing          | ✅ Done                     | Open the Specification, Task and Session screens                                          | [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#62](https://github.com/dczerwinskipl/nevo-specflow/pull/62), [#112](https://github.com/dczerwinskipl/nevo-specflow/pull/112), [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124), [#148](https://github.com/dczerwinskipl/nevo-specflow/pull/148) |
| D100            | Workspace documentation reader/search     | User-facing          | ✅ Done                     | Browse/search docs in the relevant checkout                                               | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) |
| C008            | Authentication, permissions and OpenAPI   | Foundation           | ✅ Done                     | Server authorization and generated API contract; new Workflow actions still need coverage | [#14](https://github.com/dczerwinskipl/nevo-specflow/pull/14), [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136) |
| C009            | Packaging and quality checks              | Foundation           | ✅ Done                     | Product packaging, packaged smoke and CI exist; user onboarding not yet accepted          | [#10](https://github.com/dczerwinskipl/nevo-specflow/pull/10), [#77](https://github.com/dczerwinskipl/nevo-specflow/pull/77), [#81](https://github.com/dczerwinskipl/nevo-specflow/pull/81), [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144) |
| P100            | Task Resource and authoring               | User outcome         | ⬜ Not started              | E2 + E3: independent Task files, editing, type binding and dependencies                   | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| P101            | Manual Specification/Task Workflow        | User outcome         | ⬜ Not started              | E4b: start/finish/return, review-fail/rework, wait and history                            | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| P102            | Delegate one Workflow step to an agent    | User outcome         | ⬜ Not started              | E6: verified Session claim, writes, finish/stop and owner handoff                         | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| P106            | Owner acceptance and Workflow-safe Close  | User outcome         | ⬜ Not started              | E2 minimal Close guard; E4 complete sign-off; existing Engine Close stays                 | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| T100            | Manual Workflow CLI/HTTP/UI commands      | Product interface    | ⬜ Not started              | E3/E4: shared Engine operations and authenticated action projections                      | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| D101            | Pinned context for agent steps            | Product integration  | ⬜ Not started              | E6: Task/Spec definitions and authorized docs in the agent step                           | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Task context](specflow-engine/task-resource-and-context.md) |
| I101            | Recover interrupted delegated steps       | Product integration  | ⬜ Not started              | E6: correct reconciliation across stop, retry and partial writes                          | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Recovery](specflow-engine/execution-scopes-and-recovery.md) |
| I102            | Permissions for new Workflow actions      | Product integration  | ⬜ Not started              | E4/E6: project/Task actor validation and refusal reasons                                  | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Auth](authorization/README.md) |
| T103            | Installed user onboarding                 | User outcome         | ⬜ Not verified             | Install one project, configure a provider and run outside the dev repo                    | [Packaging](../engineering/repository/product-packaging.md) |
| I103            | End-to-end release acceptance             | Release verification | ⬜ Not verified             | Manual flow + one delegated step + restart + legal Close in a real project                | [E0–E6 draft plan](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md) |
| I104            | Supported native-agent platforms          | Release decision     | 🔎 Open                     | Publish the actual supported OS/provider matrix                                           | [Provider backlog](specflow-runtime/provider-migration-plan.md) |

**Dependency and next-milestone path:** **E0** approve boundary/design → **E1** extract reusable neutral Workflow coordinator → **E2** implement standalone Task Resource and minimum Close protection → **E3** Task authoring/editing in UI and CLI → **E4a/E4b** shared action contracts and complete manual Workflow → **E6** owner-delegated single-step agent execution → **installed-product acceptance**. E5 typed forms are deferred to later 1.x. The entire E0–E6 sequence is **planned in PR #137**, not implemented merely because the dossier exists.

**1.0 end-to-end release acceptance (separate from capability coverage):** create a Specification and Task Types; edit Tasks; run a manual review/fail/rework; have an agent perform one eligible step; inspect and approve its result; recover after restart; refuse unsafe Close and complete valid Close in an installed, real Git project. **Not verified (0/1).** The [#137 acceptance scenario](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md#full-user-acceptance-scenario) is a proposal, not a passing test.

**Relationships, not false equivalences:** C004 Workflow Kernel ✅ enables P101 manual Workflow ⬜. C005/C006 managed Sessions ✅ enable P102 delegated Workflow execution ⬜. C003 Task Workbench ✅ is not P100 Task authoring ⬜. C008 authorization ✅ is a prerequisite for I102's new Workflow action permissions ⬜. C009 packaging ✅ does not prove T103 onboarding or I103 release acceptance.

## 1.1.0 and later compatible 1.x releases

**1.1.0:** candidates for the first compatible feature release, **not yet an approved scope**. No progress percentage.

| ID · capability | Planning                             | Desired result | Idea / evidence                                      |
| --------------- | ------------------------------------ | -------------- | ---------------------------------------------------- |
| P103            | Auto-continue                        | ⬜ Candidate    | Start the next eligible step after finish            | [F01](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P104            | Selected Task batches                | ⬜ Candidate    | Execute dependency-ordered Tasks and review loops    | [F12](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P105            | Command and human verification gates | ⬜ Candidate    | Execute checks and collect evidence at transitions   | [F03](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| T101            | GitHub delivery                      | 🔎 Needs design | PR, CI, reviews, fixes and merge with owner approval | [Migration notes](specflow-engine/legacy-nevo-migration.md) |
| T102            | Workflow commit/push actions         | ⬜ Candidate    | Commit scoped files and recover Git post-actions     | [F04](specflow-engine/execution-plans/06-workflow-kernel/README.md) |

**Later 1.x minors:** optional compatible improvements, not implicitly due in 1.1.0. Per [SemVer](https://semver.org/spec/v2.0.0.html), compatible new features normally use a new minor version (`1.2.0`); compatible fixes use patch versions (`1.1.1`).

| ID · capability | Planning                            | Idea / evidence      |
| --------------- | ----------------------------------- | -------------------- |
| P110            | Definition-driven input forms       | ⬜ Candidate          | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| P111            | Code inspection and editing         | ⬜ Candidate          | [Developer workspace](developer-workspace/code-inspection-and-editing.md) |
| P112            | Ideas and Roadmap UI                | 🔎 Explore            | [Ideas hub](README.md) |
| P113            | Parallel Task worktrees             | ⬜ Candidate          | [F08/F12](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| T110            | Additional agent capabilities       | 🟡 Foundation exists  | [Provider backlog](specflow-runtime/provider-migration-plan.md) |
| T111            | Search quality and expanded corpora | 🟡 Foundation exists  | [Semantic docs](semantic-docs/README.md) |
| T112            | Workflow integrations               | 🔎 Explore            | [Migration notes](specflow-engine/legacy-nevo-migration.md) |
| I110            | Native Linux/macOS adapters         | 🔎 Need certification | [Provider backlog](specflow-runtime/provider-migration-plan.md) |
| I111            | More diagnostics and recovery UI    | 🟡 Foundation exists  | [Adapter diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md) |
| I112            | Guided Project Settings             | 🔎 Verify scope       | [UI concept](specflow-ui/screens/project-settings-ui-spec.md) |

## 2.0.0 · Multi-project hosting

**Exploration, not a committed release scope.** Multi-project deployment may require changes to project identity, Runtime composition, persistence and isolation. It may be a breaking release where technically justified.

| ID · capability | Planning                          | Desired result |
| --------------- | --------------------------------- | -------------- |
| P200            | Multi-project portfolio           | 🔎 Explore      | Register, select and monitor repositories |
| I200            | Multi-project Runtime             | 🔎 Explore      | One host, project-scoped Engines and recovery |
| I201            | Docker/out-of-repo deployment     | 🔎 Needs design | Host independently of a checked-out repository |
| I202            | Project permissions and isolation | 🔎 Needs design | Host roles, isolation and quotas |
| I203            | Multi-project Session context     | 🔎 Explore      | Explicit read/write authority per project |
| P201            | Cross-project initiatives         | 💡 Optional     | Plan work spanning repositories |
| P202            | Full Ideas/Specification planning | 💡 Optional     | Link concepts and deliveries across projects |

## Open decisions and status rules

1. **Approve 1.0 scope and acceptance criteria.** The 21-item inventory is a working proposal; its 10/21 completion count must not become an official release percentage without sign-off. Keep the end-to-end scenario separately verified.
2. **Approve E0 first.** #137 needs its boundary and deterministic workflow decisions accepted and promoted before implementing E1. Then track the current E-stage against implementation evidence, not drafting progress.
3. **Confirm the native platform support matrix** before calling 1.0 installable for end users.
4. **Select 1.1.0 priorities** from automation, Task batches, verification and GitHub delivery; defer the rest to later compatible minors.
5. **Design 2.0 project ownership** before introducing a host-wide registry or cross-project write capabilities.

**Status model:** keep `conceptState` (sketch/exploring/designed/specified), `implementationState` (not started/in progress/partial/completed), `releaseState` (unreleased/released with version), and independent actual GitHub PR state. A draft proposal is planning work, never automatically implementation progress. Keep stable capability IDs and many-to-many Idea ↔ Specification ↔ PR references after delivery. No separate manual PR inventory.

**For agents:** load `ideas.roadmap` when planning a Specification; then consult only relevant linked plans and current contracts. Normal `docs:context` intentionally excludes `docs/ideas/**`. GitHub supplies PR history and live states. A future planning UI should derive progress from approved acceptance criteria, not merged PR totals.
