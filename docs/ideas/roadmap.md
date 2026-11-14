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

> **Status: 2026-11-14.** This is a product planning view, not an implementation contract. Statuses reflect `main` and the GitHub snapshot, not a live feed. Existing architecture and approved Specifications remain authoritative.

## Overview

| Release                             | Status               | What it delivers / next gap                                     | Completion coverage                                   |
| ----------------------------------- | -------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **1.0.0** · First usable release    | 🚧 In progress       | Task authoring, manual Workflow, one agent step, verified Close | **Not measured:** release acceptance set not approved |
| **1.1.0** · Automated execution     | ⬜ Proposed          | Automatic continuation, Task batches, GitHub delivery           | No % while scope is proposed                          |
| **Later 1.x** · Compatible features | 💡 Candidate backlog | Forms, planning, provider capabilities, RAG, diagnostics        | No % until each minor scope is agreed                 |
| **2.0.0** · Multi-project hosting   | 🔎 Exploration       | One installation for many projects, Docker outside repositories | No % while architecture is exploratory                |

**What exists:** Specification lifecycle, document editing, Task Workbench, Workflow kernel, managed Sessions, Workbench UI and documentation search. **What is next:** finish [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), connect one agent step (E6), and verify the complete flow with an installed build.

**Workflow belongs to the user's repository.** Users define Task Types, steps, transitions and agent archetypes in versioned files. SpecFlow interprets the definitions and tracks execution. Richer gates, post-actions and unattended execution arrive incrementally.

**Progress rule:** Show `completed / approved release acceptance criteria` only after the release scope is explicitly approved. This is *completion coverage*, not estimated engineering effort. Do not calculate it from PR counts. No percentages for exploratory 1.1 or 2.0 scope.

## 1.0.0 · First usable release

