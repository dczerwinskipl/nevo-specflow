---
id: ideas.specflow-engine.reusable-workflow.delivery
type: engineering
title: Reusable Workflow and manual execution delivery plan
status: draft
scope: specflow
areas: [workflow, runtime, ui, cli, testing]
tags: [proposal, delivery-plan, slices, task-resource, manual-ui]
read_when:
  - scoping implementation slices for reusable Workflow and Task resources
  - selecting review checkpoints before Task authoring and manual execution
  - checking end-to-end acceptance without Managed Sessions
summary: >
  Proposed E0-E5 delivery sequence with isolated reviewable vertical slices,
  preservation tests, no automatic AI dispatch and a complete manual UI proof.
related:
  - ideas.specflow-engine.reusable-workflow
  - ideas.specflow-engine.reusable-workflow.boundaries
  - ideas.specflow-engine.task-resource-and-context
  - ideas.specflow-engine.plan-06
  - architecture.workflow.workflow-kernel
---

# Delivery plan E0–E6 (proposal)

This is **not** an implementation instruction. Each phase requires only the decisions it consumes and its own test evidence before the next dependent slice starts. Actual tasks/PRs should be drafted after reconciling the current main branch and accepting architecture decisions. Keep high-risk journal, identity and recovery changes independently reviewable.

## E0 — Boundary audit and accepted design

