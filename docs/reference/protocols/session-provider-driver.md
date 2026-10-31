---
id: reference.protocols.session-provider-driver
type: reference
title: Session provider driver and invocation protocol
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, sessions, cancellation, fencing, mock]
read_when:
  - implementing a Session provider driver or the controllable mock
  - migrating Claude Codex or Antigravity adapters
summary: >
  Canonical driver operations, event normalization, invocation fences, settlement
  evidence and a no-effect mock protocol for the managed Session foundation.
related:
  - architecture.ai.provider-boundary
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - ideas.specflow-runtime.ai-adapters
---

# Session provider driver

Internal Runtime Sessions port, implemented by the mock and the bounded Claude adapter; remaining
provider operations are design guidance until their adapter is delivered. This is not a UI SDK.
Runtime owns ordering, identity, persistence and terminal arbitration. Drivers own native correlation,
process/transport resources and translating protocol evidence. This contract does not import Engine.

## Operations

- describe(): synchronous last-known ProviderDescriptor; refresh(signal) owns bounded cached discovery.
  validate(selection, signal) may await that refresh before admission;
  cache positive/negative availability for at most 30 seconds, invalidate on authoritative start error.
  Snapshot reads use the last known descriptor without network/subprocess probes; unknown is honest.
- validate(selection, signal): validate requested model/mode/effort and readiness before admission;
  no execution effects. It may refresh discovery but must be cancellable and bounded (10 seconds).
- start(invocation, emit, signal): return a live handle after resource acquisition or reject with
  explicit startup evidence. Do not confuse resource acquisition with provider execution completion.
  emit is asynchronous and backpressured; resolve only after Runtime has persisted/ignored the fact.
- respond(handle, privateInteractionRef, response, signal): unblock only the matching live request.
  The current driver handle returns `{deliveredKeys: readonly string[]}` after the native write.
  For a grouped native request this is empty until every local answer is present, then includes all
  keys written together. Canonical admission is durable before this receipt; it is not proof of
  delivery. Expire undelivered admitted answers on native expiry/restart. Never automatically resend
  an admitted answer after an uncertain write. A transport receipt is not semantic consumption.
- cancel(handle, signal): request stop, returning evidence rather than claiming success from intent.
- reconcile(invocationEvidence, signal): optional; return authoritative facts/settlement or unknown,
  never redispatch or fabricate a terminal answer.
- dispose(signal): clean resources exactly once; release partial-start acquisitions on failure.
- telemetryGroups: optional passive declaration of observed usage/cost/limits/context groups.
  The optional telemetry source exposes refreshableGroups, bounded binding(signal) and
  refresh({groups,binding},signal) for read-only observations. It cannot send prompts,
  start/resume a thread, repair credentials or change a model. See
  [Session telemetry](../api/session-telemetry.md) for snapshots and refresh delivery.

Invocation = {sessionId, turnId, invocationId, ownerEpoch, providerSessionRef?, request,
selection, executionContext}. executionContext is an opaque adapter input from trusted composition.
For the mock it is {kind:'no-effects'}; real adapters receive verified environment through their
integration port. request carries canonical user text, not spec/workflow transition authority.
Selection = {providerId, modelId?, mode, effort?}. Start overrides are already validated/captured.
The app assigns workId/interactionId/actionId; drivers use native keys scoped to invocation and
the Runtime maps them once. No provider-private key becomes a UI identifier.

## Facts accepted from drivers

Every fact carries invocationId and an invocation-local monotonically increasing driverSeq.
Runtime deduplicates identical sequence/fingerprint, rejects changed duplicates and fences all
facts by owner epoch, active invocation and terminal state before canonical mutation.

| Fact        | Required neutral input / interpretation                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| correlation | provider, opaque providerSessionId; late delivery cannot rebind a settled/replaced invocation                                                                                |
| work-open   | native key, Work kind, optional parent native key for ToolAction, safe title; Runtime allocates identity/order                                                               |
| text        | native content key, channel commentary/reasoning/answer/tool-input/tool-output, bounded UTF-8 chunk                                                                          |
| work-update | native key, neutral queued/active/waiting/completed/failed/cancelled/interrupted state, safe bounded metadata                                                                |
| interaction | native key, typed question/permission from API, recoveryPolicy live-operation or reconstructable                                                                             |
| usage       | sampleId, basis delta/turn-total/session-cumulative, nonnegative counters; no inferred price                                                                                 |
| measurement | sampleId, metric cost/context/limits and strict neutral value; money has explicit currency/scope/basis; limits may declare windowUpdate for bounded per-window native pushes |
| progress    | positive semantic activity/liveness evidence, distinct from a decorative thinking flag                                                                                       |
| outcome     | completed/failed/cancelled/interrupted, structured error if relevant, optional final answer reference                                                                        |
| lost        | operation liveness/correlation cannot be established; Runtime enters unknown if settlement is unproven                                                                       |
| settled     | evidence that owned process/transport and its allowed effects have stopped; not necessarily workflow completion                                                              |

