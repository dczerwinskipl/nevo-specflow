---
id: ideas.roadmap-coverage
type: engineering
title: Roadmap source coverage and unscheduled capabilities
status: draft
scope: specflow
areas: [workflow, ai, runtime, ui, docs, release]
tags: [roadmap, planning, coverage, follow-ups]
read_when:
  - verifying that workflow and provider follow-ups are accounted for in product planning
  - classifying previously unscheduled Ideas before the next release
summary: >
  Source-level mapping of numbered Workflow and provider follow-ups to stable product roadmap
  outcomes, plus unscheduled product candidates. Release scope and status remain owned by ideas.roadmap.
related:
  - ideas.roadmap
  - ideas.specflow-engine.plan-06
  - ideas.specflow-runtime.provider-migration-plan
---

# Roadmap coverage audit

> This is **traceability**, not a second release roadmap and not a list of merged PRs. [Product scope, status and next action](roadmap.md) are maintained in one place. Multiple source follow-ups may map to the **same user outcome**; a mapping does not mean that its implementation was verified.

## Numbered Workflow follow-ups

Source: [Workflow Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md). All **19 numbered follow-ups** (F01–F09 and F11–F20) are individually classified. F10 is not defined in that plan.

| Follow-up | Destination and disposition   | Rationale / remaining evidence                                                                  |
| --------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| F01       | 1.1 candidate → P103          | Automatic continuation after a step, not required by 1.0.                                       |
| F02       | 1.0 → P102 / T100             | Agent finish via verified CLI/MCP; E6 integration not proven.                                   |
| F03       | 1.1 candidate → P105          | Command and human verification gates.                                                           |
| F04       | 1.1 candidate → T102          | Commit/push/finalize after Workflow actions.                                                    |
| F05       | 1.0 → P102 / I101             | Managed writable claims exist; admission for delegated step remains E6.                         |
| F06       | 1.0 → P100/P106; Later → L123 | Draft edit/cancel groundwork on #137; ready-Task revisions and abandoned-task policy separate.  |
| F07       | Untriaged → L124              | Re-pinning and definition snapshots, not a 1.0 commitment.                                      |
| F08       | Later 1.x candidate → P113    | Parallel Tasks and worktree-scoped claims.                                                      |
| F09       | 1.0 on #137 → P101 / T100     | Runtime projection, API and manual Workflow UI code exist; full acceptance pending.             |
| F11       | Untriaged → L122              | Definition catalogue caching and tooling.                                                       |
| F12       | 1.1 candidate → P104          | Run selected Task batches and orchestrate dependencies.                                         |
| F13       | 1.0 → I101 / P102             | Safe native Session stop on return and late-finish refusal (E6).                                |
| F14       | 1.0 on #137 → P101 / P106     | Specification status/Close projections from Workflow state.                                     |
| F15       | Later 1.x candidate → T110    | Provider/model availability checks; ensure E6 refuses unsupported models.                       |
| F16       | 1.0 on #137 → P101 / T100     | Idempotent manual finish and HTTP retry have branch tests; failure/recovery acceptance pending. |
| F17       | 1.0 → I101                    | Owner takeover of agent attempt after verified stop; E6 protocol gate.                          |
| F18       | 1.0 on #137 → P101 / C004     | Definition kind registration/composition boundary has branch changes; review needed.            |
| F19       | Untriaged → L125              | Bounded Run history; required before advanced typed input forms (P110).                         |
| F20       | 1.0 on #137 → P100            | Task Resource, lifecycle, docs and typed context; cross-layer verification pending.             |

## Numbered provider follow-ups

Source: [Provider migration plan](specflow-runtime/provider-migration-plan.md). All **18 numbered follow-ups** (F01–F13 and F15–F19) are individually classified. F14 is not defined in that plan.

