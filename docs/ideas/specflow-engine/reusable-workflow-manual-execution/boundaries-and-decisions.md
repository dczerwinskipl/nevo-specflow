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
  Candidate responsibility map and phased design decisions for reusable Workflow,
  independent Task resources, manual execution and agent delegation.
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

| Owner                                    | Owns                                                                                                                                                                             | Explicitly does not own                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral `@nevo/workflow`                 | Compiled definitions, deterministic progression/history/pin/replay, neutral work/wait/return semantics and provider-independent continuation intents                             | Specification/Task types, Documents, Task effects, Git/worktrees, HTTP/UI, provider/model/Session selection, source YAML and application triggers |
| `@nevo/specflow-engine` Workflow adapter | Spec/Task binding, domain waits/effects, trusted admission, recoverable publication and SpecFlow-specific continuation resolution (archetype, provider, model, reuse, attention) | A competing transition algorithm, native provider execution, Session/Turn lifecycle or UI rendering                                               |
| `@nevo/specflow-engine` Task resource    | Task index, manifest, `task.md`, Task Type selection, dependency/status policy, drafts, provenance and context                                                                   | Generic transition mechanics, independent workflow Run store                                                                                      |
| Runtime                                  | Authenticated HTTP commands and projections; E6 explicit owner-requested step dispatch, eventually F01 auto continuation                                                         | No independent Workflow progress logic and no automatic launch just because a Task is ready                                                       |
| CLI + skill                              | Offline commands over the same Engine operations                                                                                                                                 | A separate lifecycle implementation or proof of human approval from caller-provided `executor`                                                    |
| UI                                       | Existing Spec/Task screens, documents editing, canonical actions and generic input renderer                                                                                      | Calculating transition legality, forging an executor, defining backend validation                                                                 |

### Minimum useful orchestration boundary

The neutral package must be more useful than exported `planStart` / `planFinish` functions. It should accept a resolved definition, a particular Run state and a host command or event; choose the legal step/transition; and yield a deterministic **next intent** such as `execute`, `await-input`, `wait-for-event`, `ready` or `terminal`. The host supplies narrowly typed execution drivers and domain data/effects. This is coordination of a declared workflow, **not** an autonomous process or automatic Session launcher.

An execution host selects _when_ to initiate a Run (UI, CLI, Runtime, future scheduler), resolves the appropriate step driver, enforces identity/writer admission and commits domain effects and Run state in a recoverable transaction. It cannot privately skip steps or choose transitions that the neutral coordinator did not authorize. **Provider choice is not neutral continuation:** the current Engine `resolveContinuation` chooses archetype/provider/model, `session: reuse` and product attention. Keep that logic in the SpecFlow adapter, not `@nevo/workflow`. Runtime executes the resulting dispatch request; it must not reimplement transition selection. Later F01 dispatches a provider Session from this resolution without creating a second state machine.

**E1 proof:** one SpecFlow Specification, one Task of a custom Task Type, and a tiny non-SpecFlow host each drive the same coordinator through start, finish, wait, resume and return. The non-SpecFlow host must demonstrate two distinct Run instances of one definition. No network service, plugin marketplace, action scheduler, or implicit synchronous callbacks under a held project lock.

Suggested cohesive boundaries, **not mandatory directories**: `packages/workflow/src/{definitions,execution}/`; Engine `workflow/{definitions,operations,integration,state}/` and `tasks/{resource,documents,context}/`; Runtime `features/{tasks,workflow}/`. Enforce feature barrel exports and no cross-feature implementation imports. Do not create forwarding-only service/manager/repository layers, central `utils` dumping grounds, or duplicated Task DTOs. Put mutations spanning Task and Workflow in **one Engine application orchestration boundary** that consumes pure Task policies; do not create a cycle where Task operations call Workflow operations which call Task operations.

## 2. Decision register and gates

Decide **only what the next slice consumes**. E0 records every open question but does not force E5 form semantics to be designed before E1.

