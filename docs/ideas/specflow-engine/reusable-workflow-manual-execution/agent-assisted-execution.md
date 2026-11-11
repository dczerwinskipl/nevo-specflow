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
3. Native agent reads its pinned StepContext and required subject context. When allowed, it writes
   registered Specification/Task documents through a **trusted claim-owned Engine broker**.
   The broker verifies the exact live claim and capability, permitting only same-invocation writes.
   All other writers, including UI edits, remain blocked until the claim is positively settled.
4. The agent submits declared result/feedback/artifacts, through F02's authenticated finish
   adapter. Engine records a deduplicated **pending finish proposal**; a reply acknowledging that
   proposal is not a completed Workflow transition. Agent is instructed to stop.
5. Runtime proves the native process stopped. Engine then finalizes the accepted attempt and all
   related effects under an exclusive claim/reservation and Project lock. Claim settlement/release
   cannot expose an unprotected interval before the Workflow publication is durable. The exact
   order of the journal stages is a D12 decision, with fault-injected recovery evidence.
6. Only after both the required finish publication and native claim settlement may the owner see
   this step as fully committed and select the next step. No new Session starts automatically.
   A stopped agent lacking valid finish leaves an unresolved attempt; an unknown-stop process
   keeps its claim and requires reconciliation.

Persisted identities and fingerprinted commands prevent duplicate Sessions, Tasks and finishes.
Late callbacks from a stopped/replaced invocation are rejected. Cancellation or takeover follows
F13/F17 and cannot turn a native stop attempt into a fabricated successful Workflow result.

**Do not implement this as a single synchronous callback running under the project lock.**
The native process and Session lifecycle are long-lived. Keep locks short; journals/claims
bridge asynchronous stages without losing exclusivity.

## Specification writing and documentation search

An eligible agent writes Specification documents with the existing Engine Document operations
and revision checks, not a provider-specific file writer. The agent receives required/optional
context and an auditable description of what was read.

The product now has
[`nevo-specflow docs search`](../../../reference/cli/nevo-specflow-docs.md#search) and
[`GET /api/docs/search`](../../../reference/api/docs-search.md), using hybrid semantic/BM25
ranking when its index and embedding endpoint are available, with lexical fallback.
Exact `docs get` and lexical `find/context` remain. **The search API is not automatically
available to the agent:** E6a must implement/test its chosen CLI/skill/tool path and report the
actual search mode; do not claim vector RAG merely because the product has an index.
Documentation search only retrieves context; it confers no write capability.

## Task creation and editing after F20

For a metadata-declared Task-producing step, the agent uses the **same** Task Resource create/edit
operations as UI, under the invocation-bound claim. Each draft has a stable id, title, summary,
allowed Task Type, substantive `task.md` (purpose, work, deliverables, acceptance checks),
registered optional documents, DAG dependencies and F20 typed context. Context includes
subject document, Specification document, repository document, path, instructions and path hint
with required/optional flags and bounded budgets. Engine validates all references and revisions.

D06 separates a producing attempt's proposals from other manual drafts: empty or incomplete
agent results cannot silently delete another author's Tasks. All index/manifest/document/Run
effects share the accepted cross-resource journal (D03); retries must not publish partial Tasks.
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
4. Loss after launch, pending finish submission, native stop evidence, Run publication and
   claim settlement is recoverable without duplicate execution or an unlocked write gap.
   A finished Turn without a valid Workflow finish cannot advance the Run.
5. Documentation retrieval is actually exercised via the chosen supported agent interface,
   using hybrid or lexical mode as reported. No inferred automatic RAG support.
6. Existing CLI+skill callers obey their independently documented local OS trust limitations.

**Deferred:** unattended continuation, automatic Task batching, scheduler, generic plugins,
parallel Task worktrees, non-existent automated F03 evidence and claims of unimplemented
filesystem containment.
