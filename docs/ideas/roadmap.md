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

# Nevo SpecFlow product roadmap

> **Planning document, not an implementation contract.** Current code, accepted architecture and Specifications take precedence over ideas. Release targets are proposals, not commitments.
>
> **Snapshot: 2026-11-14.** GitHub has **145 PRs: 121 merged, 22 closed without merge, 2 open** (#137 and #149). This is a static snapshot; the [complete register](roadmap-delivered.md) preserves individual PR links.

## Where we are today

Nevo SpecFlow already has Specification Create/Close, document editing, a Task Workbench, a deterministic Workflow kernel, managed Claude/Codex/Antigravity Sessions, security boundaries, a browser UI, and workspace-aware documentation search. These foundations are on `main`. They do **not** yet form a fully connected agent-driven development loop.

**What is still missing for 1.0:** finish Task authoring and manual Workflow execution from [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), connect a single workflow step to a Managed Session (E6), then prove manual/agent handoff, owner acceptance, safe Close and restart in an installed application.

**What comes after 1.0:** automatic continuation, selected Task execution, richer gates and GitHub PR/CI/review/merge integration. The documentation reader from [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) is **already merged** and is not a release blocker.

### The product's central principle

**Users own the development process in their Git repository.** Workflow steps and transitions, Task Types and agent archetypes are user-defined files. Nevo interprets those definitions and coordinates execution. It does not hard-code a universal `implementation → review → pass` path. More gates, post-actions and automation will be delivered incrementally. See [the Workflow kernel](../architecture/workflow/workflow-kernel.md) and [Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md).

## Release horizons

- **1.0.0:** one usable Git project with Task authoring, manual Workflow, optional delegation of a single step, owner acceptance, safe recovery and technical Close. A documented installed build must demonstrate that journey.
- **1.1.0:** first compatible feature release; primary candidates are automatic continuation, selected Task batches, more verification and Git host delivery. Its exact scope still requires a release decision.
- **Later 1.x minors:** other compatible capabilities can ship in `1.2.0`, `1.3.0` and so on. Following [SemVer](https://semver.org/spec/v2.0.0.html), new compatible features generally increment **minor**; patch releases such as `1.1.1` are for compatible bug fixes.
- **2.0.0:** a possible major architectural change for multi-project hosting and Docker/out-of-repository deployment, with breaking changes only where justified.

## Critical path to 1.0

1. ✅ **Use the existing foundations.** Do not rebuild the Engine, documents, managed Sessions or Workflow kernel.
2. **Finish Task authoring and manual Workflow** (P100, P101, T100; [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137)). Demonstrate create, edit, review-fail, correction and completion in a real project.
3. **Run one step with an agent** (P102, D101, I101). Verify attempt identity, authorized writes, explicit finish, stop and retry.
4. **Accept and close** (P106, I102). Minimum owner approval is needed now; configurable formal human-verification gates (P105) are a later 1.x feature.
5. **Verify the installable product** (T103, I103, I104). Exercise startup, platform support, restart, refusal paths and Technical Close. GitHub PR automation is not required for this milestone.

**Not required to exit 1.0:** unattended continuation, Task batches, full command/test gates, GitHub delivery automation, Linux/macOS native adapter parity, and multi-project Docker hosting. Workspace documentation reading (D100) is already delivered and is not an additional blocker.

## How to interpret status

Every roadmap record has four independent dimensions:

- **Concept:** `sketch`, `exploring`, `designed`, `specified`. Only an approved linked Specification means `specified`.
- **Implementation:** `not started`, `partial`, `in progress`, `completed`. A merged PR proves its own delivered scope, not completion of the entire feature.
- **Release:** `unreleased` or `released`, plus version and release evidence. GitHub currently lists no published Releases; merged into `main` does not mean shipped to users.
- **PR:** `draft`, `open`, `merged`, or `closed without merge`. This is derived from GitHub at the time of refresh, not set by a roadmap author.

Stable IDs do not encode versions. An item stays in the roadmap after a Specification is written and can remain in the delivered history afterward. For planning new Specifications, deliberately load `ideas.roadmap`; ordinary `docs:context` intentionally excludes `docs/ideas/**`. Open [PR history](roadmap-delivered.md) only when implementation provenance is needed.

## Delivered foundations

These **15 completed foundation areas** are already merged into `main`. ✅ means the stated contribution was implemented, **not** that the full product journey was released. The [complete categorized register](roadmap-delivered.md) accounts for all 121 merged PRs, including smaller tests, fixes and maintenance.

- ✅ **Product / CLI:** Project bootstrap, configuration and installed single-project CLI/Runtime entry points [#15](https://github.com/dczerwinskipl/nevo-specflow/pull/15), [#13](https://github.com/dczerwinskipl/nevo-specflow/pull/13), [#24](https://github.com/dczerwinskipl/nevo-specflow/pull/24), [packaging](../engineering/repository/product-packaging.md)
- ✅ **Product / Specifications:** Specification Create and project-mode workspace read/integration [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#44](https://github.com/dczerwinskipl/nevo-specflow/pull/44), [#75](https://github.com/dczerwinskipl/nevo-specflow/pull/75)
- ✅ **Engine / Git:** Verified Project Home, worktrees, Create/Close lifecycle, Git ownership and recovery foundation [#54](https://github.com/dczerwinskipl/nevo-specflow/pull/54), [#55](https://github.com/dczerwinskipl/nevo-specflow/pull/55), [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#71](https://github.com/dczerwinskipl/nevo-specflow/pull/71)
- ✅ **Product / Documents:** Archetype/registry, Specification document reads, edits, tabs, dirty tracking and Engine commit policy [#85](https://github.com/dczerwinskipl/nevo-specflow/pull/85), [#88](https://github.com/dczerwinskipl/nevo-specflow/pull/88), [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93), [#94](https://github.com/dczerwinskipl/nevo-specflow/pull/94), [#95](https://github.com/dczerwinskipl/nevo-specflow/pull/95), [#105](https://github.com/dczerwinskipl/nevo-specflow/pull/105)
- ✅ **Product / Tasks:** Task Workbench and scope-aware Task read composition (distinct from #137's Task authoring/execution) [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60)
- ✅ **Product / Workbench:** Specification list, focused shell, responsive navigation, UI routes and editor/mobile polish [#30](https://github.com/dczerwinskipl/nevo-specflow/pull/30), [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#42](https://github.com/dczerwinskipl/nevo-specflow/pull/42), [#45](https://github.com/dczerwinskipl/nevo-specflow/pull/45), [#47](https://github.com/dczerwinskipl/nevo-specflow/pull/47), [#62](https://github.com/dczerwinskipl/nevo-specflow/pull/62), [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124), [#145](https://github.com/dczerwinskipl/nevo-specflow/pull/145), [#146](https://github.com/dczerwinskipl/nevo-specflow/pull/146)
- ✅ **Product / Sessions:** Managed Sessions, Claude/Codex, Specification association, Session UX and safe start [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#99](https://github.com/dczerwinskipl/nevo-specflow/pull/99), [#112](https://github.com/dczerwinskipl/nevo-specflow/pull/112), [#117](https://github.com/dczerwinskipl/nevo-specflow/pull/117), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126)
- ✅ **Runtime / AI:** Antigravity native adapter, safe discovery, Stop continuation and provider telemetry foundation [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125)
- ✅ **Engine / Workflow:** Deterministic Specification/Task Workflow kernel, user-owned definitions and progression semantics [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120), [workflow kernel](../architecture/workflow/workflow-kernel.md) (not yet proof of autonomous execution)
- ✅ **Product / Docs:** Documentation discovery, lexical and optional semantic search [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [semantic backlog](semantic-docs/README.md) (workspace reader remains open in #143)
- ✅ **Platform / API:** Runtime authentication, scoped authorization, generated OpenAPI and validation [#13](https://github.com/dczerwinskipl/nevo-specflow/pull/13), [#14](https://github.com/dczerwinskipl/nevo-specflow/pull/14), [#26](https://github.com/dczerwinskipl/nevo-specflow/pull/26), [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136)
- ✅ **Tooling / Agents:** Agent instruction foundation, scope-aware planning, UX/implementation roles, independent review and quality checks [#10](https://github.com/dczerwinskipl/nevo-specflow/pull/10), [#29](https://github.com/dczerwinskipl/nevo-specflow/pull/29), [#38](https://github.com/dczerwinskipl/nevo-specflow/pull/38), [#40](https://github.com/dczerwinskipl/nevo-specflow/pull/40), [#41](https://github.com/dczerwinskipl/nevo-specflow/pull/41), [#43](https://github.com/dczerwinskipl/nevo-specflow/pull/43), [#57](https://github.com/dczerwinskipl/nevo-specflow/pull/57), [#81](https://github.com/dczerwinskipl/nevo-specflow/pull/81)
- ✅ **Infrastructure / Quality:** Cross-platform CI, real-Git tests, packaged product smoke, recovery fixes, CodeQL, Chromatic and dependency hygiene [#20](https://github.com/dczerwinskipl/nevo-specflow/pull/20), [#63](https://github.com/dczerwinskipl/nevo-specflow/pull/63), [#68](https://github.com/dczerwinskipl/nevo-specflow/pull/68), [#77](https://github.com/dczerwinskipl/nevo-specflow/pull/77), [#83](https://github.com/dczerwinskipl/nevo-specflow/pull/83), [#111](https://github.com/dczerwinskipl/nevo-specflow/pull/111), [#122](https://github.com/dczerwinskipl/nevo-specflow/pull/122), [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144)
- ✅ **Documentation / Vision:** Documentation architecture, provider/UX decisions, multi-project concept and README product narrative [#9](https://github.com/dczerwinskipl/nevo-specflow/pull/9), [#56](https://github.com/dczerwinskipl/nevo-specflow/pull/56), [#103](https://github.com/dczerwinskipl/nevo-specflow/pull/103), [#108](https://github.com/dczerwinskipl/nevo-specflow/pull/108), [#135](https://github.com/dczerwinskipl/nevo-specflow/pull/135), [#147](https://github.com/dczerwinskipl/nevo-specflow/pull/147)
- ✅ **Documentation / Workspace reader (D100):** A reader for documentation from a verified project or worktree is implemented. [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) merged on 2026-11-14, building on [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138). It is already part of `main`, not a pending 1.0 blocker.

## 1.0.0: finish the user-controlled experience

### Core product and Workflow

- **P100 · Create and manage Tasks.** Create and edit Task files, assign a user-defined Task Type and connect dependencies. **Concept:** designed. **Implementation:** in progress. **Release:** unreleased. Sources: [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Task resources](specflow-engine/task-resource-and-context.md). The merged #120 kernel is ✅ documented above; do not conflate it with full Task CRUD.
- **P101 · Complete a workflow manually.** Move a Specification and its Tasks through review, corrections, acceptance and Close without requiring an agent. **Concept:** designed. **Implementation:** in progress. **Release:** unreleased. Sources: [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [acceptance criteria](specflow-engine/acceptance-criteria.md). Needs real installed/project-mode proof and review of effective scope.
- **P102 · Run one Workflow step with an agent.** Delegate one eligible step, inspect the result, and decide whether to continue. **Concept:** designed. **Implementation:** not started. **Release:** unreleased. Sources: [#137 E6](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [managed integration](specflow-engine/managed-session-integration.md). A Session is not itself Workflow progress; decisions D10–D13 remain explicit gates.
- **P106 · Approve work and close a Specification.** Accept or reject outcomes without bypassing Engine rules; Technical Close is not a GitHub merge. **Concept:** designed. **Implementation:** partial. **Release:** unreleased. Sources: [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [local actor and human gates](specflow-engine/local-actor-and-human-gates.md). No false claimed approval or bypassed writer claims.

### Tooling and product knowledge

- **T100 · Use one Workflow interface in the UI and CLI.** Use the same Engine start/finish/return operations from manual and external agent commands. **Concept:** designed. **Implementation:** partial. **Release:** unreleased. Sources: [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [offline CLI](specflow-engine/offline-cli-and-external-agents.md). MCP is optional if the verified agent completion transport works.
- **T103 · Install and start a one-project server.** Make setup and startup work for someone outside the monorepo development environment. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Packaged product](../engineering/repository/product-packaging.md), [dogfooding](../engineering/repository/dogfooding.md). No requirement for Docker or a multi-project registry.
- **D101 · Give agents relevant repository context.** Use the actual Workflow and Task definitions, documents and authorized source context for the executing step. **Concept:** designed. **Implementation:** partial. **Release:** unreleased. Sources: ✅ [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120), [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Task context](specflow-engine/task-resource-and-context.md). Verify E6 read/write boundaries.

### Infrastructure and verification

- **I101 · Recover interrupted agent work safely.** Inspect a stopped or interrupted execution, retry where safe and avoid duplicate writes. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Execution scopes](specflow-engine/execution-scopes-and-recovery.md), [locking/admission](specflow-engine/locking-and-admission.md), [Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md). No release without negative/fault tests for supported agent execution.
- **I102 · Enforce user permissions for Workflow actions.** Let users see valid actions while the Runtime enforces authorization regardless of the UI. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: ✅ [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [auth follow-ups](authorization/README.md). Avoid UI-only permission decisions.
- **I103 · Prove 1.0 in a real installed project.** Test the complete 1.0 journey with a packaged build, restart and failure scenarios. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: [Dogfooding](../engineering/repository/dogfooding.md), [Engine acceptance](specflow-engine/acceptance-criteria.md). No requirement for a fully unattended agent batch.
- **I104 · Document native agent platform support.** Publish an accurate native-agent support matrix instead of equating packaging with support. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Provider backlog F08](specflow-runtime/provider-migration-plan.md). A Windows-only native adapter matrix can be documented for 1.0; native macOS/Linux is an **I110 1.1.x candidate**.

## 1.1.0 and later 1.x: compatible improvements

**First candidates for 1.1.0:** automated progress and Git delivery. These are options to prioritize, not a promise that every one belongs in the same minor release.

### Workflow automation and delivery

- **P103 · Continue the workflow automatically.** Launch the next eligible step without manually starting another Session. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Plan 06 F01](specflow-engine/execution-plans/06-workflow-kernel/README.md), [Managed Session integration](specflow-engine/managed-session-integration.md). Requires reliable P102 single-step protocol.
- **P104 · Run selected Tasks and rework in sequence.** Execute selected Tasks with dependencies, review feedback and rework across Sessions. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Plan 06 F12](specflow-engine/execution-plans/06-workflow-kernel/README.md). Distinct from multi-instance execution of one step.
- **P105 · Verify work using tests and human gates.** Require evidence from checks or a named human decision where a definition asks for it. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Plan 06 F03](specflow-engine/execution-plans/06-workflow-kernel/README.md), [legacy migration](specflow-engine/legacy-nevo-migration.md). 
- **T101 · Manage GitHub PRs, reviews and merge.** Create PRs, follow CI and review threads, apply feedback and merge with owner approval. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: [Legacy migration](specflow-engine/legacy-nevo-migration.md). GitHub as first adapter; host-agnostic Workflow model. 
- **T102 · Commit and push through Workflow actions.** Commit only intended files and recover safely after interrupted Git operations. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Plan 06 F04](specflow-engine/execution-plans/06-workflow-kernel/README.md), [durable operations](specflow-engine/durable-operations-and-recovery.md). 

**Candidates for later compatible minor releases** (for example `1.2.0`) should be selected from real user needs rather than treating all ideas as mandatory for `1.1.0`.

### Product, UI and planning

- **P110 · Show step-specific forms from Workflow definitions.** Render typed inputs such as choices, numbers and Markdown from Workflow step metadata. **Concept:** designed. **Implementation:** not started. **Release:** unreleased. Sources: E5 in [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [F19](specflow-engine/execution-plans/06-workflow-kernel/README.md).
- **P111 · Inspect and edit code inside the Workbench.** Review current worktree changes and make small fixes without switching to another tool. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Developer workspace](developer-workspace/code-inspection-and-editing.md). Full IDE separate.
- **P112 · Plan Ideas and releases inside SpecFlow.** Manage draft ideas, release candidates and links to Specifications and PRs. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: This roadmap is the data/UX seed. Design Git-owned identity and many-to-many references. Never delete an idea merely because a Specification was created.
- **P113 · Run independent Tasks concurrently.** Work on independent Tasks simultaneously without sharing unsafe Git state. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Plan 06 F08/F12](specflow-engine/execution-plans/06-workflow-kernel/README.md), [workspace binding](specflow-engine/workspace-binding-lifecycle.md).

### Tooling, knowledge and runtime

- **T110 · Support more native agent features.** Add profiles, skills/MCP, interaction and model options when safely supported by native providers. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Provider capability backlog](specflow-runtime/provider-migration-plan.md). Capability-specific trust decisions required.
- **T111 · Improve and expand documentation search.** Improve result relevance, add contextual help and extend searchable source types. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Search quality](semantic-docs/search-quality.md), [surfaces](semantic-docs/surfaces-and-setup.md).
- **T112 · Integrate other developer tools.** Support real integrations without hard-coding a marketplace into the kernel. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: [Legacy migration](specflow-engine/legacy-nevo-migration.md). No speculative plugin marketplace.
- **I110 · Run agents natively on Linux/macOS.** Certify actual agent process, sandbox and recovery behavior on supported Linux/macOS installations. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Provider backlog F08](specflow-runtime/provider-migration-plan.md); platform packaging alone is insufficient.
- **I111 · Understand and recover execution failures.** Show why work stopped and what the user can do to resume or reconcile it. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Adapter diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md), [eventing](specflow-ui/data-loading-refresh-and-eventing.md).
- **I112 · Configure projects and providers in Settings.** Set up model endpoints, definitions and workspaces through a guided UI. **Concept:** exploring. **Implementation:** partial. **Release:** unreleased. Sources: [Project settings UI](specflow-ui/screens/project-settings-ui-spec.md), [semantic setup](semantic-docs/surfaces-and-setup.md).

## 2.0.0: multi-project hosting and external deployment

One instance managing several repositories changes project identity, workspace resolution, persistence, authorization and Session targeting. This requires its own design rather than a project selector added to the single-checkout model. The [multi-project idea](multi-project-hosting.md) is a starting point, not an accepted implementation plan.

### Product and planning

- **P200 · Manage several repositories in one Workbench.** Register, clone, select and monitor several Git projects in the same installation. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Multi-project hosting direction](multi-project-hosting.md). Need UX for registration, lifecycle, project isolation and global vs project navigation.
- **P201 · Plan work across repositories.** View and organize initiatives spanning more than one repository. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: [Multi-project hosting](multi-project-hosting.md), P112. This is distinct from simply hosting several repositories.
- **P202 · Build a full Ideas and Roadmap product.** Evolve Ideas into editable planning, linked delivery evidence and history. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: P112 is the additive single-project precursor. Decide whether Ideas are Git-owned documents, a new domain resource, or a projection over both; do not let central planning mutate a project's canonical Specification behind its back.

### Infrastructure and tooling

- **I200 · Run several isolated project engines.** Give every registered project its own verified state, workspaces and recovery. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Multi-project hosting](multi-project-hosting.md). Evaluate registry identity, resource lifetimes, persistence partitions, boot and crash recovery, per-project limits and backwards compatibility.
- **I201 · Deploy via Docker outside Git repositories.** Host the app separately from the checkouts it manages. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: [Multi-project hosting](multi-project-hosting.md); current [packaging](../engineering/repository/product-packaging.md) is **single-product artifact packaging**, not this deployment model. A single-project container can be investigated earlier without bringing the 2.0 project model forward.
- **I202 · Manage permissions across projects.** Add host-level roles and project isolation without weakening Git authority. **Concept:** sketch. **Implementation:** not started. **Release:** unreleased. Sources: [Authorization follow-ups](authorization/README.md), [Multi-project hosting](multi-project-hosting.md). Identity and grants must not be inferred merely from filesystem paths or Session ownership.
- **I203 · Use authorized context across projects.** Read approved project context while keeping every write target explicit and authorized. **Concept:** exploring. **Implementation:** not started. **Release:** unreleased. Sources: [Multi-project hosting](multi-project-hosting.md), [Managed Session integration](specflow-engine/managed-session-integration.md). Define context versus authority without introducing a fake cross-project atomic Git transaction.

**Potential compatibility impact:** host-level project registry, project-scoped IDs and authorization, separate host credentials from repository-owned Workflow definitions, and per-project recovery. A major version permits breaking changes where justified; it does not require them.

## Longer-term ideas without a release commitment

- **Multiple independent contributions to one Workflow step:** [multi-instance execution](specflow-engine/multi-instance-execution.md), [future plan](specflow-engine/multi-instance-plan/README.md). Distinct from parallel Tasks.
- **Full browser/remote IDE:** [developer workspace](developer-workspace/README.md). Needs user validation and a hosting/security design.
- **Recurring or scheduled execution:** [reusable Workflow proposal in #137](https://github.com/dczerwinskipl/nevo-specflow/pull/137). Needs separate trigger, scheduling and idempotency analysis.
- **Third-party plugin marketplace:** [provider backlog](specflow-runtime/provider-migration-plan.md). Needs evidence from real integrations and a trusted extension boundary.

## Design notes for agents writing Specifications

- **Workflow** remains owned by files in the user's repository and is provider-neutral. No built-in step names or hard-coded outcome semantics.
- **Sessions** can carry Task and project context without automatically granting permission to mutate them. Verified execution and explicit ownership must remain separate.
- **Runtime APIs** should preserve a project boundary, even with a single project today. Never use ambient process CWD as HTTP request authority.
- **GitHub integration** should use a host adapter. Existing Engine lifecycle retains control of Git worktrees, commits and Close.
- **RAG** results require corpus/workspace identity; multi-project search must not leak data or authority across projects.
- **Roadmap** records must support many-to-many Idea ↔ Specification ↔ PR relationships; completed records retain evidence.

## Lifecycle of an Idea

1. **Capture** an outcome, optional release candidate, constraints and questions.
2. **Explore** alternatives in non-authoritative idea documents; promote decisions into current product/architecture docs when approved.
3. **Specify** the implementation scope and link its Specification. The roadmap record stays visible.
4. **Implement** through linked PRs. A draft branch, merged PR and product release are distinct states.
5. **Complete** the verified implementation scope, retain ✅ and current contract/PR links; mark `released` only when a release contains it.
6. **Reconcile** after changes to Specifications, PRs and releases. Retire outdated exploratory guidance without deleting the product roadmap history.

Suggested **conceptual** fields, not a schema: `roadmapId`, `title`, `category`, `targetRelease`, `conceptState`, `implementationState`, `releaseState`, `dependencies[]`, `ideaRefs[]`, `specRefs[]`, `prRefs[]`, `currentDocs[]`. Refresh PR state from GitHub, not manual guesses.

### Verified PR status (2026-11-14)

[Complete PR history](roadmap-delivered.md): 121 merged, 22 closed without merge, 2 open. [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) merged 2026-11-14; [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) is draft/open. Recheck this snapshot before release planning.

### Remaining scope decisions

- Confirm the owner-controlled 1.0 acceptance journey and platform matrix.
- Select the first 1.1.0 feature set; move other compatible features to later **minor** versions, not patch releases.
- Decide whether P112 starts as a read-only Roadmap UI, retaining repository ownership.
- Keep multi-project hosting and Docker outside-repository management in the 2.0 architecture investigation.

