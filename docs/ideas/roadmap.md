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

| Release                                 | State                           | Evidence-based progress                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.0.0 · First usable release**        | 🛠 Code on implementation branch | **10** scopes merged into `main`; **6** more have code on #137 (unverified); **2** agent-specific items lack E6 proof; **3** release-readiness items are separate. **No approved completion percentage.** |
| **1.1.0 · Automated execution**         | ⬜ Proposed                     | Scope not approved; no percentage                                                                                                                                                                         |
| **Later 1.x · Compatible improvements** | 💡 Backlog                      | Candidate scope; no percentage                                                                                                                                                                            |
| **2.0.0 · Multi-project hosting**       | 🔎 Exploration                  | Architecture direction; no percentage                                                                                                                                                                     |

**Current implementation milestone: audit and validate E0–E4 already written on [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137). Next concrete action:** reconcile E0 architecture decisions with the existing E1–E4 code and tests, confirm acceptance gaps, and close or split the implementation only after it is reviewed. Do **not** restart E1 from scratch because #137's stale description calls itself a proposal.

**Usable on `main`:** Specification Create/Close, Specification document editing, Task inspection, managed agent Sessions, Workbench UI and workspace documentation search. **Code only on #137:** standalone Task authoring and manual Workflow through Engine, CLI, Runtime and UI. **Not yet demonstrated:** the full manual acceptance journey, agent step dispatch/finish/stop (E6) and installed end-to-end acceptance.

**Progress policy:** the 21 rows below are a **working inventory**, not a percentage of work or an approved release denominator. The overall installed end-to-end acceptance case is **not verified (0/1)**. Report official `completed/approved acceptance criteria` only after scope sign-off. Implementation on a branch, verified acceptance, merge to `main` and release remain separate facts.

## 1.0.0 · Full capability scope (working proposal)

**All 21 tracked capabilities are shown together**, including ten finished scopes and eleven remaining items. `Done` means the explicitly described scope is on `main`; it does not mean the entire user journey is implemented or the product was released.

