---
id: adr.0026-agent-step-execution
type: adr
title: Agent step execution — an agent runs one workflow step through a Runtime broker
status: current
date: 2026-11-21
scope: specflow
areas: [workflow, runtime, ai, security, cli]
tags: [agent-execution, broker, capability, claims, commits, confirmation, trust-model]
summary: >
  The owner can let an agent run one Specification or Task step ("Run with agent"). The agent's
  product CLI writes through a per-user local broker of the Runtime, authenticated by a per-Turn
  capability and admitted as the Turn's own execution claim; its finish is a proposal the Engine
  finalizes with the claim settlement once the process is proven stopped; the Engine commits the
  attempt's attributable work as one commit at finish; decisions only the owner takes wait for
  Confirm or Reject. Access to owner routes is the configured authentication mode only; the
  protocol is cooperative, not containment.
related:
  - architecture.runtime.agent-step-execution
  - architecture.workflow.workflow-kernel
  - architecture.runtime.workspace-execution-claims
  - architecture.runtime.specification-documents
  - architecture.runtime.specflow-lifecycle
  - adr.0018-engine-commit-policy-and-manual-commit
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - adr.0024-tasks-are-resources
  - reference.api.specification-workflow
  - reference.cli.specflow-specification-commands
---

# 0026 — Agent step execution

## Status

Current. Owner decisions D11 to D20 of PR #169 (2026-11-16), the orchestrator decisions and plan
amendments of 2026-11-20, and the owner decisions of 2026-11-21 (no device pairing, naming, commit at
finish). Builds on [ADR 0023](0023-neutral-workflow-coordinator-and-manual-execution.md) (executors
and actors), [ADR 0024](0024-tasks-are-resources.md) (Tasks as resources) and
[ADR 0018](0018-engine-commit-policy-and-manual-commit.md) (commit policy, ledger, manual commit),
which it extends with the attempt commit and ledger authors. The proposal that led here is
`ideas.specflow-engine.reusable-workflow.agent-execution` (superseded).

## Context

