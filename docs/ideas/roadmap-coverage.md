---
id: ideas.roadmap-coverage
type: engineering
title: Roadmap source coverage and unscheduled capabilities
status: draft
scope: specflow
areas: [workflow, ai, runtime, ui, docs, planning]
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

| Follow-up | Destination and disposition | Rationale / remaining evidence |
| --- | --- | --- |
| F01 | 1.1 candidate → P103 | Automatic continuation after a step, not required by 1.0. |
| F02 | 1.0 → P102 / T100 | Agent finish via verified CLI/MCP; E6 integration not proven. |
| F03 | 1.1 candidate → P105 | Command and human verification gates. |
| F04 | 1.1 candidate → T102 | Commit/push/finalize after Workflow actions. |
| F05 | 1.0 → P102 / I101 | Managed writable claims exist; admission for delegated step remains E6. |
| F06 | 1.0 → P100/P106; Later → L123 | Draft edit/cancel groundwork on #137; ready-Task revisions and abandoned-task policy separate. |
| F07 | Untriaged → L124 | Re-pinning and definition snapshots, not a 1.0 commitment. |
| F08 | Later 1.x candidate → P113 | Parallel Tasks and worktree-scoped claims. |
| F09 | 1.0 on #137 → P101 / T100 | Runtime projection, API and manual Workflow UI code exist; full acceptance pending. |
| F11 | Untriaged → L122 | Definition catalogue caching and tooling. |
| F12 | 1.1 candidate → P104 | Run selected Task batches and orchestrate dependencies. |
| F13 | 1.0 → I101 / P102 | Safe native Session stop on return and late-finish refusal (E6). |
| F14 | 1.0 on #137 → P101 / P106 | Specification status/Close projections from Workflow state. |
| F15 | Later 1.x candidate → T110 | Provider/model availability checks; ensure E6 refuses unsupported models. |
| F16 | 1.0 on #137 → P101 / T100 | Idempotent manual finish and HTTP retry have branch tests; failure/recovery acceptance pending. |
| F17 | 1.0 → I101 | Owner takeover of agent attempt after verified stop; E6 protocol gate. |
| F18 | 1.0 on #137 → P101 / C004 | Definition kind registration/composition boundary has branch changes; review needed. |
| F19 | Untriaged → L125 | Bounded Run history; required before advanced typed input forms (P110). |
| F20 | 1.0 on #137 → P100 | Task Resource, lifecycle, docs and typed context; cross-layer verification pending. |

## Numbered provider follow-ups

Source: [Provider migration plan](specflow-runtime/provider-migration-plan.md). All **18 numbered follow-ups** (F01–F13 and F15–F19) are individually classified. F14 is not defined in that plan.

| Follow-up | Destination and disposition | Rationale / remaining evidence |
| --- | --- | --- |
| F01 | Later 1.x candidate → T110 | Native MCP/skills/plugins with trusted extension policy. |
| F02 | Later 1.x candidate → T110 | Validated configurable provider tool inventory. |
| F03 | Untriaged → L126 | Steer an active Turn with durable input and ordering guarantees. |
| F04 | Later 1.x candidate → T110 | Explicit native slash-command discovery/invocation. |
| F05 | Later 1.x candidate → I112 / T110 | Typed provider-specific settings and secret boundaries. |
| F06 | Untriaged → L127 | ACP transport/provider adapter, not an alternative Session model. |
| F07 | Later 1.x candidate → I112 | Custom provider profiles and account affinity. |
| F08 | 1.0 decision → I104; later implementation → I110 | Native Linux/macOS certification; packaging alone is insufficient. |
| F09 | Untriaged → L128 | In-flight authentication renewal without duplicate native dispatch. |
| F10 | Untriaged → L102 | Attachments and modalities; already one Composer outcome. |
| F11 | Untriaged → L129 | Opt-in historical native Session import, explicitly excluded from migration. |
| F12 | Later 1.x candidate → T110 | Streaming fidelity improvements and source correlation. |
| F13 | Later 1.x candidate → T110 | Additional native question/permission interactions. |
| F15 | Later 1.x candidate → T110 | Antigravity effort discovery; no guessed values. |
| F16 | Later 1.x candidate → T110 / C006 | Telemetry coverage expansion beyond existing managed telemetry. |
| F17 | Later 1.x candidate → T110 | Provider feature/model capabilities discovery. |
| F18 | Untriaged → L130 | Stronger platform isolation research and security tradeoffs. |
| F19 | Untriaged → L115; E6 safe refusal → I101 | Positive reconciliation of unknown native execution; 1.0 must fail safely. |

## Unscheduled capabilities

Each ID represents a distinct possible outcome. **Untriaged means no release decision has been made**; it must not be mistaken for a rejected or deliberately deferred feature. Some remain prerequisites of planned work, so dependencies may change their priority. See the source before drafting a Specification.