| Gate                            | Decisions needed                                                                      | What can remain open                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Before E1                       | D01, D02, D09; minimal D03 effect seam and D05 executor-policy extension              | Task journal, UI permissions and typed form catalogue                 |
| Before E2                       | D03, D04, D06, D07 minimal Close guard; F20 Task authority and definition binding     | E4b owner sign-off UX and E5 typed renderer                           |
| Before E3 owner mutations / E4a | D05 identity/manual policy; D07 guard already deployed before earlier authoring/Run   | F01 unattended Session dispatch                                       |
| Before E5                       | D08 input validation, persistence and handoff                                         | Arbitrary custom components or a visual designer                      |
| Before E6a                      | D10–D12 trusted delegation, claim-owned Engine writes, stop/finish recovery and reuse | Full F01 unattended chaining, F12 auto-batches and scheduled triggers |
| Before E6b                      | D13 agent Task authoring; F20 and D06 are implemented                                 | Agent Task scheduling and parallel worktree execution                 |

### D01 — Neutral step semantics, special steps and replay

**Observed:** The Kernel knows `work`, `wait-for-tasks`, `produces: tasks`, `approve-draft-tasks` and `task-escalated`. A wait step has its own recorded attempt with no executor. `planWaitFinish`, validation and replay currently understand these rules.

**Open:** Define the smallest neutral representation of executable and suspended steps, external completion triggers, host-supplied effects and evidence, without requiring the Core to know `tasks-finished`. Who resolves a domain wait and how does replay prove it? A generic `wait` could be viable, but must preserve wait-attempt history and deterministic trigger selection. Specify the input/event and output-intent contract of the neutral coordinator; the SpecFlow adapter evaluates `tasks-finished` without adding Task awareness to the neutral package. A host callback that can arbitrarily mutate Run position is not acceptable.

**Proof:** existing Specification wait/approval/escalation tests and an unrelated wait event replay using _exactly the same neutral progression implementation_. No generic event bus, speculative DSL or hard-coded branch on Subject in the neutral package.

### D02 — Definition compilation, pins and pre-release format policy

**Decision: strict replacement, no backward compatibility.** Nevo SpecFlow has no production
users or persistent production state requiring migration. Follow the strict-parser approach
already accepted in [ADR 0015](../../../architecture/decisions/0015-specification-manifest-as-document-registry.md):
one chosen format is authoritative; do **not** build a compatibility reader, migration pipeline,
v1-v2 alias or hash-preservation shim just for provisional Workflow/Task files.

**Still required:** SpecFlow owns project YAML/schema; the neutral Core consumes a properly
compiled definition. Each **new** Run pins the chosen definition revision, which must be
validated during start, finish, return, replay and recovery. If definitions change while a new Run
exists, fail closed until an explicitly authorized rebind/repin under the current model. The
revision algorithm and record format may change **once** as part of extraction if the new scheme is
deterministic, strict and consistently applied.

**Implementation:** replace old fixtures, seed definitions, parsers, codecs and tests with the
new schema. Reject unsupported old records with a clear validation error; do not silently
reinterpret or overwrite them. This is detection of invalid data, not a migration feature.

**Proof:** freshly created runs across Specification, Task and an unrelated host retain stable
pins; deterministic replays, bad definition refusal and fault-injected recovery work on the new
format. No old SHA, YAML or Run-record compatibility test is an exit condition.

### D03 — One atomic transaction for transitions plus Task/Documents effects

**Observed:** `finishStep` today writes the transition, generated drafts, Task decisions, approval, escalation and wait settlement in one `ExecutionChange` and journal. Documents has a **separate** mutation/journal/commit system. F20 adds `tasks/index.yaml`, `task.yaml` and `task.md` beyond today's WorkflowStore targets.

**Open:** Which Engine operation owns a single recoverable write covering these files and Run changes, CAS revisions, project lock, crash replay, and eventual commit scheduling? Project Control Lock alone does not make two journals atomic. A post-commit `handler.afterFinish` cannot safely create Task files after Run has already advanced.

**Proof:** fault injection after each staged write: subsequent read sees all or none of the logical change, retry is safe, competing writers cannot silently overwrite, and Git commit/Close respects pending writes. Avoid inventing a generic distributed transaction framework.

### D04 — Task existence, definition binding and lifecycle without SpecRun

**Observed:** `loadSubject`, `ExecutionWorkingSet.specification()`, `setTaskStatus`
and `settleWait` require a Specification execution record. F20 makes the Task folder and
`tasks/index.yaml` authoritative before any SpecificationRun exists.