A dogfood run on 2026-11-16 (PR #163 build) had one managed Session write a whole Specification, six
Tasks and a tested code change on this repository. A person had to do every Start, Finish, approval
and Task creation, and the run showed:

- **B1.** `tasks create` and `tasks edit` inside the agent's own Turn failed with `SPEC_BUSY`: the
  project-wide execution claim excluded every Engine writer, the agent's own CLI included.
- **B3.** Documents, Tasks and code the agent wrote were never committed; a finish committed only
  `.execution/`.
- **B6.** A new `decisions.md` was a file, not a registered document.
- **Gaps.** Every brief was typed by hand; about 30 permission prompts for read-only tools and the
  product CLI; the owner approved the breakdown and the Task review although the agent could have
  proposed them.
- **Review finding.** With `runtime.authentication.mode: none` any local process, the agent
  included, can call the owner routes.

The kernel already had an agent actor and the rule that an agent attempt with a `sessionId` is
resumed and finished only by that Session, but nothing started such an attempt, no trusted producer
built the actor, and writer admission ignored claims for workflow writes (F05).

## Decision

### Naming

The capability is **agent step execution** in code and API (`AgentStepExecution*`, routes
`.../workflow/agent-execution`); the UI action is **Run with agent** beside **Start step**, shown
only when the current step's `executors` include `agent`. "Ask agent" is not used in product copy.
Explanations of states and refusals are Engine data, never generated text.

### D11 — An invocation capability and a local broker

1. When a write Turn of a Specification-associated Session is admitted, the Runtime mints a
   **capability**: `nvcap_` plus 256 random bits, bound in the Runtime process to the invocation,
   Session, Turn, Specification (and Task), the claimed workspace, the scope and the agent actor.
   It is never persisted, compared in constant time, admits requests only while the Turn's claim
   is `dispatched` and is revoked when the Turn ends; revocation waits (bounded) for broker calls
   already running, and a call still running then makes the Turn `unknown` rather than settled.
2. The provider process gets `NEVO_AGENT_BROKER` (the endpoint) and `NEVO_AGENT_CAPABILITY` in its
   environment. The product CLI, finding the capability, sends every write to the broker and never
   opens the Engine for writing; a command that is neither a local read nor a brokered write is
   refused. Without a capability the CLI is unchanged, so an unrelated process is still refused by
   the claim.
3. The broker takes the actor, claim, Session, Turn, workspace and scope from the capability alone;
   a request that names any of them (or an owner, `ignoreClaims`, an operation id) is refused, not
   ignored. It derives the Engine operation id from the invocation id and the client's request id,
   checks the scope and that the Specification still lives in the claimed workspace, then calls the
   same Engine use cases the UI calls, as the Turn's **owned execution**.
4. **Owned-claim admission** has two forms: `turn` (the broker's writes, only while the named claim
   is `dispatched`) and `finalize` (only the Engine's own finalize section, any unsettled phase,
   `unknown` included). Every other unsettled claim still refuses the write. Every workflow write
   (start, finish, return, wait re-evaluation, abandon, every Task command, archetype edits,
   definitions install) is admitted against the claims with Git on or off (F05 closed for agent
   claims).
5. The broker is a per-user local endpoint, never a TCP port: a Unix domain socket in a fresh `0700`
   directory owned by the user, or a Windows named pipe with an unguessable name created with
   Node's default pipe security (orchestrator decision: no native ACL code).
6. An agent write to a path whose uncommitted ledger entry carries another author's operation is
   refused ("commit it first"), so no path mixes two authors' uncommitted changes.

### D11b — Turns without an attempt

A write Turn of a Specification-associated Session that is not an agent attempt (an ad-hoc
conversation) may create, save and classify documents of its home Specification. Task drafts and
a finish need an attempt.

### Scope of an attempt

Derived in the Engine from the attempt's journal and the step definition, never configured or taken
from a request: the documents of the subject (a Task's own documents for a Task subject), Task
create and edit only when the step declares `produces: tasks` (origin `produced` by that step), and
the finish proposal of exactly the bound step and attempt. Never a Task status decision, return,
Abandon, Close, manual commit, Confirm, Reject or a write to another subject.

### D12 — A finish proposal finalized with the claim settlement

The agent submits the owner's finish input plus the files it changed outside SpecFlow
(`changes.paths`). The Engine validates it completely with an owner's finish rules and the
attribution checks, and records it in the attempt's local journal; nothing in the execution store
changes during the Turn. Same proposal again is a replay; a different one replaces it while not
finalized; a proposal of an earlier or stopped Turn is refused.

Once the Turn ended and its process is proven stopped, `finalizeAgentAttempt` takes the project
control lock **once** and, through lock-held forms, journals what the finish is judged on (the
declared paths' content hashes as the attribution check read them), publishes the step state (the
proposal re-validated, or the owner's recorded return), records the attempt's journal (outcome, the
Turn's dirty set, the pending post actions) and settles the claim with the native-result receipt, in
that order. These are separate durable publications, not one transaction; while the claim is
unsettled no other writer is admitted, and recovery runs the same operation again (the finish
replays by its request digest, with the journaled hashes only: an edit made after a crash is never
attributed to the agent, and the attempt commit refuses it as changed). A re-validation refusal is recorded on the proposal, the claim settles and the
attempt stays active. Post actions run after the lock is released. A Turn's end never advances a
run; only a finalized proposal does.

### D13 — Context as references

The Engine extends the step context with the subject's registered documents, the document types
the agent may register and, for a Task, the resolved context as references with sha256 digests in
declared order (only `instructions` inline), bounded by budgets; the digest of the resolved context
is recorded on the attempt. The Runtime renders the brief from that data, wraps every value from
files, definitions or people in labelled untrusted fences, and generates the operations section
and exact CLI forms from the same command table the CLI routing reads, filtered by the Turn's scope.
`nevo-specflow workflow context` prints the same data.

### D14 and B3 — Attribution at the boundary

With Git on, the Engine judges the checkout (`git status`, ignored files never counted):

- a new attempt starts only from a baseline the Engine can attribute (`WORKFLOW_DIRTY_BASELINE`);
- Continue is refused while files changed since the previous Turn's recorded dirty set
  (`WORKFLOW_BASELINE_CHANGED`);
- a finish is refused while the Specification directory holds an uncommitted file without a
  document type (`WORKFLOW_UNREGISTERED_DOCUMENTS`), a SpecFlow file differs from its last Engine
  post-image (`WORKFLOW_ENGINE_FILE_EDITED`), the declared paths differ from the dirty set outside
  the Specification directories and the Engine namespace (`WORKFLOW_UNDECLARED_CHANGES`), or an
  untracked Git repository sits inside the checkout (`WORKFLOW_NESTED_REPOSITORY`).

The same checks run at submission and at the finalize re-validation. With Git off none of them run.

### D15 — One attempt commit, at finish

A finalized attempt gets one Engine-owned commit on the branch its checkout is on, whatever
`git.commits.auto.documents` says, made through the manual commit (its lease, journal, verification
and prune). It holds the Specification's ledger entries only the attempt's Turns made, judged by each
entry's durable author set (never truncated like the kept operation ids), and the declared paths
whose content still has the hash recorded at publication. An entry the attempt changed together with
someone else (`ATTEMPT_COMMIT_MIXED_AUTHORS`), a declared path that could not be hashed
(`ATTEMPT_COMMIT_UNATTRIBUTABLE`) or a path changed since (`MANUAL_COMMIT_CONFLICT`, naming it)
refuses the whole commit. Every write made under an attempt's Turn, or for it (its start), goes to
the ledger with its execution author whatever the commit policy, never to the automatic-commit
queue; the queue's other changes may be committed before it, never the attempt's. The owner's
`commit-execution-state` never takes an entry an agent Turn wrote (it holds it, with what travels
with it), so the agent's work is only ever in its attempt commit. The subject is `spec(<subject>): <step title> (attempt n) by agent in <slug>` with the
trailers `Nevo-Action: attempt-commit`, `Nevo-Attempt`, `Nevo-Step` (and `Nevo-Task`). It replaces
`commit-execution-state` for agent attempts. A failed commit fails nothing already published: the
owner retries it (`.../workflow/attempt-commit/retry`, `workflow retry-commit`). Running with an
agent is the owner's authorization to execute the step and to make that commit; there is no Accept
step. **Owner decision 2026-11-21:** the attempt commit also runs when the result then waits for
the owner's confirmation, so the owner decides on committed work and no agent work is left
uncommitted by a Reject.

**Admission while an attempt commit waits (owner decision 2026-11-23).** With Git on, while a
finished attempt's commit is pending or failed, every workflow write of its Specification (and its
Tasks) is refused before anything is written with `WORKFLOW_ATTEMPT_COMMIT_REQUIRED`, naming the
attempt: start, finish, return, wait re-evaluation, abandon, Confirm, Reject, Task create, edit,
removal and status, and a new agent start. It is one rule of the execution store's admission
(`attempt-commit-admission.ts`), not a check per command; writes under a running Turn's own claim
are not guarded (one claim at a time: such a Turn was admitted before the attempt finished, and it
writes only its own attempt's entries). Other Specifications are unaffected. The projection says it
before the click: `attemptCommit` names the attempt, `start`, `finish`, `return`, `confirm` and
`reject` carry `unavailable` (`attempt-commit-pending`, or `attempt-commit-failed` with its `code`),
the next step's agent option is unavailable with the same reason and the Task actions and New task
are `attempt-commit`. The owner retries the commit first.

**Document writes while an attempt commit waits (owner decision 2026-11-23).** The same wait guards
the agent's files outside the workflow store: the document writer's reservation (where it already
refuses an agent building on another author's uncommitted change) refuses every write not made
under one of the waiting attempt's own Turns to a path that commit takes (its ledger entries, mixed
ones included, and its declared paths): save, create, rename (both paths), move, delete and Task
document edits alike, the owner's included, with `DOCUMENT_COMMITS_PENDING` (`cause:
attempt-commit`, `paths`, the message naming the attempt), before anything is written or queued.
It is path-level: the other documents of the Specification stay editable (a create, which writes
`specification.yaml`, waits only when the attempt changed that file). The document tree says it
before the click: `attemptCommit` names the attempt and the held paths, their actions are
unavailable with reason `attempt-commit`, and the editor shows the note with Retry commit. So
neither a refused owner save nor, with automatic commits on, a queued owner commit takes the agent's
file, and the first Retry commits the attempt.

**Commits and Close while an attempt commit waits (owner decision 2026-11-24).** No other commit
takes a held path: the manual commit (Specification and Workspace scope, the owner's
`commit-execution-state` included) refuses a selection that contains one, at its admission and
again under the lock of its reservation, with the same `DOCUMENT_COMMITS_PENDING` (`cause:
attempt-commit`). The one exemption is the attempt's own attempt commit, identified by an
in-process authority minted for that attempt by the attempt commit runner, never by the caller
being internal. Close never accepts a held path as execution state it archives along (pending or
failed alike, for the closing Specification or a sibling) and refuses before it reserves
(`DOCUMENT_COMMITS_PENDING`, `commit-uncommitted`, the attempt listed in `attempts`, D16); the
archive effects check again. So a Retry always holds all of the agent's work.

**One source of truth (owner decision 2026-11-24).** Which uncommitted paths finished agent attempts
hold, and which operation may take them, is one Engine query (`attemptCommitHolds(workspaceId)`,
computed by the workflow from its attempt journals and the ledger), keyed by the checkout of the
Specification acted on, not the checkout the Engine was opened on. The workflow admission, the
document writer and tree, the manual commit, Close and the owner's `commit-execution-state` are
thin adapters over it; there is no second list of failed attempts or of agent executions.

**The wait fails closed.** An attempt journal that cannot be read, or a listing cut short (or, once
an attempt waits, a ledger record that cannot be read), may hide what waits: the workflow admission
refuses `WORKFLOW_STATE_CORRUPT`; the document writer, the manual commit and Close refuse
`COMMIT_BLOCKED` (`blockedBy: attempt-record-unreadable`; the tree reports `commit-blocked`); the
owner's `commit-execution-state` holds the agents' entries (`WORKFLOW_STATE_CORRUPT`), until the
record is repaired.

**Every owner change is the owner's commit.** Reject and a Return that applies now run
`commit-execution-state` like Confirm; a new agent attempt first commits the owner's uncommitted
workflow state of the Specification the same way, and is refused `WORKFLOW_DIRTY_BASELINE`, naming
the files, if any of it stays uncommitted (held by a hand edit, or a failed commit). The owner's
`commit-execution-state` is never `completed` while it left an owner change uncommitted because of
agent work: `failed` `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` (tied to a waiting attempt) or
`WORKFLOW_STATE_CORRUPT` (an attempt journal cannot be read, so the authors cannot be told), with
the held paths. A new agent attempt makes that commit only once its own start checks (expected
position, actor, readiness, context, entry gates) passed with nothing written. So
`ATTEMPT_COMMIT_MIXED_AUTHORS` is unreachable through SpecFlow's own actions; it stays as the
fail-closed refusal of a change made some other way.

### D16 — Close lists, never discards

Close keeps refusing dirty paths it does not archive. Its preview lists them as the
`uncommitted-changes` blocker; agent attempts whose commit failed are listed apart (`attempts`) with
the remedy "retry the attempt commit". The product has no discard operation.

### D17 — Owner authority and confirmation

The Engine classifies each effect by authority (`approve-draft-tasks` is owner authority); a
transition may declare `confirmation: owner`; non-empty `taskDecisions` are owner authority too. An
agent attempt's proposal that takes such a decision is finalized into the core position
`awaiting-confirmation`: the attempt ends with its transition, the drafts it produced are written,
its attempt commit runs, and nothing else applies. **Confirm** (owner only) takes the transition with
its Task decisions and effects as an ordinary owner write, judged again by every finish rule, and is
committed by the owner's normal path (`commit-execution-state`), never attributed to the agent; it
applies exactly what the owner was shown (`confirmsDigest`, else `WORKFLOW_CONFIRMATION_CHANGED`).
**Reject** returns the run to the step, ready, with the owner's feedback as its handoff. Both are
idempotent by a request id. An agent finish outside an agent attempt that takes such a decision is
refused (`WORKFLOW_OWNER_DECISION_REQUIRED`). A person's own finish needs no confirmation.

### D18 — Which Session

The kernel's continuation decides fresh or continued Session. An archetype declared `independent`
(a review facet; the shipped `reviewer`) always gets a fresh Session; definition validation refuses
`session: reuse` into its step. The owner may change provider and model only for a fresh Session;
the launch is recorded on the attempt.

### D19 — Stop, Return, Take over

Stop cancels the Turn; the claim stays held until the process is proven stopped. Return during a
Turn that may still run records a return request on the attempt and stops the Turn; the finalize
applies it as `returned`. Take over is an owner operation allowed once the last Turn's claim is
settled: the agent attempt ends `taken-over` (a new core outcome) and the owner's attempt of the same
step starts with the same handoff. **Take over commits nothing**: the owner's own finish commits the
workflow state as any owner finish does (with the agent's Task drafts it keeps), and the agent's
declared code changes stay uncommitted until the owner commits them, listed by Close. A Take over or
Return that lands after a Turn was bound but before its claim was admitted refuses that Turn's
admission. A late proposal of a returned or taken-over attempt is `WORKFLOW_ATTEMPT_MISMATCH`.

### D20 — Permission allowlist

An agent attempt Turn starts with the archetype's per-provider `permissions.allow`, else the
provider's default (every product CLI command of the command table). Rules are opaque provider
strings validated at load (over-broad rules such as an unrestricted shell or write tools are
refused) and applied only for that Turn, never merged with owner or project permissions. Only the
Claude driver applies an allowlist today; others report that it was not applied.

### Access is the configured authentication mode (D21 superseded)

Owner routes are protected by the configured authentication mode only (IdP, password, `none`); no
owner credential, device pairing, CSRF or owner header is added. In mode `none` the host knowingly
chose no authentication (for example behind a tunnel) and owns that risk: any local process, the
agent included, can call owner routes. Agent step execution works in every mode. The provider
environment never receives the user's login session or any credential the Runtime issues.

### Where per-attempt data lives

The attempt record's opaque `hostData` (neutral core) holds the binding: the attempt id, the
workspace, the context digest and the launch. The Turn bindings, the proposal and its refusal, the
last dirty set, the return request, the take-over, the confirmation state and the post actions are a
local journal under `<stateRoot>/engine/operations/agent-attempt/`, never committed, so a refused
proposal is never part of the Specification's history.

## Trust model and its limits

This is a cooperative protocol, not containment.

- The native agent keeps the OS user's write access. Any process of the same OS user can read the
  capability from the agent's environment, read the claim journals, or bypass the CLI; every child
  process of the agent (installers, test runners) carries the Turn's scope.
- What is enforced: the claim keeps every other Engine writer out; the broker admits only the Turn's
  scope while the Turn runs; owner routes refuse what the configured authentication refuses; the
  finish judges the real checkout, so a write past the Engine is detected, not trusted.
- **Windows.** The pipe has Node's default security: full control for the creating user, SYSTEM and
  Administrators, read for everyone else, which cannot send a request. Pipe names can be listed by
  any local user, so the random name hides nothing; every request still needs the capability.
- **Mode `none`.** Owner protection is absent by the host's choice; that is documented, not a defect.
- Stronger separation needs OS user separation or a sandbox, outside this decision.

## Consequences

- An agent can run a step end to end: write documents, Task drafts and code, and propose its result;
  the owner sees one committed attempt or an unresolved attempt with everything it produced.
- At most one agent execution runs per project (the claim stays project-wide); parallel Task
  worktrees need containment first (plan 06, F08).
- An agent never approves: approvals wait for Confirm.
- With Git off, no attribution check runs and nothing is committed.
- The broker, the capability registry and the finalize are new crash boundaries, each covered by
  replay from durable state (see [agent step execution](../runtime/agent-step-execution.md)).
- Not addressed: a Turn lost on a long tool call (B2, a Session driver defect), unattended
  continuation (F01), step events in the Specification Activity history, an MCP transport over the
  same broker.

## Rejected

- **A delegated claim file** the agent's CLI presents: any reader of the file holds the claim.
- **Releasing the claim for each CLI call**: breaks exclusion of other writers.
- **A loopback TCP broker**: every local user can connect; a per-user socket or pipe cannot be.
- **Native ACL code for the Windows pipe** (FFI): more native code for little gain while the
  capability authenticates every request.
- **Applying the finish during the Turn**, or deriving the result from the last message.
- **Committing only with auto-commit on**, letting the agent commit with Git itself, or a mandatory
  Accept step per agent step.
- **Device pairing and an owner credential on owner routes** (former D21): the configured
  authentication mode is the owner's choice; pairing added a second credential layer and, in mode
  `none`, protected nothing the host had not chosen to leave open. The draft is kept on the remote
  branch `draft/device-pairing`.
- **Committing the agent's work at Confirm** instead of at finish: a Reject would leave agent work
  uncommitted.
