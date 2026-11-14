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

> **Working product direction, not an implementation contract.** This roadmap connects what exists, what is being implemented, and what should remain possible. Individual `docs/ideas/**` documents contain exploration; Specifications and approved architecture contain implementation decisions. Code and current contracts win over historical proposals. **A release target is a proposal, not a commitment.**
>
> **Status snapshot: 2026-11-14.** A complete audit of **145 PRs** found **120 merged, 22 closed without merge, and 3 open** (#137, #143, and this roadmap PR #149). [Every merged PR is linked in the delivery register](roadmap-delivered.md). This is a snapshot, not a live status feed.

## Product direction and release boundaries

| Horizon | Intended outcome | Scope boundary |
| --- | --- | --- |
| **1.0.0 — Usable, owner-controlled single-project workflow** | A developer can create and edit a Specification and Tasks, advance a definition-driven workflow manually, delegate an eligible step to a managed agent, inspect the result, approve and technically Close. The product installs and runs for one Git project. | **One project; human-driven handoffs are acceptable.** No unattended multi-Task orchestration, GitHub PR automation, full command-gate framework or multi-project server required for 1.0. |
| **1.1.x — Complete and improve everyday execution** | Automatic continuation, selected Task batches and review loops, command/human gates, Git host PR/CI/merge delivery, better inputs and diagnostics, provider/OS parity, planning and code-inspection improvements. | A **series of compatible increments**, not a promise that every candidate ships in 1.1.0. An item may ship in 1.1.1 or later, or be deferred after review. |
| **2.0.0 — Multi-project, externally hosted SpecFlow** | One centrally hosted SpecFlow (for example Docker) manages multiple Git repositories, project registry, project-scoped resources, authentication and agent Sessions. | Large architectural change, potentially incompatible where necessary. Do not force premature multi-project infrastructure into 1.0/1.1. |

**1.0 exit scenario:** Install or run the packed application outside the development monorepo, initialize one Git project, create a Specification and different Task Types, edit documents, advance a manual review-fail/rework/acceptance workflow, delegate **one eligible step** to a managed agent, safely recover or reconcile interrupted work, and perform an authorized technical Close. PR publication/review/merge can still be performed externally. **Automatic continuation and GitHub delivery move to 1.1.x candidates**, not hidden 1.0 blockers.

### How to read the roadmap

- **✅ Delivered** means an independently identifiable capability or foundation is already merged into `main`, with linked PR evidence. A merged PR does not imply that the complete larger feature is done.
- **Concept maturity** is separate from implementation: `sketch`, `exploring`, `designed`, `specified`. Design and analysis links are evidence, not approval.
- **Delivery** is `not started`, `partial`, `in progress`, or `delivered`. GitHub PR state (`draft`, `open`, `merged`, `closed without merge`) is independent. A working branch, even if deployed for testing, is not merged into `main`.
- **Evidence** links to existing ideas, accepted specifications where verified, PRs and current architecture or product contracts. **Needs analysis** is an explicit, valid status.
- **Release horizons** are proposals, not hard dates. Every roadmap ID is stable and **does not encode the target version**, so an item can move from 1.0 to 1.1 without being renamed.
- A concept **remains on the roadmap after a Specification is created**. Once delivered, move it to the completed foundations/history, retaining the links rather than deleting its provenance.

## Delivered foundations

**✅ 120 merged PRs** are part of the baseline for the next release. They include product features, architecture, CLI and Engine, UI, providers, security, tests, documentation and dependency updates. The table summarizes **completed scopes**, not all future work of the same name. The [complete categorized PR history](roadmap-delivered.md) links **every merged PR**, including maintenance work; it also distinguishes the **22 closed without merge** and the **3 open** PRs at this snapshot.

| Area | ✅ Implemented foundation in `main` | Delivery evidence |
| --- | --- | --- |
| Product / CLI | ✅ Project bootstrap, configuration and installed single-project CLI/Runtime entry points | [#15](https://github.com/dczerwinskipl/nevo-specflow/pull/15), [#13](https://github.com/dczerwinskipl/nevo-specflow/pull/13), [#24](https://github.com/dczerwinskipl/nevo-specflow/pull/24), [packaging](../engineering/repository/product-packaging.md) |
| Product / Specifications | ✅ Specification Create and project-mode workspace read/integration | [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#44](https://github.com/dczerwinskipl/nevo-specflow/pull/44), [#75](https://github.com/dczerwinskipl/nevo-specflow/pull/75) |
| Engine / Git | ✅ Verified Project Home, worktrees, Create/Close lifecycle, Git ownership and recovery foundation | [#54](https://github.com/dczerwinskipl/nevo-specflow/pull/54), [#55](https://github.com/dczerwinskipl/nevo-specflow/pull/55), [#53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), [#71](https://github.com/dczerwinskipl/nevo-specflow/pull/71) |
| Product / Documents | ✅ Archetype/registry, Specification document reads, edits, tabs, dirty tracking and Engine commit policy | [#85](https://github.com/dczerwinskipl/nevo-specflow/pull/85), [#88](https://github.com/dczerwinskipl/nevo-specflow/pull/88), [#92](https://github.com/dczerwinskipl/nevo-specflow/pull/92), [#93](https://github.com/dczerwinskipl/nevo-specflow/pull/93), [#94](https://github.com/dczerwinskipl/nevo-specflow/pull/94), [#95](https://github.com/dczerwinskipl/nevo-specflow/pull/95), [#105](https://github.com/dczerwinskipl/nevo-specflow/pull/105) |
| Product / Tasks | ✅ Task Workbench and scope-aware Task read composition (distinct from #137's Task authoring/execution) | [#60](https://github.com/dczerwinskipl/nevo-specflow/pull/60) |
| Product / Workbench | ✅ Specification list, focused shell, responsive navigation, UI routes and editor/mobile polish | [#30](https://github.com/dczerwinskipl/nevo-specflow/pull/30), [#39](https://github.com/dczerwinskipl/nevo-specflow/pull/39), [#42](https://github.com/dczerwinskipl/nevo-specflow/pull/42), [#45](https://github.com/dczerwinskipl/nevo-specflow/pull/45), [#47](https://github.com/dczerwinskipl/nevo-specflow/pull/47), [#62](https://github.com/dczerwinskipl/nevo-specflow/pull/62), [#124](https://github.com/dczerwinskipl/nevo-specflow/pull/124), [#145](https://github.com/dczerwinskipl/nevo-specflow/pull/145), [#146](https://github.com/dczerwinskipl/nevo-specflow/pull/146) |
| Product / Sessions | ✅ Managed Sessions, Claude/Codex, Specification association, Session UX and safe start | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#99](https://github.com/dczerwinskipl/nevo-specflow/pull/99), [#112](https://github.com/dczerwinskipl/nevo-specflow/pull/112), [#117](https://github.com/dczerwinskipl/nevo-specflow/pull/117), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126) |
| Runtime / AI | ✅ Antigravity native adapter, safe discovery, Stop continuation and provider telemetry foundation | [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#125](https://github.com/dczerwinskipl/nevo-specflow/pull/125) |
| Engine / Workflow | ✅ Deterministic Specification/Task Workflow kernel, user-owned definitions and progression semantics | [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120), [workflow kernel](../architecture/workflow/workflow-kernel.md) (not yet proof of autonomous execution) |
| Product / Docs | ✅ Documentation discovery, lexical and optional semantic search | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138), [semantic backlog](semantic-docs/README.md) (workspace reader remains open in #143) |
| Platform / API | ✅ Runtime authentication, scoped authorization, generated OpenAPI and validation | [#13](https://github.com/dczerwinskipl/nevo-specflow/pull/13), [#14](https://github.com/dczerwinskipl/nevo-specflow/pull/14), [#26](https://github.com/dczerwinskipl/nevo-specflow/pull/26), [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136) |
| Tooling / Agents | ✅ Agent instruction foundation, scope-aware planning, UX/implementation roles, independent review and quality checks | [#10](https://github.com/dczerwinskipl/nevo-specflow/pull/10), [#29](https://github.com/dczerwinskipl/nevo-specflow/pull/29), [#38](https://github.com/dczerwinskipl/nevo-specflow/pull/38), [#40](https://github.com/dczerwinskipl/nevo-specflow/pull/40), [#41](https://github.com/dczerwinskipl/nevo-specflow/pull/41), [#43](https://github.com/dczerwinskipl/nevo-specflow/pull/43), [#57](https://github.com/dczerwinskipl/nevo-specflow/pull/57), [#81](https://github.com/dczerwinskipl/nevo-specflow/pull/81) |
| Infrastructure / Quality | ✅ Cross-platform CI, real-Git tests, packaged product smoke, recovery fixes, CodeQL, Chromatic and dependency hygiene | [#20](https://github.com/dczerwinskipl/nevo-specflow/pull/20), [#63](https://github.com/dczerwinskipl/nevo-specflow/pull/63), [#68](https://github.com/dczerwinskipl/nevo-specflow/pull/68), [#77](https://github.com/dczerwinskipl/nevo-specflow/pull/77), [#83](https://github.com/dczerwinskipl/nevo-specflow/pull/83), [#111](https://github.com/dczerwinskipl/nevo-specflow/pull/111), [#122](https://github.com/dczerwinskipl/nevo-specflow/pull/122), [#144](https://github.com/dczerwinskipl/nevo-specflow/pull/144) |
| Documentation / Vision | ✅ Documentation architecture, provider/UX decisions, multi-project concept and README product narrative | [#9](https://github.com/dczerwinskipl/nevo-specflow/pull/9), [#56](https://github.com/dczerwinskipl/nevo-specflow/pull/56), [#103](https://github.com/dczerwinskipl/nevo-specflow/pull/103), [#108](https://github.com/dczerwinskipl/nevo-specflow/pull/108), [#135](https://github.com/dczerwinskipl/nevo-specflow/pull/135), [#147](https://github.com/dczerwinskipl/nevo-specflow/pull/147) |

**Completion rule:** these checkmarks attest only the scope already merged. #137 and #143 are *not* checked off in this snapshot, even if their development branches run in a testing/production-like environment. The [full PR evidence register](roadmap-delivered.md) accounts for the remaining merged refinements, fixes, CI and dependency PRs without inflating the feature roadmap.

## 1.0.0 — Minimal usable single-project release

**Delivery target:** finish what is already underway and prove one owner-controlled manual/agent step loop. Do not make the full legacy-Nevo GitHub automation or broad provider parity a prerequisite.

### A. Core product and Workflow

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **P100** | Task resources and authoring: Task folders/documents, types, dependencies and lifecycle exposed through Engine, CLI/Runtime and UI. | `designed`; **partial / #137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Task resources](specflow-engine/task-resource-and-context.md). The merged #120 kernel is ✅ documented above; do not conflate it with full Task CRUD. |
| **P101** | Full manual Specification and Task Workflow: start/finish/return, review/rework, owner acceptance, refusal and safe Close from real project UI. | `designed`; **#137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [acceptance criteria](specflow-engine/acceptance-criteria.md). Needs real installed/project-mode proof and review of effective scope. |
| **P102** | Owner-requested **single-step agent delegation** for Specification and Task. Verified claim-bound document writes, Task proposals, finish/stop/recovery, manual/agent handoff. | `designed`; **not yet integrated end to end** | [#137 E6](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [managed integration](specflow-engine/managed-session-integration.md). A Session is not itself Workflow progress; decisions D10–D13 remain explicit gates. |
| **P106** | Minimum owner acceptance and Technical Close protections (not remote GitHub PR merge). | `designed`; **partial / #137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [local actor and human gates](specflow-engine/local-actor-and-human-gates.md). No false claimed approval or bypassed writer claims. |

### B. Tooling and documentation

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **T100** | One Engine-owned manual and agent completion interface over UI/HTTP and offline CLI. No second progression model; agent identity is verified. | `designed`; **partial / #137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [offline CLI](specflow-engine/offline-cli-and-external-agents.md). MCP is optional if the verified agent completion transport works. |
| **T103** | Single-project installed product and documented onboarding. Packaging and dogfooding are ✅ done; the *user release path* still needs proof. | `exploring`; **partial** | [Packaged product](../engineering/repository/product-packaging.md), [dogfooding](../engineering/repository/dogfooding.md). No requirement for Docker or a multi-project registry. |
| **D100** | Workspace-aware documentation reader in verified linked worktrees. | `designed`; **#143 open** | ✅ [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138) already delivered the search foundation; [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) provides the reader and is **not yet merged**. [Docs follow-ups](semantic-docs/README.md). |
| **D101** | Agent step context grounded in repository-owned Workflow/Task definitions and authorized documents. | `designed`; **partial** | ✅ [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120), [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [Task context](specflow-engine/task-resource-and-context.md). Verify E6 read/write boundaries. |

### C. Infrastructure, security and verification

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **I101** | Agent/workflow invocation recovery: durable claims, stop, attempt fencing, idempotency and safe partial outputs. | `exploring`; **foundation ✅, E6 bridge open** | [Execution scopes](specflow-engine/execution-scopes-and-recovery.md), [locking/admission](specflow-engine/locking-and-admission.md), [Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md). No release without negative/fault tests for supported agent execution. |
| **I102** | Workflow/Task authorization and actor/allowed-action projections. | `exploring`; **authorization foundation ✅; domain coverage partial** | ✅ [#31](https://github.com/dczerwinskipl/nevo-specflow/pull/31), [auth follow-ups](authorization/README.md). Avoid UI-only permission decisions. |
| **I103** | End-to-end release acceptance in a real single-project installation (manual + one delegated step), including restart and refusal cases. | `sketch`; **needs acceptance design** | [Dogfooding](../engineering/repository/dogfooding.md), [Engine acceptance](specflow-engine/acceptance-criteria.md). No requirement for a fully unattended agent batch. |
| **I104** | Honest supported-platform policy: distinguish portable packaging from *certified native agent execution*. | `exploring`; **support decision required** | [Provider backlog F08](specflow-runtime/provider-migration-plan.md). A Windows-only native adapter matrix can be documented for 1.0; native macOS/Linux is an **I110 1.1.x candidate**. |

## 1.1.x — Compatible extensions after 1.0

**Recommendation:** deliver these in smaller increments across the **1.1.x** series; **none is implicitly a blocker for 1.0 or all required in 1.1.0**. Prioritize automation and completing the delivery loop; forms, planning and IDE conveniences can follow as experience justifies them.

### A. Workflow automation and Git delivery

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **P103** | **Automatic Workflow continuation:** durable `continuation: auto`, new Turn/Session (`fresh`/`reuse`) after authorized finish, recovery and no duplicate dispatch. | `exploring`; **not started** | [Plan 06 F01](specflow-engine/execution-plans/06-workflow-kernel/README.md), [Managed Session integration](specflow-engine/managed-session-integration.md). Requires reliable P102 single-step protocol. |
| **P104** | **Selected Task batches and review loops:** dependency-ordered owner-selected Tasks, agent review/implementation and safe handover. | `exploring`; **not started** | [Plan 06 F12](specflow-engine/execution-plans/06-workflow-kernel/README.md). Distinct from multi-instance execution of one step. |
| **P105** | **Command/test gates and formal human verification:** real inspect/verify behavior, attempt-scoped evidence and `failed` vs infrastructure `blocked`. | `exploring`; **partial document gates on #137** | [Plan 06 F03](specflow-engine/execution-plans/06-workflow-kernel/README.md), [legacy migration](specflow-engine/legacy-nevo-migration.md). **Moved from 1.0.** |
| **T101** | **GitHub delivery lifecycle:** PR creation and updates, CI/review evidence, comment resolution, merge with owner consent and integration with Technical Close. | `sketch`; **needs dedicated design** | [Legacy migration](specflow-engine/legacy-nevo-migration.md). GitHub as first adapter; host-agnostic Workflow model. **Moved from 1.0.** |
| **T102** | **Workflow Git finalization actions:** scoped commit/push and post-actions with journaled recovery; do not commit unrelated changes. | `exploring`; **Engine commit policy ✅; Workflow actions open** | [Plan 06 F04](specflow-engine/execution-plans/06-workflow-kernel/README.md), [durable operations](specflow-engine/durable-operations-and-recovery.md). **Moved from 1.0.** |

### B. Product, UI and planning

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **P110** | Typed Workflow inputs and generic forms (enum, boolean, numeric, Markdown; bounded history/evidence). | `designed`; **not started** | E5 in [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [F19](specflow-engine/execution-plans/06-workflow-kernel/README.md). |
| **P111** | Lightweight worktree code inspection and editing in Workbench. | `exploring`; **not started** | [Developer workspace](developer-workspace/code-inspection-and-editing.md). Full IDE separate. |
| **P112** | Initial Ideas/Roadmap planning inside SpecFlow: draft concepts, release grouping, linking Specs and PRs, completed-history view. | `sketch`; **needs product analysis** | This roadmap is the data/UX seed. Design Git-owned identity and many-to-many references. Never delete an idea merely because a Specification was created. |
| **P113** | Independent Task worktrees and safe parallel execution. | `exploring`; **not started; optional later 1.1.x** | [Plan 06 F08/F12](specflow-engine/execution-plans/06-workflow-kernel/README.md), [workspace binding](specflow-engine/workspace-binding-lifecycle.md). |

### C. Tooling, knowledge and runtime

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **T110** | Native provider capabilities: MCP/skills, profiles, tool policies, active-Turn steering, modalities, richer interaction. | `exploring`; **partial** | [Provider capability backlog](specflow-runtime/provider-migration-plan.md). Capability-specific trust decisions required. |
| **T111** | Semantic/RAG quality and expanded corpora: related docs, Specification/code sources, indexed freshness and guided setup. | `exploring`; **semantic search ✅; broader surfaces open** | [Search quality](semantic-docs/search-quality.md), [surfaces](semantic-docs/surfaces-and-setup.md). |
| **T112** | Additional integrations and reusable Workflow actions (CI, issue trackers, scripts) based on real adapters. | `sketch`; **needs analysis** | [Legacy migration](specflow-engine/legacy-nevo-migration.md). No speculative plugin marketplace. |
| **I110** | Native Linux/macOS agent adapters, with actual containment, process and recovery certification. | `exploring`; **not certified** | [Provider backlog F08](specflow-runtime/provider-migration-plan.md); platform packaging alone is insufficient. |
| **I111** | Rich operator diagnostics, workflow execution history, live invalidation, explicit repair and reconciliation UI. | `exploring`; **partial** | [Adapter diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md), [eventing](specflow-ui/data-loading-refresh-and-eventing.md). |
| **I112** | Project Settings and assisted config: definitions, models, provider profiles, embeddings and repository policy. | `exploring`; **partial** | [Project settings UI](specflow-ui/screens/project-settings-ui-spec.md), [semantic setup](semantic-docs/surfaces-and-setup.md). |

## 2.0.0 — Multi-project and external hosting architecture

**Recommended 2.0 theme:** separate **the application installation** from **the Git repository it operates on**. A server launched via Docker, service manager or package installation can host multiple verified projects, rather than assuming the active process belongs to one checkout. This is an architectural capability, not merely “add a project dropdown”.

### Product and planning

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **P200** | **Project portfolio and selector.** Register/clone/select multiple Git projects; aggregate attention and active work; preserve per-project Specification/Task ownership. | `exploring`; **not started** | [Multi-project hosting direction](multi-project-hosting.md). Need UX for registration, lifecycle, project isolation and global vs project navigation. |
| **P201** | **Cross-project planning Workbench.** Organize an initiative/roadmap spanning repositories without treating it as a synthetic Git Project Home or weakening each project's authority. | `sketch`; **needs analysis; optional for 2.0** | [Multi-project hosting](multi-project-hosting.md), P112. This is distinct from simply hosting several repositories. |
| **P202** | **Full Ideas → Specification planning product.** Manage concepts, versions, decisions and related Specs/PRs, potentially across projects, with useful draft/roadmap views. | `sketch`; **needs analysis; optional for 2.0** | P112 is the additive single-project precursor. Decide whether Ideas are Git-owned documents, a new domain resource, or a projection over both; do not let central planning mutate a project's canonical Specification behind its back. |

### Infrastructure and tooling

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **I200** | **Multi-project Runtime and project registry.** One host composes project-scoped Engine instances, verified roots, worktrees, claims, jobs, logs and recovery. | `exploring`; **not started** | [Multi-project hosting](multi-project-hosting.md). Evaluate registry identity, resource lifetimes, persistence partitions, boot and crash recovery, per-project limits and backwards compatibility. |
| **I201** | **Docker/out-of-repo deployment.** Run the product outside a checkout, mount/register repositories or clone them into managed storage, configure host-level secrets and upgrades. | `sketch`; **needs technical design** | [Multi-project hosting](multi-project-hosting.md); current [packaging](../engineering/repository/product-packaging.md) is **single-product artifact packaging**, not this deployment model. A single-project container can be investigated earlier without bringing the 2.0 project model forward. |
| **I202** | **Application-level access and project isolation.** Administrator/project roles, provider profiles, quotas and shared Runtime resources, keeping Git/project permissions independent. | `sketch`; **needs analysis** | [Authorization follow-ups](authorization/README.md), [Multi-project hosting](multi-project-hosting.md). Identity and grants must not be inferred merely from filesystem paths or Session ownership. |
| **I203** | **Multi-project Session/agent targeting.** A Session may read explicitly authorized projects; writes require a separate verified target and claim. Optional cross-project coordination later. | `exploring`; **not started** | [Multi-project hosting](multi-project-hosting.md), [Managed Session integration](specflow-engine/managed-session-integration.md). Define context versus authority without introducing a fake cross-project atomic Git transaction. |

### Why 2.0 may need breaking changes

- The **single-project Runtime composition** may become a host-level registry with project-scoped engines and durable state.
- CLI/server configuration and the location of `.nevo/local` **may** need to evolve for externally hosted operation; repository-owned definitions/policy should remain under Git authority.
- API resource addressing may need stable project IDs, project-aware authorization and routes beyond today's single-project assumptions.
- Session associations, workspace resolution, writer claims and recovery must retain stable identities while gaining explicit project scope.

Do not choose a breaking change merely to justify a major version. First investigate whether the 1.0 design can be extended safely. Conversely, do not force compatibility shims if they would conceal unsafe ownership or persistence semantics in a deliberately major release.

## Longer-term ideas without a release commitment

| Candidate | Existing source | Why not automatically in 1.0/1.1/2.0 |
| --- | --- | --- |
| Multiple independent executions of **one** Workflow step (e.g. independently collected reviews and deterministic aggregation) | [Multi-instance execution](specflow-engine/multi-instance-execution.md), [future implementation plan](specflow-engine/multi-instance-plan/README.md) | Separate state model and aggregation/recovery semantics; not the same as Task parallelism. |
| Full external/browser IDE | [Developer workspace](developer-workspace/README.md) | Needs actual usage evidence and hosting/security decisions; lightweight inspection is a smaller first step. |
| Scheduled/recurring Workflow triggers or generalized automation | [Reusable Workflow direction, #137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) | A new consumer of the reusable coordinator, with separate trigger/idempotency policy; no current requirements dossier. **Needs analysis.** |
| Cross-provider or third-party extension marketplace | [Provider backlog](specflow-runtime/provider-migration-plan.md), T112 | Capability/security and trust model not yet demonstrated by real integrations. **Needs analysis.** |

## Cross-release design guardrails

These are **foresight notes for writing Specifications**, not permission to build future releases early.

| When specifying... | Preserve this possibility without implementing it now |
| --- | --- |
| 1.0 Workflow/Task execution | Workflow remains provider-neutral and definition-driven; no hard-coded `review`, `implementation` or `pass` semantics; neutral coordination can serve future consumers. |
| 1.0 Session/Turn storage | Session identity is not “one permanent Task” or “one fixed checkout path”. Context association never grants write authority. |
| 1.0 Runtime/HTTP APIs | Keep a project-scoped application boundary, even if the first composition has only one project. Do not bake in ambient `cwd` as the authority of an HTTP request. |
| 1.1 GitHub integration | Use host/integration adapters for PR state and CI evidence; keep Git/workspace mutations under Engine lifecycle ownership and preserve worktree-safe Close. |
| 1.0 claims/recovery | Use explicit verified workspace identity and durable invocation fencing; future per-Task or multi-project concurrency must not depend on globally mutable process state. |
| 1.0 Docs/RAG | Preserve workspace/corpus identity and revision evidence; a future central host cannot let search results from project A authorize actions in project B. |
| 1.1 Ideas and roadmap product | Model many-to-many **idea ↔ Specification ↔ PR** evidence. A draft concept may survive implementation, and a completed item may remain visible as delivered history. |
| 1.1 UI/project settings | Separate application-level credentials/provider profiles from repository-owned definitions and project-local operational configuration. |

## Roadmap maintenance and future in-product planning

1. **Capture:** create or link an idea with its outcome, open questions, known constraints and source references; add a stable roadmap item ID and a tentative horizon. `needs analysis` is an acceptable, explicit state.
2. **Explore:** link new designs, experiments, accepted/rejected decisions and dependencies. Keep a conceptual description even when no technical design exists; do not turn roadmap text into a hidden engineering contract.
3. **Specify:** add the Specification link and mark concept `specified`. **Do not remove the roadmap item.** A single idea may feed several Specifications; a Specification may realize several ideas. Record which acceptance scope it covers.
4. **Implement:** add PR links and capture their actual state (`draft`/`open`/`merged`); distinguish the branch's implementation from `main` or a release. Merging part of the work leaves the parent roadmap item `partial`.
5. **Complete:** mark `shipped` only when the intended scope is verifiably in the relevant release; link current authoritative docs, the completing Specification(s) and merged PR(s). Keep a short completed-history view in the roadmap rather than losing provenance.
6. **Reconsider:** move targets between 1.0, 1.1, 2.0 or `later` explicitly. Split an oversized topic without changing existing completed evidence. Mark a rejected concept `superseded` and link the replacement.
7. **Reconcile:** on PR merge, Specification Close and release cut, refresh status and links. Periodically compare open ideas to current architecture to remove *stale instructions*, not valuable product history.

**Suggested future record shape (concept only, not a schema):** `roadmapId`, `title`, `category`, `targetRelease`, `scope` (candidate/stretch/later), `conceptState`, `deliveryState`, `description`, `questions`, `dependencies`, `ideaRefs[]`, `specRefs[]`, `prRefs[]`, `currentDocs[]`, `updatedAt`. Keep GitHub PR state as a derived/synced external fact, not manually authoritative status. A SpecFlow planning UI could present this as roadmap columns, idea drafts, Specification links and delivered history.

### Complete PR evidence (2026-11-14)

The [delivered-work register](roadmap-delivered.md) contains links to **all 120 merged PRs**, grouped by area, plus all 22 closed-without-merge PRs and the three open PRs. Keep it as a traceable historical index, while this roadmap stays organized around product capabilities. In this snapshot [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) is **draft/open** and [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) is **open**. Neither is represented as merged.

### Open release decisions to resolve before declaring 1.0 scope

1. **Owner-controlled minimum:** Is manual execution plus one safe agent-delegated step enough for 1.0? This revision recommends **yes**, instead of requiring autonomous end-to-end dispatch.
2. **GitHub delivery:** Is a fully integrated PR/CI/review/merge lifecycle a **1.1.x** follow-up? This revision recommends **yes**; the owner may still close Technical Close in 1.0 after external Git delivery.
3. **Verification gates:** Can 1.0 ship with its implemented document/owner protections, leaving command and formal human verification gates for **1.1.x**? This revision recommends **yes**, as long as no UI implies tests were automatically verified.
4. **Platform promise:** Can 1.0 honestly advertise a Windows-certified native adapter profile with Linux/macOS certification in **1.1.x**? Product packaging on three OSes is not sufficient evidence of provider support.
5. **External hosting:** Does 1.0 require only the installed one-project process, leaving standalone **multi-project** Docker hosting and a project registry for **2.0**? This revision recommends **yes**.
6. **Product planning:** Treat a basic Ideas/Roadmap UI as a **1.1.x candidate** and the cross-project planner as a **2.0** candidate, with separate analysis of model and evidence ownership.

