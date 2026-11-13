---
id: ideas.specflow-engine.reusable-workflow.delivery
type: engineering
title: Reusable Workflow and manual/agent execution delivery plan
status: draft
scope: specflow
areas: [workflow, runtime, ui, cli, testing]
tags: [proposal, delivery-plan, slices, task-resource, manual-ui]
read_when:
  - scoping implementation slices for reusable Workflow and Task resources
  - selecting review checkpoints before Task authoring and manual execution
  - checking manual end-to-end execution and optional owner-delegated Managed Sessions
summary: >
  Proposed E0-E6 delivery sequence with isolated reviewable vertical slices,
  behavioral regression and recovery tests, a complete manual UI proof and single-step agent delegation.
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
- Inventory [D01–D13](boundaries-and-decisions.md#2-decision-register-and-gates) with alternatives, first consumer and verification. **Approve D01/D02/D09 before E1**; define the minimal D03 effect seam and a single D05 executor-policy model. No legacy-file readers, hash-preservation shims or migration work. The detailed D03/D04/D06 and minimal D07 Close guard are required before E2, D05/D07 Workflow Close before E4a, D08/F19 before E5 and D10–D12 before E6a.
- Rewrite fixtures to the **new** YAML, Run and Task record formats as required. Protect observable behaviour: task dependencies/approval/escalation, wait semantics, refusal cases, deterministic replay, recovery/idempotency, plus dependency/import boundaries per ADR 0012. Do not require golden SHA equality or reading obsolete records.
- Promote approved architecture into current ADR/architecture documents **before coding**; the draft idea itself is never normative.

**Exit:** named owner per data/operation, acyclic import matrix, deterministic new-format pins/replay, stable Run identity/host keys and an explicit neutral intent/host boundary. The architecture explicitly accepts strict cutover and rejects legacy migration. Remaining gates retain concrete Task authority, cross-resource recovery proof, manual authorization and input limits.

## E1a — Separate neutral progression inside Engine

- Isolate deterministic Run, attempts/history, transition selection, replay and planning from SpecFlow Subject, Task state, document/FS, agent-provider/session semantics. Provide the neutral coordinator contract: command/event plus resolved definition and Run produces a lawful provider-independent next work/wait/return/terminal intent, not just low-level progression functions. **Do not move the existing `resolveContinuation` provider/archetype/model/session resolver into the neutral package.**
- Define a **minimal neutral** `work/wait` and host-effect protocol sufficient to express existing `wait-for-tasks` as a SpecFlow adapter, including event identity and replay evidence. Neutral Core decides transition legality; SpecFlow Engine adapter resolves Task waits/effects and agent configuration/attention; Runtime dispatches Sessions. None should implement a second transition algorithm. No automatic Session dispatch or general plugin registry.
- Use **one strict target schema** for source YAML, compiled definitions, Run and journal as appropriate. Rewrite current callers and fixtures together if signatures change; do not add compatibility wrappers solely to preserve old internal formats. Keep the semantic capabilities of `startSpecificationExecution`, `startTaskExecution`, `finishStep`, `returnToStep` and `setTaskStatus`, not their provisional wire shape.
- Plan all declared Task effects, updates and wait settlement in one Engine-controlled mutation before persisting. Move definition-kind registration to a composition root (F18), avoid Task ↔ Workflow application import cycles.

**Exit:** revised fixtures and regression suites pass on the new strict model; hashes and replay are deterministic, one finish with effects is recoverable, and source dependency checks pass. No old hash, old YAML or prior Run-record support required. A real minimal host consumes coordinator intents; a forwarding wrapper around `planStart` / `planFinish` alone fails this gate.

## E1b — Create `@nevo/workflow` when extraction boundary holds

- Move only neutral verified code; public exports limited to compiled definition, opaque host Run key, Run/position/history, deterministic coordinator intents, progression/validation and host-facing results. Do not bake `specId`, `taskId`, provider or Session identity into the neutral model. No SpecFlow contracts, Task CRUD, SDK/FS/HTTP/UI imports.
- Engine depends on the neutral package. Amend ADR 0012, package manifests/exports, lint boundaries and single-artifact build packaging.
- Retain existing public Engine operations as the SpecFlow adapters; a separate `startWorkflow` API for generic consumers is allowed only if it has a concrete caller and stable semantics.

**Exit:** Specification and Task workflows use the package; a tiny unrelated host exercises work, wait, finish, return and replay for **two independent Runs of one definition**. New-format revisions are stable under equivalent inputs, invalid positions fail closed and crash recovery is covered. No forwarding-only layers or legacy Run/hash support. Driver dispatch, durable claims and F01 auto-Sessions remain host responsibilities.

## E2 — Task Resource F20, strict cutover and minimum Close protection

Deliver in independently reviewable, coherent slices. Do **not** migrate provisional
`.execution/tasks/<id>.yaml` records or maintain a legacy Task read path. Rebuild demo/project
fixtures and tests in the final F20 format, with one strict parser and clear error on obsolete data.
No production state is being preserved. A failed read must not quietly rewrite an old directory.

1. **Resource authority:** `<spec>/tasks/index.yaml` owns membership/order;
   `<spec>/tasks/<id>/task.yaml` owns metadata, preparation status, dependencies and provenance;
   `task.md` is required and registered. An optional `.execution/tasks/<id>.yaml` Run is
   created **on first start only**. Neither Task membership nor preparation status is duplicated
   in the Run.
2. **Binding at creation (D04/R02):** Task creation validates the selected Task Type against the
   Specification archetype and records the expected Task Type **canonical fingerprint** and Workflow revision plus the relevant
   archetype allow-list fingerprint in `task.yaml`. **This is evidence, not a Task-specific
   Workflow override or a Run.** First start compares live definitions/policy, refuses drift,
   and atomically pins the matching definition. An owner may explicitly
   `rebindUnstartedTask` using expected revision and a before/after summary. No implicit
   adoption of changed definitions.
3. **Recoverable resource changes (D03):** create/edit/remove and cross-resource
   `finishStep` effects publish index, manifest, `task.md`, other documents and affected
   Run through one Engine-owned recoverable mutation boundary. Use CAS/idempotency, fault
   injection and the existing admission/commit system; two unrelated journals sharing
   a lock do not provide atomic publication.
4. **Status, context and provenance:** resolve status/dependencies independently of SpecRun;
   settle `wait-for-tasks` only if an appropriate SpecRun is active. Separate manual drafts
   from an agent producing attempt's proposals (D06); omission does not delete another
   owner's draft. Reuse F20 bounded, typed context and resource-scoped Documents operations.
5. **Minimum Technical Close guard (D07):** before exposing the new Task resource/CRUD
   through any user surface, extend **existing Engine Close preflight** to refuse incomplete
   Task resources, broken/dependent Tasks, unreconciled writers and required unfinished
   Workflow. This is a minimal blocker check, not the complete owner-sign-off UI.
   It must work while no SpecRun exists. Specifications **without** a required execution
   binding follow their current intended Close rules; this is not a legacy format reader.

**Exit:** Create Spec -> Task create/edit/approve -> Task start/finish with **no
SpecificationRun**. Tests cover changes of Task Type mapping, Workflow revision and
Specification archetype allow-list between creation and start, explicit owner rebind and
stale-revision refusal, crash at each resource write, incomplete Task Close blocking,
empty-producing-step safety and broken Task isolation. No dual authority, old-format
migration or compatibility reader.

## E3 — Manual Specification and Task authoring in UI

Deliver **per use case** through Engine → authenticated HTTP → existing UI, with offline CLI over the same Engine use cases where meaningful. Do not implement all CLI, then all HTTP, then all UI.

| Slice                    | User-visible proof                                                                  | Backend/CLI alignment                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E3a: list/inspect/create | Owner opens Specification and creates a typed Task                                  | Existing Task read model + one Engine create operation; CLI create/list/inspect       |
| E3b: edit Task           | Owner edits `task.md`, title, summary, dependencies and sees revision conflict      | Task-scoped Documents operations and shared update validation; CLI same case          |
| E3c: lifecycle           | Owner approves, holds, resumes, cancels or removes never-started Task where allowed | Existing `setTaskStatus`, resource rules, human attribution, CLI where trusted        |
| E3d: integrations        | Existing Spec editor and Task detail show canonical state without Session           | Authorization, real project mode, narrow/mobile UX, recovery and skills documentation |

**Release gate:** E3 cannot make Task CRUD visible unless E2's minimum Close preflight is active in the same build. An unfinished Task must not be silently closable during the period before E4b. Use existing Documents UI and Design System, not a duplicate Markdown editor. Preserve current Task details/resources/history endpoints and extend their concrete Engine adapter; no parallel `TaskV2` DTO. Reject stale revisions and unauthorized owner actions in Engine and HTTP; UI does not own validation.

**Exit:** browser E2E creates Spec and several different-type Tasks, edits docs, approves drafts and reloads canonical state; relevant CLI operations work offline and reach the _same use cases_. Do not claim a CLI approval proves a trusted human unless the accepted trust model permits it.

## E4 — Manual Workflow execution via UI, with no AI session

**E4a: shared, transport-neutral action foundation.** Add a trusted owner action and read-only Engine action projection before manual UI or early E6a. Validate subject/Run/step/attempt, executor policy, pinned definition, idempotency and dispatch choice without mutating the Run on inspection. Use the new strict executor-policy model, with no legacy-replay shim. **Ship the minimal D07 Workflow Close guard with E4a** if E4a or E6a can start a Workflow before E2 ships; do not leave an active workflow closable while awaiting E4b. E6a may consume E4a before E4b/F20 but cannot create a separate start/finish/permissions path.

**E4b: full manual UI execution.** Reuse E4a and complete the user-facing flow.

- Introduce/persist the single accepted strict-format Run policy and per-step executor permissions; no legacy reader or translation layer. Display current step, allowed actions/results, required feedback, handoff, dependencies, attention, attempt identity and history. Publish a **read-only Engine action projection** covering `not-started`, `ready`, `active`, blocked and terminal positions; today's `StepContext.finish.transitions` exists only for an active step. The UI must never mutate a Run merely to discover its possible actions. Keep the projection extensible for E5, without inventing a contract name before it is implemented.
- Generic UI `Start step`, `Finish step`, `Return to step` and status decisions call authenticated Runtime HTTP adapters over Engine. They do not branch on literal names `implementation`/`review`/`acceptance` or invent `pass` rules.
- Allow a person to do agent-oriented work **only where permitted by the pinned executor policy**, never by forging the executor identity or bypassing deterministic replay. Record actual human actor, not a forged agent Session. A Run's dispatch preference and a particular attempt's authorized actor are different facts. Active agent attempts require F17 takeover with verified stop/reconcile, otherwise refuse.
- In manual mode, even a transition with `continuation: auto` does **not** spawn a Session. The Run stays ready for owner action after refresh/restart. Preserve the definition/pin and store the dispatch policy outside React. For mixed execution, the `session: reuse` transition after a manually completed step needs D10's explicit owner-authorized fresh override or a visible `session-unavailable` refusal, never silent reinterpretation.
- The flow covers manual Specification preparation, Task breakdown/approval, wait-for-tasks, individual Task workflows with review failure/rework loops and Specification owner acceptance. The selected Task Type still chooses its own workflow.
- E4b adds full owner acceptance/sign-off and waiver presentation to the **already active D07 guard**. Use declarative/authorized evidence, not a literal step id, and preserve the existing Git/workspace Close rules. Show cancelled/abandoned Task decisions; do not claim automated tests passed without F03.
- Idempotent finish retry (F16), cross-process/writer admission as applicable (F05), stale attempt refusal, durable context and explicit recovery are acceptance criteria, not optional cleanup.

**Exit:** E4a serves one canonical set of actions and enforces Workflow Close blocking before early E6a; E4b completes the UI-only Spec/Task path with multiple Task Types, review failure/rework, no Session/Turn, restart and same-payload retry, authorization and sign-off. New-format replay stays deterministic; manual-to-agent reuse policy is exercised separately.

## E5 — Definition-driven, bounded transition input forms (with F19)

Use the Engine's new E4a read-only action projection, derived from current
`StepContext.finish.transitions` and definition rules; the symbol
`TransitionActionDescriptor` is **not** an implemented API. Approve
[D08](boundaries-and-decisions.md) and resolve
[F19](../execution-plans/06-workflow-kernel/README.md#f19--bound-run-history-so-a-long-run-cannot-reach-the-record-byte-budget)
before enabling custom inputs.

- Schema is authoritative for Engine validation, typed history, effect input and handoff;
  semantic type (string, boolean, integer, decimal with explicit precision, enum, Markdown)
  is different from a Design System `ui.component` allowlisted hint.
- Define size limits **before write** for each field, each attempt and the cumulative
  `RECORD_BYTES_MAX` Run budget. Do not append large Markdown blobs to an unbounded
  attempt array. Where needed, store immutable large content as a registered document or
  content-addressed artifact with reference, digest/revision and recovery validation;
  keep bounded references in Run.
- Replay and the following step must retrieve and validate declared references without
  stale or missing data; never truncate already accepted history merely to satisfy size.
  Preserve idempotent retries, CAS and crash recovery.
- One reusable form handles arbitrary user-defined step identifiers, required/optional
  fields, enum choices, error states and narrow UI.

**Exit:** submit enum, boolean, integer, decimal and Markdown, validate/persist/reload,
and pass declared values forward. Maximal accepted attempt/return sequences plus feedback
and artifacts **cannot deadlock at `RECORD_BYTES_MAX`**. Missing/stale externalized
evidence fails closed; no UI-only input is silently discarded.

## E6 — Agent-assisted execution, selected per step

An eligible step may be performed manually or delegated by an authenticated owner for a **single**
attempt. Agent execution uses the same deterministic Engine commands, not a second Workflow.
See the [protocol](agent-assisted-execution.md) and D10–D13 in
[boundaries and decisions](boundaries-and-decisions.md). Full F01 unattended continuation and F12
Task batches remain deferred.

| Slice                    | Outcome                                                                                                                                                                             | Mandatory prerequisites                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| E6a: Specification agent | Owner requests one eligible Specification step; a Session writes a registered document through claim-owned Engine operations, submits a result and stops; no automatic next Session | E1, **E4a** shared owner/action contract, D05 and D10–D12; narrow F01/F02/F05/F09/F16/F17 invocation/claim/finish/stop support |
| E6b: Task drafts         | A producing agent step creates complete draft Tasks with `task.md`, dependencies and typed context; human reviews/approves                                                          | E2/F20 Task Resource, D03/D06/D13, D11 claim-owned Task/Document writes and crash-safe multi-resource publication              |
| E6c: Task agent          | Owner delegates one eligible Task step with pinned Task Type workflow and context; one declared finish; stop                                                                        | E6a protocol, E2 readiness/F20 context and D10–D12                                                                             |
| E6d: mixed path          | Manual and agent attempts coexist, with actor/Session correlation, retry/stop/takeover; never forge owner approval                                                                  | E4b, E6a–E6c and F13/F17                                                                                                       |

A producing step is selected through metadata, not literal `breakdown` or `implementation`
identifiers. Task-writer commands and UI mutations call the same Engine operations. The native
process still has broad filesystem access; cooperative operation scoping is not an OS sandbox.
Document mutations completed during an active claim remain **durable incremental work**, even if the step never finishes; see D12 and the agent protocol. A pending finish submission is **not** a completed Workflow step: finalization and claim settlement must preserve exclusive admission until native stop is proven.

**Exit:** One owner-requested agent writes Specification documents and preserves safely inspectable partial edits after a failed attempt; proposes three substantive linked Task drafts with context and performs one selected Task step; a separate step runs manually.
A manual `requirements` -> delegated `specification` `session: reuse` case obeys the recorded
owner override/refusal. Recovery and duplicate submissions never duplicate Tasks, Sessions or
finish, bypass a claim, or accidentally trigger automatic chaining.

**Scheduling:** E6a may precede E2, E3 and E4b **only if E4a already enforces minimum Close blocking** and all D10–D12 preconditions are
implemented. It cannot be a standalone ad hoc agent endpoint. E6b/c require F20. E6 does not depend
on E5's generic form renderer.

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
9. Under E6, ask an agent to write Specification documents **through its own verified claim**, submit finish, stop and reconcile; inspect the exact pending/committed result. Create fully described linked Task drafts with context, approve manually, delegate one Task step and complete another personally. Test owner authentication, claim self-mutations, `session: reuse` after manual work, retries, crashes, and absence of auto-chain or forged sign-off.

**Test environments:** actual production project mode and repository/worktree; demo-only coverage is insufficient. Include fault injection for multi-file publication, stale revisions, race with external writer, newly rewritten strict-format fixtures and boundary enforcement. UI verification should include narrow/medium/wide layouts and screenshots compared with approved design.
