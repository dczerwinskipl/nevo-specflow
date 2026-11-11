---
id: ideas.specflow-engine.reusable-workflow.agent-execution
type: engineering
title: Agent-assisted deterministic Specification and Task execution
status: draft
scope: specflow
areas: [workflow, runtime, ai, ui, cli, security, testing]
tags: [agent-execution, task-authoring, managed-sessions, deterministic]
read_when:
  - adding an Ask agent action beside manual Workflow execution
  - implementing agent-written Specification documents and Task resources
  - integrating Managed Sessions with Workflow start and finish
summary: >
  Owner-delegated execution of one declared Workflow step by an agent, including
  Specification authoring, Task descriptions, dependencies and context, with
  durable Session and attempt correlation and shared Engine validation.
related:
  - ideas.specflow-engine.reusable-workflow
  - ideas.specflow-engine.reusable-workflow.delivery
  - ideas.specflow-engine.reusable-workflow.boundaries
  - ideas.specflow-engine.task-resource-and-context
  - ideas.specflow-engine.plan-06
  - architecture.workflow.workflow-kernel
  - architecture.runtime.workspace-execution-claims
  - reference.api.docs-search
  - reference.cli.nevo-specflow-docs
---

# E6 — Agent-assisted deterministic Workflow (proposal)

## Product path

For an eligible step the owner chooses **Do it myself** or **Ask agent**. The two choices share
one canonical Engine state machine, attempt history and allowed-action projection (E4a).
Tasks have their own Task Type workflows; agent-written Task drafts are real resources with
editable `task.md`, type, dependency graph, typed context and owner approval.

**Default:** exactly one expressly authorized attempt. Neither `continuation: auto` nor a
successful Turn authorizes a new Managed Session. Unattended F01 and F12 batching are deferred.

## Existing implementation constraints

- [Workspace execution claims](../../../architecture/runtime/workspace-execution-claims.md)
  currently reserve the **entire project** while a native agent is active. Ordinary Engine
  Document changes refuse that unsettled claim. The E6 writer needs D11's narrow same-invocation
  mutation path, not `ignoreClaims` or a second uncoordinated writer.
- Native providers can write directly to the filesystem under their OS permissions. Engine
  command authorization is not filesystem containment. Treat use of the Engine writer as a
  cooperative agent protocol until a sandbox actually enforces it. Validate real output.
- Existing `isPositionJustified` rejects any attempt whose executor kind disagrees with the
  pinned step executor. E4a/D05 must supply a versioned effective policy before a person can
  execute an agent-oriented step. Existing Run histories preserve their strict replay rule.
- The shipped Specification flow uses `session: reuse` from requirements to specification.
  Manual completion yields no prior Session. D10 requires an explicitly recorded fresh override,
  if permitted, or a predictable refusal. Never silently change the definition.
- A terminal Session Turn, an accepted finish *submission* and a committed Workflow transition
  are different records, with separate crash windows.
- Incremental Document writes are **durable when their own Engine mutation commits**. They are
  not delayed until Workflow finish and must not disappear merely because finish is refused.

## Responsibilities and boundary

