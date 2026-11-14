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
> **Status snapshot: 2026-11-14.** PR states below were checked on GitHub on this date and are not live badges. Refresh them when updating the roadmap. In particular, #137 and #143 are not merged into `main` at this snapshot, regardless of whether their branches are deployed for testing.

## Product direction and release boundaries

| Horizon | Intended outcome | Scope boundary |
| --- | --- | --- |
| **1.0.0 — Complete single-project development loop** | A person and AI agents can take one repository-owned Specification through preparation, Task authoring, implementation, review, verification, owner acceptance and delivery, without manually coordinating every handoff. | One verified Git Project Home per running product instance; repo-owned Workflow/Task Type/agent definitions; UI and CLI are two entry points to the same Engine. Not a multi-project control plane. |
| **1.1.x — Improve daily use without changing the product model** | Better forms, diagnostics, provider capabilities, documentation, code inspection and local concurrency. Introduce an initial planning/ideas experience if its model can remain additive. | Prefer compatible additions to the single-project model and existing Session/Workflow identities. No mandatory migration to a centralized server. |
| **2.0.0 — Multi-project, externally hosted SpecFlow** | One centrally hosted SpecFlow (e.g. Docker) manages registered/cloned repositories, their workspaces, agents, permissions and possibly a cross-project planning Workbench. | An intentionally large architectural release. It **may** change persistence, configuration, routing, resource identities and APIs where needed; it does **not** require gratuitous breaking changes. |

**1.0 exit scenario:** Create a Specification from repository definitions; let an agent prepare its documents; review and approve generated Tasks; run selected Tasks in dependency order with review/rework and verification gates; inspect evidence and recover interrupted work; approve delivery; publish/review/merge the PR and close the Specification through existing Git/workspace rules. A documented single-project installation should run this outside the monorepo development environment. If part of this scenario is deliberately excluded from 1.0, record an explicit release-scope decision rather than silently redefining “complete”.

### How to read each roadmap item

- **Concept:** `sketch` (outcome only), `exploring` (analysis exists), `designed` (candidate contracts/plan exist), `specified` (approved Specification exists). Concept status is **not** implementation status.
- **Delivery:** `not started`, `in progress`, `shipped`, `partial`, or `unverified`. A merged PR is evidence of a change, not proof that the entire roadmap item is shipped.
- **PR state:** independent GitHub state: `draft`, `open`, `merged`, or `none`. Recorded as of the snapshot date. A Specification can exist before implementation, and an item stays on the roadmap **after** it has been specified and **after** it has shipped.
- **Evidence:** link to the idea/plan, approved Specification (when one exists), PR(s), and the current product/architecture documentation. **A missing Specification link means no specific approved Specification was verified**, not that the feature can never be implemented.
- **Release scope:** `candidate` means proposed for that version; `stretch` means optional and not a release blocker; `later` means a concept to preserve, not approved delivery work.

The rows below have stable IDs for future linking. An idea file or Specification may be edited, split, or merged without changing the roadmap ID. A single PR can implement part of several items, and one item may require many PRs.

## 1.0.0 — Single-project complete workflow

