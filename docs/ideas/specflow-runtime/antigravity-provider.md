---
id: ideas.specflow-runtime.antigravity-provider
type: engineering
title: Antigravity managed Session provider
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [antigravity, providers, sessions, migration]
read_when:
  - implementing or reviewing the Antigravity Session adapter
  - checking account binding, interactive tools and process settlement
summary: >
  Native Antigravity protocol, private configuration, account affinity and
  interactive bridge implementation, with separate controlled and native evidence.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-runtime.provider-process-boundary
  - ideas.specflow-runtime.managed-agent-execution
  - reference.protocols.session-provider-driver
---

# Antigravity managed Session provider

Continue in PR #107, branch `feature/antigravity-provider`. PR #98 is merged.
The adapter uses the existing Session driver, Engine execution admission and
settlement, SQLite lifecycle and HTTP/SSE/history contracts. It introduces no
second lifecycle authority, credential broker or global MCP installation.

Future capabilities are consolidated in the
[provider capability backlog](provider-migration-plan.md#current-scope-and-capability-backlog-ownership),
especially recursive search (F14), effort discovery (F15) and interaction parity (F13).
They are outside PR #107; this document describes the admitted native profile.

Production Runtime enables managed Agent and Plan with Engine write admission.
Supported automatic file tools retain native file identities through completion;
each command requires explicit one-shot delegation to the user's host permissions.

## Native context and transcript

The installed CLI emits `init` before a user frame. Runtime validates the account,
workspace and permission profile, persists the assigned native conversation ID,
and crosses durable dispatch admission before writing literal user input.
Continuation selects only the exact persisted `--conversation`; there is no
most-recent fallback, automatic replay or replacement of an uncertain context.

The bounded stream adapter handles native `step_update` and `result` frames,
message text, commentary, actual supplied reasoning text, tool Work/Actions and
session-cumulative usage. Numeric thinking-token usage is not reasoning text.
Conflicting tool identities/arguments and unsupported frames fail closed. A
failed tool remains failed even if the overall native Turn reports success.

Native Agent (`accept-edits`) is the default; native Plan is also exposed. Both
require canonical `workspace-write` authority: Plan is an instruction, not a
filesystem read-only boundary. Models come from bounded no-input CLI discovery;
effort overrides remain unavailable until a native catalogue contract establishes
supported values. No model-name heuristics invent effort support.

## Authentication and private configuration

The Windows x64 consumer CLI source is the exact generic Credential Manager
entry `gemini:antigravity`. Enumeration returning no entries did not establish
absence: exact `CredReadW` succeeds. The previous generic account-source blocker
is resolved; the owner's existing terminal login needs no replacement.

The inspector reads an owned bounded credential copy and clears it. Stable
account scope derives from native OAuth identity metadata; rotating access-token
fingerprints are separate. Local identity parsing is affinity evidence, not JWT
signature validation or proof of remote authentication. The CLI remains solely
responsible for actual login and token refresh. No credential is copied into the
workspace or private profile, exported, logged or returned through descriptors.

The first supported authentication profile is the native consumer keyring source.
Alternate gateway, ADC/WIF, API-key and file-fallback sources are not silently
selected. Environment projection excludes ambient authentication overrides.
Known fallback files and cached keyring-failure markers in the private profile
are rejected. Installation/account identity is checked at discovery, launch,
before native correlation and immediately before input. Account switches cannot
resume the old account's native context. The read-to-launch window is not atomic.

Private native history lives outside the project, under a project/account/Session
binding. Each Session has independent hook/MCP configuration, preventing concurrent
Sessions from overwriting each other's invocation transport. Discovery uses a
separate disposable profile and sends no user event. Private directories and
configuration targets reject symlink redirection before child writes. Profile
markers bind account and physical workspace; token rotation preserves history.
The CLI-created `default-cli-project.json` is accepted only with closed metadata
keys, the exact default ID and empty project resources. Additional projects,
resources, malformed files and symlinks remain unavailable; legitimate native
bookkeeping must not prevent the next Turn.
Directory identities use full SHA-256 encoded as base64url to keep native Windows
HOME below 260 UTF-16 code units. Longer homes are rejected before directory
creation. A 261-character profile reproduced initialization timeout before any
user input; the shorter representation passed the full Runtime correlation and
dispatch barriers in a manually instrumented check that prevented model input.

Workspace `.agents` hooks, MCP configuration, plugins, sidecars and project
customizations are rejected rather than deleted. Native global user configuration
is untouched. The updater is disabled. Only the invocation-private MCP server is
registered, with the exact `mcp(specflow-interactions/ask_user)` permission.

## Interactive questions and permissions

The shared implementation is owned by Sessions `interactions/mcp/`: MCP/HTTP,
`ask_user` schema, per-Invocation authentication, limits, canonical interaction
delivery, expiry and cleanup. It imports no Antigravity policy. The Antigravity
bridge owns only native configuration/permission registration, hook decisions,
native correlation and Stop/idle evidence. Hook extensions share the same bounded
invocation transport and delivery ledger; SQLite remains the canonical owner.
Claude and Codex retain their native question protocols and do not use MCP merely
for uniformity.

The MCP tool accepts free-text questions and single-choice lists. Calls
requesting multiple selections are rejected before creating an Interaction.

This transport binds only to loopback with an OS-assigned port. Runtime and CLI
must share the network namespace; a Runtime/CLI split across Docker/host namespaces
needs a separately designed execution transport. A configurable public bind host
or global cross-Session MCP server is not a fallback.

The invocation-private Streamable HTTP MCP server uses a random bearer credential,
bounded requests and waiters, canonical interaction facts and existing response
idempotency. Setup may precede dispatch; question admission requires activation
after durable native correlation and dispatch. Human response lifetime is bounded
separately from initialization; no protocol-silence timer interrupts a pending
human answer. Disconnect, cancellation and restart expire live interactions.
Lost delivery acknowledgement never causes automatic retransmission. Transport
flush is delivery evidence, not evidence the model consumed the answer.

Native MCP calls pass through `PreToolUse` as `call_mcp_tool`. The adapter admits
only the exact server/tool pair and validated question arguments. It does not
allow arbitrary MCP, resource, browser, scheduling, messaging or other unknown
native tools. Hook metadata must identify the admitted native conversation and
exactly one normalized workspace. Immutable native step and argument identity
prevent replay or changed-operation grants.
The native call ledger binds `stepIdx` and a canonical digest of tool name and
arguments. Distinct calls at the same trajectory step receive separate admission;
an exact retry is denied, never granted from a previous answer. Matching
PostToolUse receipts release that call's file ownership. The reserved-file
Overwrite variant is correlated privately to the same owned operation.
The native-hook ledger has its own 1024-call budget, independent of JSON-RPC
request IDs and HTTP admission. One invocation accepts one initialized MCP
session; attempted reinitialization closes it rather than replaying client IDs.

The native permission profile is `proceed-in-sandbox`, including for Agent and
Plan. Direct native file operations retain Agent auto-edit behavior. Runtime opens
each path component without following reparse points and keeps directory/target
handles open without delete sharing until its matching PostToolUse or proven
process-tree termination. Existing hardlinked targets are denied. New targets are
reserved atomically, and only that reservation receives native Overwrite=true.
Outside-root and customization-control-path writes are denied. Recursive native
listing/search is denied in this profile because a root handle cannot constrain
uninspected descendants; an explicitly approved command remains available.
Command execution requires an exact canonical once-only host permission and
physical CWD validation. After approval the hook returns auto_approve for that
call only. No confinement is promised for approved commands. Bypass, daemon,
background/reused-terminal and unknown argument variants are rejected.
The managed command policy accepts `WaitMsBeforeAsync` up to 30 seconds.
Supported file-tool arguments have explicit type and range checks. Unverified
artifact/lint metadata is rejected rather than passed through. Public command
permissions contain the exact command, a workspace-relative CWD and canonical
authority/once-only approval; native metadata remains private. A command may
itself contain explicit paths that the user must see before approving it.

Node path checks remain admission filters; retained Win32 handles prevent the
admitted direct path from being renamed/replaced before native use. This is not
protection against an arbitrary malicious process already running as the user.
There are at most 32 outstanding file operations and 1024 admitted calls per Turn.
Transport closure alone never releases file handles while process settlement is
unknown. An interrupted new-file reservation can leave an empty file or parent
directories inside the workspace; it is an admitted partial effect, not rolled
back after an uncertain native write.
File tools deny customization writes, but an approved native command can change
repository configuration files. The current active private configuration and
subsequent-invocation admission checks are separate from repository immutability;
this adapter does not claim immutable repository configuration for a whole Turn.
Job Objects provide process ownership, not a filesystem sandbox.

The fixed Windows hook launcher encodes only trusted executable paths and hook
role. Native tool input travels through bounded UTF-8 stdin, never shell-code
interpolation. Its invocation credential stays in private configuration; command
lines and public readiness contain no credential. Helper errors produce denial.

## Lifetime and recovery

Windows Job Objects retain ownership independently of root PID lifetime. A
terminal protocol result alone is insufficient for settlement. Normal completion
requires graceful stdin EOF, authenticated positive `Stop`/`fullyIdle` evidence,
natural process exit and positive stopped-tree evidence. Missing idle, nonzero
success exit, timeout, failed helper or forced descendant cleanup cannot fabricate
success. Stop metadata is bound to the native conversation/workspace and cannot
settle a newer tool generation or an unresolved interaction.

EOF is graceful draining, not cancellation. Forced process termination after
possible dispatch, without a correlated authoritative outcome, remains uncertain
under existing recovery/Engine claim rules. No Claude control-frame emulation,
force-success endpoint or automatic replay is introduced.

## Evidence as of 2026-10-30

Evidence types remain separate:

- Automated tests use controlled process owners, synthetic credentials, native
  protocol fixtures and authenticated loopback MCP/hooks only. No real CLI login,
  paid endpoint, model or subscription is used by any test runner or CI.
- Manual exact-source credential inspection succeeded without exporting tokens.
- Manual production-driver no-input discovery succeeded with the existing native
  keyring login: 13 models, native Agent/Plan and account affinity. No user frame
  or inference prompt was sent. This does not prove semantic continuation.
- Manual Runtime HTTP acceptance with the existing native consumer login passed:
  a minimal explicit integration-test prompt produced the requested marker and
  completed; after closing/reopening Runtime, a second minimal prompt recovered
  that marker from native conversation context and completed. Earlier attempts
  exposed the Windows HOME limit, inert default project metadata and a native
  resume `system_message` step; each now has controlled regression coverage.
  The earlier uncertain invocation was not automatically replayed or released.
- Manual native CLI tests used a synthetic loopback model backend, synthetic key
  and disposable private configuration, outside all test runners and CI. They
  verified actual hook allow/deny, malformed/error/timeout denial, exact native MCP
  question invocation, positive `fullyIdle` Stop before result, and retained Job
  cleanup. These are native protocol/policy observations, not OAuth model success.
- Native terminal positive control wrote inside the disposable workspace; the
  same PowerShell command targeting an owned sibling was denied by Windows and
  produced no file. A command may exit zero despite a nonterminating write error;
  this is not proof that its requested effects succeeded.
- A controlled native command created a workspace hook configuration, followed
  by a native file write in the same Turn. The new workspace hook did not run;
  the original private hook remained active. The next invocation rejects that
  workspace configuration. This is observed behavior of the recorded build,
  not a guarantee that arbitrary future native plugins cannot reload dynamically.

Observed Windows x64 CLI SHA-256:
`fbbfb3f15c7628252c5e12765683c688ba05ee122b853cadeb0bbfd4e13ca25b`.
The PE has no file/product version. This is diagnostic evidence, not a version pin
or permission for arbitrary future binaries. Compatibility classification remains
provisional unless trusted tested-build evidence exists; actual policy and
protocol checks are separate admission prerequisites.

The CLI does not expose its internal `SandboxStatus` in stream initialization.
Primary documentation says `--sandbox` can have no effect on an unsupported host.
Flags and OS version alone therefore cannot establish command containment. After
canonical human approval, the current contract explicitly delegates host execution
and returns a one-call `auto_approve`. The UI displays the exact command, relative
CWD and outside-workspace warning. Every command requires this decision; native
auto-edit modes cannot suppress it. Runtime does not treat a configuration boolean
or guessed version as proof of command containment.
Some soft-denied executions emit a result without positive Stop/idle evidence;
these remain uncertain rather than being promoted to success.

Remaining acceptance is reported on the final implementation commit: full Runtime
and process verification, installed helper packaging, independent review, and a
separately recorded native evidence above. No automated paid acceptance or retry
is permitted. No UI redesign,
historical import or backward compatibility belongs to this feature.

Primary sources: [headless protocol](https://antigravity.google/docs/cli/headless/),
[hooks](https://antigravity.google/docs/hooks/),
[MCP](https://antigravity.google/docs/mcp/),
[authentication](https://antigravity.google/docs/install/),
[sandbox](https://antigravity.google/docs/sandbox/), and
[settings schema](https://antigravity.google/schemas/v1/settings.json).

## Execution policy and routine CLI updates

### N01 native hook-start failure acceptance — 2026-11-08

The re-review requested a real-CLI control for a hook that cannot start, rather
than another simulated helper response. The installed Windows x64 build above
(SHA-256 `fbbfb3f15c7628252c5e12765683c688ba05ee122b853cadeb0bbfd4e13ca25b`)
was exercised manually with a synthetic Gemini-compatible HTTP/SSE backend bound
only to loopback. A disposable HOME selected `modelProvider: gemini`, a synthetic
API key, an explicit custom model and a loopback `GOOGLE_GEMINI_BASE_URL`.
No personal login, OAuth token, paid endpoint or real model inference was used.
The initialization frame had to confirm that custom model before any user frame.
The prompt explicitly identified a manual integration test and requested a short
confirmation. Scripted model responses proposed exactly one controlled tool call;
all target files and command working directories belonged to disposable scratch.

The native invocation used `--input-format stream-json --output-format stream-json
--disable-slash-commands --sandbox --mode <mode> --model <local-model>`. Apart from
the synthetic model/auth source, execution policy matched the admitted profile:
`toolPermission: proceed-in-sandbox`, `allowNonWorkspaceAccess: false`, terminal
sandbox enabled, no persistent allow rules and private generated hooks. Every
process was owned by the existing Job Object implementation and settled with a
positive zero-process count (`group-exited`).

| Native mode            | Tool                           | Hook cases                                                                                                                          | Observed effects                                                                                                              |
| ---------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Agent (`accept-edits`) | `write_to_file`, `run_command` | Explicit fixture approval; explicit deny; missing launcher; launcher exit 23; missing helper; helper exit 23; malformed JSON output | Approved controls created their exact marker. All 12 negative cases reported native hook/tool errors and created no marker.   |
| Plan (`plan`)          | `write_to_file`, `run_command` | Explicit fixture approval; missing launcher; launcher exit 23                                                                       | Approved controls created their exact marker. All four negative cases reported native hook/tool errors and created no marker. |

All **20 manual cases passed**. Absence of a file was accepted as denial evidence
only alongside a valid positive control, a valid proposed native tool call and
the native hook/tool error. Native final `SUCCESS` can follow a handled tool
error; it was not used as proof that the denied operation executed. These probes
verify the native hook transport boundary, not a complete production OAuth Turn
or protection against arbitrary same-user processes.

The positive control exposed a separate confirmed defect: the generated UTF-16
PowerShell `EncodedCommand` exceeded the native intermediary `cmd.exe` limit of
8191 characters. Native CLI correctly blocked the tool with `The command line
is too long`, so direct PowerShell unit launches had missed a functional failure.
The launcher now compresses the same fixed trusted script, reconstructs it in
PowerShell and rejects a command exceeding that limit before launch. Native tool
input still travels only through bounded stdin; policy, permission decisions,
deadlines, output bounds and child cleanup are unchanged. The controlled Windows
regression now launches via `cmd.exe /d /s /c`, failed on the old code and passed
after correction. Independent review reran all eight launcher tests successfully.

N01 is closed for this recorded native profile. This evidence is not a hash pin,
a requirement to test every ordinary CLI update, or a claim about all future hook
implementations. N02 Stop/continue semantics remain a separate nonblocking
[follow-up F20](provider-migration-plan.md#f20--antigravity-stop-continuation-semantics).

### F20 Stop continuation � 2026-11-08

The [native Stop contract](https://antigravity.google/docs/hooks/#stop) uses
`continue` to re-enter the current execution loop. Every other decision, including
`deny`, permits termination. Stop is not a tool permission response. `fullyIdle`
reports completion of background activity; it is not a terminal result and cannot
settle unresolved Runtime interactions or retained file operations.

The original regression was a Stop with `NO_TOOL_CALL`, `fullyIdle: true` and a
retained file identity awaiting PostToolUse. Returning `deny` ended the native loop
instead of allowing it to finish outstanding work. The HTTP/helper regression in
`antigravity/hooks.test.ts` failed with expected `continue`, received `deny` before
the correction.

| Evidence at authenticated Stop                                                                   | Response and effect                                                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Pending question, permission or retained file; ordinary completion; continuation still available | `continue` once within the same invocation; no idle receipt, tool approval, answer delivery or new Turn |
| Duplicate continued Stop or lower execution number                                               | `deny`; no new continuation or idle receipt                                                             |
| Earlier fully-idle Stop replayed after a newer tool generation                                   | `deny`; no new idle receipt                                                                             |
| Cancellation, error, step limit, unknown termination reason or nonempty error                    | Allow termination; permanently disable continuation; never accept idle while work is unresolved         |
| Native result already observed                                                                   | Disable continuation before buffering the result; still require independent idle and process settlement |
| No pending work, valid `fullyIdle: true`                                                         | `stop`, accept idle for that generation and disable continuation                                        |
| No pending work, valid `fullyIdle: false`                                                        | `stop`, await later positive idle evidence; do not infer completion                                     |
| Aborted, closed, inactive, incorrectly bound or malformed request                                | `deny`; no continuation or idle receipt                                                                 |

Only `NO_TOOL_CALL` (observed native) and `model_stop` (documented) with absent or
empty `error` count as ordinary completion. The first conflicting Stop consumes
the single continuation opportunity even if termination is required. An earlier
cancellation/error cannot later be replaced by a normal-looking Stop to resume.
A continued execution number is never accepted again, including after its work
clears; a later execution must supply its own positive idle evidence. Native
background completion without a requested continuation can still change a
non-idle Stop to an idle Stop at the same execution number.

The limit is one continuation per invocation, not one per tool generation. If
another Stop conflicts with unresolved work, the adapter allows termination and
withholds idle evidence. Insufficient settlement remains unknown under the
existing recovery contract. This deliberately bounds additional native activity;
it does not promise to repair every inconsistent native completion sequence.
Handles remain owned until matching PostToolUse or positive stopped-tree cleanup.
Private endpoints and replay state are invocation-local and are not restored or
transferred on restart. There is no database/schema migration or public API change.

Controlled tests cover question/permission/file conflicts, one-shot exhaustion,
duplicates/stale generations, native cancellation/error reasons, Runtime abort,
observed terminal result, closed old endpoints/replacement invocations and ordinary
idle/background completion. The production driver composition also proves one
launch, one dispatch and one input frame across permission conflict, continuation,
explicit denial and native settlement. Existing operation/recovery tests retain
unknown outcomes for process loss or missing settlement evidence.

Manual native protocol checks used the Windows x64 CLI fingerprint recorded above,
a disposable trusted workspace/HOME, synthetic Gemini key and loopback HTTP/SSE
backend. No personal credentials or paid inference were used. The production
compressed Stop launcher and owned Job Object process boundary were exercised:

- `continue` at execution 0 (`NO_TOOL_CALL`, `fullyIdle: true`) caused another
  native iteration, then execution 1 with the same reason/idle state; `stop`
  ended it. There was one user frame and one final result containing both scripted
  answers.
- The `deny` control at execution 0 ended immediately, with one scripted answer
  and one final result.
- Both controls exited with code 0 and positive `group-exited` tree settlement.
  These establish native Stop response semantics, not production OAuth acceptance
  or a native reproduction of every synthetic conflict/race.

Independent architectural/security review remains pending; author verification
is not independent review. F14 and capability parity remain separate deliveries.

### Compatible updates

The owner reaffirmed optimistic compatibility after the 2026-10-31 deep review.
Required native API inventory, permission mode, workspace and account binding
are checked; hooks accept only declared tools with supported handlers/schemas.
Additional tools in a compatible minor do not disable the installation. There
is no per-hash security certification or mandatory negative-control run on every
update. Unpaid initialization, configured hooks, actual native hook execution
and OS containment remain distinct evidence; readiness is not a sandbox proof.
An unlisted compatible build remains eligible for provisional discovery. Managed
execution uses retained file identities for supported automatic file operations
and explicit one-shot host delegation for commands. Engine admission is required
for both managed modes. This restores Agent/Plan without a version/hash pin or
a claim that Job Objects provide filesystem isolation.

Manual no-input verification of the updated inventory checks succeeded on
2026-10-31: the real local CLI reported the required native file/command/MCP APIs
among its inventory, discovery returned 13 models and readiness `ready`. No user
frame, inference prompt, native tool execution or model request was sent. This
confirms detection/configuration compatibility, not OS sandbox enforcement.