| ID · capability | Kind                                      | Implementation       | Delivered scope or blocker | Evidence                                                                                                                   |
| --------------- | ----------------------------------------- | -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| C001            | Create/Close Specification, Git worktrees | User-facing          | ✅ Done                    | Create and technically close a Specification                                                                               | [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#55](https://github.com/dczerwinskipl/nevo-specflow/pull/55)                                                                                                                                                                                                    |
| C002            | Specification documents                   | User-facing          | ✅ Done                    | Read and edit archetype-backed documents                                                                                   | [#88](https://github.com/dczerwinskipl/nevo-specflow/pull/88), [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93), [#94](https://github.com/dczerwinskipl/nevo-specflow/pull/94), [#105](https://github.com/dczerwinskipl/nevo-specflow/pull/105)     |
| C003            | Task Workbench                            | User-facing          | ✅ Done                    | Inspect Task lists and details; **not** author Tasks                                                                       | [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60)                                                                                                                                                                                                                                                                   |
| C004            | Deterministic Workflow kernel             | Foundation           | ✅ Done                    | Run progression and dependency logic exist; **not** a manual UI flow                                                       | [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120)                                                                                                                                                                                                                                                                 |
| C005            | Managed Claude/Codex Sessions             | User-facing          | ✅ Done                    | Start and use Sessions; **not** delegated Workflow execution                                                               | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126)                                                                                                                                                                                                  |
| C006            | Antigravity and provider telemetry        | User-facing          | ✅ Done                    | Use the native provider integration and see telemetry                                                                      | [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125)                                                                                                                                                                                                |
| C007            | Workbench and navigation                  | User-facing          | ✅ Done                    | Open the Specification, Task and Session screens                                                                           | [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#62](https://github.com/dczerwinskipl/nevo-specflow/pull/62), [#112](https://github.com/dczerwinskipl/nevo-specflow/pull/112), [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124), [#148](https://github.com/dczerwinskipl/nevo-specflow/pull/148) |
| D100            | Workspace documentation reader/search     | User-facing          | ✅ Done                    | Browse/search docs in the relevant checkout                                                                                | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143)                                                                                                                                                                                                |
| C008            | Authentication, permissions and OpenAPI   | Foundation           | ✅ Done                    | Server authorization and generated API contract; new Workflow actions still need coverage                                  | [#14](https://github.com/dczerwinskipl/nevo-specflow/pull/14), [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136)                                                                                                                                   |
| C009            | Packaging and quality checks              | Foundation           | ✅ Done                    | Product packaging, packaged smoke and CI exist; user onboarding not yet accepted                                           | [#10](https://github.com/dczerwinskipl/nevo-specflow/pull/10), [#77](https://github.com/dczerwinskipl/nevo-specflow/pull/77), [#81](https://github.com/dczerwinskipl/nevo-specflow/pull/81), [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144)                                                                    |
| P100            | Task Resource and authoring               | User outcome         | 🛠 Code on #137             | E2/E3 Task Resource schema, Engine, HTTP/CLI and authoring UI exist on the branch; verify create/edit/type/dependency E2E. | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                                                                                                                                                                 |
| P101            | Manual Specification/Task Workflow        | User outcome         | 🛠 Code on #137             | E4 commands, action projection, Runtime HTTP and UI exist on the branch; verify a full manual review/fail/rework path.     | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                                                                                                                                                                 |
| P102            | Delegate one Workflow step to an agent    | User outcome         | ⬜ E6 unverified           | Owner-delegated Session dispatch, claim, writes, finish, native stop and recovery not verified end to end.                 | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                                                                                                                                                                 |
| P106            | Owner acceptance and Workflow-safe Close  | User outcome         | 🛠 Code on #137             | E2/E4 Close blockers and owner actions exist on branch; verify approvals, waivers and safe Close.                          | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                                                                                                                                                                 |
| T100            | Manual Workflow CLI/HTTP/UI commands      | Product interface    | 🛠 Code on #137             | Task/Workflow CLI, authenticated Runtime routes and UI actions exist; check shared Engine semantics.                       | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                                                                                                                                                                 |
| D101            | Pinned context for agent steps            | Product integration  | 🟡 Branch partial          | E2 Task context and documents are implemented on branch; pinned E6 agent context remains to integrate.                     | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Task context](specflow-engine/task-resource-and-context.md)                                                                                                                                                                                                   |
| I101            | Recover interrupted delegated steps       | Product integration  | ⬜ E6 unverified           | General Engine recovery exists; E6 Session claim, stop/retry and partial writes need completion proof.                     | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Recovery](specflow-engine/execution-scopes-and-recovery.md)                                                                                                                                                                                                   |
| I102            | Permissions for new Workflow actions      | Product integration  | 🟡 Branch partial          | Manual Workflow permissions and refusal routes exist on branch; verify actor identity and E6 claims.                       | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Auth](authorization/README.md)                                                                                                                                                                                                                                |
| T103            | Installed user onboarding                 | User outcome         | ⬜ Outside #137            | Release readiness: independent end-user installation, provider configuration and onboarding proof.                         | [Packaging](../engineering/repository/product-packaging.md)                                                                                                                                                                                                                                                                     |
| I103            | End-to-end release acceptance             | Release verification | ⬜ Outside #137            | Release readiness: installed UI + agent + restart + Close acceptance test; HTTP tests are insufficient.                    | [E0–E6 draft plan](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md)                                                                                                                             |
| I104            | Supported native-agent platforms          | Release decision     | 🔎 Outside #137            | Release readiness: decide and certify the native platform/provider matrix.                                                 | [Provider backlog](specflow-runtime/provider-migration-plan.md)                                                                                                                                                                                                                                                                 |

**#137 audit snapshot (head `ccf8d070`, 481 changed files, unmerged):**

