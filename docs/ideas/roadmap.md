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

> **Snapshot: 2026-11-20.** Proposed release scope. Updated Ideas inventory includes the three new proposals from PR #189; approved Specifications and architecture take precedence.

## Where the product stands

| Release                              | Status                 | What remains                                                         |
| ------------------------------------ | ---------------------- | -------------------------------------------------------------------- |
| **1.0.0** · First usable release     | Manual Workflow merged | Verify the manual journey, deliver E6, then run installed acceptance |
| **1.1.0** · Automated execution      | ⬜ Proposed            | Select an agreed subset of automation and GitHub delivery            |
| **Later 1.x** · Compatible additions | 🔎 Candidate backlog   | Forms, providers, planning, search and tooling                       |
| **2.0.0** · Multi-project hosting    | 🔎 Exploring           | Project ownership, deployment and isolation design                   |

**On `main`:** Specification Create/Close, document editing, managed Sessions, Workbench navigation
and workspace documentation search. [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) added Task Resources, Task authoring, repository-defined
Workflow binding, and manual execution through Engine, CLI, HTTP and UI, including owner actions
and Close guards. [#173](https://github.com/dczerwinskipl/nevo-specflow/pull/173) added Workbench refinements and moved demo Workflow onto the in-memory Engine.

**Progress and scope:** 10 foundations and 7 additional 1.0 items have implementation evidence on
`main`, three of those seven with partial coverage. Two items need E6 delivery and verification,
and three concern release readiness. These are **22 proposed 1.0 items**. The full installed
end-to-end acceptance is **0/1 verified**. Track passed acceptance criteria separately from
implementation milestones once the requirements are approved.

## 1.0.0 · Capability and release scope

The table includes **currently proposed 1.0 foundations, user outcomes and release gates**; the remaining product backlog has been inventoried separately. `Foundation` means an existing dependency, not proof of the resulting user journey. `1.0 target` and `Release gate` are proposed mandatory requirements, pending scope approval. Implementation and verification remain separate.

| Capability                           | Delivery                      | Acceptance or remaining work                                           | Evidence                                                                                                                         |
| ------------------------------------ | ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C001 · Specification Create/Close    | Foundation · ✅ main          | Create/close a Specification with Git worktrees                        | [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53)                                                                    |
| C002 · Specification documents       | Foundation · ✅ main          | Read and edit Specification documents                                  | [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93)     |
| C003 · Task Workbench                | Foundation · ✅ main          | Read Tasks; authoring belongs to P100                                  | [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60)                                                                    |
| C004 · Workflow kernel               | Foundation · ✅ main          | Deterministic progression; manual UI belongs to P101                   | [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120)                                                                  |
| C005 · Managed Claude/Codex Sessions | Foundation · ✅ main          | Use Sessions; Workflow delegation belongs to P102                      | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98)                                                                    |
| C006 · Antigravity and telemetry     | Foundation · ✅ main          | Native adapter and provider telemetry                                  | [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125) |
| C007 · Workbench and navigation      | Foundation · ✅ main          | Specification, Task and Session navigation                             | [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124)                                                                  |
| D100 · Workspace documentation       | Foundation · ✅ main          | Browse/search workspace-scoped docs                                    | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) |
| C008 · Auth and OpenAPI              | Foundation · ✅ main          | Server authorization; new Workflow actions still require I102          | [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136)                                                                  |
| C009 · Packaging and CI              | Foundation · ✅ main          | Packaging and CI; installed acceptance belongs to I103                 | [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144)                                                                  |
| P100 · Task authoring                | 1.0 target · ✅ main          | Verify create/edit/Task Type/dependencies via E2–E3                    | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| P107 · Repository workflows          | 1.0 target · 🟡 main partial  | Verify YAML Task Types, transitions, validation and binding (E1–E4)    | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| P101 · Manual Workflow               | 1.0 target · ✅ main          | Verify Spec/Task start, finish, return, review failure and rework (E4) | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| P106 · Owner acceptance and Close    | 1.0 target · ✅ main          | Verify approval, waivers, Close blocking and legal exit (E2/E4)        | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| T100 · Workflow CLI/API/UI           | 1.0 target · ✅ main          | Verify consistent Engine rules across all transports (E3/E4)           | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| D101 · Agent step context            | 1.0 target · 🟡 main partial  | E2 context exists; verify pinned context delivered to E6 Session       | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| I102 · Workflow permissions          | 1.0 target · 🟡 main partial  | Manual routes exist; verify ownership and E6 claims                    | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                                  |
| P102 · Agent step delegation         | 1.0 target · ⬜ E6 unverified | Prove owner launch, claim-owned writes, finish, native stop            | [E6 plan](https://github.com/dczerwinskipl/nevo-specflow/pull/169)                                                               |
| I101 · Delegated recovery            | 1.0 target · ⬜ E6 unverified | Prove crash/retry/reconcile with no duplicate actions                  | [E6 plan](https://github.com/dczerwinskipl/nevo-specflow/pull/169)                                                               |
| T103 · Installation and onboarding   | Release gate · ⬜ unverified  | Install/configure one real project outside development checkout        | [Packaging](../engineering/repository/product-packaging.md)                                                                      |
| I103 · Full installed E2E            | Release gate · ⬜ unverified  | UI manual + agent loop, restart, safe Close; test separately           | [Installed acceptance](#installed-acceptance)                                                                                    |
| I104 · Native platform matrix        | Release gate · 🔎 undecided   | Certify actual OS/provider support; packaging alone is insufficient    | [Provider backlog](specflow-runtime/provider-migration-plan.md)                                                                  |

### Manual Workflow delivery and acceptance

| Stage                       | Implementation on `main`                                                                                      | Still needs proof                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **E0** · Design boundary    | ADRs 0023 and 0024 record the coordinator and Task boundaries                                                 | Check the remaining design assumptions against the real journey  |
| **E1** · Neutral Workflow   | `packages/workflow` coordinator and tests                                                                     | Host boundary, deterministic replay and contract review          |
| **E2** · Task Resource      | Models, Engine operations, Close guards                                                                       | Atomic changes, type binding, recovery and refusal               |
| **E3** · Task authoring     | CLI, Runtime routes and UI                                                                                    | Real-project create/edit/approve across transports               |
| **E4** · Manual progression | Start/finish/return UI and HTTP tests                                                                         | Complete manual review/rework, restart, sign-off and Close       |
| **E5** · Typed forms        | Planned/deferred                                                                                              | Later 1.x, not a 1.0 blocker                                     |
| **E6** · Agent delegation   | Session infrastructure exists; [E6 plan](https://github.com/dczerwinskipl/nevo-specflow/pull/169) is in draft | Launch, claim, write, finish, stop, recovery and mixed execution |

**Integrated manual acceptance:** verify repository-defined YAML binding, the reject/rework/review loop,
owner approval provenance and restart/Close against the merged code. E6 still needs delivery and
verification of the delegated claim/write/stop/recovery path. Installation and supported-platform
certification have separate release gates.

### Installed acceptance

**Acceptance definition for 1.0:** In an installed real Git project, create and edit a Specification and Tasks, complete a Task review/fail/rework loop manually, delegate an eligible step to an agent, inspect and approve the result, survive restart and finish a legal Close while refusing an unsafe one. **Not verified.**

**Boundary:** A 1.0 Workflow is owned by the user's repository, including Task Types, steps and transitions. The product interprets that definition; it must not hard-code one implementation/review sequence. E5 rich forms, autonomous continuation, full external-agent CLI ownership and advanced gates are not implicitly part of 1.0.

**Relationships:** C004 Workflow kernel ✅ supports P101 Manual Workflow 🛠; C005/C006 Managed Sessions ✅ support P102 Step delegation ⬜; C003 Task reads ✅ support P100 Authoring 🛠. Each integrated outcome needs its own acceptance.

### Legacy NEvo AI retirement is a separate cutover gate

The installed **1.0** acceptance above proves manual Workflow plus one delegated
agent step; it does **not** authorize deleting legacy AI tooling from
`dczerwinskipl/nevo`. That repository may remove its own Node/TypeScript/JavaScript
workflow implementation only after the
[full-feature cutover DoD](specflow-engine/legacy-nevo-migration.md#project-cutover-definition-of-done)
has passed **in the real .NET project**: agent prepares a complete Specification,
owner makes required decisions, Tasks are implemented and independently reviewed,
build/test/docs gates pass, GitHub PR reviews and CI are resolved, the PR is
squash-merged, and Close/recovery/worktree cleanup succeeds. The final E2E must run
**after** removing the legacy tools and demonstrate that current NEvo development
instructions and documentation were honored. Record an explicit disposition for
the old slash commands, audits, follow-ups, PR review handling and migration of
historical Specifications.

This cutover depends on **P102/I101, L131, P103, P104, P105, T101/T102**
and NEvo-specific .NET definitions/documentation (with L148 as an optional
starting point). Reuse those roadmap capabilities; the migration is a
**project-specific acceptance milestone, not another workflow engine or
a new mandatory product-release capability**. A passing E6 PR or a plan in
#189 alone is insufficient.

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

The [roadmap coverage register](roadmap-coverage.md) records source-by-source dispositions and **49 untriaged L-series outcomes**. It does not set release scope or duplicate implementation status.

**Known inventory: 93 stable capability IDs**: 22 proposed for 1.0, 5 candidates for 1.1, 10 other later 1.x, 7 exploratory 2.0 and 49 unscheduled. The 37 numbered Workflow/provider follow-ups are mapped individually; the other 88 Ideas source files (excluding these two roadmap documents) have an explicit source disposition. This measures **inventory coverage of the current repository**, not completeness of every possible product direction. Many outcomes are still untriaged by release horizon, and this count is not a work estimate or release percentage.

## Owner decisions and the next gate

**Next engineering gate:** run the E0–E4 manual Specification and Task journey on `main` and record
results in a scenario-based acceptance matrix. Resolve confirmed gaps, then deliver E6 single-step
delegation and run installed 1.0 acceptance.

The owner needs to settle only these product choices:

1. **1.0 minimum:** confirm the installed manual + single managed-agent-step journey as the release contract, including repository-defined Workflow/Task Types. Decide whether Create-with-agent is mandatory at initial Specification creation or remains [L131](roadmap-coverage.md#unscheduled-capabilities).
2. **Human trust boundary:** confirm the supported 1.0 approval identity model (authenticated Runtime owner, local trusted CLI, or both). Agent self-approval through an untrusted local role string is not acceptable.
3. **Supported platform/provider matrix:** name the minimum OS and at least one provider path that must pass a real installed E2E; do not imply native certification from successful packaging.
4. **Later release commitments:** choose which 1.1 candidates to prioritize after 1.0 evidence exists. Untriaged Ideas remain open, not silently deferred or rejected.

**Data rules:** `✅ main` means code is merged, **not** accepted or released. `🟡 main partial` means part of the capability has code merged. `⬜` is unproven; `🔎` is an unresolved planning decision. An Idea is not current architecture. A release is accepted only against criteria and an installed user journey. The user's repository owns Workflow definitions, steps, transitions, Task Types and archetypes. Keep stable IDs and Idea ↔ Specification ↔ PR links after delivery. Planning agents intentionally load this roadmap; ordinary `docs:context` excludes Ideas.
