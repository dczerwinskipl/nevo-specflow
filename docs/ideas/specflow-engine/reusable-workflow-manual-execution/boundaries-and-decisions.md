---
id: ideas.specflow-engine.reusable-workflow.boundaries
type: architecture
title: Reusable Workflow boundaries and unresolved design decisions
status: draft
scope: specflow
areas: [workflow, runtime, ui, cli, testing, security]
tags: [proposal, architecture, ownership, atomicity, manual-execution, decisions]
read_when:
  - defining the reusable Workflow package boundary or API
  - designing Task CRUD without a running Specification workflow
  - deciding human execution, transition inputs, or close eligibility
summary: >
  Candidate responsibility map and open P1/P2 decisions that must be resolved
  before extracting Workflow and exposing manual Task execution.
related:
  - ideas.specflow-engine.reusable-workflow
  - ideas.specflow-engine.task-resource-and-context
  - ideas.specflow-engine.decisions
  - architecture.workflow.workflow-kernel
  - adr.0012-product-package-topology-and-dependency-direction
---

# Boundaries and decisions (unapproved)

## 1. Dependency direction and ownership

```text
@nevo/specflow (product CLI/composition)
    ├── @nevo/specflow-runtime  -> @nevo/specflow-engine -> @nevo/workflow
    └── @nevo/specflow-ui       -> @nevo/specflow-contracts
@nevo/specflow-engine          -> @nevo/specflow-contracts/documents (existing)
@nevo/workflow                 -X-> any SpecFlow package
```

Arrows express allowed dependencies, not required imports. `@nevo/workflow` is a proposed **internal source package**, not an HTTP service or independent distributed product. It may be Node-only if necessary; browser compatibility is not a prerequisite. `@nevo/specflow` remains the application composition root per ADR 0012.

| Owner | Owns | Explicitly does not own |
| --- | --- | --- |
| Neutral `@nevo/workflow` | Resolved definitions, transition policy, Run position, attempt identity/history, pin/replay, start/finish/return planning, host-facing step execution state and generic suspend/resume semantics | Specification/Task types, Documents, Task effects, Git/worktrees, HTTP/UI, provider Sessions, source YAML format |
| `@nevo/specflow-engine` Workflow adapter | Spec/Task subject binding, definition compilation, authorization/admission integration, atomic multi-resource planning, domain-specific waits/effects, state journal and workspace identity | A second progression algorithm or UI form rendering |
| `@nevo/specflow-engine` Task resource | Task index, manifest, `task.md`, Task Type selection, dependency/status policy, drafts, provenance and context | Generic transition mechanics, independent workflow Run store |
| Runtime | Authenticated HTTP commands/projections; eventual F01 provider dispatch with durable intent | Canonical Task mutations, independent Run policy or silent auto-start merely because a Task is ready |
| CLI + skill | Offline commands over the same Engine operations | A separate lifecycle implementation or proof of human approval from caller-provided `executor` |
| UI | Existing Spec/Task screens, documents editing, canonical actions and generic input renderer | Calculating transition legality, forging an executor, defining backend validation |

Suggested cohesive boundaries, **not mandatory directories**: `packages/workflow/src/{definitions,execution}/`; Engine `workflow/{definitions,operations,integration,state}/` and `tasks/{resource,documents,context}/`; Runtime `features/{tasks,workflow}/`. Enforce feature barrel exports and no cross-feature implementation imports. Do not create forwarding-only service/manager/repository layers, central `utils` dumping grounds, or duplicated Task DTOs. Put mutations spanning Task and Workflow in **one Engine application orchestration boundary** that consumes pure Task policies; do not create a cycle where Task operations call Workflow operations which call Task operations.

## 2. P1 decisions: blockers for E1/E2/E4

### D01 — Neutral step semantics, special steps and replay

**Observed:** The Kernel knows `work`, `wait-for-tasks`, `produces: tasks`, `approve-draft-tasks` and `task-escalated`. A wait step has its own recorded attempt with no executor. `planWaitFinish`, validation and replay currently understand these rules.