**Decision proposed for E2 (R02): bind expectations at Task creation.** A Task's
`task.yaml` records **creation-time binding evidence**, distinct from a running Workflow:
the chosen Task Type id and **canonical content fingerprint** (the current TaskType model
has no separate revision field), its referenced Workflow id/revision, and the relevant
Specification archetype execution/task-type-allow-list fingerprint. Compute those fingerprints
from the canonical **execution-relevant** definition fields, not from display-only metadata. This is **not** a per-Task
Workflow override or a prematurely created Run. It records what was shown/validated when the
Task was authored; the authoritative live Task Type still selects the Workflow.

At first start, Engine atomically validates the current Task Type, Workflow definition and
Specification archetype policy against that expected binding, then creates and pins the Task Run.
If the Task Type was removed, `task-type.workflow` changed, a Workflow definition changed,
the type is no longer allowed or the policy fingerprint differs, **refuse with an explicit
`definition-changed` / `task-type-not-allowed` result**. A separate owner-authorized
`rebindUnstartedTask` action may confirm/adopt the current binding, with expected revision;
it cannot silently change a Task with attempts. The action must show old/new type/workflow/policy
and requires no speculative compatibility reader.

The absence of a Task Run before first start is `not-started`, not `broken`. The absence of an
already-started Task's manifest/index is `broken`, isolated to that Task. Status changes settle
`wait-for-tasks` only when a corresponding active SpecificationRun exists. Manual Task creation
records real human origin rather than inventing `origin.step`.

**Proof:** create Specification without starting its Workflow; create, edit and approve a Task;
start it with the originally shown definition. For each of three independently modified inputs
(Task Type mapping or content fingerprint, Workflow revision, Specification archetype allow-list), starting
refuses until explicit adopt/rebind; unauthorized or stale rebind refuses. Restart/recovery,
no-SpecRun readiness and broken Task isolation all pass.

### D05 — Manual execution capability, mode and authoritative actor

**Observed:** `executor: agent|human` is strict, and replay expects matching executor. `continuation: auto` may yield a Session launch decision. A person must not silently finish an agent attempt as an agent.

**Open:** Separate (1) allowed executors of the pinned definition/policy, (2) durable Run dispatch preference, (3) trusted authorization for this attempt and (4) the actual recorded actor. A manual-only Run must not accidentally prohibit all later owner-requested agent steps. The current `isPositionJustified` requires `record.executor.kind === step.executor`: a human finish on an agent step **fails current replay rules**. E1 may replace that provisional record format and its rule with one strict, coherent model whose allowed executor policy is pinned per Run/attempt. E4/E6 then implements the real policy and attribution; no dual-mode reader or old-hash preservation is required. Human-only sign-off stays human-only; takeover of an active agent requires F17 stop/reconcile, never an impersonated finish. Owner identity comes from Runtime Auth or a proven local boundary, never an untrusted payload.

**Proof:** manual start/finish/return of an agent-oriented step with explicit policy, zero Sessions across restart, and a mixed human/agent Run with separately trusted actor identities. Updated current-model pin/replay fixtures pass; forged executors, stale attempts and unproven takeover are rejected.

### D06 — Manual Task creation versus full-list Breakdown finish

**Observed:** `materializeTasks` treats `finish.tasks` as the _complete_ draft list and cancels omitted drafts. A valid `expectedRevision` only detects concurrent modifications, not unintended deletion of a user's previously created draft.

**Open:** Model task authoring separately from finishing a step. Define proposal ownership/scope (for example, Breakdown attempt), explicit replace-vs-merge intent, approval and cancellation. Omission **never implicitly cancels drafts owned by a separate author/attempt**. Determine legal create/edit/status transitions before, during and after Specification `wait-for-tasks`, and after terminal state.

**Proof:** manually create 3 drafts, finish Breakdown with empty proposals and verify none disappears; concurrent UI/agent edit fails or resolves explicitly; cancelling a Task is a deliberate authorized operation.

### D07 — Minimum Close guard before new Task or Workflow use cases

**Observed:** The current Technical Close preflight guards Git/workspace operations, but does not
yet enforce Workflow/Task completion. E3 Task CRUD and an early E6a would make unfinished work
possible before E4b's full owner acceptance UI.

