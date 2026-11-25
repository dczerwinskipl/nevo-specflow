---
id: architecture.runtime.agent-step-execution
type: architecture
title: Agent step execution — broker, invocation capability and the agent attempt lifecycle
status: current
scope: specflow
areas: [runtime, workflow, ai, security, cli]
tags: [agent-execution, broker, capability, claims, finalize, recovery, redaction, permissions]
read_when:
  - changing how an agent runs a workflow step (Run with agent), Continue, Stop, Return or Take over
  - changing the agent broker, the invocation capability or what an agent Turn may write
  - adding a product CLI command (it must be placed as a read, a brokered write or refused)
  - changing the finalize, the attempt commit or the recovery of an agent attempt
  - diagnosing an AGENT_* broker refusal or a WORKFLOW_* attribution refusal
summary: >
  How one agent attempt of a Specification or Task step runs end to end: the owner route, the
  Engine start with the trusted agent actor, the Session and Turn, the per-Turn capability and the
  per-user local broker through which the agent's product CLI writes as the Turn's own claim, the
  derived scope, the finish proposal, the finalize that publishes the step and settles the claim in
  one lock section, the attempt commit, the owner's Stop, Return, Take over, Confirm, Reject and
  Retry commit, redaction, the provider allowlist, and recovery after a crash.
related:
  - adr.0026-agent-step-execution
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-agent-attempts
  - architecture.runtime.workspace-execution-claims
  - architecture.runtime.specification-documents
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.specification-workflow
  - reference.cli.specflow-specification-commands
  - reference.protocols.session-provider-driver
---

# Agent step execution

The decisions are [ADR 0026](../decisions/0026-agent-step-execution.md). This page is the
vertical: what each part does, in the order a Turn meets it. The UI calls the action **Run with
agent**; code and API call it agent step execution.

## Where the code lives

| Part                                                                                                                               | Code                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent attempt (start, scope, context, proposal, boundary, finalize, attempt commit, confirmation, owner actions, history, journal) | Engine `packages/specflow-engine/src/workflow/agent/` (`index.ts`)                                                                                                       |
| Writer admission of workflow writes, owned-claim forms                                                                             | Engine `workflow/write-admission.ts`, `workflow/state/claim-guard.ts`, `specs/coordination/resources.ts`, `specs/durable/claims.ts`                                      |
| Ledger authors, foreign-ledger refusal                                                                                             | Engine `specs/durable/ledger/model.ts`, `specs/documents/write/foreign-ledger.ts`                                                                                        |
| Neutral core: `hostData`, `awaiting-confirmation`, `confirm`, `reject`, `take-over`, outcome `taken-over`                          | `packages/workflow/src/execution/` (`run.ts`, `coordinator.ts`, `replay.ts`)                                                                                             |
| Capability, broker, owner routes, brief, availability                                                                              | Runtime `packages/specflow-runtime/src/features/agent-execution/` (`capability/`, `broker/`, `step-execution/`, `brief/`, `feature.ts`)                                  |
| Managed invocation (mint, activate, revoke, settle), allowlist plan                                                                | Runtime `features/sessions/lifecycle/managed-invocation.ts`, `lifecycle/permission-allowlist.ts`, `effects/engine.ts`; Claude `providers/claude/`                        |
| Wire contracts                                                                                                                     | `@nevo/specflow-contracts`: `runtime/agent-broker.ts`, `runtime/agent-permissions.ts`, `documents/agent-commands.ts`, `documents/agent-permission-rules.ts`, `workflow/` |
| CLI routing and broker client                                                                                                      | `packages/specflow/src/agent-broker/` (`routing.ts`, `client.ts`)                                                                                                        |

The Engine owns every rule (scope, admission, attribution, finalize, commit). The Runtime holds what
only a running process can hold (the capability, the broker endpoint, the provider process and its
native-stop evidence) and renders the brief.

## Lifecycle of one attempt

