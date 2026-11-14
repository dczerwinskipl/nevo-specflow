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

> **Snapshot: 2026-11-14.** Proposed release scope, not an approved release contract. `main` and [PR #137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) are different delivery states; #137 is a draft **with substantial E1–E4 implementation**. Approved Specifications and architecture take precedence.

## Where the product stands

| Release                              | Status                | What remains                                              |
| ------------------------------------ | --------------------- | --------------------------------------------------------- |
| **1.0.0** · First usable release     | 🛠 Integration on #137 | Verify E0–E4, complete E6, then installed acceptance      |
| **1.1.0** · Automated execution      | ⬜ Proposed           | Select an agreed subset of automation and GitHub delivery |
| **Later 1.x** · Compatible additions | 💡 Candidate backlog  | Forms, providers, planning, search and tooling            |
| **2.0.0** · Multi-project hosting    | 🔎 Exploring          | Project ownership, deployment and isolation design        |

**Can use on `main`:** Specification Create/Close, document editing, Task inspection, managed agent Sessions, Workbench navigation and workspace documentation search.

**Code on #137, not yet accepted:** standalone Task Resource, Task authoring, manual Workflow Engine/CLI/HTTP/UI, owner actions and Close guards. **Still missing or unverified:** full manual acceptance, E6 delegated execution, installed E2E, onboarding and the platform support decision.

**Next action: audit and accept the existing E0–E4 code in #137.** Reconcile its architecture decisions with the implementation, verify the manual Spec + Task journey and record concrete gaps. Do not restart E1. After that, implement/verify E6 and run the installed-product acceptance test.

**Progress:** 10 supporting scopes are merged on `main`; 6 additional 1.0 items have code on #137 (some partial); 2 need E6 verification; 3 concern release readiness. These are **21 tracked items**, not 21 equally sized units of work or an approved completion denominator. **No defensible completion percentage yet.** The full installed end-to-end acceptance is **0/1 verified**. Once requirements are approved, report `passed / approved acceptance criteria` separately from implementation milestones.

## 1.0.0 · Capability and release scope

The table includes **all known 1.0 foundations, user outcomes and release gates**. `Foundation` means an existing dependency, not proof of the resulting user journey. `1.0 target` and `Release gate` are proposed mandatory requirements, pending scope approval. Implementation and verification remain separate.

| Capability                           | Delivery                       | Acceptance or remaining work                                           | Evidence                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C001 · Specification Create/Close    | Foundation · ✅ main           | Create/close a Specification with Git worktrees                        | [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53)                                                                                                                                 |
| C002 · Specification documents       | Foundation · ✅ main           | Read and edit Specification documents                                  | [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93)                                                                  |
| C003 · Task Workbench                | Foundation · ✅ main           | Read Tasks; authoring belongs to P100                                  | [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60)                                                                                                                                 |
| C004 · Workflow kernel               | Foundation · ✅ main           | Deterministic progression; manual UI belongs to P101                   | [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120)                                                                                                                               |
| C005 · Managed Claude/Codex Sessions | Foundation · ✅ main           | Use Sessions; Workflow delegation belongs to P102                      | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98)                                                                                                                                 |
| C006 · Antigravity and telemetry     | Foundation · ✅ main           | Native adapter and provider telemetry                                  | [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125)                                                              |
| C007 · Workbench and navigation      | Foundation · ✅ main           | Specification, Task and Session navigation                             | [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124)                                                                                                                               |
| D100 · Workspace documentation       | Foundation · ✅ main           | Browse/search workspace-scoped docs                                    | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143)                                                              |
| C008 · Auth and OpenAPI              | Foundation · ✅ main           | Server authorization; new Workflow actions still require I102          | [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136)                                                                                                                               |
| C009 · Packaging and CI              | Foundation · ✅ main           | Packaging and CI; installed acceptance belongs to I103                 | [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144)                                                                                                                               |
| P100 · Task authoring                | 1.0 target · 🛠 #137            | Verify create/edit/Task Type/dependencies via E2–E3                    | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| P101 · Manual Workflow               | 1.0 target · 🛠 #137            | Verify Spec/Task start, finish, return, review failure and rework (E4) | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| P106 · Owner acceptance and Close    | 1.0 target · 🛠 #137            | Verify approval, waivers, Close blocking and legal exit (E2/E4)        | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| T100 · Workflow CLI/API/UI           | 1.0 target · 🛠 #137            | Verify consistent Engine rules across all transports (E3/E4)           | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| D101 · Agent step context            | 1.0 target · 🟡 branch partial | E2 context exists; verify pinned context delivered to E6 Session       | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| I102 · Workflow permissions          | 1.0 target · 🟡 branch partial | Manual routes exist; verify ownership and E6 claims                    | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| P102 · Agent step delegation         | 1.0 target · ⬜ E6 unverified  | Prove owner launch, claim-owned writes, finish, native stop            | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| I101 · Delegated recovery            | 1.0 target · ⬜ E6 unverified  | Prove crash/retry/reconcile with no duplicate actions                  | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                                                                               |
| T103 · Installation and onboarding   | Release gate · ⬜ unverified   | Install/configure one real project outside development checkout        | [Packaging](../engineering/repository/product-packaging.md)                                                                                                                                   |
| I103 · Full installed E2E            | Release gate · ⬜ unverified   | UI manual + agent loop, restart, safe Close; test separately           | [E0–E6 plan](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md) |
| I104 · Native platform matrix        | Release gate · 🔎 undecided    | Certify actual OS/provider support; packaging alone is insufficient    | [Provider backlog](specflow-runtime/provider-migration-plan.md)                                                                                                                               |