**Decision proposed:** add a minimal Engine-owned Close eligibility guard **before the first
user-accessible Task lifecycle or Workflow Run action**. This means E2's resource/CRUD release
must include its Task blocker check **before E3**, and E4a must include the Workflow blocker
before an early E6a (if that slice ships first). Both call the existing Close preflight, with
a single shared rule source; no UI-only gate or separate Close implementation.

Guard at least: active/ready/waiting required Workflow Runs; bound-but-never-started required
flows; Tasks that are draft, ready, on-hold, active, broken or have unresolved dependents;
pending agent claim/Document write and unreconciled journal. A Specification without a required
Workflow remains under its normal Close semantics. Do not hard-code step id `acceptance`:
a declarative required owner sign-off or separately persisted evidence can be an E4b extension,
but the minimal guard must not declare unfinished work complete.

A waiver, if the product explicitly allows one, must be a **durable, authorized, scoped and
audited** decision covering the listed blocker(s), not an automatic bypass or a request flag
silently converting a failed preflight to success. Revalidate it under concurrency and Close's
existing lock. No claim of F03 test/build verification follows from sign-off.

**Proof:** Close refuses when Task drafts exist before SpecRun or when a required Workflow has
not started; refuses on an active Task/agent and on unreconciled writer state; a legally empty
Specification still closes as before. Tests must run with E2 Task CRUD alone and with E4a/E6a
before E4b. Full acceptance and optional waiver UX can arrive later without opening a Close gap.

### D08 — Typed inputs, bounded history and handoff (F19)