**Open:** Define the smallest neutral representation of executable and suspended steps, external completion triggers, host-supplied effects and evidence, without requiring the Core to know `tasks-finished`. Who resolves a domain wait and how does replay prove it? A generic `wait` could be viable, but must preserve wait-attempt history and deterministic trigger selection. A host callback that can arbitrarily mutate Run position is not acceptable.

**Proof:** existing Specification wait/approval/escalation tests and an unrelated wait event replay using *exactly the same neutral progression implementation*. No generic event bus, speculative DSL or hard-coded branch on Subject in the neutral package.

### D02 — Definition compilation and pinned revisions

**Observed:** `workflowRevision()` currently hashes `canonicalJson` of the fully resolved **SpecFlow** definition. Moving fields or changing canonicalization can invalidate existing `revision` pins even if behaviour looks equivalent.

**Open:** Keep source YAML and its product schemas owned by SpecFlow. Specify the compatibility boundary between the existing full resolved definition hash and the proposed neutral compiled definition (e.g. a versioned trusted pin passed to Core), including signature/replay validation and future migration rules.

**Proof:** golden fixtures for v1 YAML, SHA, existing run records, replay and refusal codes before/after extraction. **No silent schema or pin migration in E1.**

### D03 — One atomic transaction for transitions plus Task/Documents effects

**Observed:** `finishStep` today writes the transition, generated drafts, Task decisions, approval, escalation and wait settlement in one `ExecutionChange` and journal. Documents has a **separate** mutation/journal/commit system. F20 adds `tasks/index.yaml`, `task.yaml` and `task.md` beyond today's WorkflowStore targets.

**Open:** Which Engine operation owns a single recoverable write covering these files and Run changes, CAS revisions, project lock, crash replay, and eventual commit scheduling? Project Control Lock alone does not make two journals atomic. A post-commit `handler.afterFinish` cannot safely create Task files after Run has already advanced.

**Proof:** fault injection after each staged write: subsequent read sees all or none of the logical change, retry is safe, competing writers cannot silently overwrite, and Git commit/Close respects pending writes. Avoid inventing a generic distributed transaction framework.

### D04 — Task existence and lifecycle independent of Specification Run

**Observed:** `loadSubject`, `ExecutionWorkingSet.specification()`, `setTaskStatus` and `settleWait` assume an execution record for Specification. Under F20, the Task index/folder must be authoritative even before a Specification Workflow starts.

**Open:** How are resource existence, optional Run and subject-binding records represented? The absence of a Task Run **before first execution** is normal `not-started`; absence of a started Task's folder/index is `broken`. Status changes must settle a Specification wait **only if** an active appropriate SpecRun exists. Define provenance for manually created Tasks instead of inventing `origin.step`.

**Proof:** create Spec -> create Task -> edit Task -> approve -> start/finish Task, while no Specification Run exists; verify each operation and read including restart and recovery.

### D05 — Manual execution capability, mode and authoritative actor

**Observed:** `executor: agent|human` is strict, and replay expects matching executor. `continuation: auto` may yield a Session launch decision. A person must not silently finish an agent attempt as an agent.

**Open:** Separate (1) allowed executors of a step, (2) durable execution mode/dispatch policy for a particular Run, and (3) actual trusted executor of each attempt. Decide manual mode storage and whether it can change mid-run, keeping historical pin compatibility. An active agent Session needs explicit F17 takeover/stop/reconciliation, not `finish` with `executor: human`. Human review/approval identity comes from HTTP Auth or a proven offline local trust model, never an untrusted payload.

**Proof:** manual UI start/finish/return through a user-defined agent-oriented flow with explicit permission, zero Sessions even after Runtime restart; rejected unauthorized finish, safe existing attempts and replay.

### D06 — Manual Task creation versus full-list Breakdown finish

**Observed:** `materializeTasks` treats `finish.tasks` as the *complete* draft list and cancels omitted drafts. A valid `expectedRevision` only detects concurrent modifications, not unintended deletion of a user's previously created draft.

**Open:** Model task authoring separately from finishing a step. Define proposal ownership/scope (for example, Breakdown attempt), explicit replace-vs-merge intent, approval and cancellation. Omission **never implicitly cancels drafts owned by a separate author/attempt**. Determine legal create/edit/status transitions before, during and after Specification `wait-for-tasks`, and after terminal state.