### A. Core product and Workflow

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **P100** | **Specification and Task foundations.** Create, edit and inspect Specifications and their documents; Task resources, dependencies, preparation states and manual execution driven by definitions. | `designed`; **partial, #137 draft** | Engine kernel [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120) (**merged**); proposed implementation [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) (**draft, open**); [kernel](../architecture/workflow/workflow-kernel.md), [Task resource context](specflow-engine/task-resource-and-context.md). Audit delivered E1–E4 scope after merge; do not reimplement it. |
| **P101** | **Manual end-to-end execution.** A human can take a Specification and several Task Types through a real review-fail/rework cycle, owner acceptance, restart and valid Close without running an agent. | `designed`; **in progress, #137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137); [Workflow acceptance criteria](specflow-engine/acceptance-criteria.md); [local actor and human gates](specflow-engine/local-actor-and-human-gates.md). Require a real project-mode acceptance test, not only Storybook. |
| **P102** | **Agent-assisted Workflow.** Owner delegates one eligible step to a Managed Session; agent receives pinned context, writes authorized documents/Task drafts, reports result, stops, and the Engine records the transition. Manual and agent steps can coexist. | `designed`; **not started as a complete integration** | E6 plan in [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137); [Managed Session integration](specflow-engine/managed-session-integration.md), [execution scopes](specflow-engine/execution-scopes-and-recovery.md). Reconcile invocation/claim/finish protocol, agent identity, restart and explicit takeover before implementation. |
| **P103** | **Automatic continuation.** `continuation: auto` drives the next eligible Session/Turn (`fresh` or `reuse`) with durable dispatch, without the UI inventing transitions. | `exploring`; **not started** | [Plan 06 F01](specflow-engine/execution-plans/06-workflow-kernel/README.md), [Managed Session integration](specflow-engine/managed-session-integration.md). Depends on P102's reliable single-step protocol. |
| **P104** | **Selected Task execution and review loop.** Owner selects Tasks; engine/runtime honor dependencies, execute/review/rework and stop only for explicit attention, blockers or human decisions. | `exploring`; **not started** | [Plan 06 F12](specflow-engine/execution-plans/06-workflow-kernel/README.md), [Task UI ideas](specflow-ui/README.md). Decide selection semantics, sequential batch handoff and minimum concurrency; distinct from multiple independent reviewers of **one** step. |
| **P105** | **Definition-driven gates and results.** Real command/test and human verification gates, inspect vs verify, failure vs infrastructure-blocked, evidence scoped to the attempt; custom step names remain data, not hard-coded code paths. | `exploring`; **partial** | [Plan 06 F03](specflow-engine/execution-plans/06-workflow-kernel/README.md), [legacy migration dossier](specflow-engine/legacy-nevo-migration.md). #137 adds document gates; full command/human gate behavior needs scope and verification. |
| **P106** | **Finish and acceptance.** Owner signs off outcomes, resolves cancelled/abandoned Task decisions, and closes only when Workflow/Git/workspace preconditions are satisfied. | `designed`; **partial, #137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [local human gates](specflow-engine/local-actor-and-human-gates.md), [legacy finalize caveats](specflow-engine/legacy-nevo-migration.md). Do not confuse Technical Close with GitHub merge. |

### B. Tooling, integrations and developer experience

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **T100** | **CLI/agent workflow interface.** Offline owner commands and a trusted agent completion path use exactly the Engine's start/finish/return operations and consistent evidence. | `designed`; **partial, #137 draft** | [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137), [offline CLI/external agents](specflow-engine/offline-cli-and-external-agents.md), [Plan 06 F02](specflow-engine/execution-plans/06-workflow-kernel/README.md). MCP and native skills are transport choices, not second workflow engines. |
| **T101** | **Git host delivery lifecycle.** Create/update PR, inspect CI and review threads, request changes, reconcile feedback, approve merge, and connect merge evidence to Specification completion. | `sketch`; **not started**; **needs analysis** | [Legacy Nevo migration](specflow-engine/legacy-nevo-migration.md) covers existing evidence/finalize patterns, but **no unified new-product delivery plan has been identified**. Design hosting-provider ports, credentials, idempotency, human merge authority and worktree-safe finalization. GitHub first; do not hard-code GitHub into the Workflow kernel. |
| **T102** | **Workflow Git actions.** Declarative scoped commit/push and post-actions; no accidental commit of unrelated changes; crash-safe publish/repair. | `exploring`; **partial** | [Plan 06 F04](specflow-engine/execution-plans/06-workflow-kernel/README.md), [durable operations](specflow-engine/durable-operations-and-recovery.md), [legacy migration](specflow-engine/legacy-nevo-migration.md). Must reuse existing Engine commit policy; distinguish from T101's remote PR lifecycle. |
| **T103** | **Project onboarding and usable installed build.** Install the packed product, initialize a single Git project, start Runtime + UI, configure a provider, diagnose unavailable capabilities. | `exploring`; **partial** | [Product packaging](../engineering/repository/product-packaging.md), [dogfooding](../engineering/repository/dogfooding.md), [release model](../engineering/repository/releasing.md). Product tarball and internal dogfood exist; **public install/update UX and supported distribution matrix need an explicit 1.0 decision**. |