| Follow-up | Destination and disposition                      | Rationale / remaining evidence                                               |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| F01       | Later 1.x candidate → T110                       | Native MCP/skills/plugins with trusted extension policy.                     |
| F02       | Later 1.x candidate → T110                       | Validated configurable provider tool inventory.                              |
| F03       | Untriaged → L126                                 | Steer an active Turn with durable input and ordering guarantees.             |
| F04       | Later 1.x candidate → T110                       | Explicit native slash-command discovery/invocation.                          |
| F05       | Later 1.x candidate → I112 / T110                | Typed provider-specific settings and secret boundaries.                      |
| F06       | Untriaged → L127                                 | ACP transport/provider adapter, not an alternative Session model.            |
| F07       | Later 1.x candidate → I112                       | Custom provider profiles and account affinity.                               |
| F08       | 1.0 decision → I104; later implementation → I110 | Native Linux/macOS certification; packaging alone is insufficient.           |
| F09       | Untriaged → L128                                 | In-flight authentication renewal without duplicate native dispatch.          |
| F10       | Untriaged → L102                                 | Attachments and modalities; already one Composer outcome.                    |
| F11       | Untriaged → L129                                 | Opt-in historical native Session import, explicitly excluded from migration. |
| F12       | Later 1.x candidate → T110                       | Streaming fidelity improvements and source correlation.                      |
| F13       | Later 1.x candidate → T110                       | Additional native question/permission interactions.                          |
| F15       | Later 1.x candidate → T110                       | Antigravity effort discovery; no guessed values.                             |
| F16       | Later 1.x candidate → T110 / C006                | Telemetry coverage expansion beyond existing managed telemetry.              |
| F17       | Later 1.x candidate → T110                       | Provider feature/model capabilities discovery.                               |
| F18       | Untriaged → L130                                 | Stronger platform isolation research and security tradeoffs.                 |
| F19       | Untriaged → L115; E6 safe refusal → I101         | Positive reconciliation of unknown native execution; 1.0 must fail safely.   |

## Unscheduled capabilities

Each ID represents a distinct possible outcome. **Untriaged means no release decision has been made**; it must not be mistaken for a rejected or deliberately deferred feature. Some remain prerequisites of planned work, so dependencies may change their priority. See the source before drafting a Specification.

