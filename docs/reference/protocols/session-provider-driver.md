---
id: reference.protocols.session-provider-driver
type: reference
title: Session provider driver and invocation protocol
status: current
scope: specflow
areas: [ai, runtime, security, testing]
tags: [providers, sessions, cancellation, fencing, mock]
read_when:
  - implementing a Session provider driver or the controllable mock
  - changing the Claude, Codex or Antigravity adapters
  - building a provider process environment or diagnostics capture
summary: >
  Canonical driver operations, neutral facts, invocation fences, settlement evidence,
  the shared provider environment projection and the no-effect mock protocol for
  managed Sessions.
related:
  - architecture.ai.provider-boundary
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - architecture.ai.provider-process-ownership
  - reference.providers.compatibility
  - ideas.specflow-runtime.provider-migration-plan
---

# Session provider driver

Internal Runtime Sessions port, implemented by the mock, Claude, Codex and Antigravity adapters.
Availability remains subject to each adapter's native profile and platform checks
([provider reference](../providers/README.md)). This is not a UI SDK.
Runtime owns ordering, identity, persistence and terminal arbitration. Drivers own native correlation,
process/transport resources and translating protocol evidence. This contract does not import Engine.

Deferred capabilities are tracked in the consolidated
[provider capability backlog](../../ideas/specflow-runtime/provider-migration-plan.md#current-scope-and-capability-backlog-ownership).
They do not extend this implemented contract.

## Operations

`SessionDriver` (`providers/driver.ts`):

- `describe()`: synchronous last-known ProviderDescriptor. Snapshot reads use it without network or
  subprocess probes; unknown is honest.
- `refresh(signal)` (optional): bounded cached discovery. Positive/negative availability is cached
  for at most 30 seconds and invalidated by an authoritative start or authentication error.
- `validate(selection, signal)`: validate requested model/mode/effort and readiness before
  admission, without execution effects. It may await refresh; the coordinator bounds discovery and
  validation together to 30 seconds and maps a timeout to `PROVIDER_UNAVAILABLE`.
- `start(invocation, emit, signal)`: returns a `ProviderOperation` after resource acquisition, or
  rejects with explicit startup evidence. Resource acquisition is not execution completion.
  Cancellation is the AbortSignal: the driver requests stop and reports evidence rather than
  claiming success from intent. `emit` is asynchronous and backpressured; it resolves only after
  Runtime has persisted or ignored the fact.
- `ProviderOperation.respond(key, response)`: unblocks only the matching live request and returns
  `{deliveredKeys}` after the native write. For a grouped native request this is empty until every
  local answer is present, then lists all keys written together. Canonical admission is durable
  before this receipt; the receipt proves transport delivery, not semantic consumption. Undelivered
  admitted answers expire on native expiry or restart. An admitted answer is never resent
  automatically after an uncertain write.
- `ProviderOperation.done` resolves when the operation ends. `settlement` (required for a managed
  writer) resolves positive process evidence `{process: stopped|unknown, source, result?}` from the
  shared process owner; see [provider process ownership](../../architecture/ai/provider-process-ownership.md).
- Optional declarations: `nativeContextMode` (`reserved`, or `provider-assigned` when the native
  protocol allocates the context during thread start; its identity is durably correlated before any
  user input), `supportsManagedWrites`, `contextScope()`, `telemetryGroups` and a read-only
  `telemetry` source (`refreshableGroups`, bounded `binding(signal)`,
  `refresh({groups,binding},signal)`). Telemetry cannot send prompts, start or resume a thread,
  repair credentials or change a model. See [Session telemetry](../api/session-telemetry.md).

There is no driver-level reconcile or dispose operation. The authenticated reconcile command
consumes an exact Engine settlement receipt without sending native input; resource cleanup is owned
by the operation's process owner and runs exactly once, including after partial startup.

Invocation = {sessionId, turnId, invocationId, request, selection, executionContext,
providerContext?, beforeDispatch?}. `request` carries canonical user text, not spec/workflow
transition authority. Selection = {providerId, mode, providerModeId?, modelId?, effort?}; start
overrides are already validated and captured. `executionContext` is trusted composition input:
`{kind:'no-effects'}` for the mock, `read-only` with a verified workspace and temporary root, or
`workspace-write` additionally carrying the workspace identity and the Engine admission
`{operationId, scope:'project'}`. `providerContext` names the persisted native context and whether
it resumes; `beforeDispatch` crosses the durable dispatch barrier and MUST complete before the
first user input reaches the provider. The app assigns workId/interactionId/actionId; drivers use
native keys scoped to the invocation and Runtime maps them once. No provider-private key becomes a
UI identifier.

## Facts accepted from drivers

Runtime stamps every emitted fact with its invocationId and an invocation-local monotonically
increasing driverSeq. It deduplicates identical sequence/fingerprint, rejects changed duplicates and fences all
facts by owner epoch, active invocation and terminal state before canonical mutation.

| Fact                | Required neutral input / interpretation                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| correlation         | opaque providerSessionId; late delivery cannot rebind a settled or replaced invocation                                                                                                           |
| work-open           | native key, Work kind, safe title (<=2 KiB); Runtime allocates identity and order                                                                                                                |
| work-update         | native key, neutral queued/active/waiting/completed/failed/cancelled/interrupted state                                                                                                           |
| action-open         | native key, parent tool Work key, safe title, optional closed `operation` mapped only from the provider's own tool identity (unmapped -> `other`); never inferred from command text or arguments |
| action-update       | native key, neutral ToolAction state                                                                                                                                                             |
| text                | native content key, channel commentary/reasoning/answer/tool-input/tool-output, bounded UTF-8 chunk                                                                                              |
| interaction         | native key, typed question (prompt, allowText, options, maxSelections) or permission (prompt, actionSummary, optional command action)                                                            |
| interaction-expired | native key of an interaction the native side withdrew or expired                                                                                                                                 |
| usage               | sampleId, basis delta/turn-total/session-cumulative, nonnegative counters, optional `baseline`; no inferred price                                                                                |
| measurement         | sampleId, metric cost/context/limits and strict neutral value; money has explicit currency/scope/basis; limits may declare windowUpdate                                                          |
| progress            | positive semantic activity (`waiting`/`responding`) with a bounded label, distinct from a decorative thinking flag                                                                               |
| outcome             | completed/failed/cancelled/interrupted, structured `{code, message}` error if relevant                                                                                                           |
| lost                | operation liveness/correlation cannot be established; Runtime enters unknown if settlement is unproven                                                                                           |

Process settlement is not a fact: it arrives through `ProviderOperation.settlement`.

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

Interactions are live-operation only: disconnect, cancellation and restart expire them. A driver
that wanted reconstructable interactions would first have to persist the minimum private
continuation evidence and prove reconstruction; no current driver does.

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
process liveness cessation, not arbitrary child-tool settlement
([provider process ownership](../../architecture/ai/provider-process-ownership.md)). Writable
execution additionally needs the Engine claim/effect settlement receipt. Native resume is a new validated invocation
against an existing provider context; it does not reactivate a terminal Turn.

Hard limits: discovery plus validation 30 seconds; native initialization 10 seconds after process
launch; Runtime shutdown waits at most 5 seconds for owned invocations to settle, otherwise it
reports `SESSION_RECOVERY_REQUIRED`. Pending user interaction does not trigger a protocol-silence timeout. Mock progress
is deterministic, controlled by tests rather than timers. Real-provider liveness budgets are
adapter-owned explicit settings after inspecting protocol and tool activity; no destructive
shared timeout inferred solely from a silent stream.

## Process environment

`projectProviderEnvironment` (`providers/process/environment.ts`) builds every provider child
environment; adapters MUST NOT spread or merge the ambient `process.env`. The projection is:

```text
platform base (Windows: PATH, PATHEXT, SYSTEMROOT, WINDIR, USERPROFILE, APPDATA, LOCALAPPDATA,
               TEMP, TMP; POSIX: PATH, HOME, TMPDIR)
+ adapter-named inherited host inputs (proxy, cloud identity and similar are adapter-owned)
+ explicit configured values
+ resolved secrets
+ Runtime-owned NEVO_* correlation
```

- `NEVO_*` names are reserved for Runtime values; neither inheritance nor configuration may supply
  or override them.
- Names must be portable identifiers; values reject NUL, are at most 32 KiB each and 128 KiB in
  total. On Windows names are normalized to upper case, and inherited names whose differently cased
  host entries carry different values are rejected as ambiguous rather than picking one.
- Each entry records its source (platform, inherited, configured, secret, runtime). Names and
  sources MAY appear in private diagnostics; values never do. Secret values feed the diagnostic
  redactor.
- Discovery, readiness/authentication probes and execution MUST use the same projection, so a probe
  never sees different authentication or network inputs than the real invocation. Probe-specific
  additions are explicit.

Diagnostics are disabled by default and private to adapters; there is no raw disk recorder or public
diagnostics endpoint. Enabled capture is sanitized in memory (resolved secrets, their escaped/URL
forms and common credential structures, after terminal-control normalization), retained separately
from canonical history, capped at 1 MiB per invocation and 100 MiB per store with 1024-record limits,
at most 7 days old, evicting oldest settled records first, and does not survive Runtime exit.
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