### #137 implementation checkpoints

| Stage                       | Observed code                                                      | Still needs proof                                                |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **E0** · Design boundary    | Architecture and implementation differ from an unapproved proposal | Reconcile D01–D13 against code; promote accepted decisions       |
| **E1** · Neutral Workflow   | `packages/workflow` coordinator and tests on branch                | Host boundary, deterministic replay and contract review          |
| **E2** · Task Resource      | Models, Engine operations, Close guards on branch                  | Atomic changes, type binding, recovery and refusal               |
| **E3** · Task authoring     | CLI, Runtime routes and UI on branch                               | Real-project create/edit/approve across transports               |
| **E4** · Manual progression | Start/finish/return UI and HTTP tests on branch                    | Complete manual review/rework, restart, sign-off and Close       |
| **E5** · Typed forms        | Planned/deferred                                                   | Later 1.x, not a 1.0 blocker                                     |
| **E6** · Agent delegation   | Session infrastructure exists, protocol proposed                   | Launch, claim, write, finish, stop, recovery and mixed execution |

**Acceptance definition for 1.0:** In an installed real Git project, create and edit a Specification and Tasks, complete a Task review/fail/rework loop manually, delegate an eligible step to an agent, inspect and approve the result, survive restart and finish a legal Close while refusing an unsafe one. **Not verified.** [Full draft scenario](https://github.com/dczerwinskipl/nevo-specflow/blob/docs/idea-reusable-workflow-manual-execution/docs/ideas/specflow-engine/reusable-workflow-manual-execution/delivery-plan.md#full-user-acceptance-scenario).

**Relationships:** C004 Workflow kernel ✅ supports P101 Manual Workflow 🛠; C005/C006 Managed Sessions ✅ support P102 Step delegation ⬜; C003 Task reads ✅ support P100 Authoring 🛠. Each integrated outcome needs its own acceptance.

## 1.1.0 and later 1.x · Compatible additions

These are candidates, **not approved release requirements**. A compatible new feature normally goes to a new [SemVer minor](https://semver.org/spec/v2.0.0.html), such as `1.2.0`; compatible fixes use patches such as `1.1.1`.

**First candidates for 1.1.0:**

| Capability                       | Planning         | Source                                                              |
| -------------------------------- | ---------------- | ------------------------------------------------------------------- |
| P103 · Auto-continuation         | ⬜ 1.1 candidate | [F01](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P104 · Task batches              | ⬜ 1.1 candidate | [F12](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P105 · Test and human gates      | ⬜ 1.1 candidate | [F03](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| T101 · GitHub PR/CI/review/merge | 🔎 Needs design  | [Migration](specflow-engine/legacy-nevo-migration.md)               |
| T102 · Workflow commit/push      | ⬜ 1.1 candidate | [F04](specflow-engine/execution-plans/06-workflow-kernel/README.md) |

**Other later 1.x candidates:**

| Capability                         | Planning    | Source                                                                    |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------- |
| P110 · Typed input forms           | ⬜ proposed | [E5](https://github.com/dczerwinskipl/nevo-specflow/pull/137)             |
| P111 · Code view/edit              | ⬜ proposed | [Developer workspace](developer-workspace/code-inspection-and-editing.md) |
| P112 · Ideas/Roadmap UI            | 🔎 explore  | [Ideas hub](README.md)                                                    |
| P113 · Parallel Task worktrees     | ⬜ proposed | [F08](specflow-engine/execution-plans/06-workflow-kernel/README.md)       |
| T110 · Provider features           | 🟡 mixed    | [Provider plan](specflow-runtime/provider-migration-plan.md)              |
| T111 · Search quality/corpora      | 🟡 mixed    | [Semantic docs](semantic-docs/README.md)                                  |
| T112 · Workflow integrations       | 🔎 explore  | [Migration](specflow-engine/legacy-nevo-migration.md)                     |
| I110 · Native Linux/macOS agents   | 🔎 certify  | [Provider plan F08](specflow-runtime/provider-migration-plan.md)          |
| I111 · Diagnostics and recovery UI | 🟡 mixed    | [Diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md)     |
| I112 · Project/Provider Settings   | 🔎 explore  | [Settings](specflow-ui/screens/project-settings-ui-spec.md)               |

## 2.0.0 · Multi-project hosting

Exploratory scope; not simply a project switcher. [Multi-project design](multi-project-hosting.md) must settle project identity, host-owned state, Engine recovery and access before implementation.

| Capability                           | Planning     | Outcome                                        |
| ------------------------------------ | ------------ | ---------------------------------------------- |
| P200 · Project portfolio             | 🔎 explore   | Register and switch repositories               |
| P201 · Cross-project initiatives     | 💡 candidate | Plan across repositories                       |
| P202 · Extended Ideas/Planning       | 💡 candidate | Track cross-project product delivery           |
| I200 · Multi-project Runtime         | 🔎 explore   | Project-scoped Engines and recovery            |
| I201 · Docker/out-of-repo hosting    | 🔎 explore   | Run the host separately from checkouts         |
| I202 · Host permissions/isolation    | 🔎 explore   | Roles, isolation and quotas                    |
| I203 · Cross-project Session context | 🔎 explore   | Authorized context with explicit write targets |

## Later ideas and scope coverage

Additional unscheduled capabilities and the source-by-source audit are tracked in the [roadmap coverage register](roadmap-coverage.md). That register maps Workflow and provider follow-ups to **the capability IDs above or unique Later IDs**; it is not a PR history and does not set release scope independently.

**Coverage status:** the 19 Workflow and 18 provider numbered follow-ups have individual dispositions in the linked audit. Other idea documents may still contain independently deliverable details; do not claim all product scope is exhaustive until those have been triaged. Unscheduled does **not** mean deliberately rejected.

## Open decisions

1. **Accept the 1.0 release gates.** Confirm which user outcomes and platform support are mandatory. Only then calculate completion coverage from passed criteria, not PR counts or foundations.
2. **Validate E0–E4 on the actual #137 branch**, resolving decisions against code already written. Record verification evidence per capability before calling any branch work Done.
3. **Finish E6** through the existing Workflow/Managed Session authority boundary, then prove the installed scenario.
4. **Select 1.1.0 scope** and decide future minor release priorities.
5. **Triage remaining idea subfeatures** before claiming the full known product scope is mapped.

**Data rules:** Keep separate concept, implementation, verification, release and GitHub PR states. `Code on branch` does not mean `Done`; `Done on main` does not mean `released`. The user's repository owns Workflow steps, transitions, Task Types and archetypes. Keep stable IDs and Idea ↔ Specification ↔ PR links after work is delivered. Agents should intentionally load this roadmap for Specification planning; regular `docs:context` excludes proposals.