| ID   | Candidate outcome                                 | Source                                                                      |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| L100 | Task decision and evidence drill-down             | [Task evidence](specflow-ui/components/task-decision-evidence-ui-spec.md)   |
| L101 | Floating Session                                  | [UI proposal](specflow-ui/screens/floating-session-ui-spec.md)              |
| L102 | Composer attachments and repository references    | [Composer](specflow-ui/components/session-composer-design.md)               |
| L103 | Workflow events in Session conversation           | [Chat V10](specflow-ui/components/session-chat-v10-design.md)               |
| L104 | Quote/origin-aware conversation navigation        | [Chat V10](specflow-ui/components/session-chat-v10-design.md)               |
| L105 | Server-side Work history filtering                | [Work history](specflow-runtime/work-history-server-filter.md)              |
| L106 | Per-tool Work Inspector rendering                 | [Work Inspector](specflow-ui/components/session-work-inspector-ui-spec.md)  |
| L107 | Full IDE integration                              | [Developer workspace](developer-workspace/code-inspection-and-editing.md)   |
| L108 | Multiple independent executions of one step       | [Multi-instance](specflow-engine/multi-instance-execution.md)               |
| L109 | Scheduled/recurring Workflow runs                 | [Managed integration](specflow-engine/managed-session-integration.md)       |
| L110 | Workspace relocate and repair                     | [Binding lifecycle](specflow-engine/workspace-binding-lifecycle.md)         |
| L111 | Provider liveness/watchdog                        | [Watchdogs](specflow-runtime/ai-adapters/liveness-watchdog.md)              |
| L112 | Quota vs transient error classification           | [Error taxonomy](specflow-runtime/ai-adapters/error-classification.md)      |
| L113 | Capacity-aware provider admission                 | [Capacity](specflow-runtime/ai-adapters/provider-capacity-and-admission.md) |
| L114 | Provider diagnose and protocol replay             | [Diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md)       |
| L115 | Native Session recovery improvements              | [Resume](specflow-runtime/ai-adapters/session-resume-and-recovery.md)       |
| L116 | Authorization filtering and capability projection | [Auth follow-ups](authorization/README.md)                                  |
| L117 | UI data prefetch, refresh and events              | [UI events](specflow-ui/data-loading-refresh-and-eventing.md)               |
| L118 | Automated Storybook policy/coverage               | [Storybook](specflow-ui/storybook-rework.md)                                |
| L119 | Settings catalogue renderer                       | [Settings](specflow-ui/components/settings-catalog-renderer-ui-spec.md)     |
| L120 | Semantic search quality and evaluation            | [Search quality](semantic-docs/search-quality.md)                           |
| L121 | Contextual docs help and additional corpora       | [Docs surfaces](semantic-docs/surfaces-and-setup.md)                        |
| L122 | Workflow definition tooling/caching               | [Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md)     |
| L123 | Ready Task revisions and abandoned-task policy    | [Plan 06 F06](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L124 | Workflow re-pin and definition snapshots          | [Plan 06 F07](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L125 | Bounded Workflow Run history                      | [Plan 06 F19](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L126 | Active-Turn steering                              | [Provider F03](specflow-runtime/provider-migration-plan.md)                 |
| L127 | ACP agent transport                               | [Provider F06](specflow-runtime/provider-migration-plan.md)                 |
| L128 | In-flight provider authentication renewal         | [Provider F09](specflow-runtime/provider-migration-plan.md)                 |
| L129 | Native Session import                             | [Provider F11](specflow-runtime/provider-migration-plan.md)                 |
| L130 | Strong OS isolation research                      | [Provider F18](specflow-runtime/provider-migration-plan.md)                 |

### Additional untriaged outcomes (L131–L147)

- **L131** · Agent-assisted Specification creation in project mode ([source](specflow-ui/README.md)).
- **L132** · Bounded Work-by-ID lookup and deep links ([source](specflow-runtime/session-v10-backend-readiness.md)).
- **L133** · Session execution Context and event linkage ([source](specflow-runtime/session-v10-backend-readiness.md)).
- **L134** · Session artifacts, file changes and handovers ([source](specflow-runtime/session-v10-backend-readiness.md)).
- **L135** · Verified Composer mode/approval selection ([source](specflow-ui/components/session-composer-design.md)).
- **L136** · Complete Specification Activity history ([source](specflow-runtime/project-mode-spec-overview/README.md)).
- **L137** · Editing project/provider settings and secrets ([source](specflow-ui/screens/project-settings-ui-spec.md)).
- **L138** · Protected-target Close policy ([source](specflow-engine/durable-operations-and-recovery.md)).
- **L139** · Assisted/manual post-Close conflict resolution ([source](specflow-engine/durable-operations-and-recovery.md)).
- **L140** · Offline external-agent Workflow execution and claims ([source](specflow-engine/offline-cli-and-external-agents.md)).
- **L141** · Work digest and stable Commentary-phase anchors ([source](specflow-runtime/session-v10-backend-readiness.md)).
- **L142** · Project Repository/Changes inspection surface ([source](specflow-runtime/project-mode-spec-overview/README.md)).
- **L143** · Additional documentation corpora ([source](semantic-docs/surfaces-and-setup.md)).
- **L144** · Assisted documentation/embedding setup ([source](semantic-docs/surfaces-and-setup.md)).
- **L145** · Explicit worktree cleanup user controls ([source](specflow-engine/acceptance-criteria.md)).
- **L146** · Specification Task filtering ([source](specflow-ui/screens/specification-workspace-ui-spec.md)).
- **L147** · Task-origin ad hoc Session start/list ([source](specflow-ui/session-association-ux/README.md)).

## Source-by-source Ideas audit

All **80 Ideas source Markdown files** present at this snapshot, excluding `roadmap.md` and this coverage register, have been classified below (paths relative to [the Ideas tree](https://github.com/dczerwinskipl/nevo-specflow/tree/docs/product-roadmap-1x-2x-20261114/docs/ideas)): **61 primary documents/hubs and 19 phase-task files**. This register maps _distinct product outcomes_, not one ID per file or subsection. Hubs, decision rationales, fixtures and old task plans reuse the owning outcome. A proposed contract is not proof that an implementation works.

### Product, authorization, developer workspace and docs (8 sources)

```text
README.md | Hub. Index; no separate outcome
authorization/README.md | Mapped. C008, I102, L116: authorization and scoped filtering
developer-workspace/README.md | Hub. P111, L107: code surface and full IDE index
developer-workspace/code-inspection-and-editing.md | Mapped. P111 compact code view; L107 IDE integration
multi-project-hosting.md | Mapped. P200–P202, I200–I203: host and cross-project model
semantic-docs/README.md | Hub. T111, L120, L121, L143, L144
semantic-docs/search-quality.md | Mapped. T111/L120: scaling, excerpts, answer quality, evaluation
semantic-docs/surfaces-and-setup.md | Mapped. D100 shipped reader; L121 help; L143 corpora; L144 setup
```

### Engine and execution plans (40 sources)

```text
specflow-engine/README.md | Hub. Engine proposal index only
specflow-engine/acceptance-criteria.md | Acceptance. C004 baseline; P101/P102/P106/I101 unproven scenarios
specflow-engine/decisions-and-promotion.md | Decision. I102/P106/L140: trust and external claims
specflow-engine/durable-operations-and-recovery.md | Mapped. T102 commits; L138 protected Close; L139 conflicts; I101 recovery
specflow-engine/execution-plans/03-offline-workflow-execution/README.md | Phase plan. T100/P106/I101/L140: offline execution work
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T04-verification-boundary.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T05-physical-admission.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T06-owner-recovery-protocol.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T07-actor-and-human-gates.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T08-cli-and-external-skill.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T09-runtime-read-projection.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/03-offline-workflow-execution/tasks/T10-process-restart-tests.md | Phase task. T100/P106/I101/L140: offline claims, CLI, human gates and tests
specflow-engine/execution-plans/05-managed-execution-integration/README.md | Phase plan. P102/I101/P104: managed execution and batches
specflow-engine/execution-plans/05-managed-execution-integration/tasks/T01-cross-owner-contract.md | Phase task. P102/I101/P104: managed launch, handover and tests
specflow-engine/execution-plans/05-managed-execution-integration/tasks/T02-preparation-and-authorization.md | Phase task. P102/I101/P104: managed launch, handover and tests
specflow-engine/execution-plans/05-managed-execution-integration/tasks/T06-explicit-workflow-interaction.md | Phase task. P102/I101/P104: managed launch, handover and tests
specflow-engine/execution-plans/05-managed-execution-integration/tasks/T07-bounded-batch-and-handover.md | Phase task. P102/I101/P104: managed launch, handover and tests
specflow-engine/execution-plans/05-managed-execution-integration/tasks/T08-restart-and-auth-regressions.md | Phase task. P102/I101/P104: managed launch, handover and tests
specflow-engine/execution-plans/05-managed-execution-integration/tasks/T09-architecture-audit-promotion-backlog.md | Phase task. P102/I101/P104: managed launch, handover and tests
specflow-engine/execution-plans/06-workflow-kernel/README.md | Mapped above. 19 follow-ups, individually classified above
specflow-engine/execution-plans/README.md | Hub. Historical plan index
specflow-engine/execution-scopes-and-recovery.md | Mapped. I101/P102/L140: claims and recovery
specflow-engine/legacy-nevo-migration.md | Mapped. P105 gates; P104 batches; T101 integration; T102 commit
specflow-engine/local-actor-and-human-gates.md | Mapped. P106/I102/L140: human trust and local authorization
specflow-engine/locking-and-admission.md | Mapped. P102/I101/L140: admission and liveness
specflow-engine/managed-session-integration.md | Mapped. C005/P102/P104/L109: Sessions and delegation
specflow-engine/multi-instance-execution.md | Mapped. L108 same-step independent instances
specflow-engine/multi-instance-plan/README.md | Phase plan. L108, six implementation tasks below
specflow-engine/multi-instance-plan/tasks/T01-execution-contracts.md | Phase task. L108: design, admission, outcomes, aggregation and proof
specflow-engine/multi-instance-plan/tasks/T02-input-and-effect-admission.md | Phase task. L108: design, admission, outcomes, aggregation and proof
specflow-engine/multi-instance-plan/tasks/T03-result-submission.md | Phase task. L108: design, admission, outcomes, aggregation and proof
specflow-engine/multi-instance-plan/tasks/T04-managed-orchestration.md | Phase task. L108: design, admission, outcomes, aggregation and proof
specflow-engine/multi-instance-plan/tasks/T05-aggregation-and-waivers.md | Phase task. L108: design, admission, outcomes, aggregation and proof
specflow-engine/multi-instance-plan/tasks/T06-end-to-end-proof.md | Phase task. L108: design, admission, outcomes, aggregation and proof
specflow-engine/offline-cli-and-external-agents.md | Mapped. T100 CLI; L140 external actor/claim authority
specflow-engine/ownership-and-state.md | Mapped. P106/I101/L140: approval provenance and unknown claims
specflow-engine/task-resource-and-context.md | Mapped. P100/D101/P107/P106: Task, context and binding
specflow-engine/test-plan.md | Acceptance. P101/P102/P106/I101/I102 verification; no new feature
specflow-engine/workflow-api-requirements.md | Mapped. T100/P101: manual API and projections
specflow-engine/workspace-binding-lifecycle.md | Mapped. L110 relocation; I101 refusal under claims
```

### Runtime and agent adapters (13 sources)

```text
specflow-runtime/ai-adapters/README.md | Hub. L111–L115/I111 proposal index
specflow-runtime/ai-adapters/diagnostics-and-replay.md | Mapped. L114 diagnose/replay
specflow-runtime/ai-adapters/error-classification.md | Mapped. L112 quota and retry taxonomy
specflow-runtime/ai-adapters/liveness-watchdog.md | Mapped. L111 provider watchdog
specflow-runtime/ai-adapters/provider-capacity-and-admission.md | Mapped. L113 capacity and delay admission
specflow-runtime/ai-adapters/provider-error-examples.md | Evidence. L112 captured/contract-test examples, not a feature
specflow-runtime/ai-adapters/provider-readiness-and-auth.md | Mapped. I111/L112/T110 diagnose and provider readiness
specflow-runtime/ai-adapters/session-resume-and-recovery.md | Mapped. L115 native resume; I101 unknown-outcome refusal
specflow-runtime/project-mode-spec-overview/README.md | Decision. C007 accepted view; P100 Task source; L136 activity
specflow-runtime/provider-migration-plan.md | Mapped above. 18 follow-ups, individually classified above
specflow-runtime/session-association/README.md | Decision. C005 association; P102 worktree; D101 Task ID; I102 scope
specflow-runtime/session-v10-backend-readiness.md | Mapped. L132/L133/L134/L135/L141/L102: missing Session UI contracts
specflow-runtime/work-history-server-filter.md | Mapped. L105 bounded Work filtering
```

### UI and Workbench (19 sources)

```text
specflow-ui/README.md | Mapped. L131 agent-assisted Specification Create on project Runtime
specflow-ui/components/README.md | Hub. UI component proposal index
specflow-ui/components/session-chat-v10-design.md | Mapped. L103 event display; L104 quote links; L135 choices
specflow-ui/components/session-composer-design.md | Mapped. L102 attachments; L135 certified intent and approval
specflow-ui/components/session-work-inspector-ui-spec.md | Mapped. L106 detail; L141 digest and phase anchor
specflow-ui/components/settings-catalog-renderer-ui-spec.md | Mapped. L119 renderer; I112 reads; L137 edit boundary
specflow-ui/components/task-decision-evidence-ui-spec.md | Mapped. L100 evidence drill-down; P106 review acceptance
specflow-ui/data-loading-refresh-and-eventing.md | Mapped. L117 eventing, refresh, prefetch and batches
specflow-ui/examples/session-chat-v10/README.md | Evidence. Chat prototype for L103/L104/L135, not shipped code
specflow-ui/full-session-screen-structure.md | Mapped. L133 Context; L134 artifacts; L101 floating view
specflow-ui/navigation-and-route-model.md | Mapped. L100/L103/L104/L101 navigation and origins
specflow-ui/screens/README.md | Hub. Screen-spec index, no independent outcome
specflow-ui/screens/floating-session-ui-spec.md | Mapped. L101 floating Session
specflow-ui/screens/project-settings-ui-spec.md | Mapped. I112 read catalogue; L119 renderer; L137 edit/secret
specflow-ui/screens/specification-workspace-ui-spec.md | Mapped. P104 batch; C007 navigation; L136 timeline; L146 filter
specflow-ui/screens/task-detail-ui-spec.md | Mapped. P101/P106 actions; L100 evidence; L134 artifacts; L147 Sessions
specflow-ui/session-actions-ux/README.md | Decision. C005 accepted Session actions; missing glyph is an icon detail
specflow-ui/session-association-ux/README.md | Decision. C005 association; L133 Context; L147 Task-origin Session
specflow-ui/storybook-rework.md | Mapped. L118 Storybook coverage and governance
```

## Coverage result and limits

**Repository source reconciliation: 80/80 Ideas source files classified; 37/37 numbered follow-ups mapped.** The audit found **17 additional independently schedulable outcomes (L131–L147)**, plus a distinct proposed 1.0 repository Workflow definition/binding requirement (P107). Hubs, execution-plan subtasks, historical proposals and test fixtures are mapped to existing IDs rather than counted as new features. Repeated mappings are intentional overlap, **not duplicate feature IDs**. No proposal was called rejected or fully superseded without an explicit decision.

**Inventory: 92 unique IDs**, comprising 22 proposed 1.0 entries, 5 suggested 1.1, 10 later 1.x, 7 exploratory 2.0 and 48 untriaged L-series entries. These are counts of tracked outcomes and release gates, not equally sized work items or a completion percentage. **All L131–L147 are Untriaged**, not assigned to a release by this audit.

**Still unresolved:** confirm 1.0 acceptance boundaries, owner-approval trust and native OS/provider certification; check E0–E4 on [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) against real user journeys and implement/verify E6. In particular, project-mode Create-with-agent (L131) is **not** equivalent to delegation of one Task step (P102); optional Session artifacts (L134) must not be confused with required Task evidence for 1.0 acceptance. The current repository's Ideas inventory is classified, but this does not certify all conceivable product scope, future external requirements, or passing code.

**Evidence policy:** [#137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) contains unmerged code, not completed functionality on `main`; a proposal document is planning evidence, not code. Current API, ADRs, architecture and actual implementation take precedence over Ideas. Any later document that adds an independently deliverable outcome must extend this map instead of inheriting a blanket "covered" status.
