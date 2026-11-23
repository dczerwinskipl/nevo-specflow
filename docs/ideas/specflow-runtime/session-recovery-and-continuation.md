---
id: ideas.specflow-runtime.session-recovery-continuation
type: architecture
title: Session recovery and work continuation
status: draft
scope: specflow
areas: [ai, runtime, workflow, security, testing, ui]
tags: [sessions, crash-recovery, continuation, handover, provider-neutral, durability]
read_when:
  - designing safe work continuation after a Runtime, host or provider interruption
  - comparing native provider resume with fresh-session context recovery or cross-provider handover
  - planning recovery UX, checkpoint evidence and restart fault-injection tests
summary: >
  Proposal for provider-neutral recovery assessments and durable work continuation across
  native resume, new Sessions and providers; reuses existing Session and Engine evidence,
  keeps uncertain effects blocked and separates context recovery from replaying execution.
related:
  - ideas.readme
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.execution-scopes
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.session-storage-and-lifecycle
  - architecture.runtime.workspace-execution-claims
  - reference.protocols.session-provider-driver
---

# Session recovery and work continuation

> **Draft proposal, not current product behaviour.** The implementation and current contracts win
> on conflict. Tracking issue: [#218](https://github.com/dczerwinskipl/nevo-specflow/issues/218).
> Agent step execution is being developed in [PR #169](https://github.com/dczerwinskipl/nevo-specflow/pull/169);
> any suggested changes to its attempt model are explicitly future work until accepted.

## Problem and desired outcome

Nevo can retain a canonical Session transcript and can reconcile many interrupted native
executions. This is **not** equivalent to preserving the user's work when the provider's native
conversation disappears or becomes unusable. A multi-day quota pause, host restart, provider
crash, unavailable account, or lost provider context can leave useful files, history and workflow
state without a usable native resume target.

The product should let a user inspect exactly what is still known, reconcile what can be proved,
and continue the same **work objective** using an eligible native context or a new Session.
Continuation must work for standalone Sessions as well as optional Specification/Task workflow
attempts; provider choice must not define the lifecycle of the work.

Three distinct promises:

1. **Data continuity:** retain application-owned Session/Turn/Work history and committed evidence.
2. **Execution reconciliation:** determine which dispatched effects are settled, unknown or require
   inspection, without resending a possibly executed command.
3. **Semantic continuation:** give a new invocation a bounded, attributed description of the
   objective, previous decisions, verified results, open work, artifacts and uncertainties.

Nevo cannot restore hidden model state, regenerate unpersisted output or resurrect a third-party
cloud Remote Control environment that it does not own. Semantic continuation is a documented
replacement for lost provider context, not a claim of identical model state.

## Baseline: existing authority and gaps

Current authorities (see linked current documents):

- Runtime Sessions owns application `sessionId`, `turnId`, `invocationId`, SQLite,
  conversation/history/content, durable request idempotency, provider selection and native binding.
- Engine owns workflow positions/attempts, deterministic gates and Git/file mutation journals.
- Engine workspace execution claims prevent conflicting writes until positively settled.
- Runtime persists dispatch barriers and process identity, reconciles positive native-stop evidence,
  keeps uncertain work `unknown` and does not automatically replay provider input.
- Provider drivers own their specific native-context compatibility and invocation protocol.
- In PR #169, an agent workflow attempt is tied to a specific Session/provider; its journal and
  `finalizeAgentAttempt` are separate from the native Turn outcome.

Missing capability: a provider-neutral, user-facing **recovery assessment plus continuity
handoff**. No new mechanism may invent a successful workflow finish merely because a Turn stopped.
Native resume support is **not** a guarantee that the original native context still exists.

## Boundaries and proposed ownership

| Component                                 | Owns                                                                                                                                                    | Must not own                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Sessions (Runtime)                        | Session/Turn history, continuation lineage, accepted continuation intent and target Session creation                                                    | Workflow gates, Engine writer claims, authoritative Git outcome                      |
| RecoveryCoordinator (Runtime composition) | Read-only assessment, safe sequencing of existing reconciliation, provider eligibility checks, continuation context compilation and action coordination | A second canonical workflow/claim store, a force-release path                        |
| Engine                                    | Workflow attempt transitions, exact execution claims, Git effects and their receipts, workspace identity and baseline checks                            | Vendor conversation formats, summary generation                                      |
| Provider adapter                          | Native resume eligibility and transport-specific readiness; start of a validated new invocation                                                         | Decision to accept uncertain workspace effects or silently switch execution identity |
| UI                                        | States, evidence, explicit owner choices and review actions                                                                                             | Inferring success, force-unlocking claims or reconstructing state from partial SSE   |

This is composition above independent Sessions. No workflow attempt is created for a standalone
chat. Associations to Specification/Task are optional context, not Session identity or authority.

### Identity and immutable lineage

Keep application Session identity and native provider locator separate. Do **not** change an
existing Session's pinned provider/account/native context in place to represent a new provider
conversation. Native resume creates a new Turn of the same Session if validated. Lost native
context or a different provider creates a **new application Session** with an immutable predecessor
link (`sourceSessionId`, `sourceTurnId?`, `recoveryId`, creation timestamp and reason).

The UI can present the linked Sessions as one line of work while their independent histories,
permissions, identities and accounting remain intact. The predecessor remains readable and
auditable; lineage must not imply inherited authorization or inherit an unsettled claim. The
continuation link is written transactionally with the new Session admission.

Proposed constraints: no cycles; one accepted continuation command is idempotent; a Session may
have several explicitly chosen successors, but each one records its own action and provenance.
Do not introduce a global mutable "current agent" pointer.

## Assessment before any continuation

A recovery **assessment** is a bounded, read-only projection from the authoritative stores, with
a revision/observed-evidence digest. It is re-evaluated under admission before effects occur;
assessment alone does not guarantee a later action can still run.

Inputs:

- canonical Session, latest Turn state, persisted transcript and native binding;
- provider availability, account/workspace compatibility and context eligibility;
- Engine claim status, native process evidence, active workflow attempt and pending post-actions;
- verified workspace incarnation and Git baseline/artifact identities;
- open interactions, accepted commands and any unresolved tool side effects.

Candidate user-facing results:

| Result            | Meaning                                                                                             | Allowed next action                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ready-native`    | Original provider context is eligible and previous invocation is settled                            | Validate again and create the next Turn in the same Session              |
| `ready-fresh`     | The previous writer is settled and a new context may be prepared                                    | Create a successor Session with bounded context                          |
| `review-required` | Process settled, but changed files, partial output or tool effects need human reconciliation        | Inspect artifacts/diff and record explicit disposition first             |
| `blocked`         | Writer may still run, claim unresolved, provider identity uncertain or workspace cannot be verified | Reconcile through existing positive evidence or guided operator recovery |
| `unavailable`     | Required persisted history, identity or workspace is corrupt/missing                                | Explain missing evidence; no invented "recovery succeeded"               |

The projection is not a second persisted state machine. Persist accepted owner decisions,
reconciliation receipts and new Session lineage, not a competing copy of the claim/Turn state.
On each subsequent attempt, recompute eligibility and detect changes in its revision.

**Ordering:** verify authorization and project scope -> inspect canonical Turn and claim -> collect
positive process/operation evidence -> reconcile using existing Engine/Runtime paths -> verify
workspace/baseline -> evaluate provider-native eligibility -> prepare continuation context ->
revalidate under effect admission -> dispatch once.

A stopped process proves only the process stopped, not that every detached external effect or Git
operation finished. Do not equate `PROCESS_STOPPED` with "feature implemented".

## Provider-neutral continuation context

A `ContinuationContext` is a versioned, bounded **rendered input**, not an independent source of
truth. Compose it from immutable references and verified snapshots when the user requests
continuation or after a settled Turn; do not rely on a crash-time summarizer to run.

Candidate fields (exact schema deferred to contract design):

| Group                 | Source and expected content                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Identity              | `recoveryId`, predecessor Session/Turn, optional workflow subject/step/attempt                 |
| Objective             | Original user request and explicit owner instructions with provenance                          |
| Decisions             | Owner-approved decisions, handoffs and outstanding confirmations                               |
| Progress              | Completed Turns, accepted workflow transitions, tool results marked as observed vs proven      |
| Artifacts             | Content IDs/revisions, workspace incarnation, Git HEAD, commit IDs, paths and content hashes   |
| Open work             | Remaining tasks, latest failed/interrupted operation, unanswered questions                     |
| Uncertainty           | Unknown dispatches, partial streams, unverified edits, failed post-actions, stale interactions |
| Execution constraints | Permitted operation scope, provider selection, workspace and current gates                     |

Avoid copying the whole transcript, storing credentials, reusable broker capabilities,
unredacted tool secrets or provider-private chain-of-thought. Use existing chunked content,
bounded history reads and redaction; store minimal source references and a digest/version for any
materialized checkpoint. Labels such as "completed" need provenance: Engine evidence, verified
artifact, observed tool response, or untrusted model summary. Never upgrade a model summary into
an authoritative finish/commit.

A summary may improve prompt size but is **lossy and untrusted**. Preserve user decisions and
verifiable records separately; on conflicts, canonical stores and fresh workspace checks win.
Cap tokens/bytes and use a priority policy: safety/uncertainty -> task objective -> owner
decisions -> verified outcomes -> next actions -> selected historical detail. If required safety
context does not fit, refuse continuation rather than silently truncate it.

Suggested checkpoints are created at safe boundaries (settled Turn, accepted workflow transition,
operator review); crash recovery also derives an assessment from persisted partial facts. Never
promise that bytes emitted but not durably stored before power loss can be reconstructed.

## Continuation paths

### 1. Native resume

Use the existing Session only if the previous Turn/claim is settled, workspace identity and
account scope are verified, the adapter confirms compatible native context and the next Turn's
readiness is valid. The adapter may report **eligible**, **ineligible** or **unavailable/unknown**;
no vendor-specific condition leaks into Engine. Eligibility inspection must not send prompts,
create a native Turn or consume a one-shot interaction.

A native resume still uses a new admitted Turn, dispatch intent and invocation ID. Revalidate
at the dispatch boundary. If validation fails, return an actionable error, **not** an implicit
fresh native thread after a possibly dispatched operation.

### 2. Fresh context, same provider

When native resume is unavailable but effects are settled, create a **new Nevo Session** with
explicit predecessor lineage, the original verified workspace scope and the chosen provider.
Deliver the bounded continuation context to its first Turn; do not simply replay the previous
last user prompt. Previous interactions expire and require fresh authorization/answers.

### 3. Fresh context, different provider

Identical to (2) after validating the new provider's model/mode, account readiness, tool policy
and permitted execution scope. Provider-native IDs and approvals never transfer. A handover
may not bypass pending workflow approvals, Git recovery or a blocked checkout.

### 4. Workflow-bound agent attempt

A recovered conversation is **not** authorized to finish the predecessor attempt just because it
contains the same Task in the prompt. Under PR #169 the attempt actor carries the original
Session and provider. A cross-Session handover therefore requires an explicit Engine transition,
with expected position and exact predecessor attempt, authorized owner intent and journaling.

Preferred proposal: terminate/record the interrupted attempt without inventing a successful
finish, keep its artifacts and any uncertain effects, and start a **new attempt at the same step**
with a distinct actor and predecessor reference **after** all claims and dirty changes have been
settled or reviewed. This needs a new Engine-supported interruption/restart transition; do not
misuse Return, Take over, Confirm, or a manual edit to the actor binding.

An alternative is per-attempt actor epochs and explicit transfer, but that greatly expands the
authorization and replay surface. Compare both during design review before choosing. Neither
approach may advance a gate automatically. Existing attempt commit and dirty-baseline rules need
an explicit treatment for previously produced uncommitted files; do not reset a baseline to
conceal them or attribute them to the new agent.

## Proposed interface (not implemented)

An initial read-only view can be composed without a new persisted workflow phase:

- `GET /api/sessions/{sessionId}/recovery` -> assessment with evidence and allowed actions;
- `POST /api/sessions/{sessionId}/continuations` -> `requestId`,
  `expectedAssessmentRevision`, `mode: native|fresh`, optional provider selection and an explicit
  owner-reviewed disposition reference when required;
- a workflow-specific Engine action only after the actor/handover decision is accepted.

Treat these as candidate routes, **not** part of the current OpenAPI. Use existing Runtime auth
and per-project permissions; a Session association does not grant project write rights.
A continuation POST is exactly idempotent per request/payload. Replaying a previously accepted
request returns its original successor/Turn rather than starting another one. A different payload
for the same key conflicts. The write path must recheck stale assessment revisions.

The UI should show "Resume original session", "Continue in new session", "Change provider" only
when eligibility is established. A blocked or review-required result must say why and present
evidence before offering a safe next action. No silent fallback or auto-dispatch on UI reload.
Retain access to predecessor transcript and relevant diffs. The default should **not** create a
new provider Turn merely because the app restarted.

## Failure matrix and acceptance evidence

| Fault window / case                                       | Minimum evidence and expected behavior                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Crash before dispatch intent                              | Existing admission recovered; no phantom provider input                                              |
| Crash after dispatch intent, before native correlation    | Unknown unless positive evidence; never replay input                                                 |
| Runtime/host crash during writable Turn                   | Verify exact stopped process identity and claim settlement; preserve partial history and dirty files |
| Limit/auth failure before dispatch                        | No effect, explicit unavailable state; context remains durable                                       |
| Limit/auth failure after dispatch                         | Follow recorded native/claim facts, not the error message alone                                      |
| Lost native context after several days                    | Fresh successor possible once safe, with predecessor lineage                                         |
| Native resume incompatible with rebound/missing workspace | Refuse; do not reuse a native context in another checkout                                            |
| Provider switch during unfinished workflow attempt        | Explicit Engine interruption/handover, no actor spoof or gate advance                                |
| Tool call or broker write in flight                       | Block or review until effect outcome is known; do not release based on time                          |
| Dirty workspace from interrupted Turn                     | Preserve/compare artifacts; no blind reset, overwrite or unscoped commit                             |
| Crash during workflow finish / attempt commit             | Existing journal and idempotent operation evidence decide; do not retry ambiguous external effects   |
| Lost HTTP ACK, retry or repeated owner click              | Same accepted request returns same target Session/Turn                                               |
| Corrupt Session database or missing worktree              | Fail closed with recovery evidence; no silent new empty history                                      |
| Secret in transcript/tool output                          | Redaction preserved in continuation input and logs                                                   |
| Two simultaneous continuation requests                    | CAS/serial admission; no duplicate successor for one idempotent intent                               |

### End-to-end DoD

1. A real provider/mock-controlled agent starts implementing a feature, creates and edits files,
   enters a workflow step and is interrupted by Runtime kill or host restart.
2. On restart, Nevo shows the persisted history, last known evidence and a correct
   `ready-native` / `ready-fresh` / `review-required` / `blocked` assessment.
3. After mandatory reconciliation, the owner continues without copying the old transcript by
   hand. The original native context may be deliberately unavailable.
4. The next agent sees the objective, owner decisions, verified artifacts and warnings about
   unknown work; it completes the feature through normal Engine workflow gates.
5. No duplicate accepted command, no forged success, no duplicate commit, no accidental
   write-claim release and no loss of persisted changes.
6. Test deterministic crash cuts with a controlled mock provider and process harness on
   Windows, Linux and macOS; cover Claude/Codex native-eligibility compatibility separately.
7. Tests cover standalone conversations and workflow attempts. UI demonstrates recovery and
   errors on desktop and narrow layouts; current OpenAPI and architecture are updated only when
   the implementation ships.

Proof must include effect and artifact state, not just the existence of Session rows or a
successful prompt exchange.

## Delivery slices

| Slice | Deliverable                                                                                             | Dependencies                              |
| ----- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| R0    | Audit and design decision: existing recovery paths, actor binding, data retention, provider eligibility | Current Session contracts and PR #169     |
| R1    | Read-only `RecoveryAssessment` with truthful reasons and UI inspection                                  | Existing reconcile/process evidence       |
| R2    | Bounded `ContinuationContext`, provenance, redaction and checkpoint references                          | Session history/content, Engine artifacts |
| R3    | Native resume validation + fresh successor Session with idempotent lineage                              | R1–R2                                     |
| R4    | Workflow attempt interruption/restart or explicit actor-epoch handover                                  | Engine review of PR #169 model, R3        |
| R5    | Cross-provider handover, complete UX and fault-injection E2E                                            | R3–R4                                     |
| R6    | Optional local-state backup/restore and portability policy                                              | Separate security/retention proposal      |

R0 should identify what is already shipped rather than reimplement process/claim recovery.
R1–R3 are the smallest useful increment for the original lost-provider-context case.
R4 is required before promising equivalent continuation of an *active workflow attempt*.

## Non-goals and open decisions

**Not in first implementation:** restoring provider-private hidden thinking, resurrecting
third-party cloud workspaces, automatic replay of arbitrary Bash/HTTP effects, cross-machine
live process migration, treating checkpoints as a replacement for local backups, or fully
unattended continuation after a detected crash.

Decisions to resolve before implementation:

1. Does the workflow model gain an explicit `interrupted` attempt outcome/new same-step attempt,
   or an owner-mediated actor-epoch transfer? Verify both against current attempt replay rules.
2. Which facts can prove a dirty baseline is safely adoptable by a successor, especially when
   previous attempt commit failed? Which cases remain owner-only?
3. Which provider readiness probes are genuinely side-effect-free and available on every supported
   CLI version? `unknown` must not be coerced to `eligible`.
4. When and where are optional checkpoint summaries materialized, how long retained, and how are
   cost/size bounds and sensitive content handled?
5. What backup scope and restore procedure protects Session SQLite, Engine journals and worktrees
   together without treating a partial copy as a verified state?

Promote only accepted behaviour into current architecture, provider reference, product UI and
OpenAPI documents. This idea remains a backlog input, not an implementation instruction.