| ID | Candidate outcome | Source |
| --- | --- | --- |
| L100 | Task decision and evidence drill-down | [Task evidence](specflow-ui/components/task-decision-evidence-ui-spec.md) |
| L101 | Floating Session | [UI proposal](specflow-ui/screens/floating-session-ui-spec.md) |
| L102 | Composer attachments and repository references | [Composer](specflow-ui/components/session-composer-design.md) |
| L103 | Workflow events in Session conversation | [Chat V10](specflow-ui/components/session-chat-v10-design.md) |
| L104 | Quote/origin-aware conversation navigation | [Chat V10](specflow-ui/components/session-chat-v10-design.md) |
| L105 | Server-side Work history filtering | [Work history](specflow-runtime/work-history-server-filter.md) |
| L106 | Per-tool Work Inspector rendering | [Work Inspector](specflow-ui/components/session-work-inspector-ui-spec.md) |
| L107 | Full IDE integration | [Developer workspace](developer-workspace/code-inspection-and-editing.md) |
| L108 | Multiple independent executions of one step | [Multi-instance](specflow-engine/multi-instance-execution.md) |
| L109 | Scheduled/recurring Workflow runs | [Managed integration](specflow-engine/managed-session-integration.md) |
| L110 | Workspace relocate and repair | [Binding lifecycle](specflow-engine/workspace-binding-lifecycle.md) |
| L111 | Provider liveness/watchdog | [Watchdogs](specflow-runtime/ai-adapters/liveness-watchdog.md) |
| L112 | Quota vs transient error classification | [Error taxonomy](specflow-runtime/ai-adapters/error-classification.md) |
| L113 | Capacity-aware provider admission | [Capacity](specflow-runtime/ai-adapters/provider-capacity-and-admission.md) |
| L114 | Provider diagnose and protocol replay | [Diagnostics](specflow-runtime/ai-adapters/diagnostics-and-replay.md) |
| L115 | Native Session recovery improvements | [Resume](specflow-runtime/ai-adapters/session-resume-and-recovery.md) |
| L116 | Authorization filtering and capability projection | [Auth follow-ups](authorization/README.md) |
| L117 | UI data prefetch, refresh and events | [UI events](specflow-ui/data-loading-refresh-and-eventing.md) |
| L118 | Automated Storybook policy/coverage | [Storybook](specflow-ui/storybook-rework.md) |
| L119 | Settings catalogue renderer | [Settings](specflow-ui/components/settings-catalog-renderer-ui-spec.md) |
| L120 | Semantic search quality and evaluation | [Search quality](semantic-docs/search-quality.md) |
| L121 | Contextual docs help and additional corpora | [Docs surfaces](semantic-docs/surfaces-and-setup.md) |
| L122 | Workflow definition tooling/caching | [Plan 06](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L123 | Ready Task revisions and abandoned-task policy | [Plan 06 F06](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L124 | Workflow re-pin and definition snapshots | [Plan 06 F07](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L125 | Bounded Workflow Run history | [Plan 06 F19](specflow-engine/execution-plans/06-workflow-kernel/README.md) |
| L126 | Active-Turn steering | [Provider F03](specflow-runtime/provider-migration-plan.md) |
| L127 | ACP agent transport | [Provider F06](specflow-runtime/provider-migration-plan.md) |
| L128 | In-flight provider authentication renewal | [Provider F09](specflow-runtime/provider-migration-plan.md) |
| L129 | Native Session import | [Provider F11](specflow-runtime/provider-migration-plan.md) |
| L130 | Strong OS isolation research | [Provider F18](specflow-runtime/provider-migration-plan.md) |

## Coverage limits and next reconciliation

These two numbered plans are reconciled **at item level**: **19 Workflow + 18 provider**. That removes the known gaps in the two specifically audited lists, but it does **not** prove complete product-scope coverage across all other Ideas.

The `main` snapshot contains **80 Markdown documents under `docs/ideas/**`**, including hubs and detailed execution tasks. Documentation file count is not a number of independent capabilities. Other documents may contain several unrelated outcomes: UI designs, engineering hardening and historic execution plans still require their own per-capability dispositions.

**Next scope audit:** compare the remaining idea documents against the product roadmap, identify any independently deliverable outcome not listed in the release tables or L100–L130, and assign it a unique ID or an explicit duplicate, implemented, superseded or rejected disposition **with evidence**. Only then can the roadmap be described as exhaustive.

**Evidence policy:** code on [PR #137](https://github.com/dczerwinskipl/nevo-specflow/pull/137) is unmerged implementation evidence, not a completed feature on `main`; a proposal document is planning evidence, not code. Current API and architecture take precedence over Ideas.