**Critical path:** Task authoring (P100) → manual Workflow (P101/T100) → one agent step (P102/D101/I101) → owner acceptance and safe Close (P106/I102) → installed acceptance test (T103/I103). The foundational Engine, Sessions and Workbench are already implemented; see [Completed](#completed).

**Acceptance target:** In one Git project, create/edit a Specification and Tasks, move a Task through review and corrections, delegate one Workflow step to an agent, inspect its result, accept or refuse it, recover after a restart and close safely. External GitHub PR/merge handling is acceptable for 1.0.

| ID · capability                          | State             | What is still needed                                                | Specification / PR / idea                                                                                                            |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P100 · Task authoring                    | 🚧 In progress    | Create/edit Tasks, types and dependencies in a real project         | Spec: — · PR: [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                        |
| P101 · Manual Workflow execution         | 🚧 In progress    | Complete a review-fail/rework path from the UI and CLI              | Spec: — · PR: [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                        |
| P102 · One-step agent delegation         | ⬜ Planned        | Run a step with a Managed Session; validate writes, result and stop | Spec: — · [E6 plan](specflow-engine/managed-session-integration.md), [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) |
| P106 · Owner acceptance and safe Close   | 🟡 Partial        | Approve the result, reject invalid transitions and complete Close   | Spec: — · [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                            |
| T100 · Workflow UI/CLI commands          | 🟡 Partial        | Manual and agent commands must use the same Engine operations       | Spec: — · [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)                                                            |
| D101 · Agent step context                | 🟡 Partial        | Use the right repo-owned Workflow, Task and document context        | Spec: — · [Task context](specflow-engine/task-resource-and-context.md)                                                               |
| I101 · Interrupted agent work            | 🟡 Partial        | Restart or retry without duplicate actions or lost ownership        | Spec: — · [Recovery](specflow-engine/execution-scopes-and-recovery.md)                                                               |
| I102 · Workflow authorization            | 🟡 Partial        | Enforce allowed actions in Runtime, not only the UI                 | Spec: — · [Auth follow-ups](authorization/README.md)                                                                                 |
| T103 · Install and configure one project | 🟡 Partial        | Prove external installation and guided provider setup               | Spec: — · [Packaging](../engineering/repository/product-packaging.md)                                                                |
| I103 · Installed end-to-end verification | ⬜ Planned        | Test manual/agent journey, restart, refusal and Close               | Spec: — · [Acceptance](specflow-engine/acceptance-criteria.md)                                                                       |
| I104 · Supported platform policy         | 🔎 Needs decision | State exactly which native agent adapters work on each OS           | Spec: — · [Provider backlog](specflow-runtime/provider-migration-plan.md)                                                            |

**Status meanings:** ✅ Done means the stated scope is implemented in `main`; 🚧 work is on an active branch; 🟡 partially implemented; ⬜ not started; 🔎 analysis/decision needed. `Spec: —` means no approved Specification link was verified. An ideas-stage PR is **not** automatically an approved Specification. **Completed implementation does not imply a product release.**

## Next releases · 1.1.0, later 1.x and 2.0.0

### 1.1.0 · Automated execution (candidate scope)

These are the **first candidates**, not five confirmed release commitments. Revisit scope after the 1.0 end-to-end journey works.

| ID · capability              | State             | User outcome / gap                                   | Existing design                                                     |
| ---------------------------- | ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| P103 · Auto-continue         | ⬜ Proposed       | Launch the next eligible step automatically          | [F01](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P104 · Selected Task batches | ⬜ Proposed       | Execute Tasks in dependency order with review/rework | [F12](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| P105 · Test and human gates  | 🟡 Partial        | Run checks and collect explicit review evidence      | [F03](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| T101 · GitHub delivery       | 🔎 Needs analysis | PR creation, CI feedback, review comments and merge  | [Migration notes](specflow-engine/legacy-nevo-migration.md)         |
| T102 · Workflow Git actions  | 🟡 Partial        | Scoped commit/push and safe post-actions             | [F04](specflow-engine/execution-plans/06-workflow-kernel/README.md) |

### Later compatible 1.x minor releases

Other candidates may go into `1.2.0`, `1.3.0` and so on. Following [SemVer](https://semver.org/spec/v2.0.0.html), compatible features normally increment **minor**; patch releases such as `1.1.1` are for compatible fixes.

| ID · capability                    | State                  | Source / next analysis                                                        |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| P110 · Step forms                  | ⬜ Proposed            | [E5 in #137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)         |
| P111 · Code inspection/editing     | ⬜ Proposed            | [Developer workspace](developer-workspace/code-inspection-and-editing.md)     |
| P112 · Ideas and roadmap UI        | 🔎 Needs analysis      | Concept: Git-owned drafts, stable IDs and Spec/PR links                       |
| P113 · Parallel Task worktrees     | ⬜ Proposed            | [F08/F12](specflow-engine/execution-plans/06-workflow-kernel/README.md)       |
| T110 · More provider capabilities  | 🟡 Partial             | [Provider backlog](specflow-runtime/provider-migration-plan.md)               |
| T111 · Better RAG and more sources | 🟡 Partial             | [Semantic docs](semantic-docs/README.md)                                      |
| T112 · More Workflow integrations  | 🔎 Needs analysis      | [Migration notes](specflow-engine/legacy-nevo-migration.md)                   |
| I110 · Native Linux/macOS agents   | 🔎 Needs certification | [Provider F08](specflow-runtime/provider-migration-plan.md)                   |
| I111 · Recovery and diagnostics UI | 🟡 Partial             | [Runtime diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md) |
| I112 · Project Settings            | 🟡 Partial             | [UI proposal](specflow-ui/screens/project-settings-ui-spec.md)                |

### 2.0.0 · Multi-project hosting (exploration)

One installation managing several repositories is an architectural change, not just a project selector. [Multi-project proposal](multi-project-hosting.md). Breaking changes are acceptable **only if required** by the new model.

| ID · capability                     | State           | Desired outcome                                         |
| ----------------------------------- | --------------- | ------------------------------------------------------- |
| P200 · Project portfolio            | 🔎 Exploration  | Register and switch between Git repositories            |
| I200 · Multi-project Runtime        | 🔎 Exploration  | Isolated project engines, persistence and recovery      |
| I201 · External/Docker hosting      | 🔎 Needs design | Run SpecFlow outside a checkout; manage repositories    |
| I202 · Project access and isolation | 🔎 Needs design | Host roles, project permissions and quotas              |
| I203 · Cross-project agent context  | 🔎 Exploration  | Read authorized contexts; keep write targets explicit   |
| P201 · Cross-project planning       | 💡 Optional     | Initiatives spanning repositories                       |
| P202 · Full planning product        | 💡 Optional     | Editable Ideas, versions, delivery evidence and history |

## Completed

These are **completed scopes available in `main`**, not the full end-to-end 1.0 experience and not proof of a published release. PR links are *selected evidence*, not a manual duplicate of GitHub history. A capability stays here with its Specification/PR links after completion.

| Product capability or foundation                       | State   | Merged PR evidence                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C001 · Specification Create/Close and Git worktrees    | ✅ Done | [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#55](https://github.com/dczerwinskipl/nevo-specflow/pull/55)                                                                                                                                                                                                    |
| C002 · Archetype-backed document reading and editing   | ✅ Done | [#88](https://github.com/dczerwinskipl/nevo-specflow/pull/88), [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93), [#94](https://github.com/dczerwinskipl/nevo-specflow/pull/94), [#105](https://github.com/dczerwinskipl/nevo-specflow/pull/105)     |
| C003 · Task Workbench and read views                   | ✅ Done | [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60) (not Task authoring)                                                                                                                                                                                                                                              |
| C004 · Deterministic Workflow kernel                   | ✅ Done | [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120) (not agent orchestration)                                                                                                                                                                                                                                       |
| C005 · Managed Claude/Codex Sessions                   | ✅ Done | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126)                                                                                                                                                                                                  |
| C006 · Antigravity and provider telemetry              | ✅ Done | [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125)                                                                                                                                                                                                |
| C007 · Workbench UI and navigation                     | ✅ Done | [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#62](https://github.com/dczerwinskipl/nevo-specflow/pull/62), [#112](https://github.com/dczerwinskipl/nevo-specflow/pull/112), [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124), [#148](https://github.com/dczerwinskipl/nevo-specflow/pull/148) |
| D100 · Workspace-aware documentation reader and search | ✅ Done | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) (merged 2026-11-14)                                                                                                                                                                            |
| C008 · Authentication, authorization and OpenAPI       | ✅ Done | [#14](https://github.com/dczerwinskipl/nevo-specflow/pull/14), [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136)                                                                                                                                   |
| C009 · Packaging, CI and agent-quality tooling         | ✅ Done | [#10](https://github.com/dczerwinskipl/nevo-specflow/pull/10), [#43](https://github.com/dczerwinskipl/nevo-specflow/pull/43), [#77](https://github.com/dczerwinskipl/nevo-specflow/pull/77), [#81](https://github.com/dczerwinskipl/nevo-specflow/pull/81), [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144)     |

## Decisions / open questions

1. **Approve the 1.0 acceptance set.** Until then there is no meaningful completion-coverage percentage. When approved, track each criterion as Done/Not Done, with independent release state.
2. **Set supported platforms.** Distinguish packaged software from certified native-agent operation; decide the minimum 1.0 support matrix.
3. **Select 1.1.0 scope.** Decide which automation, verification and GitHub delivery features are mandatory for that minor release, and which move to later `1.x` minors.
4. **Design Ideas/Roadmap records.** Preserve stable IDs and many-to-many Idea ↔ Specification ↔ PR links. Creating a Specification never removes the roadmap item; obsolete exploration documents may be retired.
5. **Design 2.0 hosting boundaries.** Project identity, Engine composition, permissions, state location and deployment need analysis before implementation.

**For agents:** Read `ideas.roadmap` intentionally when planning a new Specification. Ordinary implementation context still excludes non-authoritative `docs/ideas/**`. For details, follow the linked idea or architecture document. The current PR state comes from GitHub; a merged PR and a released feature are separate facts.