| Stage                       | Evidence on branch                                                  | Missing verification                                                                               |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **E0 · Boundary decisions** | Architecture changes and new Workflow package                       | D01–D13 need review, reconciliation with the code and promotion into accepted docs                 |
| **E1 · Reusable Workflow**  | `packages/workflow` coordinator, replay/host contracts and tests    | Verify separate host, determinism, replay and package boundaries                                   |
| **E2 · Task Resource**      | Task manifests, Engine operations, Close blockers and tests         | Verify atomic Task changes, type pinning, recovery and refusal                                     |
| **E3 · Task authoring**     | CLI commands, Runtime Task routes, UI dialogs and tests             | Verify real-project Task create/edit/lifecycle across transports                                   |
| **E4 · Manual Workflow**    | Start/finish/return, action projections, UI and real Git/HTTP tests | Verify full Spec + Task review/rework, restart, human sign-off and Close                           |
| **E5 · Typed forms**        | Deferred proposal                                                   | Not needed for 1.0; target later 1.x                                                               |
| **E6 · Agent delegation**   | Protocol proposal; existing Managed Sessions are a foundation       | Build/prove Session dispatch, scoped writes, finish, stop, reconciliation and agent Task proposals |

**Immediate task: audit the existing #137 E0–E4 implementation and test it against the [E0–E6 delivery plan](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md).** Passing isolated tests or having a UI does not automatically close a milestone. E6 then integrates the same Workflow contract rather than inventing another execution path.

**Separate release acceptance:** run a real installed-product scenario with Task editing, manual review/rework, an agent-managed step, restart/duplicate-finish recovery and authorized Close. **0/1 verified.**

**Dependencies:** C004 Kernel ✅ enables P101 manual Workflow 🛠; C005/C006 Sessions ✅ enable P102 agent delegation ⬜; C003 Task reads ✅ enable P100 Task authoring 🛠. The completed foundation and integrated user outcome remain different capability IDs.

## 1.1.0 and later compatible 1.x releases

**1.1.0:** candidates for the first compatible feature release, **not yet an approved scope**. No progress percentage.