Text chunks <=16 KiB; metadata <=8 KiB per fact; interactions follow API limits. Normalize larger
native frames incrementally in the driver without holding the full transcript/output. No raw
payload in these facts. Runtime assigns its eventSeq/Work order, never trusts provider timestamps
as ordering. Adapter correlation maps are bounded by active resources and released on settlement.

Usage and monetary session-cumulative facts may declare `baseline:true` only for
a verified fresh native zero origin. This initializes attribution without claiming
observed Turn consumption. A missing intervening Turn measurement invalidates
cumulative attribution: the next sample rebases, rather than assigning several
Turns' consumption to the latest Turn. Context gauges are tied to the verified
native account/context/model, while historical usage remains independently readable.

For reconstructable interactions, the driver must persist the minimum private continuation
evidence and prove reconstruction before advertising the capability. The mock uses live-operation
only: restart expires its questions. A capability is not enabled merely because this union has a case.

## Failure and settlement

Driver failures distinguish unavailable, authentication-required, invalid request, unsupported,
transport/process failure, timeout, cancellation, interrupted, provider execution failure and unknown.
Canonical stored Turn error is {code, message}, message <=2 KiB, with code one of
PROVIDER_UNAVAILABLE, PROVIDER_AUTH_REQUIRED, REQUEST_INVALID, CAPABILITY_UNSUPPORTED,
TRANSPORT_FAILED, PROCESS_FAILED, PROVIDER_FAILED, TIMEOUT, INTERRUPTED, OPERATION_UNKNOWN.
Cancellation normally uses its outcome without an error. Native diagnostics remain private.
Before admission map unavailable/auth/invalid/unsupported into the corresponding API error;
after admission store the error with truthful Turn terminal/unknown state.
Native structured codes/status are preferred; arbitrary stderr prose is diagnostic evidence.
An unavailable/auth failure proven before dispatch may fail the admitted Turn without replay.
If work might have started, never retry start automatically because a native ID was not recorded.

Each invocation has exactly one resource owner; cleanup covers partial startup, abort, MCP request,
temporary files, child/process tree, listeners and stdout/stderr pipes. Process termination proves
process liveness cessation, not arbitrary child-tool settlement. Real writable execution needs the
separate Engine claim/effect disposition protocol. Native resume is a new validated invocation
against an existing provider context; it does not reactivate a terminal Turn.

Hard limits: validate timeout 10 seconds; foundation mock cancel/shutdown settlement timeout
5 seconds. Pending user interaction does not trigger a protocol-silence timeout. Mock progress
is deterministic, controlled by tests rather than timers. Real-provider liveness budgets are
adapter-owned explicit settings after inspecting protocol and tool activity; no destructive
shared timeout inferred solely from a silent stream.

Provider process environment is allowlisted by platform/transport need, with feature-owned
explicit additions; never copy all process.env. Diagnostic text is redacted before persistence,
retained separately from canonical history, capped at 1 MiB per invocation and 100 MiB per store,
maximum 7 days, dropping oldest settled diagnostics. Disable raw capture by default.
No credential-manager/UI login feature is included; auth-required is surfaced honestly.

## Controlled mock

Mock is registered only when explicitly enabled in committed sessions configuration. Its public
descriptor clearly labels it a test; only read-only mode. No spawn/filesystem tool executor exists.
It can emit synthetic tool Work whose output is data only. Production mock accepts ordinary
messages and emits a deterministic bounded commentary and answer with a distinct new invocation.

Test control is injected directly into the driver, never exposed as a public HTTP backdoor.
It can pause at admission/start/correlation/interaction/completion, emit out-of-order/late facts,
duplicate facts, stream a huge single Turn, fail startup, simulate lost ownership, and acknowledge
or withhold cancellation settlement. Test scenarios may emit question/permission; do not overload
user prompt magic strings as the production test control API.

An executable driver conformance suite covers each supported operation, no-effect enforcement,
late facts, duplicate sequences, backpressure, honest unsupported capability, resource cleanup,
usage provenance and output channel separation. Passing mock conformance does not certify a
real provider version, native resume or writable worktree safety.