- Map actual imports of `workflow/{progression,state,definitions,operations,continuation,tasks}`, Engine Documents, Task reads, definition-kind registration and Spec Close. Explicitly list cycles and public package exports.
- Inventory [D01–D09](boundaries-and-decisions.md#2-decision-register-and-gates) with alternatives, expected first consumer, rejected paths and test evidence. **Approve D01, D02 and D09 before E1**; reserve the minimal D03 effect/storage boundary and D05 backward-compatible Run policy seam. Detailed Task journal, UI authorization, Close and typed form decisions stay gated by E2/E3/E4/E5 respectively.
- Capture baseline fixtures: v1 YAML/compiled hash and stored record replay, task status/dependency, approval, escalation, wait, errors, process-crash journal replay. Add import-boundary and package-artifact requirements compatible with ADR 0012.
- Promote approved architecture into current ADR/architecture documents **before coding**; the draft idea itself is never normative.

**Exit:** named owner per data/operation, acyclic import matrix, pin compatibility test fixtures, stable Run identity/host keys, and an explicit neutral intent/host boundary. Later gates retain concrete Task status authority, cross-resource recovery proof, manual authorization and typed input rules; do not pretend they are already decided.

## E1a — Separate neutral progression inside Engine

- Isolate deterministic Run, attempts/history, transition selection, replay and planning from SpecFlow Subject, Task state, document/FS, agent-provider/session semantics. Provide the **coordinator contract** from the boundaries proposal: command/event plus resolved definition and Run produces a lawful next execution/attention/wait intent, not just low-level progression functions.
- Define a **minimal neutral** `work/wait` and host-effect protocol sufficient to express existing `wait-for-tasks` as a SpecFlow adapter, including event identity and replay evidence. Host/Runtime selects when to initiate a Run and provides actual drivers; neutral coordination decides what action is legal and next. No second state machine, automatic Session dispatch or general plugin registry.
- Keep v1 source YAML/schema and old revision algorithm stable; use a versioned compiled/adapted form where necessary. Preserve Engine application APIs `startSpecificationExecution`, `startTaskExecution`, `finishStep`, `returnToStep`, `setTaskStatus`.
- Plan all declared Task effects, updates and wait settlement in one Engine-controlled mutation before persisting. Move definition-kind registration to a composition root (F18), avoid Task ↔ Workflow application import cycles.

**Exit:** old tests/fixtures unchanged, including exact SHA/replay, one atomic finish with effects, and source-level dependency checks. A minimal real host consumes coordinator intents; a forwarding wrapper around `planStart` / `planFinish` alone fails this gate.

## E1b — Create `@nevo/workflow` when extraction boundary holds

- Move only neutral verified code; public exports limited to compiled definition, opaque host Run key, Run/position/history, deterministic coordinator intents, progression/validation and host-facing results. Do not bake `specId`, `taskId`, provider or Session identity into the neutral model. No SpecFlow contracts, Task CRUD, SDK/FS/HTTP/UI imports.
- Engine depends on the neutral package. Amend ADR 0012, package manifests/exports, lint boundaries and single-artifact build packaging.
- Retain existing public Engine operations as the SpecFlow adapters; a separate `startWorkflow` API for generic consumers is allowed only if it has a concrete caller and stable semantics.

**Exit:** existing Specification and Task workflows use the package; one tiny unrelated test host exercises work, wait, finish, return and replay for **two independent Runs of one definition**; no change of stored revision or new forwarding-only layers. E1 coordinates intents; actual driver dispatch, persistent invocation claims and F01 automated provider sessions remain host responsibilities and future integration.

## E2 — Task Resource F20 and one Task application API

Suggested slices:

1. **Resource authority:** `<spec>/tasks/index.yaml` registry; `<spec>/tasks/<id>/task.yaml` (type, title, summary, dependencies, preparation status, provenance); `task.md` required; optional Task documents. `.execution/tasks/<id>.yaml` contains the Run **only after first start**. Validate allowed Task Types against the Specification archetype execution binding without creating a SpecRun. Decide and expose the selected Task Type Workflow revision at first start so definition drift between creation and start is explicit. No duplicate status or membership authority. Final layout follows accepted F20 ADR, not this draft alone.
2. **Atomic write:** create/edit/delete operations with expected revision + idempotent operation identity. Extend existing Engine journaling/recovery to write index, manifest, body and any affected Run as **one logical change**. Integrate document commit/admission rules without inventing a second journal that can commit independently.
3. **Lifecycle and context:** shared Task policy for manual UI CRUD and Breakdown proposals; status decisions and dependency graph/cycle/refusal; typed ordered context references including `task.md` and Specification overview, bounds and stable evidence according to F20.
4. **Integration:** `setTaskStatus` and Task start/finish no longer require a SpecificationRun; `settleWait` only acts on a relevant active SpecRun. Preserve behavior for Tasks already started, missing folders and broken Tasks.
5. **Draft ownership:** explicitly scoped proposals from a producing attempt; finish never silently cancels a distinct manual draft. Handle allowed create/edit/status during wait, after terminal, and before/after technical Close.

**Exit:** Create Spec -> create Task -> edit `task.md` -> approve -> Task start/finish with **no SpecRun**; rejected disallowed Task Type, invalid/revised Task Type Workflow handled explicitly at first start; conflict and crash-fault tests; 3 manual drafts survive an empty Breakdown result; started Task with missing folder is broken without corrupting unrelated Tasks; no dual write authority.

## E3 — Manual Specification and Task authoring in UI

Deliver **per use case** through Engine → authenticated HTTP → existing UI, with offline CLI over the same Engine use cases where meaningful. Do not implement all CLI, then all HTTP, then all UI.

| Slice                    | User-visible proof                                                                  | Backend/CLI alignment                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E3a: list/inspect/create | Owner opens Specification and creates a typed Task                                  | Existing Task read model + one Engine create operation; CLI create/list/inspect       |
| E3b: edit Task           | Owner edits `task.md`, title, summary, dependencies and sees revision conflict      | Task-scoped Documents operations and shared update validation; CLI same case          |
| E3c: lifecycle           | Owner approves, holds, resumes, cancels or removes never-started Task where allowed | Existing `setTaskStatus`, resource rules, human attribution, CLI where trusted        |
| E3d: integrations        | Existing Spec editor and Task detail show canonical state without Session           | Authorization, real project mode, narrow/mobile UX, recovery and skills documentation |

Use existing Documents UI and Design System, not a duplicate Markdown editor. Preserve current Task details/resources/history endpoints and extend their concrete Engine adapter; no parallel `TaskV2` DTO. Reject stale revisions and unauthorized owner actions in Engine and HTTP; UI does not own validation.

**Exit:** browser E2E creates Spec and several different-type Tasks, edits docs, approves drafts and reloads canonical state; relevant CLI operations work offline and reach the *same use cases*. Do not claim a CLI approval proves a trusted human unless the accepted trust model permits it.

## E4 — Manual Workflow execution via UI, with no AI session

- Introduce/persist accepted manual Run policy and per-step executor permissions without reinterpreting old runs. Display current step, allowed actions/results, required feedback, handoff, dependencies, attention, attempt identity and history. Publish a **read-only Engine action projection** covering `not-started`, `ready`, `active`, blocked and terminal positions; today's `StepContext.finish.transitions` exists only for an active step. The UI must never mutate a Run merely to discover its possible actions. Keep the projection extensible for E5, without inventing a contract name before it is implemented.
- Generic UI `Start step`, `Finish step`, `Return to step` and status decisions call authenticated Runtime HTTP adapters over Engine. They do not branch on literal names `implementation`/`review`/`acceptance` or invent `pass` rules.
- Allow a person to do agent-oriented work **only where explicitly permitted by the pinned definition/policy**. Record actual human actor, not a forged agent Session. Active agent attempts require separate F17 takeover; implement the narrowest safe behavior or refuse while occupied.
- In manual mode, even a transition with `continuation: auto` does **not** spawn a Session. The Run stays ready for the owner's next step, after refresh/restart too. Don't rewrite transition definitions or use React-only state to enforce this.
- The flow covers manual Specification preparation, Task breakdown/approval, wait-for-tasks, individual Task workflows with review failure/rework loops and Specification owner acceptance. The selected Task Type still chooses its own workflow.
- Integrate minimum **functional completion prerequisite** into the *existing* Specification Close preflight, when policy requires it; preserve unrelated legacy/technical Close semantics. Required sign-off is declarative/authorized evidence, not a literal step id. Show cancelled/abandoned Task waivers; do not claim automated tests passed without F03.
- Idempotent finish retry (F16), cross-process/writer admission as applicable (F05), stale attempt refusal, durable context and explicit recovery are acceptance criteria, not optional cleanup.

**Exit:** UI-only Spec and Task end-to-end; multiple Task Types/flows; implementation -> review fail -> rework -> pass; no Session or Turn created; restart and same-payload retry; unauthorized actor blocked; no Close before required completion/sign-off, valid Technical Close after it.

## E5 — Definition-driven transition input forms

Use the **new read-only action projection from E4**, grounded in today's `StepContext.finish.transitions` and the existing definition rules; no current `TransitionActionDescriptor` type exists. Approve [D08](boundaries-and-decisions.md) before extending storage/definitions.

- A typed, versioned input schema is authoritative for the Engine and history/effects, not merely a UI rendering description. Proposed primitives: string, boolean, integer, decimal (explicit precision), enum, Markdown and bounded collections. Unknown or invalid inputs refuse before any mutation.
- Renderer maps semantic types to Design System components; optional `ui.component` **hint** chooses from a registered allowlist (e.g. Markdown editor, textarea, select, number input), not arbitrary React imports or executable code.
- Define retention, next-step handoff, effect consumption, read projection, revisions, permissions and history visibility for inputs. Do not build a form that captures data the engine discards.
- Start with a single reusable form in UI; use two unrelated user-defined workflow definitions to prove step-name independence. Support required/optional fields, defaults, choices, disabled and error states and mobile layouts.

**Exit:** add a custom `enum`, `boolean`, `integer`, `decimal` and `markdown` input to a definition; the UI adapts without feature-specific code, the Engine validates/records the values and the next step receives only the declared handoff.

## E6 — Agent-assisted execution, selected per step

The user can **execute an eligible step manually or explicitly ask an agent** through the UI. The agent is a bounded executor of the same deterministic Workflow, not its orchestrator. See [Agent-assisted execution](agent-assisted-execution.md). E6 depends on E4's manual/owner action model, but **not E5's generic form renderer**.

| Slice                    | Outcome                                                                                                                                                                                       | Prerequisites                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E6a: Specification agent | Ask agent starts one Managed Session for an eligible Specification step. The agent gets canonical StepContext, edits registered Specification documents and finishes; no unattended next step | E1, trusted owner action, narrow F01 launch, F02 finish, F05/F16 claims and retries        |
| E6b: Task drafts         | On a declared producing step, agent creates complete draft Tasks: task.md, optional docs, allowed type, dependsOn links and F20 context; human inspects/approves                              | E2/F20 resource, Task/Document Engine writers, D06 ownership, atomic multi-resource finish |
| E6c: Task agent          | Owner delegates one eligible Task step; agent gets pinned Task Type workflow and resolved context, reports declared result, stops                                                             | E6a session/finish, E2 readiness, F20 context, identity/admission                          |
| E6d: mixed path          | The next eligible step may be executed by owner or agent. Show actor, linked Session, attempt, artifacts, retry/stop/takeover; never forge a human gate                                       | E4, E6a–E6c, F13/F17                                                                       |

A producing step is identified by workflow metadata, **not** a hard-coded name such as breakdown. Its Task-writer commands and the ordinary UI call the **same** Engine operations. An agent cannot directly edit Task registry or .execution records. Task dependencies, required contexts, rights, revisions, and admission are validated before durable mutation. Agent outputs remain draft until authorized approval.

**Exit:** An owner-requested agent can write a Specification, propose three Tasks with substantive content/dependencies/context, and perform one selected Task step. Another step is done manually in the same Run. Retry and restart do not duplicate Tasks, Sessions, or finish; no automatic Task batching or chained Sessions.

**Scheduling:** E6a can be delivered earlier than E2/E5 as an isolated Specification-only milestone if trusted invocation, document-writing and recovery prerequisites exist. E6b and E6c require F20 Task resources. Do not bypass those requirements with a separate ad hoc agent writer.

## Explicitly deferred

Full F01 unattended provider continuation (E6 allows explicitly requested single-step dispatch), F12 automatic selection/batches, scheduler/Automation triggers, arbitrary plugin registry, multi-instance/parallel Task worktrees, generic visual workflow editor, and full F03 automated gates. MCP `workflow_finish` can be added later as a thin adapter; the first release does not require it.

## Full user acceptance scenario

1. Create a Specification in the UI without a provider and author required documents manually.
2. Create a Task **before** starting the SpecificationRun. Edit and approve it; verify archetype Task Type policy and the chosen Task Workflow definition at first start, while reads/operations work with no SpecRun.
3. Start manual Specification workflow; complete requirements/specification/solution with human evidence, then Breakdown. Create spike/backend/UI Tasks with **different** Task-Type workflows and dependency edges. No pre-existing manual draft is cancelled by an unrelated finish.
4. Approve drafts and enter wait. Execute each Task's user-defined steps in UI; one deliberately fails review, returns to work with required feedback and then passes. Dependencies unblock deterministically.
5. Complete or explicitly waive outstanding/cancelled work; provide owner acceptance; verify a premature Technical Close is blocked and then execute a legal Close without bypassing Git/workspace checks.
6. Restart Runtime mid-run and retry the same finish after injected ambiguous response; observe the same durable outcome and no new Session.
7. Confirm external CLI can read and perform its supported Task operations offline, with the same rules and no invented owner identity.
8. Optionally extend a Task workflow with typed inputs and verify the generic E5 renderer, Engine validation, stored values and handoff. Separately prove two independent runs of one user definition in the E1 neutral test host.
9. Under E6, ask an agent to write Specification documents and finish one step. On another, have the agent create fully described linked Tasks with context, approve them manually, delegate one Task step, and perform another step personally; verify no auto-chain or forged sign-off.

**Test environments:** actual production project mode and repository/worktree; demo-only coverage is insufficient. Include fault injection for multi-file publication, stale revisions, race with external writer, pinned legacy fixtures and boundary enforcement. UI verification should include narrow/medium/wide layouts and screenshots compared with approved design.
