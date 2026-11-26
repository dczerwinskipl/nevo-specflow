---
id: architecture.workflow.workflow-agent-attempts
type: architecture
title: Workflow agent attempts, owner confirmation and the attempt commit
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - changing how an agent attempt starts, proposes, finalizes or commits (Run with agent)
  - implementing owner Confirm, Reject, Stop, Return or Take over of an agent attempt
  - reviewing attempt attribution, the attempt journal or the workflow history
summary: >-
  Engine side of agent step execution: attempt binding and journal, the finish proposal, attribution
  checks, finalize after the agent's process stopped, owner confirmation of owner-only decisions,
  Stop/Return/Take over, the workflow history and the attempt commit.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-definitions-and-gates
  - architecture.workflow.workflow-storage-and-recovery
  - architecture.runtime.agent-step-execution
  - architecture.runtime.document-commit-policy
  - adr.0026-agent-step-execution
---

# Workflow agent attempts

## Agent attempts

An agent attempt is the attempt an agent works on when the owner runs a step with an agent ("Run
with agent"; [ADR 0026](../decisions/0026-agent-step-execution.md)). The Engine side is
`workflow/agent/`; the Runtime side (capability, broker, Session and Turn) is
[agent step execution](../runtime/agent-step-execution.md). Every operation below runs in the
workflow's `serialize` section (the project control lock) and is admitted against the writer
claims like every other workflow write.

**Start and binding.** `startAgentAttempt` is the ordinary start with three additions: a trusted
`AgentActor` whose `sessionId` the Runtime chose, an **expected position** (a new attempt of
`step`, or Continue of the active attempt `step#attempt`; a stale one refuses before anything is
written), and the baseline admission (below). The attempt's `hostData` is its binding
`{kind: agent-attempt, attemptId, workspaceId, contextDigest?, launch: {session, effort?}}`
(`agentAttemptBindingOf`), committed with the run. `contextDigest` is the Task context digest of
the agent context the start reads in the same section, before anything is written; the start
returns that context, so the Turn is briefed with exactly what the attempt records. The same section
then records the Turn `{invocationId, turnId, boundAt, contextDigest?}` in the attempt's local
journal (the digest the Turn is briefed with: a Continue's is the context when it is bound); each Continue appends a Turn (at
most 100), and a Turn is bound only once the one before it settled, because every write is refused
while an unsettled agent claim exists. A crash between the two leaves an active attempt with no
Turn, which the same Session continues.

**Journal** (`journal/`, `<stateRoot>/engine/operations/agent-attempt/<attemptId>.json`, `settled/`
once nothing is left to run): the subject, step, attempt and actor, the Turns, the finish proposal,
the last settled Turn's dirty set, the owner's return request, the take-over, the confirmation state
and the post actions with what their last run reported (for the attempt commit: the commit's sha
and how many of its paths SpecFlow wrote and the agent declared, counted when the run is recorded,
which the history's `work.commit` serves). It is local and never committed, so a refused proposal is never part of the
Specification's history. A journal that does not parse fails closed (`WORKFLOW_STATE_CORRUPT`).

**Proposal** (`proposal/propose.ts`). The agent's `workflow finish` is not a finish:
`proposeAgentFinish` validates the input completely with `planFinish` (legal transition, feedback,
exit gates, open Tasks, draft conflicts) plus the attribution checks, and records it as the
journal's `proposal` (`pending`), with the declared `changes.paths` and the finish digest. Only the
attempt's current Turn submits, while its claim is `dispatched`; the same proposal again is
`replayed`, a different one `replaced` while not finalized; a proposal of a stopped or replaced Turn,
or of an attempt the owner returned or took over, is `WORKFLOW_ATTEMPT_MISMATCH`.

**Attribution** (`boundary/`, with Git on; with Git off nothing is checked). The facts are the
checkout's `git status` (ignored files never count) and, for each dirty path, the Engine's
uncommitted writes of it; a path is the Engine's when its bytes are the post-image of its latest
uncommitted write. Facts that cannot be read in full attribute nothing (fail closed).

| Check                                                  | When                                                  | Refusal                           |
| ------------------------------------------------------ | ----------------------------------------------------- | --------------------------------- |
| Clean baseline but for the Engine's own writes         | a new attempt, or one none of whose Turns settled yet | `WORKFLOW_DIRTY_BASELINE`         |
| Nothing changed since the previous Turn's dirty set    | Continue (start and dispatch)                         | `WORKFLOW_BASELINE_CHANGED`       |
| No uncommitted file without a type in a Spec directory | proposal and finalize                                 | `WORKFLOW_UNREGISTERED_DOCUMENTS` |
| No SpecFlow file differs from its Engine post-image    | proposal and finalize                                 | `WORKFLOW_ENGINE_FILE_EDITED`     |
| Declared paths equal the dirty set outside SpecFlow's  | proposal and finalize                                 | `WORKFLOW_UNDECLARED_CHANGES`     |
| No untracked Git repository inside the checkout        | proposal and finalize                                 | `WORKFLOW_NESTED_REPOSITORY`      |

"Outside SpecFlow's" means outside the Specification directories (from the configured
Specification root) and the Engine's namespace (from the Project Home), never hardcoded paths.
`details.attribution` names the paths (at most `ERROR_DETAIL_PATHS_MAX`, with the count).

**Finalize** (`finalize/finalize.ts`). Once a Turn ended and its process is proven stopped, the
Runtime calls `finalizeAgentAttempt(attemptId, intent, receipt)`. It takes the control lock once
and, admitted under the `finalize` form of the Turn's own claim
([workspace execution claims](../runtime/workspace-execution-claims.md#the-project-wide-resource)):

1. publishes the step state: the owner's recorded return request applies as `returned`; else the
   pending proposal is re-validated with exactly its recorded actor and input (attribution
   included) and published as the attempt's finish, with the declared paths' content hashes as
   judged now; a refusal publishes nothing and is recorded on the proposal (`refused`);
2. records the journal: the outcome, the Turn's `finalizedAt` and the checkout's dirty set, and the
   post action `attempt-commit` as `pending`;
3. settles the claim with the native-result receipt (`settleWorkspaceExecutionInSection`).

Store change first, settlement last: two durable publications, not one transaction; no other
writer is admitted in between. The same finalize again is the recovery (a published finish replays
by its request digest, a recorded journal is not written again, the settlement repeats with the
same receipt). Errors that are no verdict (corrupt state, busy, source unavailable, a document write
of the Turn still open) leave the claim held and the proposal pending. A Turn without a proposal
ends as `turn-ended`: the attempt stays active and the owner can Continue, Take over or Return.
Post actions run after the lock is released (`finalize/post-actions.ts`); a failed one stays
`failed` for the owner's Retry commit and is never retried by recovery on its own. One a crash left
`pending` is run by recovery at the next Runtime start, or by the owner's Retry commit at once
(the same operation id and locks; refused `WORKFLOW_SPECIFICATION_BUSY` `commit-in-progress` while it
runs in this process, `agent-turn` while the last Turn's claim is not settled yet).

What the finalize judged a proposal on (`proposal.judged`, the declared paths' hashes) is journaled
before the step state is published, and once recorded it is final: a finalize run again after a crash
at any point past that record takes those hashes and never judges the checkout again, so an edit
made in between is refused by the attempt commit (naming the path), never committed as the agent's.

### Attempt commit

The attempt commit (`finalize/attempt-commit/`, ADR 0026, D15) is the attempt's one commit, in place
of `commit-execution-state` ([commits of the execution state](workflow-storage-and-recovery.md#commits-of-the-execution-state)).
A finalized agent attempt runs the post action `attempt-commit` whatever `git.commits.auto.documents`
says, after the finalize section released the lock: one manual commit (lease, journal,
verification, prune) on the branch the checkout is on, holding the Specification's ledger entries
that only the attempt's Turns made (judged by each entry's durable `authors`, never truncated, see
[the ledger](../runtime/document-commit-policy.md#uncommitted-ledger);
the attempt's start and finalize attribute their execution state to its Turns) and the declared
paths whose content still has the hash recorded at publication. With automatic commits on, the
Specification's document queue drains first.

- Subject `spec(<task id | specification>): <step title> (attempt n) by agent in <slug>` (a shorter
  form is taken whole when it does not fit), a body naming the agent's provider and model by the
  model's catalogue title recorded at the start, trailers `Nevo-Action: attempt-commit`,
  `Nevo-Attempt`, `Nevo-Step`, `Nevo-Model` (the model id) and, for a Task, `Nevo-Task`.
- An entry the attempt changed together with someone else (`ATTEMPT_COMMIT_MIXED_AUTHORS`), a
  declared path that could not be hashed (`ATTEMPT_COMMIT_UNATTRIBUTABLE`) or a path changed since
  (`MANUAL_COMMIT_CONFLICT`, a genuine foreign edit: restore it or commit it by hand) refuses the
  whole commit. A mixed entry is unreachable through SpecFlow's actions (see
  [While an attempt commit waits](#while-an-attempt-commit-waits)): its refusal names the files and
  suggests no Git remedy; the step stays published, the
  result reports `postActions: [{action: attempt-commit, status: failed, code}]`, and the owner
  retries it (`.../workflow/attempt-commit/retry`, `workflow retry-commit`).
- It runs also for a result that then waits for the owner's confirmation; the owner's later Confirm
  is committed by `commit-execution-state`. A Take over commits nothing. Push stays out of scope
  (ADR 0018).
- The owner's `commit-execution-state` leaves out only what an attempt commit still takes: the
  entries of the Turns of an attempt in progress, or of a finished one whose attempt commit is
  pending or failed (`executions` of the attempt holds of the Specification's own checkout, see
  below). The execution state of an attempt that ended
  without its own commit (taken over, returned) has no other commit: the owner's next one takes it.
  It is never `completed` while it left an owner change uncommitted because of agent work: an
  owner's change tied to waiting agent work (closed under operations, or inside the same entry)
  fails `WORKFLOW_ATTEMPT_COMMIT_REQUIRED`, and agent-written execution state while the attempt
  journals cannot all be read fails `WORKFLOW_STATE_CORRUPT`; both name the held paths (`held`).

### While an attempt commit waits

**One source of truth.** Which uncommitted paths finished agent attempts hold, and which operation
may take them, is one query: `readAttemptCommitHolds` (`finalize/attempt-commit/holds.ts`), the
engine port `attemptCommitHolds(workspaceId)`, keyed by the checkout of the Specification acted on.
Per attempt whose commit is pending or failed it returns the wait (named attempt, reason, code), the
Turns whose writes are its own and the paths its commit takes (its ledger entries, mixed ones
included, and its declared files); it also returns the agent executions an attempt commit still
takes (the Turns of an attempt in progress or of a held one). It fails closed (`readable: false`)
when an attempt journal or a ledger record cannot be read, or a listing was cut short. Every
admission below is a thin adapter over it: the workflow's (`specificationAttemptCommitWait`, which
resolves the Specification's checkout), the document writer's and the document tree's, the manual
commit's, Close's and the owner's `commit-execution-state`.

With Git on, while a finished attempt's commit is pending or failed
(`specificationAttemptCommitWait`), every workflow write of its Specification is refused before
anything is written (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`, naming the attempt): the execution store's
admission (`attempt-commit-admission.ts`, beside the claim and Close guards) refuses every non-empty
change not made under a Turn's own claim, so start, finish, return, wait re-evaluation, abandon,
Confirm, Reject, the Task commands and an agent's start are refused alike; Confirm and Reject ask
it before they plan. A Turn's own writes and its finalize are not guarded: one claim at a time, so
a running Turn was admitted before the attempt finished; refusing its finalize would hold its claim,
which the waiting commit's retry needs settled. The wait fails closed: a journal that cannot be read
(or a listing cut short) may be the one that waits, so every workflow write is refused
`WORKFLOW_STATE_CORRUPT` until it is repaired. Other Specifications are unaffected.

The agent's files are guarded at the document writer too (the same holds): while the commit
waits, a document write not made under one of the attempt's
own Turns to a path that commit takes (its ledger entries, mixed ones included, and its declared
paths) is refused under the reservation lock before anything is written or queued
(`DOCUMENT_COMMITS_PENDING`, `cause: attempt-commit`, naming the attempt and the paths; the owner's
save, create, rename, move, delete and Task document edits alike). The other paths stay writable.
The document tree reports the same holds (`attemptCommit`, actions `attempt-commit`); holds that
cannot be read refuse every write `COMMIT_BLOCKED` and show `commit-blocked`. See
[document commit policy](../runtime/document-commit-policy.md#agent-writes).

No other commit takes those paths either: the manual commit (Specification and Workspace scope, and
the owner's `commit-execution-state`) refuses a selection that contains one, at its admission and
under the lock of its reservation, with the same `DOCUMENT_COMMITS_PENDING`, `cause:
attempt-commit`; only the attempt's own attempt commit is exempt, proven by an in-process authority
the attempt commit runner mints for that attempt. Close never accepts them as execution state it
archives along, pending or failed alike, and refuses before it reserves
([Close lifecycle](../runtime/specification-close-lifecycle.md)). So a Retry always holds all of the
agent's work.

The projection (`withAttemptCommitWait`) shows it for every affected action: `attemptCommit` names
the attempt and its subject (Retry commit), `start`, `finish`, `return`, `confirm` and `reject`
carry `unavailable {reason: attempt-commit-pending | attempt-commit-failed, code?}`, the next
step's agent option is unavailable with that reason (`detail`: the code), the Task actions and New
task are `attempt-commit`.

**Owner commits around an attempt.** Reject and a Return that applies now commit the owner's
change at once (`afterOwnerChange`, the ordinary `commit-execution-state`, results in
`postActions`). A new agent attempt runs the same commit first, once the start's own checks passed
in a section that writes nothing, so it starts where SpecFlow's own
workflow state of the Specification is committed (an owner's Task edit, start or deferred return
included), and is refused `WORKFLOW_DIRTY_BASELINE`, naming the files, if any of that state is
still uncommitted and dirty (`ownerWorkflowState`: held by a hand edit, or a failed commit). A Take
over commits nothing: the owner's attempt it starts is committed by its finish, and no agent can
start meanwhile. So no agent entry ever shares a ledger entry with another author through SpecFlow's
actions.

### Owner confirmation

A decision only the owner takes (see [effect authority](workflow-definitions-and-gates.md#executor-admission))
does not apply from an agent's proposal. The finalize publishes the proposal as the core `finish`
with `confirmation`: the attempt ends with its transition and `outcome`, the record carries
`confirmation: {state: pending, hostData?}` (the host data holds the Task decisions,
`owner-decisions`), and the run is `awaiting-confirmation`. The Task drafts the attempt produced are
written; nothing else applies. The attempt commit runs now, as for a finished attempt (owner decision
2026-11-21), so the owner decides on committed work.

- **Confirm** (`confirmAgentResult`, core `confirm`): takes the held transition with the owner as
  actor, with the Task decisions and the effects (for example `approve-draft-tasks`), judged again by
  every finish rule on the state as it is now (a refusal leaves the result waiting). It applies
  exactly what the projection showed: the request names `confirmsDigest` (the drafts it approves
  with the content revisions of their manifests and documents, and the Task decisions); another
  digest is `WORKFLOW_CONFIRMATION_CHANGED`. With Git on, it applies only once the attempt commit
  ran ([while an attempt commit waits](#while-an-attempt-commit-waits): `actions.confirm.unavailable`,
  Retry commit first). The change is an ordinary owner write,
  committed by the owner's `commit-execution-state` post action, never attributed to the agent's
  Turns; that commit never takes a ledger entry an agent Turn wrote.
- **Reject** (`rejectAgentResult`, core `reject`): the transition is not taken; the run is `ready` at
  the attempt's step with the owner's feedback (required) as its handoff (`kind: return`). Nothing the
  agent wrote is undone; it was committed with its attempt. With Git on it waits for the attempt
  commit exactly like Confirm (`actions.reject.unavailable`), and its run write is committed by the
  owner's `commit-execution-state` at once (`postActions`), so the next attempt starts clean.
- Both take a request id: the same request again is replayed; a confirm or reject of an attempt
  another request decided is `WORKFLOW_ATTEMPT_MISMATCH` (for a confirmed one: repeat that request,
  or Retry commit for its owner commit); with nothing waiting `WORKFLOW_POSITION_INVALID`. While a
  result waits, start, finish and return are `WORKFLOW_POSITION_INVALID`. The confirmation state is
  recorded in the attempt's journal after the store change, and repaired from the run by the next
  decision after a crash.
- The attention item `awaiting-confirmation` (actions `confirm-result`, `reject-result`) names the
  waiting result on the Specification or the Task.

### Stop, Return and Take over

- **Stop** is the Runtime's cancel of the Turn; nothing changes in the run. Once the process is
  proven stopped the finalize records `turn-ended`.
- **Return** (`returnDuringAgentAttempt`). Every rule of the return is judged now. If no agent
  Turn may still run (its claim settled or never admitted), it applies now, as `returnToStep` does.
  Otherwise the return is recorded on the attempt (`returnRequest: requested`), admitted under the
  Turn's own unsettled claim, without writing the step state; the Runtime stops the Turn and the
  finalize applies it as `returned` (a pending proposal is then refused). A request recorded while the
  claim was only admitted applies when that admission is abandoned as never dispatched.
- **Take over** (`takeOverAgentAttempt`, core `take-over`, F17): allowed once the last Turn's claim is
  settled (or was never admitted); while it may still run `WORKFLOW_SPECIFICATION_BUSY`
  (`agent-turn` or `agent-turn-unknown`), while a return waits to apply
  `WORKFLOW_POSITION_INVALID`. In one change the agent
  attempt ends with outcome `taken-over` and the owner's attempt of the same step starts with the same
  handoff. It commits nothing and undoes nothing: the owner's own finish commits the workflow state
  as any owner finish does (the agent's Task drafts the owner keeps included); the agent's declared
  code changes stay uncommitted until the owner commits them, and Close lists them.
- A Take over or Return that lands after a Turn was bound but before its claim was admitted refuses
  that Turn's admission (`WORKFLOW_ATTEMPT_MISMATCH`): it never runs.
- **Hand to agent** (ADR 0026 D19): the owner's active attempt of a step whose executors include
  `agent` exposes `actions.handToAgent` (`step`, `attempt`, and the agent option as for a start; the
  projection never reads the checkout). `startAgentAttempt` with `expected: { step, attempt,
handOver: true }` (Runtime: `POST .../workflow/agent-execution`; `GET .../agent-execution/check`
  answers its position with `handOver`) is a new agent attempt: the core `take-over` ends the owner's
  attempt `taken-over` and activates attempt n+1 for the agent with its binding, in one change
  (summary `hand step <step> to an agent (attempt n → n+1)`); the Task's readiness, context and entry
  gates are not judged again. Its checks are a start's (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`, the
  project hold, the provider's validation) plus `admitAgentTurn`'s owner-work check, run in the
  start's probe before the owner's commit: every dirty path but the owner's workflow state
  (`ownerWorkflowState`) refuses `WORKFLOW_OWNER_WORK_UNCOMMITTED` (attribution paths; Runtime
  reason `owner-work-uncommitted`), so a refused hand commits and writes nothing. The new attempt's
  position carries `handedOverFrom`; its history detail `handedOverFrom` and its first event
  `handed-over` instead of `started`. The CLI has no command: an agent attempt needs the Runtime's
  Sessions.

### History

`readWorkflowHistory` (route `GET .../workflow/history`) lists every attempt and return of the
subject's run, newest first (at most 200), and for an agent attempt its provider, Session, Turns,
how it ended, the proposal and return request, its step events (`started` or `handed-over`, `turn-started`,
`turn-ended`, `proposal-refused`, `return-requested`, `returned`, `finished`, `committed`,
`commit-failed`, `taken-over`, `abandoned`, `awaiting-confirmation`, `confirmed`, `rejected`) and
the work it left (`readAgentAttemptWork`: uncommitted SpecFlow files only it wrote and those mixed
with another author, its Task drafts, its declared paths, the last dirty set, and the commit state).
An attempt whose result was held for confirmation carries the owner's decision once made
(`confirmation`: `confirmed` or `rejected`, when, by whom, a Reject's feedback), read from the run
record. What a committed attempt changed comes from the paths its commit recorded; a journal written
before commits recorded them falls back to the last dirty set only when it holds exactly as many
paths as the commit counted (`committedPathsOf`); the read never asks Git.
Partial work is never rolled back by the product.