| Layer            | Owns                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nevo/workflow` | Legal work/wait/return transitions, recorded attempt history, provider-independent intents                                                                  |
| SpecFlow Engine  | Subject/Task binding, effective executor validation, Task/document use cases, SpecFlow's `resolveContinuation`, claim-aware mutation and recoverable finish |
| Runtime          | Authenticated owner request, Session/Turn/invocation binding, native provider dispatch, positive native-stop evidence and reconciliation                    |
| UI / CLI / skill | Present permitted operations and invoke shared Engine commands; never invent transitions, identity or a privileged claim bypass                             |

The preferred provider/model and `session: fresh | reuse` resolution belong to the SpecFlow
adapter; Runtime implements a dispatch decision but never chooses Workflow transitions.

## Candidate invocation and finish protocol, gated by D10–D12

1. Runtime authenticates a one-step owner request and calls E4a's canonical read/command API.
   Engine verifies the subject, pinned definition, step, allowed executor and revision.
2. Runtime and Engine durably associate **one** invocation with the exact
   `(Run, step, attempt, Session, Turn, workspace)`, including retry/fencing identity, before
   native execution. The project-wide writer claim is admitted and marked dispatched using the
   existing durable claim lifecycle. Unknown native launch is reconciled, never replayed blindly.
3. Native agent reads pinned StepContext and source-scoped F20 context. When allowed, it writes
   registered Specification/Task documents through a **trusted claim-owned Engine broker**. Each
   accepted write has its own recoverable journal, idempotency identity and document revision;
   it is already published, not awaiting step finish. All unrelated writers, including the UI,
   remain blocked while the native claim is active.
4. The agent submits declared result/feedback/artifacts, through F02's authenticated finish
   adapter. Engine records a deduplicated **pending finish proposal**; a reply acknowledging that
   proposal is not a completed Workflow transition. Agent is instructed to stop.
5. Runtime proves the native process stopped. Engine then finalizes the **remaining declared
   transition/effects** under the exclusive claim and Project lock. This does not retroactively
   commit or roll back previously published Document edits. Claim settlement/release must not
   expose an unprotected gap before the final Run/effect publication. Fault injection proves the
   chosen D12 journal stage order.
6. Only after both the required finish publication and native claim settlement may the owner see
   this step as fully committed and select the next step. No new Session starts automatically.
   A stopped agent lacking valid finish leaves an unresolved attempt **and its already accepted
   Document revisions intact**; an unknown-stop process keeps its claim pending reconciliation.

Persisted identities and fingerprinted commands prevent duplicate Sessions, Tasks and finishes.
Late callbacks from a stopped/replaced invocation are rejected. Cancellation or takeover follows
F13/F17 and cannot turn a native stop attempt into a fabricated successful Workflow result.

**Do not implement this as a single synchronous callback running under the project lock.**
The native process and Session lifecycle are long-lived. Keep locks short; journals/claims
bridge asynchronous stages without losing exclusivity.

## Durable partial work, recovery and retry

One agent step is **not** an ACID transaction over the native process's lifetime. Separate:

- **Incremental Documents:** each successful claim-owned Engine write publishes a durable,
  individually versioned document. A failed finish does not erase these bytes. A direct OS
  write outside Engine is a separately reconciled side effect, not an Engine-journal promise.
- **Task drafts:** each Task create/edit must be internally atomic across its index, manifest
  and documents (D03); multiple successful Task creates may already be visible as unapproved
  drafts before the producing step finishes. A finish-time batch of effects can be atomic without
  rolling back earlier accepted Task mutations.
- **Workflow finish:** only the accepted, fenced and durable transition advances Run. A pending
  finish submission and a terminated Turn do not.

If an agent writes two documents then crashes without a valid finish, retain both revisions,
keep the attempt unresolved and preserve its writer claim until **positive native-stop proof**.
After reconciliation, expose the partial-work list and origin to the owner. The owner may inspect,
repair, resume an eligible step or **explicitly revert** selected revisions through ordinary
versioned Document operations. Never silently roll back or announce completed Workflow. Retried
invocations reconcile accepted operation IDs/revisions and do not duplicate edits or Task drafts;
they do not blindly re-dispatch an unknown native process.

**Recovery test:** two accepted edits -> crash -> restart -> same two document revisions and
unresolved Run/claim -> positive stop -> owner chooses repair/retry. Conflicting writers remain
blocked until safe release, duplicate writes replay idempotently, and selective revert requires
an authorized action.

## Specification writing and Workspace-scoped context

The agent edits Specification documents through registered Engine Documents operations and
revision checks. F20 context references for Specification and Task documents resolve from the
actual resource registry, with required/optional semantics and revision provenance.

The current [`nevo-specflow docs search`](../../../reference/cli/nevo-specflow-docs.md#search)
and [`GET /api/docs/search`](../../../reference/api/docs-search.md) search the Runtime
project's configured **`docs.root`**. They neither search Specification/Task files nor accept
a selected Worktree. Search may be hybrid semantic/BM25 or lexical; it is not automatically
wired to a running agent.

For E6, bind retrieval to the verified project, Workspace/incarnation, checkout path,
branch/HEAD and document revisions as applicable. If context must reflect a particular
Worktree's repository docs, provide a scoped corpus/index with its own freshness checks **or**
read verified files from that Worktree and record their origin. A project-wide search result
must not masquerade as that Worktree's document. Branch switching or Worktree rebind invalidates
old context evidence. The agent interface must explicitly expose/test the chosen CLI/skill/tool
path; search alone conveys no write permission.

**Verification:** two Worktrees with different docs give different, correct evidence; switching
a branch forces re-resolution/refusal of stale references. Specification `overview.md` and
Task `task.md` always come from the registered resource, never project docs search.

## Task creation and editing after F20

For a metadata-declared Task-producing step, the agent uses the **same** Task Resource create/edit
operations as UI, under the invocation-bound claim. Each draft has a stable id, title, summary,
allowed Task Type, substantive `task.md` (purpose, work, deliverables, acceptance checks),
registered optional documents, DAG dependencies and F20 typed context. Context includes
subject document, Specification document, repository document, path, instructions and path hint
with required/optional flags and bounded budgets. Engine validates all references and revisions.

D06 separates a producing attempt's proposals from other manual drafts: empty or incomplete
agent results cannot silently delete another author's Tasks. Each Task create/edit is one
recoverable multi-file D03 mutation; different accepted draft creates may persist before
Workflow finish. Finish-time effects are separately atomic. Retry cannot publish half a Task
or recreate a previously accepted draft.
An agent's direct edit of `task.yaml` or `.execution` is outside the supported cooperative
contract but is **not technically impossible** without sandboxing.

## Acceptance and failure tests

1. Same-invocation Engine writes work while the agent holds a `project-write` claim. Other
   writers, stale invocations, wrong workspace and forged owner approval are refused.
2. Three complete linked Task drafts, typed context, document content and revisions become
   visible and editable to the owner; no manual draft is lost on finishing a producing step.
3. An agent finishes one selected Task attempt and stops; manual steps in the same Run retain
   correct executor history and definition pins. Manual requirements -> agent specification
   honors the explicit `session: reuse` policy.
4. Two successful document writes followed by native crash remain visible but do not finish
   the Workflow. Loss after pending submission, stop evidence, Run publication and claim
   settlement is recoverable without duplicate execution or an unlocked write gap.
   A finished Turn without a valid Workflow finish cannot advance the Run.
5. Documentation retrieval is exercised via a real agent adapter. Two Worktrees with differing
   docs cannot share stale context; Task/Specification documents come from their own registry,
   and reported hybrid/lexical mode matches the tested retrieval. No inferred automatic RAG.
6. Existing CLI+skill callers obey their independently documented local OS trust limitations.

**Deferred:** unattended continuation, automatic Task batching, scheduler, generic plugins,
parallel Task worktrees, non-existent automated F03 evidence and claims of unimplemented
filesystem containment.