### C. Infrastructure, security and reliability

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **I100** | **Managed provider Sessions.** Claude, Codex and Antigravity sessions with reliable lifecycle, telemetry, permission boundaries and UI context. | `designed`; **foundation shipped; workflow coupling pending** | [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126) (**merged**); [provider capability backlog](specflow-runtime/provider-migration-plan.md). Do not conflate ad hoc Session support with P102. |
| **I101** | **Recovery and ownership across Workflow and native Turns.** Durable dispatch, writer claims, stop/late-result fencing, bounded history, idempotent finish and owner reconciliation. | `exploring`; **partial** | [Execution scopes and recovery](specflow-engine/execution-scopes-and-recovery.md), [locking](specflow-engine/locking-and-admission.md), [Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md), [adapter hardening](specflow-runtime/ai-adapters/README.md). Prioritize crash/fault injection in every agent-driven flow. |
| **I102** | **Authorization and actionable product projections.** The server enforces resource-scoped permissions; owner sees only legal actions with explicit refusal reasons. | `exploring`; **partial** | [Authorization follow-ups](authorization/README.md), [Workflow API requirements](specflow-engine/workflow-api-requirements.md). Align Workflow actor trust with Session claims; do not rely on hidden UI buttons as enforcement. |
| **I103** | **One-project release acceptance and dogfooding.** Installed artifact and real repository demonstrate the full 1.0 scenario, including failure/restart and mobile/desktop flows. | `sketch`; **partial tooling; acceptance scenario needs analysis** | [Dogfooding](../engineering/repository/dogfooding.md), [Packaging](../engineering/repository/product-packaging.md), [acceptance criteria](specflow-engine/acceptance-criteria.md). Specify a reproducible sample project and supported environments. |
| **I104** | **Platform support policy.** Decide whether native agent execution on Linux/macOS is required for 1.0 or expressly excluded; do not advertise packaging compatibility as native adapter support. | `exploring`; **Windows native profiles only per current backlog** | [Provider backlog F08](specflow-runtime/provider-migration-plan.md). **Explicit release-scope decision needed.** If 1.0 promises native agents across the three OSes, this becomes a 1.0 gate; otherwise target 1.1. |

### D. Documentation and product knowledge

| ID | Capability / intended result | Concept; delivery | Evidence and next analysis |
| --- | --- | --- | --- |
| **D100** | **Workspace-aware project documentation.** Read/search the verified checkout of the selected Project Home or Specification worktree, with permissions and a consistent article/tree UI. | `designed`; **#143 open, not merged** | [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138) (**merged** semantic foundation), [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) (**open** workspace reader), [semantic docs follow-ups](semantic-docs/README.md). |
| **D101** | **Repository-owned definitions and discoverable context.** Workflow, Task Type, archetype and context are owned by the user repository. Agent gets relevant docs and effective step constraints, not arbitrary global search. | `designed`; **partial** | [Workflow kernel](../architecture/workflow/workflow-kernel.md), [Task resource context](specflow-engine/task-resource-and-context.md), [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137). Verify the complete path with P102 before calling it shipped. |

## 1.1.x — Additive improvements for everyday use

**Recommendation:** prioritize these *after* the 1.0 user journey works. No new central project registry, no forced server migration. Individual items are candidates, not all required for 1.1.0.

### Product and workflow

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **P110** | **Typed workflow inputs and generic forms.** Definition-driven enum, number, boolean, Markdown and bounded history/evidence, rendered by the UI. | `designed`; **not started** | E5 in [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137); [Plan 06 F19](specflow-engine/execution-plans/06-workflow-kernel/README.md). Can move to 1.0 if an actual first workflow needs it. |
| **P111** | **Lightweight code inspection/editing.** Inspect current worktree changes and make small edits inside the Workbench without turning SpecFlow into an IDE. | `exploring`; **not started** | [Developer workspace proposal](developer-workspace/code-inspection-and-editing.md). Keep a full IDE integration separate. |
| **P112** | **Ideas and roadmap in SpecFlow (initial product).** Browse concepts, group by release/category, reference source files, create a Specification from an idea, and show its delivery evidence. | `sketch`; **not started; needs dedicated product analysis** | This roadmap is the seed, not an implementation spec. Decide Git-owned model, stable IDs, many-to-many idea↔Spec↔PR references, review/history, and whether a simple read-only first release is sufficient. **Do not erase an idea when a Specification is created.** |
| **P113** | **Selected parallel Task worktrees.** Execute independent Tasks concurrently while keeping Git/workspace claims and output conflict-safe. | `exploring`; **not started** | [Plan 06 F08/F12](specflow-engine/execution-plans/06-workflow-kernel/README.md), [workspace binding](specflow-engine/workspace-binding-lifecycle.md). Separate Task concurrency from multi-instance review of a single step. |