| ID · capability | Planning                             | Desired result  | Idea / evidence                                      |
| --------------- | ------------------------------------ | --------------- | ---------------------------------------------------- |
| P103            | Auto-continue                        | ⬜ Candidate    | Start the next eligible step after finish            | [F01](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P104            | Selected Task batches                | ⬜ Candidate    | Execute dependency-ordered Tasks and review loops    | [F12](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P105            | Command and human verification gates | ⬜ Candidate    | Execute checks and collect evidence at transitions   | [F03](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| T101            | GitHub delivery                      | 🔎 Needs design | PR, CI, reviews, fixes and merge with owner approval | [Migration notes](specflow-engine/legacy-nevo-migration.md)         |
| T102            | Workflow commit/push actions         | ⬜ Candidate    | Commit scoped files and recover Git post-actions     | [F04](specflow-engine/execution-plans/06-workflow-kernel/README.md) |

**Later 1.x minors:** optional compatible improvements, not implicitly due in 1.1.0. Per [SemVer](https://semver.org/spec/v2.0.0.html), compatible new features normally use a new minor version (`1.2.0`); compatible fixes use patch versions (`1.1.1`).

| ID · capability | Planning                            | Idea / evidence       |
| --------------- | ----------------------------------- | --------------------- |
| P110            | Definition-driven input forms       | ⬜ Candidate          | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)               |
| P111            | Code inspection and editing         | ⬜ Candidate          | [Developer workspace](developer-workspace/code-inspection-and-editing.md)     |
| P112            | Ideas and Roadmap UI                | 🔎 Explore            | [Ideas hub](README.md)                                                        |
| P113            | Parallel Task worktrees             | ⬜ Candidate          | [F08/F12](specflow-engine/execution-plans/06-workflow-kernel/README.md)       |
| T110            | Additional agent capabilities       | 🟡 Foundation exists  | [Provider backlog](specflow-runtime/provider-migration-plan.md)               |
| T111            | Search quality and expanded corpora | 🟡 Foundation exists  | [Semantic docs](semantic-docs/README.md)                                      |
| T112            | Workflow integrations               | 🔎 Explore            | [Migration notes](specflow-engine/legacy-nevo-migration.md)                   |
| I110            | Native Linux/macOS adapters         | 🔎 Need certification | [Provider backlog](specflow-runtime/provider-migration-plan.md)               |
| I111            | More diagnostics and recovery UI    | 🟡 Foundation exists  | [Adapter diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md) |
| I112            | Guided Project Settings             | 🔎 Verify scope       | [UI concept](specflow-ui/screens/project-settings-ui-spec.md)                 |

## 2.0.0 · Multi-project hosting

**Exploration, not a committed release scope.** Multi-project deployment may require changes to project identity, Runtime composition, persistence and isolation. It may be a breaking release where technically justified.

| ID · capability | Planning                          | Desired result  |
| --------------- | --------------------------------- | --------------- |
| P200            | Multi-project portfolio           | 🔎 Explore      | Register, select and monitor repositories      |
| I200            | Multi-project Runtime             | 🔎 Explore      | One host, project-scoped Engines and recovery  |
| I201            | Docker/out-of-repo deployment     | 🔎 Needs design | Host independently of a checked-out repository |
| I202            | Project permissions and isolation | 🔎 Needs design | Host roles, isolation and quotas               |
| I203            | Multi-project Session context     | 🔎 Explore      | Explicit read/write authority per project      |
| P201            | Cross-project initiatives         | 💡 Optional     | Plan work spanning repositories                |
| P202            | Full Ideas/Specification planning | 💡 Optional     | Link concepts and deliveries across projects   |

## Later / not assigned to a release

These are **explicitly tracked ideas, not promised features**. Assign an owner and target release only after analysis. Each has a separate ID rather than disappearing inside a generic "provider improvements" or "UI polish" label.

| ID       | Independent candidate                                        | Planning                  | Source                                                                               |
| -------- | ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------ |
| **L100** | Task decision and evidence drill-down                        | Later, scope not approved | [Task evidence UI](specflow-ui/components/task-decision-evidence-ui-spec.md)         |
| **L101** | Floating Session                                             | Later, scope not approved | [Floating Session UX](specflow-ui/screens/floating-session-ui-spec.md)               |
| **L102** | Composer attachments and repo references                     | Later, scope not approved | [Session Composer](specflow-ui/components/session-composer-design.md)                |
| **L103** | Workflow events inside Session conversation                  | Later, scope not approved | [Chat V10 follow-ups](specflow-ui/components/session-chat-v10-design.md)             |
| **L104** | Quote and origin-aware chat navigation                       | Later, scope not approved | [Chat V10 follow-ups](specflow-ui/components/session-chat-v10-design.md)             |
| **L105** | Server-side Work history search and filtering                | Later, scope not approved | [Runtime search proposal](specflow-runtime/work-history-server-filter.md)            |
| **L106** | Per-tool Work Inspector presentation                         | Later, scope not approved | [Work Inspector UX](specflow-ui/components/session-work-inspector-ui-spec.md)        |
| **L107** | Full IDE integration                                         | Later, scope not approved | [Developer workspace](developer-workspace/code-inspection-and-editing.md)            |
| **L108** | Independent multiple executions of one step                  | Later, scope not approved | [Multi-instance plan](specflow-engine/multi-instance-execution.md)                   |
| **L109** | Scheduled/recurring workflows                                | Later, scope not approved | [Engine managed integration](specflow-engine/managed-session-integration.md)         |
| **L110** | Workspace relocation and repair                              | Later, scope not approved | [Workspace lifecycle](specflow-engine/workspace-binding-lifecycle.md)                |
| **L111** | Provider liveness watchdog                                   | Later, scope not approved | [Adapter liveness](specflow-runtime/ai-adapters/liveness-watchdog.md)                |
| **L112** | Quota vs transient rate-limit classification                 | Later, scope not approved | [Provider classification](specflow-runtime/ai-adapters/error-classification.md)      |
| **L113** | Capacity-aware admission                                     | Later, scope not approved | [Provider capacity](specflow-runtime/ai-adapters/provider-capacity-and-admission.md) |
| **L114** | Provider diagnose and protocol replay                        | Later, scope not approved | [Diagnose/replay](specflow-runtime/ai-adapters/diagnostics-and-replay.md)            |
| **L115** | Native Session resume and positive reconciliation            | Later, scope not approved | [Provider resume](specflow-runtime/ai-adapters/session-resume-and-recovery.md)       |
| **L116** | Authorization persistence filters and capability projections | Later, scope not approved | [Authorization follow-ups](authorization/README.md)                                  |
| **L117** | UI prefetch, refresh and eventing                            | Later, scope not approved | [UI data loading](specflow-ui/data-loading-refresh-and-eventing.md)                  |
| **L118** | Automated Storybook policy and coverage checks               | Later, scope not approved | [Storybook follow-ups](specflow-ui/storybook-rework.md)                              |
| **L119** | Settings catalogue rendering                                 | Later, scope not approved | [Settings renderer](specflow-ui/components/settings-catalog-renderer-ui-spec.md)     |
| **L120** | Semantic search scale, quality and evaluation                | Later, scope not approved | [Search quality](semantic-docs/search-quality.md)                                    |
| **L121** | Contextual documentation help and additional corpora         | Later, scope not approved | [Search surfaces](semantic-docs/surfaces-and-setup.md)                               |
| **L122** | Workflow definition catalogue/caching tools                  | Later, scope not approved | [Plan 06 F11](specflow-engine/execution-plans/06-workflow-kernel/README.md)          |

### Ideas coverage audit

The repository has **80 Markdown files under `docs/ideas/**`** in the audited `main` tree, including umbrella indexes and detailed implementation tasks. The mapping below is a **file-level reconciliation**, not a claim that every independently deliverable feature has an accepted release target.

| Source group        | Files | Mapped product destinations                                                                                                   |
| ------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------- |
| Engine              |    40 | 1.0 P100–P102/P106/T100, 1.x P103–P105/P113/T102, Later L108–L110/L122; some historic execution plans refer to delivered C004 |
| Runtime             |    13 | 1.0 C005/C006 and E6 prerequisites, 1.x T110/I110–I111, Later L105/L111–L115                                                  |
| UI                  |    19 | 1.0 C007 and E3/E4, 1.x P110/I112, Later L100–L104/L106/L117–L119                                                             |
| Semantic search     |     3 | 1.0 D100, 1.x T111, Later L120–L121                                                                                           |
| Developer workspace |     2 | 1.x P111, Later L107                                                                                                          |
| Authorization       |     1 | 1.0 C008/I102, Later L116                                                                                                     |
| Multi-project       |     1 | 2.0 P200–P202/I200–I203                                                                                                       |
| Ideas hub           |     1 | Navigation only; not an independently deliverable capability                                                                  |

**Known gaps before calling the roadmap exhaustive:** the [provider capability backlog](specflow-runtime/provider-migration-plan.md) has independently prioritizable F01–F19 proposals, and [Workflow plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md) has F01–F20 follow-ups. Several are grouped under T110 or implemented prerequisites and still need **item-level disposition** (1.x / 2.0 / Later / Superseded) before the scope inventory can be signed off. A document may describe several capabilities; mapping its file path alone is insufficient proof of complete planning coverage.

## Open decisions and status rules

1. **Approve 1.0 scope and acceptance criteria.** The 21-item inventory is a working proposal; its 10/21 completion count must not become an official release percentage without sign-off. Keep the end-to-end scenario separately verified.
2. **Approve E0 first.** #137 needs its boundary and deterministic workflow decisions accepted and promoted before implementing E1. Then track the current E-stage against implementation evidence, not drafting progress.
3. **Confirm the native platform support matrix** before calling 1.0 installable for end users.
4. **Select 1.1.0 priorities** from automation, Task batches, verification and GitHub delivery; defer the rest to later compatible minors.
5. **Design 2.0 project ownership** before introducing a host-wide registry or cross-project write capabilities.

**Status model:** keep `conceptState` (sketch/exploring/designed/specified), `implementationState` (not started/in progress/partial/completed), `releaseState` (unreleased/released with version), and independent actual GitHub PR state. A draft proposal is planning work, never automatically implementation progress. Keep stable capability IDs and many-to-many Idea ↔ Specification ↔ PR references after delivery. No separate manual PR inventory.

**For agents:** load `ideas.roadmap` when planning a Specification; then consult only relevant linked plans and current contracts. Normal `docs:context` intentionally excludes `docs/ideas/**`. GitHub supplies PR history and live states. A future planning UI should derive progress from approved acceptance criteria, not merged PR totals.