```mermaid
sequenceDiagram
  autonumber
  participant O as Owner (UI or HTTP)
  participant RT as Runtime
  participant EN as Engine
  participant AG as Agent process

  O->>RT: POST .../workflow/agent-execution {requestId, expected, provider?, model?}
  RT->>RT: availability (demo, provider ready, other writer, baseline)
  RT->>EN: startAgentAttempt(AgentActor, expected, workspace, Turn ids)
  EN-->>RT: attempt (hostData binding) + journal with the Turn binding
  RT->>RT: create the fresh Session (id from the actor) or join the Task
  RT->>EN: admit the Turn's claim (intent.attempt), Turn admissible?
  RT->>RT: mint capability (scope from the Engine), baseline admitted again
  RT->>AG: launch with NEVO_AGENT_BROKER, NEVO_AGENT_CAPABILITY, allowlist
  RT->>EN: claim dispatched, capability active
  loop During the Turn
    AG->>RT: product CLI write over the broker
    RT->>EN: same use case, owned execution (turn form), AgentActor
  end
  AG->>RT: workflow finish (proposal + changed paths)
  RT->>EN: proposeAgentFinish (validated, recorded in the journal)
  AG-->>RT: Turn ends; capability revoked, calls drained, process proven stopped
  RT->>EN: finalizeAgentAttempt(intent, native-result receipt)
  EN->>EN: one lock section: publish step, record journal, settle claim
  EN->>EN: post action: attempt commit
  EN-->>O: projection: finished, awaiting confirmation, refused or Turn ended
```

1. **Refuse before anything exists.** `startAgentStepExecution`
   (`step-execution/operation.ts`) checks the position the owner was shown (`expected.step`, and
   `expected.attempt` for Continue), the projection's agent option and the Runtime's reasons
   (`availability.ts`, in this order: the definitions' reason, `demo`, `provider-not-ready`,
   `project-busy`, `dirty-baseline` or `baseline-changed`). A refusal is
   `WORKFLOW_AGENT_UNAVAILABLE` with the option in `details.agent`, so the form can explain it; the
   dialog asks `GET .../agent-execution/check` when it opens.
2. **Engine start.** `startAgentAttempt` runs the ordinary start in one `serialize` section with
   the trusted `AgentActor {archetype, provider, model, sessionId}`, an expected position (a stale
   one refuses), the baseline admission and the attempt binding as `hostData`
   (`{kind: agent-attempt, attemptId, workspaceId, contextDigest?, launch}`), then records the Turn
   binding `{invocationId, turnId, contextDigest?}` in the attempt's journal. The start's own store
   change is attributed to the first Turn, so the attempt commit takes it. The agent context is read
   once, in the same section, in the start's admission hook: after the start's own checks
   (position, readiness, executors, entry gates), so a refusal never hashes it, and before anything
   is written. The start returns it, the Runtime renders the brief from it, and its Task context
   digest is what the attempt (a new attempt) and the Turn record. A folder or glob reference's
   digest leaves out SpecFlow's own state, which the Engine writes itself (any `.execution` folder
   below `specs/`, and the Engine's namespaces: the Project Home's configuration folder and a local
   state root inside the checkout), so the start's own run record never changes it. A retried
   request whose Turn is not dispatched yet reads the context again (`readAgentTurnContext`) and is
   refused `WORKFLOW_STATE_CONFLICT` when its digest is not the Turn's; Continue briefs a new Turn
   with the current context. A retried request whose Turn was dispatched already is answered from
   the attempt without a new brief.
3. **Session and Turn.** Session, Turn and invocation ids are derived from the request id, so a
   retried request finds what the first one made. The Turn records the digest of the request's
   payload (subject, expected position, provider, model, effort, note): the same request id with
   another payload is refused `WORKFLOW_STATE_CONFLICT` before anything is dispatched, so a resend
   never finishes the earlier choice under a new one. A fresh Session is created with the id the actor
   already names (origin `workflow`, title "Agent step execution"); a continued Session that moves
   into a Task's step is associated with that Task (`associate-tasks`). The Turn starts in
   `workspace-write` mode with the brief, the owner's optional note (fenced as untrusted) and the
   allowlist.
4. **Claim and capability.** The claim intent carries `attempt {attemptId}`. Inside the admission
   section the Turn must still be the attempt's last Turn, and the attempt neither ended, returned
   nor taken over (`assertAgentTurnAdmissible`). The capability is minted with the scope the Engine
   derives from the journal; the baseline is admitted again now, under the claim, before the
   provider process exists. A write Turn of an attempt is never dispatched without a capability.