**Proof:** manually create 3 drafts, finish Breakdown with empty proposals and verify none disappears; concurrent UI/agent edit fails or resolves explicitly; cancelling a Task is a deliberate authorized operation.

### D07 — Workflow completion, owner acceptance and Technical Close

**Observed:** The default Specification seed ends with a human Acceptance step, but user-authored workflows need not contain an identically named step. Existing Technical Close has its own Git/workspace safety rules and is not yet a full Workflow exit-gate integration.

**Open:** Determine which Specifications require completed execution before Close, including a bound-but-never-started workflow. Model required owner acceptance/sign-off **declaratively or as a separate owner evidence**, not by checking literal step id `acceptance`. Preserve legacy/non-workflow Close semantics. Make `cancelled` and `abandoned` work visible and require an explicit owner acknowledgement/waiver where appropriate. Do not mistake owner acceptance for F03 automated verification evidence.

**Proof:** required-workflow Spec cannot Close without completion and owner evidence (even when never started); legacy Spec retains existing behaviour; completed Task set with waived exceptions is visible and auditable.

### D08 — Typed inputs: schema, persistence, handoff and projection

**Observed:** Current `FinishInput` supports `result`, `feedback`, `artifacts` plus SpecFlow-specific `tasks`/`taskDecisions`; metadata alone cannot carry arbitrary `riskLevel` or `estimatedHours` across attempts. Legacy Nevo had `finishContract.parameters`, `enum` results and action metadata, but it was a different engine.

**Open:** Define a versioned, validated input/output contract, where values live (attempt outcome, explicit artifact or effect input), how the next step sees them, and what is retained in history; semantic type (enum/string/boolean/integer/decimal/markdown) is distinct from a UI rendering hint. Treat decimal precision explicitly (prefer a validated decimal string unless a bounded numeric type is justified). A hint can select a **registered** component, not execute arbitrary code from YAML. UI never gets to invent required fields.

**Proof:** input submitted through UI, validated server-side, retained/recoverable across restart, available to the declared next step, and rejected for unknown fields/types. E4 needs the small transition-action projection; the general form renderer is E5.

## 3. Additional unresolved integration constraints

- **Task status authority:** The detailed F20 proposal places `status` in `task.yaml`, while a Plan 06 summary still refers to keeping status in execution state. Reconcile in an ADR. No dual authority; one indexed resource and one clear place for status.
- **Definition kind registration:** Current `specs/definitions/kinds/index.ts` imports workflow kinds (Plan 06 F18). Move registration to a real composition boundary without inducing a cycle.
- **Task documents:** Extend existing Documents application semantics to a Task-scoped registry. Avoid parallel document editors, writers or revision systems.
- **CLI trust:** A local agent and owner using the same OS identity are not securely distinguishable merely by a CLI option or execution handle. Supported trust boundary must be documented; do not promise forged-owner prevention unless an enforceable mechanism exists. Refer to [local actor and human gates](../local-actor-and-human-gates.md).
- **Idempotency/claims:** F16 finish retry and F05 writable admission are relevant even without F01. Specify what is needed for the manual HTTP path and what remains an explicit limitation of unsupervised external agents.
- **Package viability:** A public neutral API should be tested with the existing Specification and Task consumers and a tiny independent test host. Test host is **evidence**, not a speculative production Automation feature. It should not force an unused action scheduler into E1.
- **Close and commits:** `terminal: completed` is not equivalent to Git archival, merge, push or successful tests. Reuse the supported Close preflight and commit queue rather than bypassing them.

## 4. E0 decision outcome

Before implementation, publish a proposed ADR covering D01–D05 and D07; make D06 and D08 explicit bounded contracts before their consuming slices. The following are not implied approvals: package creation, step-schema change, `allowedExecutors`, Run-mode persistence, Task status location, generalized input DSL or mandatory Close blocking for every existing Specification.

The accepted design must demonstrate an acyclic import graph, a concrete multi-file journal boundary, a source-format/pin compatibility test, a Task without SpecRun and a manual action with trustworthy attribution.