**Observed:** `FinishInput` currently has `result`, `feedback`, `artifacts`,
Task-specific `tasks/taskDecisions`; `StepContext.finish.transitions` is only an active-step
projection, not a standalone UI descriptor. The [F19 backlog](../execution-plans/06-workflow-kernel/README.md#f19--bound-run-history-so-a-long-run-cannot-reach-the-record-byte-budget)
identifies that repeated valid attempts, long feedback and many artifacts can exhaust
`RECORD_BYTES_MAX` and permanently block Workflow progression.

**Open for E5:** Define a typed versioned input/output contract (enum, integer, decimal,
Markdown etc.), Engine validation, a side-effect-free action projection and a declared handoff.
Do not store unbounded Markdown or arbitrary form results inline in every Run attempt. Agree a
per-field and cumulative storage budget, and where large immutable values live (e.g. document or
content-addressed artifact with stable id, digest and revision), and what concise reference is
kept in the Run. Attempt replay/handoff must validate the referenced evidence and fail closed
when it is unavailable. Semantic types differ from allowlisted UI widget hints; no executable
YAML component imports.

**Gate:** resolve F19 or ship an independently proven bounded scheme **before enabling E5**.
The sequence of valid finishes/returns may not fill the fixed Run record and deadlock progress.
Do not silently truncate accepted history or strip the last useful handoff.

**Proof:** many attempts/returns with maximal accepted Markdown/enum/decimal/feedback/artifacts
stay within `RECORD_BYTES_MAX`; large values survive restart and exact replay, stale references
refuse safely, and the declared next step receives the correct handoff. Check concurrent writes,
idempotent retry and serializer limits _before_ mutation.

### D09 — Run identity and cardinality beyond the SpecFlow subject

**Observed:** SpecFlow binds one Run to each Specification or Task and stores it under a Specification-owned `.execution/` tree. A scheduler might run one workflow definition 100 times for one Automation or use the same definition for unrelated subjects. A Task ID is not a Run instance ID.

**Open:** Make the neutral coordinator take a stable opaque Run identity or accept a Run value with a separate host-owned execution key; do not require `subject.kind: specification | task`, `specId` or an on-disk Task parent to operate. The host chooses storage and subject linkage; the neutral algorithm must distinguish independent attempts/histories of separate runs of the same definition. Decide where identity and idempotency/fencing tokens live without forcing a global workflow-run registry or changing existing SpecFlow file locations.

**Proof:** two independent runs of one definition, concurrently addressable by different host keys, with separate history, retries and pinned revisions; both survive host reload. New-format SpecFlow records remain deterministic; previous internal file layouts need no compatibility reader.

### D10 — Trusted owner delegation and Session reuse

**Current limitation:** Workflow attempts and Managed Session/Turn invocations have independent
identities. A terminal Turn does not automatically finish a Workflow step.

**Decision:** Authorize exactly one owner-requested, eligible subject/Run/step/attempt and bind it
durably to one Session/Turn/invocation and verified workspace. Runtime validates actor and attempt;
Engine validates step eligibility. Human-only gates never accept agent finish. The preferred actor
for a Run and the actual executor of each attempt are separate persisted facts.

**Reuse edge case:** Shipped `specification-standard` has
`requirements -> specification` with `session: reuse`. A manual requirements attempt leaves no
Session to reuse. Never silently treat `reuse` as `fresh`. Either define an explicit, authorized,
persisted owner override to a fresh Session or refuse with `session-unavailable`. Preserve the
original meaning for unattended transitions and the original pinned definition.

**Proof:** one request creates one correlated Session; a manual requirements step followed by
Ask agent on specification follows the chosen, observable fallback/refusal policy after restart.
Duplicate owner requests, mismatched step, expired invocation and agent approval fail.

### D11 — Claim-owned Engine writes, not a global claim bypass

**Current limitation:** Every native Managed Session holds a project-wide `project-write` claim.
`assertSharedResourcesAvailable` blocks ordinary Engine Document changes while that claim is
unsettled. Therefore an agent cannot simply call the existing Document writer while its claim
is active, as the current E6 draft implies.

**Decision:** Define narrowly scoped, claim-owned self-mutations. A trusted Engine/Runtime broker
checks the exact current invocation, Session/Turn actor, workspace incarnation, intended
Specification/Task and permitted capability before admitting a Document/Task write under its
_own_ claim. Do not accept a caller-provided claim ID as proof and do not add a blanket
`ignoreClaims` flag. Project control lock, fencing, all unrelated writer exclusions and
recovery rules remain effective. Specify admission/lock order to avoid cycles.

**Security limitation:** Native agents can access repository files using their OS permissions.
The instruction to write via Engine is a **cooperative protocol**, not proof of enforced path
isolation or that direct edits to `task.yaml`, `tasks/index.yaml` or `.execution/` are impossible.
Do not promise that security guarantee until an actual process sandbox enforces it. Validate
resulting artifacts and identify unsupported direct-file effects.

**Proof:** claimed agent writes through the Engine; concurrent UI and second-agent mutations,
stale/mismatched invocation, wrong workspace, out-of-scope Task and forged human approval refuse.
No ordinary writer becomes unblocked by the self-mutation exception.

### D12 — Durable finish submission, native stop and handoff

**Current limitation:** An agent may submit finish while still running tools. A stopped Session may
lack a valid Workflow result. The native claim settles only after positive stopped-process
evidence, and a Run may not be finalized outside that protection window.

**Decision:** Specify a crash-safe two-stage protocol: an invocation-bound, fingerprinted finish
submission is durably recorded as **pending**, not an accepted completed step. After positively
verified native stop, finalize the exact attempt and all committed Task/Document/Workflow effects
under the still-held reservation, then settle/release the claim without allowing an unrelated
writer to enter between those operations. An alternate ordering is acceptable only if it proves
the same no-gap property. Pending submissions cannot dispatch the next step. A stopped agent
without finish leaves the attempt unresolved for owner action. Unknown stop/side effects block
until reconciled, never time out as successful.

**Incremental mutations (R04):** An individual successful claim-owned Document write is durable
as soon as its own Engine journal commits. It is **not** a staged speculative edit waiting for
Workflow finish. If the agent crashes after two successful document edits but no valid finish,
both edits remain with their own revisions and auditable source. The Run remains unresolved;
the claim remains until native stop is positively proved. After reconciliation the owner may
inspect, repair, resume or **explicitly revert** selected revisions through ordinary versioned
Document operations. Never auto-rollback already accepted writes or mark the step complete.
Each Task resource create/edit is atomic _within that mutation_, while several previously
accepted Task drafts may remain visible after a failed producing step. The finish transaction
covers only its newly declared effects, not retroactive rollback of prior commits.

**Proof:** replay after crash at every stage (two incremental Document writes, pending submission,
stop receipt, Run publication and claim settlement), duplicate finish and late callback; the
same two edits survive failure without completed Workflow, no accepted operation is applied
twice, and no writer enters before verified native stop. A deliberate owner revert is
revision-checked and never an implicit cancel.

### D13 — Agent Task authoring and Workspace-bound context

An eligible producing attempt may use the **same** Engine Task commands as UI to create
complete `task.md`, other registered files, allowed Task Type, F20 typed context and a
dependency DAG. D06 prevents cancellation of unrelated manual drafts. Direct mutation of
resource metadata bypasses the supported cooperative protocol, but D11's OS access limitation
still applies.

**Three distinct sources:** (1) `nevo-specflow docs search` /
`GET /api/docs/search` currently indexes only the Runtime **project's configured
`docs.root`**, not a selected Worktree and **not** Specification/Task documents;
(2) Specification and Task documents are resolved by their resource-scoped Engine Documents
contract; (3) F20 explicit context entries can include repository documents, paths and
instructions with required/optional flags. No source inherits another source's authority.

**Open for E6:** bind every retrieval request and returned evidence to the agent's verified
`(projectId, workspaceId, workspace incarnation, checkout/root, branch/HEAD, document revision)`
where applicable. For Worktree-specific repository documents either provide an explicitly scoped
corpus/index with independent freshness/invalidation, **or read verified files from that
Worktree with provenance**. Do **not** silently send results from Runtime's project-wide
search index as though they came from a different checkout. A branch switch/rebind or document
revision change must invalidate or revalidate the context; never carry stale index/document
evidence into a new attempt. Expose search mode `hybrid|lexical` accurately. The chosen
agent CLI/skill/tool adapter must be tested; availability in Runtime is not automatic agent access.

**Proof:** an agent on two Worktrees with differing docs reads the expected checkout's
version, not the other's; rebind/branch change triggers invalidation/refusal or fresh resolution;
a Task's `task.md` and Specification's `overview.md` are never silently sourced from the
project-docs corpus. Three linked drafts carry verified context IDs/revisions, reject stale
references, survive retries without duplication, and still require human approval.

## 3. Additional unresolved integration constraints

- **Task status authority and schema cutover:** F20 owns `status` in `task.yaml`; the provisional execution record is replaced strictly, without a dual reader or migration. Invalid old-format records are reported explicitly rather than silently rewritten.
- **Definition kind registration:** Current `specs/definitions/kinds/index.ts` imports workflow kinds (Plan 06 F18). Move registration to a real composition boundary without inducing a cycle.
- **Task documents:** Extend existing Documents application semantics to a Task-scoped registry. Avoid parallel document editors, writers or revision systems.
- **CLI trust:** A local agent and owner using the same OS identity are not securely distinguishable merely by a CLI option or execution handle. Supported trust boundary must be documented; do not promise forged-owner prevention unless an enforceable mechanism exists. Refer to [local actor and human gates](../local-actor-and-human-gates.md).
- **Idempotency/claims:** F16 finish retry and F05 writable admission are relevant even without F01. Specify what is needed for the manual HTTP path and what remains an explicit limitation of unsupervised external agents.
- **Package viability:** A public neutral API should be tested with the existing Specification and Task consumers and a tiny independent test host. Test host is **evidence**, not a speculative production Automation feature. It should not force an unused action scheduler into E1.
- **Close and commits:** `terminal: completed` is not equivalent to Git archival, merge, push or successful tests. D07's minimum Close guard ships with the first Task/Run capability; reuse existing Close preflight, writer claims and commit queue.

## 4. E0 decision outcome

Before E1, promote D01, D02 and D09 and the minimal D03/D05 extension seams to authoritative architecture. Decide D03/D04/D06 and the minimum D07 Close guard before E2; D05 plus the Workflow Close guard before E4a or earlier E6a; full owner sign-off before E4b, D08/F19 before E5, D10–D12 before E6a and D13 before E6b (after F20/D06). The following are not implied approvals: package creation, step-schema change, `allowedExecutors`, Run-mode persistence, Task status location, generalized input DSL or mandatory Close blocking for every existing Specification.

The E1 contract must demonstrate an acyclic import graph, reusable coordination intents, a neutral Run identity, new-format pin/replay determinism and an intentional multi-resource persistence seam. Before E2/E4, prove the concrete journal boundary, a Task without SpecRun and a manual action with trustworthy attribution.