5. **During the Turn**, writes go through the broker (below). Each one (documents, Task drafts,
   execution state) is recorded in the uncommitted-changes ledger with the Turn as its author,
   whatever `git.commits.auto.documents` says: only the attempt commit commits it. A Turn ending
   finishes nothing.
6. **End of the Turn.** The capability is revoked; the Runtime waits up to 30 s for broker calls
   still running. If one still runs then, the Turn is recorded `unknown` instead of settled. With
   positive native-stop evidence the settlement of an attempt-bound claim calls
   `finalizeAgentAttempt` instead of the bare settlement (also from startup recovery and reconcile).

## Invocation capability

`capability/registry.ts`. One capability per write Turn of a Specification-associated Session
(an attempt's Turn or an ad-hoc Turn). The value is `nvcap_` plus 32 random bytes in base64url;
the registry keys entries by the value's sha256 and compares with `timingSafeEqual`. It is held only
in memory and never persisted: after a Runtime restart no capability is valid.

| State    | Admits                                                       | Entered when                      |
| -------- | ------------------------------------------------------------ | --------------------------------- |
| `minted` | nothing (`not-dispatched`)                                   | the claim was admitted            |
| `active` | broker calls, each counted until it answers                  | the claim was marked `dispatched` |
| `ended`  | nothing (`ended`); the last 256 are kept to word the refusal | the Turn ends (`revoke`)          |

The binding is `{invocationId, sessionId, turnId, specId, taskId?, workspace, scope, actor}`, built
by the Runtime from the Turn it admitted; nothing in it comes from the agent. An invocation holds at
most one capability.

## Broker

**Endpoint** (`broker/endpoint.ts`): listened on at first use, closed with the Runtime.

- Unix: `broker.sock` in a fresh `mkdtemp` directory, `chmod 0700`, verified after creation (a
  directory, not a link, owned by this user, no group or other bits).
- Windows: `\\.\pipe\nevo-specflow-agent-broker-<128 random bits>`, created by Node with the default
  pipe security (full control for the creator, SYSTEM and Administrators, read for everyone else)
  and as the first instance of its name.

**Framing** (`broker/framing.ts`, `server.ts`): one connection carries one request line and one
response line of UTF-8 JSON. A request above 2 MiB is refused unread, a response is at most 1 MiB,
the request frame must arrive within 5 s of the connection, and at most 16 connections are served
at once (one more is answered `AGENT_BROKER_UNAVAILABLE`, `busy`). The server logs nothing of a
request.

**Dispatch order** (`broker/dispatch.ts`): the frame parses; no field at any depth names what only
the broker decides (`actor*`, `claim*`, `owner*`, `ignoreClaim*`, `ownedExecution*`, `authorit*`,
`operationId`, `invocationId`, `sessionId`, `turnId`, `attempt`, `workspace*`, `scope`, `trust`,
`principal`; the top-level `capability` excepted); the envelope is protocol 1; the capability is an
active one; the operation is in scope; the request matches its schema; the Specification still
lives in the claimed workspace; the Turn is still active right before the Engine runs; a
`workflow.finish` names exactly the bound step and attempt (`stepAttempt`). Only then the Engine use
case runs with operation id `uuidv8(sha256(invocationId, requestId))`, so a client retry is an exact
replay and the same request id under another invocation is another operation.

**Operations** (`AGENT_BROKER_OPERATIONS`): `scope.describe` (always), `documents.create`,
`documents.save`, `documents.classify`, `tasks.create`, `tasks.edit`, `tasks.remove`,
`workflow.finish`. A
`workflow.finish` answers `recorded`, `replaced` or `replayed`; it is applied only by the finalize.

**Refusals.** An Engine refusal of an admitted operation keeps its own code and details
(`SPEC_BUSY`, `DOCUMENT_REVISION_CONFLICT`, `WORKFLOW_*`). The broker's own:

| Code                       | Meaning                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_REQUEST_INVALID`    | Not a request of this protocol: frame, UTF-8, JSON, shape or size.                                                                                       |
| `AGENT_REQUEST_REFUSED`    | The request names a field only the broker decides (`details.field`).                                                                                     |
| `AGENT_CAPABILITY_INVALID` | No capability, not this Runtime's, or its Turn is not running (`details.reason`: `unknown`, `not-dispatched`, `ended`).                                  |
| `AGENT_SCOPE_REFUSED`      | Outside the Turn's scope (`details.reason`: `operation-not-in-scope`, `other-specification`, `task-not-in-scope`, `workspace-changed`, `other-attempt`). |
| `AGENT_BROKER_UNAVAILABLE` | The broker could not run the operation (internal failure, or `busy`).                                                                                    |

Every message says what the agent can do and never carries the capability or an absolute path.

## Scope

Derived by the Engine (`workflow/agent/scope/`), enforced by the broker:

| Turn                                         | Writes                                                                                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ad-hoc` (an associated Session, no attempt) | `documents.create`, `documents.save`, `documents.classify` of the home Specification                                                                                                                                                                 |
| `attempt`                                    | documents of the subject (a Task subject: its Task's documents only); `tasks.create`, `tasks.edit`, `tasks.remove` and the documents of the step's Task drafts only when the step declares `produces: tasks`; `workflow.finish` of the bound attempt |

A Task drafted in an attempt is recorded with origin `produced` by that step and attempt; an agent
edits, removes and rewrites the documents of only the drafts its step produced, in any attempt of
the step (a later attempt reworks them after a review). The broker asks the Engine
(`assertAgentDraftTask`) before it writes a draft's documents; an approved or started Task is refused
`WORKFLOW_EXECUTOR_NOT_ALLOWED` with the remedy: propose a `cancelled` task decision in the finish,
which the owner confirms. An agent write that would build on another author's
uncommitted change of the same path is refused (`foreign-uncommitted`, "commit it first"); two Turns
of one attempt, or two ad-hoc Turns of one Session, are the same author. Conversely, while a finished
attempt's own commit waits, any other write to a path that commit takes (the owner's included) is
refused (`DOCUMENT_COMMITS_PENDING`, `cause: attempt-commit`; see
[document commit policy](document-commit-policy.md#agent-writes)).

**CLI routing** (`packages/specflow/src/agent-broker/routing.ts`). When `NEVO_AGENT_CAPABILITY` is
set, every command is placed before its action runs:

- `READS` (from `AGENT_READ_COMMANDS`): stay local and never open the Engine for writing
  (`specs list`, `specs documents list|read|validate|status`, `tasks list|inspect`,
  `workflow actions|context`, `project inspect`, `definitions list|show|validate`, `commit status`,
  `docs list|get|find|context|search`; `docs search` starts no index catch-up);
- `BROKERED` (from `AGENT_BROKERED_COMMANDS`): `specs documents add|save|classify`,
  `tasks create|edit|remove`, `workflow finish` (with `--changed <path>`), sent to the broker;
- everything else is refused with `AGENT_SCOPE_REFUSED` before an Engine opens, including the owner
  commands `workflow confirm|reject|retry-commit|take-over|return|start`, `tasks status`,
  `specs close|abandon` and `commit`. A table test requires every registered command to be in
  exactly one of `READS`, `BROKERED` and `REFUSED`, so a new command is closed to agents until it is
  placed.

The brief (`brief/render.ts`, `operations.ts`) lists the writes the scope admits and the reads,
with their exact forms, from the same table (`AGENT_COMMANDS`), so it never names a refused command.
Its "Finishing this step" section lists every result of the bound step (`--result` value, label,
transition, target, feedback); the `workflow finish` form shows `--result (pass | fail)`, or no
`--result` for a single-exit step. Its rules name the command size limit (7000 bytes; a longer Bash
command is denied with its size, the limit and `--content-file` as the remedy) and that `--path` is
relative to the Specification folder.

**What the owner sees.** The Turn's request entry carries `origin` (`specflow-step-brief`: subject,
optional Task, step, attempt, handoff as data, and `continuation: true` when the Turn is a Continue
of the same attempt rather than its start); the entry's text is the full brief (its content
reference reads all of it). A fresh Session is titled "<step title> · attempt <n>" (and the Task
title), created in `auto` when the provider runs the model in auto, else `acceptEdits` (the option's
`workMode`). While the Turn waits on a pending question or permission of its Session,
`agentAttempt.turn.waitingForOwner` names it (`kind`, `interactionId`). A configured model the
provider does not list is reported as `modelRequired` with an empty model. After a step returned
(for example a review that requested changes), `handoff` on the projection names the step that
finished, its transition, label, result and feedback.

## Proposal, attribution and finalize

The proposal and its checks are in [workflow agent attempts](../workflow/workflow-agent-attempts.md#agent-attempts);
the claim forms in [workspace execution claims](workspace-execution-claims.md#the-project-wide-resource).
In short:

- `proposeAgentFinish` runs under the `turn` form of the Turn's own claim, validates the input with
  an owner's finish rules (`planFinish`), refuses what only the owner decides outside an attempt,
  runs the attribution checks and records the proposal in the journal. Nothing in the store changes.
- `finalizeAgentAttempt` takes the control lock once and, under the `finalize` form, publishes the
  step state, records the journal and settles the claim, then runs the post actions after the lock.

**Finalize outcomes:** `finished`, `awaiting-confirmation` (both with the post actions' results),
`refused` (the proposal or the owner's return; the attempt stays active), `returned`, `turn-ended`.
Errors that are no verdict (corrupt state, busy, source unavailable, a document write of the Turn
still in flight) leave the claim held and the proposal pending for the next run of the same
finalize.

**Attempt commit** (`finalize/attempt-commit/`): see
[ADR 0026, D15](../decisions/0026-agent-step-execution.md#d15--one-attempt-commit-at-finish). Its post
action id is derived from `(attemptId, attempt-commit)`; a run repeated after a crash resumes the
same manual commit from its journal; an owner's retry is a new run id. With Git off it is
`skipped: git-disabled`; with nothing to commit `skipped: nothing-to-commit`.

## Owner actions during and after an attempt

All are owner routes (`spec.manage`) or the offline CLI's `local:<os-user>`; an agent Turn cannot
call them (the CLI refuses them inside a Turn, and the broker has no such operation).

| Action                   | Route / CLI                                                                  | Effect                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run with agent, Continue | `POST .../workflow/agent-execution` (no CLI)                                 | A new attempt of `expected.step`, or a new Turn of the active agent attempt (`expected.attempt`) in its own Session.                                                                           |
| Check                    | `GET .../workflow/agent-execution/check`                                     | The agent option with every reason a start would refuse with, baseline included.                                                                                                               |
| Stop                     | `POST .../workflow/agent-execution/stop`                                     | Cancels the Turn; the claim stays held until the process is proven stopped, then the finalize records `turn-ended`.                                                                            |
| Return                   | `POST .../workflow/return`, `workflow return`                                | No Turn may run: returns now. A Turn may still run: records the request (`return-requested`) and stops the Turn; the finalize applies it.                                                      |
| Take over                | `POST .../workflow/agent-execution/take-over`, `workflow take-over`          | Once the last Turn's claim is settled: the attempt ends `taken-over`, the owner's attempt starts. Commits nothing. While it may run: `WORKFLOW_SPECIFICATION_BUSY`.                            |
| Confirm, Reject          | `POST .../workflow/confirmation/confirm\|reject`, `workflow confirm\|reject` | Decide a result that waits (`awaiting-confirmation`); with Git on, both only once the attempt commit ran; see [owner confirmation](../workflow/workflow-agent-attempts.md#owner-confirmation). |
| Retry commit             | `POST .../workflow/attempt-commit/retry`, `workflow retry-commit`            | Runs a failed or pending attempt commit (not while it runs); for a confirmed attempt whose commit ran, the confirmation's owner commit.                                                        |

The projection's `agentAttempt` (Session, Turn state `working|stopping|unknown|ended|session-missing`,
proposal, `continue`, `returnRequest`, `takeOver`, `work`) and `GET .../workflow/history` (each agent
attempt's step events and the work it left, partial work never rolled back) are what the UI shows.
`session-missing` is an attempt whose fresh Session was never created; Continue creates it. Once the
attempt commit made a commit, `work.commit` names its `sha` and counts its paths (`documents`
SpecFlow wrote, `files` the agent declared), from the post action's run record in the journal.

Every projection of another subject carries `projectHold` while an agent Turn holds the project
(`agent-working`, or `agent-outcome-unknown` while its process may still run), naming the subject it
works on with its title and its Session. The Runtime derives it in `decorate` from the unsettled
execution claims that carry an attempt and the attempt's journal, without Git.

## Provider permissions (D20)

The Turn's allowlist is the archetype's `providers[].permissions.allow` for the chosen provider,
else `defaultAgentAllowlist` (for Claude: `Bash(nevo-specflow <command> *)` for every command of the
table; other providers none). `planPermissionAllowlist` applies only rules
`partitionAgentPermissionRules` accepts and reports ignored ones in the Turn; a driver without
`supportsPermissionAllowlist` gets none and the Turn says so.

Claude: setting sources are off and `Bash` always asks, so no owner or project permission is merged.
Scoped read-tool rules become native `allow` rules; a command is approved by the host only when it
consists of allowlisted product CLI calls alone (`judgeAgentCliCommand`: parsed as the shell splits
it, calls joined by `&&`, `;`, `|` or new lines, an optional leading `cd`, literal words, file
redirections and quoted here-documents only; `cd` and redirection targets inside the worktree,
`command-paths.ts`; ADR 0026 D20), and only while `nevo-specflow` on `PATH`
can only be the installed CLI (no relative or empty `PATH` entry, no entry or resolved executable
inside the workspace; `cli-path.ts`). Each approval is recorded in the Turn; anything else goes to
the owner.

## Redaction

The capability is a secret of the Turn:

- the driver passes it in the runtime environment entries (`Invocation.runtimeEnvironment`) with
  the value marked secret, so provider diagnostics redact it;
- every fact the Runtime stores from the Turn (transcript, tool input and output, outcome errors) is
  redacted for the minted value in its plain, JSON-escaped and URL-encoded forms and for anything
  shaped like a capability (`redactCapabilities`, `redactAgentCapabilityShapes`);
- the broker never logs a request and its refusals never echo the capability.

## Recovery

| Crash or failure                                          | State left                                      | Resolution                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After the Engine start, before the Session or Turn exists | Active attempt with a bound Turn and no process | The same request again completes it; Continue creates a missing fresh Session (`session-missing`).                                                                                                                                      |
| Turn bound, claim never dispatched                        | Claim `admitted`                                | Abandoned as `not-dispatched`; an owner Return or Take over recorded meanwhile is applied (`settleAbandonedAgentTurn`).                                                                                                                 |
| Runtime restart during a Turn                             | Claim `dispatched`, capability lost             | Native-stop evidence settles it through `finalizeAgentAttempt`; without evidence the Turn is `unknown` and blocks writers.                                                                                                              |
| Broker call still running when the Turn ended             | Turn `unknown`                                  | Check outcome or recovery; the finalize refuses while a document write of the Turn is still open (`write-in-progress`).                                                                                                                 |
| Between step publication, journal record and settlement   | Step published, claim held                      | The same finalize again: the finish replays by digest with the declared hashes journaled before the publication (a later edit is refused by the attempt commit, never taken), the journal is not written twice, the settlement repeats. |
| After the section, before the post action                 | Post action `pending`                           | `recoverAgentAttempts` at Runtime start, the next finalize, or the owner's Retry commit runs it with the same operation id.                                                                                                             |
| Attempt commit failed                                     | Step published, paths uncommitted               | Retry commit; Close lists the paths under `attempts` until committed; a waiting result cannot be confirmed or rejected meanwhile (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`). Recovery never retries a failed action by itself.                |
| Crash between Confirm's store change and its journal      | Run decided, journal not                        | Repaired by the next Confirm or Reject of the attempt (the same request id replays it).                                                                                                                                                 |

An attempt journal moves to `settled/` once the attempt ended and nothing of it is left to run.

## Limits and non-goals

The trust model is [ADR 0026, Trust model](../decisions/0026-agent-step-execution.md#trust-model-and-its-limits):
cooperative, same OS user, no containment. One agent execution per project at a time. The demo
Runtime runs no agent (`demo`; its routes answer 503 `WORKFLOW_UNAVAILABLE`). Unattended
continuation (F01), an MCP transport over the broker, and Activity history step events are not
implemented.