### Tooling and knowledge

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **T110** | **Native provider capability parity.** Configurable profiles/tools/MCP skills, richer interactions and active-Turn steering where safely supported. | `exploring`; **partially available** | [Provider capability backlog](specflow-runtime/provider-migration-plan.md) F01–F07, F10–F19. Prioritize observed user pain rather than switching everything on at once. |
| **T111** | **Search quality and expanded corpora.** Better ranked results, contextual related docs, selected Specification/code sources and assisted semantic-search setup. | `exploring`; **partial foundation shipped** | [Search quality](semantic-docs/search-quality.md), [surfaces and setup](semantic-docs/surfaces-and-setup.md); [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) handles the initial reader, not all of this. |
| **T112** | **More workflow integrations.** Additional host actions/gates (scripts, CI, issue trackers) once real integrations establish the necessary extension boundary. | `sketch`; **needs analysis** | [Legacy migration](specflow-engine/legacy-nevo-migration.md), [Plan 06 F03/F04](specflow-engine/execution-plans/06-workflow-kernel/README.md). Do not build a generic plugin marketplace based only on imagined integrations. |

### Infrastructure and experience

| ID | Candidate | Concept; delivery | Existing idea or missing analysis |
| --- | --- | --- | --- |
| **I110** | **Native Linux/macOS adapters**, if omitted from the explicitly documented 1.0 support matrix. | `exploring`; **not certified per backlog** | [Provider backlog F08](specflow-runtime/provider-migration-plan.md). This is a compatibility/security certification effort, not just a platform flag. |
| **I111** | **Better observability and recovery UI.** Provider diagnostics, activity history, live invalidation, stale work detection and operator reconciliation. | `exploring`; **partial** | [Adapter diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md), [eventing ideas](specflow-ui/data-loading-refresh-and-eventing.md), [project Overview follow-ups](specflow-runtime/project-mode-spec-overview/README.md). |
| **I112** | **Project settings and guided configuration.** Configure definitions, models, capabilities, embeddings and verified workspace settings without duplicating backend ownership. | `exploring`; **not complete** | [Project settings UI](specflow-ui/screens/project-settings-ui-spec.md), [semantic setup](semantic-docs/surfaces-and-setup.md). |

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
| 1.0 GitHub integration | Use host/integration adapters for PR state and CI evidence; keep Git/workspace mutations under Engine lifecycle ownership and preserve worktree-safe Close. |
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

### Verified PR snapshot (2026-11-14)

| PR | Verified GitHub state | Roadmap relevance |
| --- | --- | --- |
| [#120](https://github.com/dczerwinskipl/nevo-specflow/pull/120) | **Merged** | Deterministic Engine Workflow kernel; not the full product path. |
| [#98](https://github.com/dczerwinskipl/nevo-specflow/pull/98), [#107](https://github.com/dczerwinskipl/nevo-specflow/pull/107), [#126](https://github.com/dczerwinskipl/nevo-specflow/pull/126) | **Merged** | Managed Sessions/providers and association foundation. |
| [#138](https://github.com/dczerwinskipl/nevo-specflow/pull/138) | **Merged** | Documentation and semantic-search foundation. |
| [#136](https://github.com/dczerwinskipl/nevo-specflow/pull/136) | **Merged** | Runtime OpenAPI, tooling baseline. |
| [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) | **Draft / open** | Large in-progress Task/manual Workflow implementation and E6 planning. PR description may lag actual branch contents. |
| [#143](https://github.com/dczerwinskipl/nevo-specflow/pull/143) | **Open / not draft** | Workspace-aware documentation reader. |
| [#147](https://github.com/dczerwinskipl/nevo-specflow/pull/147) | **Merged** | Public README/product direction, not proof that the described agent-driven full workflow already ships. |

### Open release decisions to resolve before declaring 1.0 scope

1. **Delivery boundary:** Is host PR creation/review/merge a 1.0 requirement or an explicitly documented 1.1 extension? This roadmap recommends **1.0** because completion of the development loop is the product promise.
2. **Platform promise:** Are native agent adapters required on Linux/macOS for 1.0, or is an openly Windows-limited 1.0 acceptable? Packaging tests on three OSes do not answer this.
3. **Automatic execution minimum:** Is one sequential selected-Task batch plus review/rework enough for 1.0, with parallel Task worktrees deferred to 1.1? This roadmap recommends **yes**.
4. **External deployment minimum:** Is an installed one-project server sufficient for 1.0, with standalone multi-project Docker hosting explicitly reserved for **2.0**? This roadmap recommends **yes**.
5. **Planning product:** Should 1.1 begin with read-only Ideas/Roadmap integration and linkage to Specifications, or is even this better treated as a dedicated product discovery effort? The full cross-project planner can remain a 2.0 candidate.
